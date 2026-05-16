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

## At-most-once handler execution (issue #196)

The helper uses an `INSERT … ON CONFLICT DO NOTHING RETURNING` claim to
serialise concurrent retries. Two callers racing on the same
`(user_id, request_id)` end up in one of three states:

1. **Winner** — INSERT returns a row id. Runs `do()`, then UPDATEs the
   claim row with the real `(status_code, response_body)`.
2. **Loser, in-flight** — INSERT conflicts. Re-reads the row and finds a
   sentinel (`status_code = 0`) meaning the winner is still running.
   Short-polls for up to ~2s; if the winner finishes, replays its result;
   otherwise returns `409 IDEMPOTENCY_IN_FLIGHT`.
3. **Loser, filled** — INSERT conflicts. Re-reads the row and finds a real
   `(status_code, response_body)`. Replays it.

The Postgres unique constraint on `(user_id, request_id)` is what makes
this safe — only one INSERT can succeed per key, regardless of how many
concurrent retries arrive.

## TTL strategy: passive overwrite, not lazy delete

Stale rows are not deleted. The replay window is enforced at *read* time:
when a row older than 24h is found, the helper attempts to take it over
with a guarded UPDATE (`WHERE created_at <= now() - 24h RETURNING id`)
and runs the handler again — overwriting the stale row with the new
`(status, body, created_at)` under the same `(user_id, request_id)` key.

The guarded UPDATE prevents a race with a concurrent fresh claim: if
another caller has already refreshed the row between our read and our
takeover, the UPDATE returns nothing and we fall back to the
loser-in-flight or loser-filled paths.

Net effect on table size is the same as lazy delete (bounded by the
active key set, not history) but no DELETE is ever issued. A periodic
sweep can be added later if the active key set itself grows
uncomfortably; the `(created_at)` index is in place for that.

## Server errors (5xx) are NOT cached

When `do()` returns a status code ≥ 500 the winner DELETEs its claim row
instead of filling it, so the next retry under the same `X-Request-Id`
is free to claim again and run the handler fresh. The idempotency
contract is "same input → same output" for *deterministic* outcomes; a
transient DB error or upstream timeout is neither. Caching a 500 for the
24h replay window would convert a recoverable failure into a sticky one
— a legitimate client retry would replay the failure instead of getting
a chance at success once the underlying issue (DB unreachable, GCS
hiccup, etc.) clears.

`4xx` responses ARE cached. Those reflect deterministic input/auth
state — retrying with the same request id should keep returning the
same client-error envelope, otherwise the SPA could "shake out" a
validation rejection by hammering the same id.

This means the cache stores only `{2xx, 4xx}`. The asymmetry is
intentional and documented at the call site of every write endpoint
that uses this helper.
"""

from __future__ import annotations

import asyncio
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Tuple

from fastapi import Header, HTTPException

from .db import prisma

REPLAY_WINDOW = timedelta(hours=24)

# Sentinel marking a row that has been claimed but whose handler hasn't
# finished yet. status_code is NOT NULL on the model so we can't use NULL;
# 0 is invalid as an HTTP status, so it can't collide with a real cached
# response.
_IN_FLIGHT_STATUS = 0
_EMPTY_BODY_JSON = "{}"

# Loser short-poll: 5 attempts, 200ms apart → ~1s total wall time before
# we give up and 409. The winner's handler typically completes in <100ms,
# so this absorbs ordinary handler latency without 409-ing legitimate
# sequential retries that arrive a few ms apart.
_POLL_INTERVAL_S = 0.2
_POLL_ATTEMPTS = 5


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

    Raises `HTTPException(409, IDEMPOTENCY_IN_FLIGHT)` if a concurrent caller
    has claimed the key and is still executing its handler when our short
    poll window expires. Callers can retry — by the time they do, the
    winner's row will be filled and the result will replay normally.
    """
    if not request_id:
        return await do()

    claim_id = await _try_claim(user_id=user_id, request_id=request_id)

    if claim_id is None:
        return await _replay_or_takeover(user_id=user_id, request_id=request_id, do=do)

    try:
        body, status_code = await do()
    except BaseException:
        # Handler crashed before producing a result. Drop the claim so the
        # next retry can run fresh — same rationale as the 5xx skip path.
        await _delete_claim(claim_id)
        raise

    if status_code >= 500:
        await _delete_claim(claim_id)
        return body, status_code

    await _fill_claim(claim_id=claim_id, status_code=status_code, body=body)
    return body, status_code


async def _try_claim(*, user_id: str, request_id: str) -> str | None:
    """Attempt to insert a fresh in-flight claim row.

    Returns the new row's `id` on success, or `None` if a row already
    exists for `(user_id, request_id)`. Postgres serialises the contention
    via the unique constraint — exactly one concurrent caller wins.

    The `id` column is `TEXT NOT NULL PRIMARY KEY` with no DB-side
    default; the Prisma `@default(cuid())` is generated client-side and
    we're bypassing the client. `secrets.token_hex(16)` gives a 32-char
    opaque PK — the id is internal-only (never returned to clients, never
    validated as a CUID downstream), so the format doesn't need to match.
    """
    new_id = secrets.token_hex(16)
    row = await prisma.query_first(
        """
        INSERT INTO "idempotency_keys"
            (id, user_id, request_id, status_code, response_body, created_at)
        VALUES
            ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (user_id, request_id) DO NOTHING
        RETURNING id
        """,
        new_id,
        user_id,
        request_id,
        _IN_FLIGHT_STATUS,
        _EMPTY_BODY_JSON,
    )
    if row is None:
        return None
    return row["id"]


