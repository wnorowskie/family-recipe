"""/v1/feedback — submit (member) + list (admin only).

Mirrors the Next.js handler at src/app/api/feedback/route.ts (issue #183,
sub-task of #37). Bearer-token auth via get_current_user_v1; v1-only —
no un-prefixed cookie-auth twin. Pattern-matches /v1/notifications: the
Phase 2 frontend only hits this surface when USE_FASTAPI_AUTH is on, so
a dual-mounted cookie-auth alias would have no caller.

## Divergences from the Next handler (intentional, follow the v1 spec)

- POST returns `201 { feedback }` carrying the persisted row. Next
  returns `200 { success: true }`. The 201+body shape is what the
  migration plan documents for the cutover.
- GET returns `{ items, total }`. Next returns
  `{ items, page: { hasMore, nextOffset } }`. The issue spec is `total`;
  it's a single `count(...)` against the same filter — admin-only
  surface, not a hot path.
- POST is authenticated. The Next handler accepts anonymous feedback
  with an `email` field; v1 requires a member (per acceptance criteria
  "Authenticated, family-scoped at write time"). The Next handler will
  remain the anonymous-feedback entrypoint until Phase 4 decides
  whether to keep that path at all.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse
from prisma.errors import PrismaError

from ...db import prisma
from ...dependencies_v1 import get_current_user_v1
from ...errors import forbidden, internal_error, rate_limited, validation_error
from ...idempotency import replay_or_record
from ...permissions import is_owner_or_admin
from ...rate_limit import feedback_limiter
from ...schemas.auth import UserResponse
from ...schemas.feedback import (
    CreateFeedbackRequest,
    CreateFeedbackResponse,
    FeedbackListResponse,
)
from ...utils import iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/feedback", tags=["feedback"])

# Pagination caps mirror src/lib/feedback.ts (limit ≤ 50, default 20).
_DEFAULT_LIMIT = 20
_MAX_LIMIT = 50


def _serialize_row(row: Any) -> dict:
    """Convert a Prisma feedback row to the response shape.

    Returns a plain dict (not a Pydantic model) so the idempotency
    cache stores JSON-serialisable data — pydantic models on the replay
    path would need re-validation against a possibly-evolved schema.
    """
    return {
        "id": row.id,
        "category": row.category,
        "message": row.message,
        "contactEmail": getattr(row, "contactEmail", None),
        "userId": getattr(row, "userId", None),
        "familySpaceId": getattr(row, "familySpaceId", None),
        "pageUrl": getattr(row, "pageUrl", None),
        "userAgent": getattr(row, "userAgent", None),
        "createdAt": iso(row.createdAt),
    }


def _serialize_list_row(row: Any) -> dict:
    """List-row variant — adds `userName` / `userEmail` from the joined user."""
    base = _serialize_row(row)
    user = getattr(row, "user", None)
    base["userName"] = getattr(user, "name", None) if user else None
    base["userEmail"] = getattr(user, "email", None) if user else None
    return base


@router.post("", response_model=CreateFeedbackResponse, status_code=201)
async def create_feedback(
    payload: CreateFeedbackRequest,
    user: UserResponse = Depends(get_current_user_v1),
    x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
    user_agent: Optional[str] = Header(default=None, alias="User-Agent"),
):
    """Create a feedback submission.

    Rate-limited at 20/hour/user (migration plan § Rate Limits). Honours
    `X-Request-Id` for at-most-once retry semantics; the 24h idempotency
    window is shared with every other write endpoint via replay_or_record.

    Rate-limit is checked BEFORE the idempotency lookup so a flood of
    replays from the same client can't bypass the limiter — the replay
    path re-issues the original 201 only when the original call was
    actually allowed. A 429 on the first attempt is not idempotency-
    cached (we don't call `do`, so no row is recorded); subsequent
    retries hit the limiter again and stay 429 until the window resets.
    """
    rate = feedback_limiter.check(user.id)
    if not rate.allowed:
        return rate_limited(retry_after_seconds=rate.retry_after_seconds)

    async def _do() -> tuple[dict, int]:
        try:
            row = await prisma.feedbacksubmission.create(
                data={
                    "userId": user.id,
                    "familySpaceId": user.familySpaceId,
                    "contactEmail": payload.email,
                    "category": payload.category,
                    "message": payload.message,
                    "pageUrl": payload.pageUrl,
                    "userAgent": user_agent,
                }
            )
        except PrismaError as e:
            logger.exception("feedback.create.prisma_error: %s", e)
            # Surface as a tuple so replay_or_record returns the 500 body
            # rather than letting the exception escape. The exception
            # handler in main.py would also produce a 500 envelope, but
            # we'd lose the structured log line tying it to this handler.
            return {"error": {"code": "INTERNAL_ERROR", "message": "Failed to record feedback"}}, 500

        logger.info(
            "feedback.create userId=%s familySpaceId=%s category=%s id=%s",
            user.id, user.familySpaceId, row.category, row.id,
        )
        return {"feedback": _serialize_row(row)}, 201

    body, status_code = await replay_or_record(
        user_id=user.id, request_id=x_request_id, do=_do
    )
    return JSONResponse(content=body, status_code=status_code)


@router.get("", response_model=FeedbackListResponse)
async def list_feedback(
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = Query(default=None),
    includeOrphaned: bool = Query(default=True),
    user: UserResponse = Depends(get_current_user_v1),
):
    """List feedback submissions — admin/owner only.

    Family-scoped: by default also includes rows where `familySpaceId IS
    NULL` (anonymous submissions persisted by the legacy Next handler)
    so admins see the full backlog. Set `includeOrphaned=false` to
    restrict to the caller's family only. Mirrors getFeedbackForFamily
    in src/lib/feedback.ts.
    """
    if not is_owner_or_admin(user):
        return forbidden("Admin access required")

    if category is not None and category not in ("bug", "suggestion"):
        # Tight allowlist mirrors feedbackSubmissionSchema's enum. Anything
        # else is a contract violation, not a 200-with-empty-result case.
        return validation_error("Invalid category")

    if includeOrphaned:
        where: dict = {
            "OR": [
                {"familySpaceId": user.familySpaceId},
                {"familySpaceId": None},
            ]
        }
    else:
        where = {"familySpaceId": user.familySpaceId}
    if category is not None:
        where["category"] = category

    try:
        # `count` against the same `where` gives the headline `total`.
        # Two queries instead of `limit+1` because the contract is total,
        # not "are there more after this page" — and total is what the
        # admin UI uses for its page-of-N display.
        rows = await prisma.feedbacksubmission.find_many(
            where=where,
            include={"user": True},
            order={"createdAt": "desc"},
            take=limit,
            skip=offset,
        )
        total = await prisma.feedbacksubmission.count(where=where)
    except PrismaError as e:
        logger.exception("feedback.list.prisma_error: %s", e)
        return internal_error("Failed to load feedback")

    items = [_serialize_list_row(row) for row in rows]
    return {"items": items, "total": total}
