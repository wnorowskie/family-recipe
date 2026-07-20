"""/v1/me/* — current-user surface on the v1 namespace.

This module hosts two router objects under the same `/v1/me` namespace,
each owning exactly one auth dependency — no single router mixes auth modes:

- `me_router` — `GET /favorites`, `PATCH`/`PUT /profile`, `POST /password`,
  cookie-capable `get_current_user`. Moved here from the legacy
  `routers/me.py` in #233 (Phase 4.5), when the un-prefixed aliases were
  removed and every resource router was collapsed under `routers/v1/`.
- `router` — `DELETE /v1/me/delete` (issue #186, sub-task of #37),
  bearer-only `get_current_user_v1`. Details below.

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
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from prisma.errors import PrismaError, UniqueViolationError

from ...cookies import clear_csrf_cookie, clear_refresh_cookie
from ...db import prisma
from ...dependencies import get_current_user
from ...dependencies_v1 import get_current_user_v1
from ...errors import (
    bad_request,
    conflict,
    file_too_large,
    forbidden,
    internal_error,
    invalid_credentials,
    not_found,
    unsupported_file_type,
    validation_error,
)
from ...multipart_uploads import (
    AVATAR_MAX_BYTES,
    UploadError,
    process_upload,
)
from ...schemas.auth import DeleteAccountRequest, UserResponse
from ...schemas.me import ChangePasswordRequest, UpdateProfileRequest
from ...security import clear_session_cookie, hash_password, verify_password
from ...uploads import create_signed_url_resolver, get_signed_upload_url
from ...utils import iso

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


# ---------------------------------------------------------------------------
# Profile / favorites / password — GET /v1/me/favorites, PATCH+PUT
# /v1/me/profile, POST /v1/me/password. Moved from routers/me.py in #233
# (Phase 4.5). Cookie-capable `get_current_user` (the SPA sends a Bearer
# token; the legacy session cookie still resolves via the fallback in
# dependencies.py). Its own router object so this cookie-capable surface's
# auth stays separate from the bearer-only delete endpoint above.
# ---------------------------------------------------------------------------

me_router = APIRouter(prefix="/v1/me", tags=["me"])


@me_router.get("/favorites")
async def my_favorites(limit: int = 20, offset: int = 0, user: UserResponse = Depends(get_current_user)):
    try:
        favorites = await prisma.favorite.find_many(
            where={"userId": user.id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=limit + 1,
            skip=offset,
            include={"post": {"include": {"author": True}}},
        )
        has_more = len(favorites) > limit
        favorites = favorites[:limit]
        # Resolve each post's mainPhotoUrl storage key into a signed URL.
        # Sharing one resolver across all rows means a favorite list with
        # duplicates (same post appearing twice across pages, unlikely but
        # cheap to guard) only hits GCS once.
        resolve_photo = create_signed_url_resolver()
        items = [
            {
                "id": fav.id,
                "createdAt": iso(fav.createdAt),
                "post": {
                    "id": fav.post.id,
                    "title": fav.post.title,
                    "mainPhotoUrl": await resolve_photo(fav.post.mainPhotoStorageKey),
                    "authorName": fav.post.author.name if fav.post.author else None,
                },
            }
            for fav in favorites
        ]
        return {"items": items, "hasMore": has_more, "nextOffset": offset + len(items)}
    except PrismaError as e:
        logger.exception("me.favorites.prisma_error: %s", e)
        return internal_error("Failed to load favorites")
    except (ValueError, TypeError, AttributeError, KeyError) as e:
        logger.exception("me.favorites.error: %s", e)
        return internal_error("Failed to load favorites")


@me_router.patch("/profile")
async def update_profile_multipart(
    response: Response,
    name: str = Form(...),
    email: str = Form(...),
    username: str = Form(...),
    currentPassword: Optional[str] = Form(default=None),
    removeAvatar: Optional[str] = Form(default=None),
    avatar: Optional[UploadFile] = File(default=None),
    user: UserResponse = Depends(get_current_user),
):
    """Update the current user's profile, including optional avatar upload.

    Multipart-only (`multipart/form-data`) per parity with
    `src/app/api/me/profile/route.ts`. Field names are flat (not a `payload`
    JSON envelope) to match Next; the migration plan's payload-envelope
    shape is tracked as a follow-up under #188.

    Behavior:
    - Validates `name`, `email`, `username` via Pydantic's `UpdateProfileRequest`
      (same constraints as Next's `updateProfileSchema`).
    - If `email` or `username` differ from the current values, requires a
      matching `currentPassword` (mirrors Next's `requiresPassword` branch).
    - `avatar` file (≤5MB, JPEG/PNG/WEBP) writes its storage key to the
      `avatarStorageKey` column (Postgres column `avatar_url`, mapped via
      `@map` in the Prisma schema). The DB stores an opaque storage key,
      not a URL — the legacy column name is kept for compatibility with
      Next-era rows that still hold pre-migration values, but the Prisma
      attribute is canonical.
    - `removeAvatar=true` clears the column.
    - On sensitive-field change (email or username), the session cookie is
      cleared so the next request re-authenticates — matches Next's
      `clearSessionCookie` call.
    - P2002 unique-constraint violations on email/username surface as
      `409 CONFLICT` per the Next contract.
    """
    raw = {"name": name, "email": email, "username": username}
    try:
        validated = UpdateProfileRequest.model_validate(raw)
    except ValueError as exc:
        return validation_error(_first_validation_message(exc, "Invalid input"))

    current = await prisma.user.find_unique(where={"id": user.id})
    if not current:
        return internal_error("Failed to update profile")

    email_changed = validated.email != current.email
    username_changed = validated.username != current.username
    requires_password = email_changed or username_changed

    if requires_password:
        if not currentPassword:
            return validation_error(
                "Current password is required to change email or username"
            )
        if not verify_password(currentPassword, current.passwordHash):
            return invalid_credentials("Incorrect current password")

    # `avatar_file` factors out the size>0 / filename!="" guard mirroring
    # Next's `isFileLike(avatarFile) && avatarFile.size > 0`. We re-bind to
    # a non-Optional local so mypy can narrow `process_upload`'s arg type
    # (a bool guard on a separate variable wouldn't narrow `avatar` itself).
    avatar_file = avatar if avatar is not None and (avatar.filename or "") and (avatar.size or 0) > 0 else None
    # `avatar_should_write` separates "intentionally write None to clear"
    # from "leave the column alone" without smuggling a sentinel value
    # through a typed Optional[str]. `avatar_new_value` is only read when
    # the flag is True.
    avatar_should_write = False
    avatar_new_value: Optional[str] = None
    if avatar_file is not None:
        try:
            processed = await process_upload(
                avatar_file,
                max_bytes=AVATAR_MAX_BYTES,
                kind="avatar",
            )
        except UploadError as exc:
            if exc.code == "UNSUPPORTED_FILE_TYPE":
                return unsupported_file_type(exc.message)
            if exc.code == "FILE_TOO_LARGE":
                return file_too_large(exc.message)
            return validation_error(exc.message)
        avatar_new_value = processed.storage_key
        avatar_should_write = True
    elif removeAvatar == "true":
        avatar_new_value = None
        avatar_should_write = True

    data: dict = {
        "name": validated.name,
        "email": validated.email.strip(),
        "username": validated.username.strip(),
    }
    if avatar_should_write:
        data["avatarStorageKey"] = avatar_new_value

    try:
        updated = await prisma.user.update(where={"id": user.id}, data=data)
    except UniqueViolationError:
        return conflict("That email or username is already in use")
    except PrismaError:
        return internal_error("Failed to update profile")

    if requires_password:
        # Sensitive change — force re-auth on the next request. Matches the
        # Next handler's `clearSessionCookie(response)` call.
        clear_session_cookie(response)

    avatar_url = await get_signed_upload_url(updated.avatarStorageKey)
    return {
        "user": {
            "id": updated.id,
            "name": updated.name,
            "email": updated.email,
            "username": updated.username,
            "emailOrUsername": updated.email,
            "avatarUrl": avatar_url,
        }
    }


def _first_validation_message(exc: ValueError, fallback: str) -> str:
    """Pull the first message from a Pydantic ValidationError, else fallback.

    The PATCH handler reports the *first* error to match the Next side, which
    returns `parsed.error.errors[0]?.message`. Any non-Pydantic ValueError
    falls back to the generic message.
    """
    errors = getattr(exc, "errors", None)
    if callable(errors):
        try:
            details = errors()
            if details:
                return str(details[0].get("msg") or fallback)
        except (TypeError, IndexError, KeyError):
            return fallback
    return fallback


@me_router.put("/profile")
async def update_profile(
    payload: dict, user: UserResponse = Depends(get_current_user)
):
    """Legacy JSON profile-update handler. Kept alive for Phase-2 clients.

    The canonical Phase-3 endpoint is `update_profile_multipart` above
    (`PATCH /v1/me/profile`), which mirrors Next's contract (flat form
    fields, multipart body, optional avatar, sensitive-field-change
    password check, 409 on duplicate). Keep behaviour here drift-free of
    the PATCH unless a deliberate parity change is being made on both sides.
    """
    # simple dict validation to mirror existing behavior
    name = payload.get("name")
    email = payload.get("email")
    username = payload.get("username")
    if not isinstance(name, str) or not name.strip():
        return bad_request("Name is required")
    if not isinstance(email, str) or not email.strip():
        return bad_request("Email is required")
    if not isinstance(username, str) or not username.strip():
        return bad_request("Username is required")

    try:
        updated = await prisma.user.update(
            where={"id": user.id},
            data={
                "name": name.strip(),
                "email": email.strip(),
                "username": username.strip(),
            },
        )
        return {
            "user": {
                "id": updated.id,
                "name": updated.name,
                "email": updated.email,
                "username": updated.username,
                "emailOrUsername": updated.email,
                "avatarUrl": await get_signed_upload_url(updated.avatarStorageKey),
            }
        }
    except PrismaError:
        return internal_error("Failed to update profile")
    except (ValueError, TypeError, AttributeError, KeyError):
        return internal_error("Failed to update profile")


@me_router.post("/password")
async def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: UserResponse = Depends(get_current_user),
):
    """Change the current user's password.

    `POST` (not `PUT`) and the `{ status: 'updated' }` response body mirror
    Next's `src/app/api/me/password/route.ts` so the Phase-2 frontend can swap
    to the FastAPI base URL in Phase 4 (#38) without an adapter shim — see
    #188. On success the legacy `session` cookie is cleared, matching Next's
    `clearSessionCookie` call, so the next request re-authenticates.

    Body keys are `currentPassword` / `newPassword` — the live Next contract
    and what `AccountSettingsForm` sends. (The migration plan's `nextPassword`
    is stale and was never shipped on either side.) Body shape is validated
    via `ChangePasswordRequest`; missing/short fields surface as the standard
    `VALIDATION_ERROR` envelope through `_validation_error_handler` (#216).
    """
    try:
        record = await prisma.user.find_unique(where={"id": user.id})
        if not record or not verify_password(payload.currentPassword, record.passwordHash):
            return bad_request("Current password is incorrect")

        await prisma.user.update(
            where={"id": user.id},
            data={"passwordHash": hash_password(payload.newPassword)},
        )
        clear_session_cookie(response)
        return {"status": "updated"}
    except PrismaError:
        return internal_error("Failed to update password")
    except (ValueError, TypeError, AttributeError, KeyError):
        return internal_error("Failed to update password")
