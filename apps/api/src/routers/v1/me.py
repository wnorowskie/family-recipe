"""/v1/me/* — current-user surface on the v1 namespace.

Today this file only exposes `DELETE /v1/me/delete` (issue #186,
sub-task of #37). The legacy cookie-auth twin lives in
`src/routers/me.py` and is kept alive until Phase 4 (#38).
Bearer-token auth via `get_current_user_v1` — never mounted unprefixed
because the Phase 2 frontend only hits this surface when
`USE_FASTAPI_AUTH` is on (and is therefore already sending access
tokens). A dual-mounted cookie-auth alias would have no caller.

## Divergences from the Next handler (intentional)

Two contract differences from `src/app/api/me/delete/route.ts`,
both following the AC in #186 rather than the legacy behaviour:

- **204 No Content** on success, with no body. Next returns
  `200 { status: 'deleted' }`. The 204 is what the migration plan and
  ticket spec, and once the Next handler is removed in Phase 4 the
  body served no purpose anyway — the SPA already treats any 2xx as
  success and clears its in-memory auth state.
- Cookies cleared on the response are `refresh_token` + `csrf_token`
  (the v1 token-auth pair). Next clears its single legacy `session`
  cookie. Different auth model, different cookies; the legacy cookie
  is owned by the Next handler.

## Cascade semantics

`prisma.user.delete(where={id})` triggers Postgres-side cascades
declared in [prisma/schema.postgres.prisma](../../../../prisma/schema.postgres.prisma).
For the User model these are:

  - `FamilyMembership.user`        onDelete: Cascade  (membership row removed)
  - `Post.author`                  onDelete: Cascade  (authored posts removed)
  - `Comment.author`               onDelete: Cascade  (authored comments removed)
  - `Reaction.user`                onDelete: Cascade  (post/comment reactions removed)
  - `CookedEvent.user`             onDelete: Cascade  (cooked entries removed)
  - `Favorite.user`                onDelete: Cascade  (favorites removed)
  - `Notification.recipient/actor` onDelete: Cascade  (notifications removed)
  - `RefreshToken.user`            onDelete: Cascade  (refresh-token rows removed)
  - `IdempotencyKey.user`          onDelete: Cascade  (idempotency cache removed)
  - `FeedbackSubmission.user`      onDelete: SetNull  (orphaned, anonymized)

This matches the Next handler verbatim — both rely on the same
schema-level cascades and neither hand-rolls a transaction. The
`SetNull` on `FeedbackSubmission` is intentional: deleting a user
should anonymize their feedback, not erase the bug/suggestion log.

The cascade hard-deletes refresh-token rows (not "revoked", which
would just set `revokedAt`); a subsequent `/v1/auth/refresh` therefore
returns 401 on the row-not-found branch rather than the revoked-row
branch. End-state for the caller is identical.

## What this endpoint refuses

- **Owners and admins** — same as the Next handler. The V1 product
  has exactly one owner per family space; letting them self-delete
  would leave the family without an owner. Operators handle the
  edge case via a manual migration, not via this endpoint.
- **Wrong password** — defense in depth. A stolen access token alone
  cannot destroy an account; the attacker also needs the password.
- **Confirmation phrase mismatch** — UX guardrail mirroring the Next
  handler's `confirmation === 'DELETE'` check.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response, status
from prisma.errors import PrismaError

from ...cookies import clear_csrf_cookie, clear_refresh_cookie
from ...db import prisma
from ...dependencies_v1 import get_current_user_v1
from ...errors import (
    forbidden,
    internal_error,
    invalid_credentials,
    not_found,
    validation_error,
)
from ...schemas.auth import DeleteAccountRequest, UserResponse
from ...security import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/me", tags=["me-v1"])


_CONFIRMATION_PHRASE = "DELETE"


@router.delete("/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    payload: DeleteAccountRequest,
    response: Response,
    user: UserResponse = Depends(get_current_user_v1),
):
    """Delete the authenticated caller's account.

    Returns 204 No Content on success — see module docstring for the
    intentional divergence from the Next handler's 200 body.
    """
    # Owner/admin guard runs before any DB lookup so a privileged
    # caller's request never even touches `passwordHash`; matches
    # the Next handler's ordering.
    if user.role in ("owner", "admin"):
        return forbidden("Owners and admins cannot delete their accounts")

    if payload.confirmation.strip().upper() != _CONFIRMATION_PHRASE:
        return validation_error("Confirmation must be DELETE")

    try:
        current_user = await prisma.user.find_unique(
            where={"id": user.id},
        )
    except PrismaError as error:
        logger.exception("account.delete.lookup_prisma_error userId=%s: %s", user.id, error)
        return internal_error("Unable to delete account")

    if not current_user:
        # `get_current_user_v1` already verified the token resolves to
        # a real user — hitting this branch means a concurrent delete
        # raced us. Surface 404 rather than 500 because the requested
        # post-condition (user gone) is already true.
        return not_found("User not found")

    if not verify_password(payload.currentPassword, current_user.passwordHash):
        logger.warning("account.delete.invalid_password userId=%s", user.id)
        return invalid_credentials("Incorrect password")

    try:
        await prisma.user.delete(where={"id": user.id})
    except PrismaError as error:
        # Postgres cascade fired and something downstream rejected.
        # No partial state: Prisma wraps the delete + cascade in a
        # single statement, so a failure here means the user row is
        # still present and the caller can retry safely.
        logger.exception("account.delete.prisma_error userId=%s: %s", user.id, error)
        return internal_error("Unable to delete account")

    logger.info(
        "account.delete.success userId=%s familySpaceId=%s",
        user.id, user.familySpaceId,
    )

    # Clear the v1 cookie pair on the response. The httpOnly refresh
    # cookie is the one that matters for security; the csrf cookie
    # is cleared in lockstep so the SPA's double-submit assertion
    # doesn't get confused on the next request.
    clear_refresh_cookie(response)
    clear_csrf_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
