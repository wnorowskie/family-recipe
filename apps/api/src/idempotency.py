"""X-Request-Id idempotency for write endpoints (Phase 3-A2, issue #180).

Migration plan: docs/API_BACKEND_MIGRATION_PLAN.md#idempotency--retries

## Recommended usage — `Depends(idempotency_key)` (issue #194)

Most route handlers should take the dependency, which pulls `X-Request-Id`
from the request and exposes the same replay-or-record semantics through
a one-liner:

    from fastapi import Depends
    from ..idempotency import IdempotencyKey, idempotency_key

    @router.post("/feedback", status_code=201)
    async def create_feedback(
        payload: CreateFeedbackRequest,
        user: UserResponse = Depends(get_current_user),
        idem: IdempotencyKey = Depends(idempotency_key),
    ):
        async def _do():
            row = await prisma.feedbacksubmission.create(...)
            return _serialize(row), 201

        body, status_code = await idem.replay_or_record(user_id=user.id, do=_do)
        return JSONResponse(content=body, status_code=status_code)

## Underlying primitive — `replay_or_record(...)`

The dependency is a thin layer over `replay_or_record`, which stays
exported for tests and any non-route caller that already holds a parsed
request id. Both call styles share the same store, replay window, and
5xx-bypass behaviour.

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

## Server errors (5xx) are NOT cached

When `do()` returns a status code ≥ 500 we deliberately skip the upsert
and let the next retry with the same `X-Request-Id` run the handler
fresh. The idempotency contract is "same input → same output" for
*deterministic* outcomes; a transient DB error or upstream timeout is
neither. Caching a 500 for the 24h replay window would convert a
recoverable failure into a sticky one — a legitimate client retry
would replay the failure instead of getting a chance at success once
the underlying issue (DB unreachable, GCS hiccup, etc.) clears.

`4xx` responses ARE cached. Those reflect deterministic input/auth
state — retrying with the same request id should keep returning the
same client-error envelope, otherwise the SPA could "shake out" a
validation rejection by hammering the same id.

This means the cache stores only `{2xx, 4xx}`. The asymmetry is
intentional and documented at the call site of every write endpoint
that uses this helper.

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

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Tuple

from fastapi import Header

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

    # Server errors (5xx) bypass the cache so a retry can hit a healthy
    # backend. See the module docstring "Server errors (5xx) are NOT
    # cached" — caching a transient failure for 24h would convert it
    # into a sticky one for every retry under the same X-Request-Id.
    if status_code >= 500:
        return body, status_code

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


@dataclass(frozen=True)
class IdempotencyKey:
    """Per-request handle returned by the `idempotency_key` dependency.

    Holds the parsed `X-Request-Id` (or `None` when the header is absent)
    and exposes `replay_or_record` so route handlers don't need to thread
    the raw header value through the call. The underlying behaviour is
    identical to calling `replay_or_record` directly — see module docstring.
    """

    request_id: str | None

    async def replay_or_record(
        self,
        *,
        user_id: str,
        do: Callable[[], Awaitable[Tuple[Any, int]]],
    ) -> Tuple[Any, int]:
        return await replay_or_record(
            user_id=user_id, request_id=self.request_id, do=do
        )


async def idempotency_key(
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> IdempotencyKey:
    """FastAPI dependency that pulls `X-Request-Id` and returns an `IdempotencyKey`.

    Route usage:

        idem: IdempotencyKey = Depends(idempotency_key)
        body, status = await idem.replay_or_record(user_id=user.id, do=_do)

    See the module docstring for full semantics. The dependency stays
    opt-in: a missing header yields `IdempotencyKey(request_id=None)`,
    which short-circuits to calling `do()` once and skipping the store.
    """
    return IdempotencyKey(request_id=x_request_id)
