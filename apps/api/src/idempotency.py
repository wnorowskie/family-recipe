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

## TTL strategy: passive overwrite, not lazy delete

Stale rows are not deleted. The replay window is enforced at *read* time:
when a row older than 24h is found, the helper ignores it and runs the
handler again, then `upsert`s — overwriting the stale row with the new
`(status, body, created_at)` under the same `(user_id, request_id)` key.

Net effect on table size is the same as lazy delete (bounded by the
active key set, not history) but no DELETE is ever issued. A periodic
sweep can be added later if the active key set itself grows
uncomfortably; the `(created_at)` index is in place for that.

## Concurrent-handler race (acknowledged limitation)

The helper protects against duplicate `idempotency_keys` rows but does
NOT serialize concurrent handler executions. If two retries with the
same `(user_id, request_id)` arrive within milliseconds of each other:

1. Both call `find_unique` and miss (no row yet).
2. Both call `do()` — the underlying handler runs twice, potentially
   creating two rows in *its* table (post, comment, etc.).
3. Both call `upsert` — the second overwrites the first idempotency-key
   row, which is harmless but means the cached body matches whichever
   call landed second.

For the Phase 3 family-only scope this is acceptable: the SPA's retry
policy is sequential (retry on 5xx after timeout), not concurrent. If a
write endpoint later takes the helper into a high-traffic / financial
context, swap the find→upsert dance for `INSERT ... ON CONFLICT DO
NOTHING RETURNING` (Postgres-native row-level lock) before relying on
it for at-most-once semantics.
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
        # run, then upsert below to overwrite the old capture (passive TTL —
        # see module docstring; we never DELETE).
        if datetime.now(timezone.utc) - _aware(existing.createdAt) <= REPLAY_WINDOW:
            return existing.responseBody, existing.statusCode

    body, status_code = await do()

    # Upsert: a parallel duplicate may have raced ahead of us between the
    # find_unique and the create — whichever write lands first wins for the
    # idempotency-key row, and subsequent calls hit the find_unique fast-path.
    #
    # NOTE: this protects the key row from duplicate-PK errors but does NOT
    # protect the handler from running twice in a tight retry race. See the
    # module docstring (Concurrent-handler race) for the full rationale.
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
