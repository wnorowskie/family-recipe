"""X-Request-Id idempotency for write endpoints (Phase 3-A2, issue #180).

Migration plan: docs/API_BACKEND_MIGRATION_PLAN.md#idempotency--retries

Usage from a route handler:

    from fastapi import Header
    from ..idempotency import replay_or_record

    @router.post("/feedback", status_code=201)
    async def create_feedback(
        payload: CreateFeedbackRequest,
        user: UserResponse = Depends(get_current_user),
        x_request_id: str | None = Header(default=None),
    ):
        async def _do():
            row = await prisma.feedbacksubmission.create(...)
            return _serialize(row), 201

        body, status_code = await replay_or_record(
            user_id=user.id, request_id=x_request_id, do=_do
        )
        return JSONResponse(content=body, status_code=status_code)

When `request_id` is None we just call `do()` and return its result —
idempotency is opt-in per request, never enforced when the header is absent.
When the same `(user_id, request_id)` pair is seen within 24h, the original
`(body, status_code)` is replayed without re-running the handler.

The replay window is enforced at read time (rows older than 24h are ignored
and a fresh one is written), so we don't need a background pruner. A periodic
delete sweep can be added later if the table grows uncomfortably; the
`(created_at)` index is in place for that.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Tuple

from .db import prisma

REPLAY_WINDOW = timedelta(hours=24)


async def replay_or_record(
    *,
    user_id: str,
    request_id: str | None,
    do: Callable[[], Awaitable[Tuple[Any, int]]],
) -> Tuple[Any, int]:
    """Run `do()` once and replay its result on duplicate request IDs.

    `do` must return `(json_body, status_code)`. The body is stored as JSON, so
    it should be a plain dict / list / scalar — Pydantic models should be
    serialised before being returned.

    Returns the original `(body, status_code)` on replay; otherwise the result
    of the freshly-executed `do()`.
    """
    if not request_id:
        return await do()

    existing = await prisma.idempotencykey.find_unique(
        where={"userId_requestId": {"userId": user_id, "requestId": request_id}},
    )

    if existing is not None:
        # Stale row past the replay window — ignore it. We let the new request
        # run, then upsert below to overwrite the old capture.
        if datetime.now(timezone.utc) - _aware(existing.createdAt) <= REPLAY_WINDOW:
            return existing.responseBody, existing.statusCode

    body, status_code = await do()

    # Upsert: a parallel duplicate may have raced ahead of us between the
    # find_unique and the create. Whichever write lands first wins; subsequent
    # calls hit the find_unique fast-path on the next request.
    await prisma.idempotencykey.upsert(
        where={"userId_requestId": {"userId": user_id, "requestId": request_id}},
        data={
            "create": {
                "userId": user_id,
                "requestId": request_id,
                "statusCode": status_code,
                "responseBody": body,
            },
            "update": {
                "statusCode": status_code,
                "responseBody": body,
                "createdAt": datetime.now(timezone.utc),
            },
        },
    )

    return body, status_code


def _aware(dt: datetime) -> datetime:
    # Postgres returns naive UTC datetimes through the Python Prisma client;
    # promote to aware so the subtraction against now(tz=UTC) is well-defined.
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