async def _replay_or_takeover(
    *,
    user_id: str,
    request_id: str,
    do: Callable[[], Awaitable[Tuple[Any, int]]],
) -> Tuple[Any, int]:
    """Loser path: another caller already claimed `(user_id, request_id)`.

    Three sub-cases:

    - **Stale row**: created_at older than REPLAY_WINDOW. Try to take it
      over with a guarded UPDATE; if it succeeds, run `do()` ourselves.
    - **Filled row**: status_code is a real HTTP code. Replay it.
    - **In-flight row**: status_code is the sentinel. Short-poll, then
      either replay (if the winner finished in time) or 409.
    """
    existing = await prisma.idempotencykey.find_unique(
        where={"userId_requestId": {"userId": user_id, "requestId": request_id}},
    )

    if existing is None:
        # Vanishingly rare: someone deleted the row between our INSERT
        # conflict and our find_unique. Retry the whole thing — at most
        # one extra round-trip in this pathological case.
        return await replay_or_record(user_id=user_id, request_id=request_id, do=do)

    if datetime.now(timezone.utc) - _aware(existing.createdAt) > REPLAY_WINDOW:
        return await _take_over_stale(
            stale_id=existing.id, user_id=user_id, request_id=request_id, do=do
        )

    if existing.statusCode != _IN_FLIGHT_STATUS:
        return existing.responseBody, existing.statusCode

    return await _wait_for_winner_or_conflict(user_id=user_id, request_id=request_id)


async def _take_over_stale(
    *,
    stale_id: str,
    user_id: str,
    request_id: str,
    do: Callable[[], Awaitable[Tuple[Any, int]]],
) -> Tuple[Any, int]:
    """Reset a stale row back to in-flight and run the handler.

    The UPDATE is guarded by `created_at <= now() - 24h` so a concurrent
    fresh claim that already refreshed the row wins the race — we'd see
    no row returned and fall back to a normal loser path.
    """
    refreshed = await prisma.query_first(
        """
        UPDATE "idempotency_keys"
        SET status_code = $1,
            response_body = $2::jsonb,
            created_at = now()
        WHERE id = $3
          AND created_at <= now() - interval '24 hours'
        RETURNING id
        """,
        _IN_FLIGHT_STATUS,
        _EMPTY_BODY_JSON,
        stale_id,
    )

    if refreshed is None:
        # Someone else refreshed the row between our read and our
        # takeover. Re-enter the dispatch — they're now the winner (or
        # someone after them is) and we'll land on the right loser path.
        return await _replay_or_takeover(
            user_id=user_id, request_id=request_id, do=do
        )

    try:
        body, status_code = await do()
    except BaseException:
        await _delete_claim(refreshed["id"])
        raise

    if status_code >= 500:
        await _delete_claim(refreshed["id"])
        return body, status_code

    await _fill_claim(claim_id=refreshed["id"], status_code=status_code, body=body)
    return body, status_code


async def _wait_for_winner_or_conflict(
    *, user_id: str, request_id: str
) -> Tuple[Any, int]:
    """Short-poll the in-flight row until it fills, then replay.

    Returns 409 IDEMPOTENCY_IN_FLIGHT if the winner hasn't filled the row
    by the end of our poll window. The client can retry; by the time the
    retry lands, the winner's handler will have finished and the result
    will replay normally.
    """
    for _ in range(_POLL_ATTEMPTS):
        await asyncio.sleep(_POLL_INTERVAL_S)
        row = await prisma.idempotencykey.find_unique(
            where={"userId_requestId": {"userId": user_id, "requestId": request_id}},
        )
        if row is None:
            # Winner crashed and DELETEd its claim. Surface as in-flight
            # so the retry can claim cleanly.
            break
        if row.statusCode != _IN_FLIGHT_STATUS:
            return row.responseBody, row.statusCode

    raise HTTPException(
        status_code=409,
        detail={
            "code": "IDEMPOTENCY_IN_FLIGHT",
            "message": "A request with this X-Request-Id is still being processed. Retry shortly.",
        },
    )


async def _fill_claim(*, claim_id: str, status_code: int, body: Any) -> None:
    await prisma.execute_raw(
        """
        UPDATE "idempotency_keys"
        SET status_code = $1,
            response_body = $2::jsonb
        WHERE id = $3
        """,
        status_code,
        json.dumps(body),
        claim_id,
    )


async def _delete_claim(claim_id: str) -> None:
    await prisma.execute_raw(
        'DELETE FROM "idempotency_keys" WHERE id = $1',
        claim_id,
    )


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
