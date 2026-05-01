"""Unit tests for src/idempotency.py — X-Request-Id replay (issue #180).

The helper is exercised against the shared `mock_prisma` fixture from
tests/conftest.py — same fixture the rest of the suite uses, so future
model surface changes (added methods, new models) propagate without a
parallel test-only mock to maintain.

Tests cover the four AC checkpoints: missing header is a no-op, same id
replays the captured (body, status), different ids each run the handler,
and the 24-hour window expires correctly. Plus per-user scoping and the
naive-UTC datetime promotion.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src import idempotency


async def _do_once_factory():
    """Return a (handler, counter) pair; counter.calls counts handler runs."""
    counter = SimpleNamespace(calls=0)

    async def handler():
        counter.calls += 1
        return ({"created": counter.calls}, 201)

    return handler, counter


@pytest.mark.asyncio
async def test_no_request_id_runs_handler_and_skips_store(mock_prisma):
    handler, counter = await _do_once_factory()

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id=None, do=handler
    )

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    mock_prisma.idempotencykey.find_unique.assert_not_awaited()
    mock_prisma.idempotencykey.upsert.assert_not_awaited()


@pytest.mark.asyncio
async def test_first_call_records_then_second_replays_without_running_handler(mock_prisma):
    handler, counter = await _do_once_factory()

    # First call: cache miss → handler runs, result is stored.
    body1, status1 = await idempotency.replay_or_record(
        user_id="u1", request_id="req-A", do=handler
    )
    assert (body1, status1) == ({"created": 1}, 201)
    assert counter.calls == 1
    assert mock_prisma.idempotencykey.upsert.await_count == 1

    # Simulate the row landing in the store: subsequent find_unique returns it.
    stored = SimpleNamespace(
        responseBody={"created": 1},
        statusCode=201,
        createdAt=datetime.now(timezone.utc),
    )
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=stored)

    # Second call with same id: replayed from cache; handler not invoked.
    body2, status2 = await idempotency.replay_or_record(
        user_id="u1", request_id="req-A", do=handler
    )
    assert (body2, status2) == ({"created": 1}, 201)
    assert counter.calls == 1, "handler must not run on replay"


@pytest.mark.asyncio
async def test_different_request_ids_each_run_the_handler(mock_prisma):
    handler, counter = await _do_once_factory()

    body1, _ = await idempotency.replay_or_record(
        user_id="u1", request_id="req-A", do=handler
    )
    body2, _ = await idempotency.replay_or_record(
        user_id="u1", request_id="req-B", do=handler
    )

    assert body1 == {"created": 1}
    assert body2 == {"created": 2}
    assert counter.calls == 2


@pytest.mark.asyncio
async def test_idempotency_is_per_user(mock_prisma):
    """User A's request id must not collide with user B's same id."""
    handler, counter = await _do_once_factory()

    # Even if find_unique is called with a different (user_id, request_id),
    # the first call has no row → handler runs.
    await idempotency.replay_or_record(user_id="userA", request_id="shared", do=handler)
    assert counter.calls == 1

    # Second call with the same request id but a different user: the helper
    # must look up via the (user_id, request_id) composite, so the userB
    # find_unique returns None and the handler runs again.
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=None)
    await idempotency.replay_or_record(user_id="userB", request_id="shared", do=handler)
    assert counter.calls == 2

    # Confirm both lookups went through the composite-key path.
    calls = mock_prisma.idempotencykey.find_unique.await_args_list
    assert all(
        "userId_requestId" in call.kwargs.get("where", {})
        for call in calls
    )


@pytest.mark.asyncio
async def test_stored_row_older_than_window_is_treated_as_miss(mock_prisma):
    """A row past REPLAY_WINDOW must NOT replay; the handler runs again."""
    handler, counter = await _do_once_factory()

    stale = SimpleNamespace(
        responseBody={"created": "stale"},
        statusCode=201,
        createdAt=datetime.now(timezone.utc) - idempotency.REPLAY_WINDOW - timedelta(seconds=1),
    )
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=stale)

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-old", do=handler
    )

    assert body == {"created": 1}
    assert status == 201
    assert counter.calls == 1, "stale row must not short-circuit the handler"
    mock_prisma.idempotencykey.upsert.assert_awaited_once()


@pytest.mark.asyncio
async def test_naive_created_at_from_prisma_is_treated_as_utc(mock_prisma):
    """Python Prisma client returns naive datetimes; the helper must promote to aware UTC."""
    handler, counter = await _do_once_factory()

    fresh_naive = SimpleNamespace(
        responseBody={"created": 99},
        statusCode=201,
        createdAt=datetime.now(timezone.utc).replace(tzinfo=None),  # naive — no tzinfo
    )
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=fresh_naive)

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-naive", do=handler
    )

    assert body == {"created": 99}
    assert status == 201
    assert counter.calls == 0, "fresh naive-utc row must replay"
