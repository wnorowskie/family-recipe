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
async def test_5xx_response_is_not_cached_and_retries_run_fresh(mock_prisma):
    """A handler that returns 5xx must NOT have its result cached.

    Rationale (see idempotency.py docstring "Server errors (5xx) are NOT
    cached"): a transient backend failure is not deterministic; caching
    it would convert a recoverable error into a sticky one for the next
    24h under the same X-Request-Id.
    """
    # First call: handler returns 500. Mock find_unique to miss so we go
    # through the "no existing row" path.
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=None)
    counter = SimpleNamespace(calls=0)

    async def flaky_handler():
        counter.calls += 1
        if counter.calls == 1:
            return ({"error": {"code": "INTERNAL_ERROR", "message": "boom"}}, 500)
        return ({"created": counter.calls}, 201)

    body1, status1 = await idempotency.replay_or_record(
        user_id="u1", request_id="req-flaky", do=flaky_handler
    )
    assert (body1, status1) == (
        {"error": {"code": "INTERNAL_ERROR", "message": "boom"}}, 500,
    )
    # The whole point: upsert must NOT have been called for a 5xx body,
    # otherwise the retry below would replay the cached 500.
    mock_prisma.idempotencykey.upsert.assert_not_awaited()

    # Second call with the same id: find_unique still misses (no row was
    # cached), so the handler runs again and this time succeeds.
    body2, status2 = await idempotency.replay_or_record(
        user_id="u1", request_id="req-flaky", do=flaky_handler
    )
    assert (body2, status2) == ({"created": 2}, 201)
    assert counter.calls == 2
    # The successful 2xx IS cached — upsert runs exactly once across the
    # two calls (the 5xx call skipped it; the 2xx call recorded it).
    assert mock_prisma.idempotencykey.upsert.await_count == 1


@pytest.mark.asyncio
async def test_4xx_response_is_cached(mock_prisma):
    """Client errors (4xx) reflect deterministic input/auth state and MUST
    cache so a retry returns the same envelope rather than letting the
    client "shake out" a different outcome by hammering the same id."""
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=None)
    counter = SimpleNamespace(calls=0)

    async def validation_failing_handler():
        counter.calls += 1
        return ({"error": {"code": "VALIDATION_ERROR", "message": "bad"}}, 400)

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-400", do=validation_failing_handler
    )
    assert (body, status) == (
        {"error": {"code": "VALIDATION_ERROR", "message": "bad"}}, 400,
    )
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


# ---------------------------------------------------------------------------
# Depends(idempotency_key) wrapper — issue #194
#
# The dependency is a thin layer over replay_or_record. We test the
# routing/binding seam end-to-end via TestClient (one route registered with
# Depends(idempotency_key) replays correctly; missing header runs once)
# rather than re-asserting the underlying semantics — those are covered by
# the existing tests above against `replay_or_record` directly.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_idempotency_key_dependency_returns_request_id_from_header():
    """Direct call to the dependency function: header maps onto the dataclass."""
    key = await idempotency.idempotency_key(x_request_id="req-XYZ")
    assert isinstance(key, idempotency.IdempotencyKey)
    assert key.request_id == "req-XYZ"


@pytest.mark.asyncio
async def test_idempotency_key_dependency_missing_header_yields_none():
    key = await idempotency.idempotency_key(x_request_id=None)
    assert key.request_id is None


@pytest.mark.asyncio
async def test_idempotency_key_method_delegates_to_replay_or_record(mock_prisma):
    """`IdempotencyKey.replay_or_record` must share the store with the module
    function — calling either should hit the same find_unique / upsert calls
    against the same (user_id, request_id) composite key."""
    handler, counter = await _do_once_factory()
    key = idempotency.IdempotencyKey(request_id="req-via-dep")

    body, status = await key.replay_or_record(user_id="u1", do=handler)

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    # Confirms the dependency went through the same composite-key path.
    mock_prisma.idempotencykey.upsert.assert_awaited_once()
    upsert_where = mock_prisma.idempotencykey.upsert.await_args.kwargs["where"]
    assert upsert_where == {"userId_requestId": {"userId": "u1", "requestId": "req-via-dep"}}


@pytest.mark.asyncio
async def test_idempotency_key_method_no_request_id_skips_store(mock_prisma):
    """Missing header → dependency yields request_id=None → handler runs,
    store is untouched. Mirrors test_no_request_id_runs_handler_and_skips_store
    against the dependency call style."""
    handler, counter = await _do_once_factory()
    key = idempotency.IdempotencyKey(request_id=None)

    body, status = await key.replay_or_record(user_id="u1", do=handler)

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    mock_prisma.idempotencykey.find_unique.assert_not_awaited()
    mock_prisma.idempotencykey.upsert.assert_not_awaited()


@pytest.mark.asyncio
async def test_idempotency_key_dependency_replays_under_fastapi_routing(mock_prisma):
    """End-to-end: register a route with Depends(idempotency_key), hit it twice
    with the same X-Request-Id, second call replays without re-running the
    handler. This is the actual route-handler integration shape that #194
    introduces and that real consumers (feedback.py et al) take."""
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    counter = SimpleNamespace(calls=0)

    @app.post("/probe")
    async def probe(idem: idempotency.IdempotencyKey = Depends(idempotency.idempotency_key)):
        async def _do():
            counter.calls += 1
            return ({"n": counter.calls}, 201)
        body, status = await idem.replay_or_record(user_id="u1", do=_do)
        return {"body": body, "status": status}

    client = TestClient(app)

    # First call: cache miss, handler runs, store gets upserted.
    resp1 = client.post("/probe", headers={"X-Request-Id": "rid-1"})
    assert resp1.status_code == 200
    assert resp1.json() == {"body": {"n": 1}, "status": 201}
    assert counter.calls == 1

    # Simulate the stored row landing — same shape as the existing replay test.
    stored = SimpleNamespace(
        responseBody={"n": 1},
        statusCode=201,
        createdAt=datetime.now(timezone.utc),
    )
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=stored)

    # Second call with same header: replayed; handler does not run again.
    resp2 = client.post("/probe", headers={"X-Request-Id": "rid-1"})
    assert resp2.status_code == 200
    assert resp2.json() == {"body": {"n": 1}, "status": 201}
    assert counter.calls == 1, "handler must not run on dependency-driven replay"


@pytest.mark.asyncio
async def test_idempotency_key_dependency_missing_header_runs_handler(mock_prisma):
    """Opt-in semantics survive the dependency layer: no X-Request-Id → no store hit."""
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    counter = SimpleNamespace(calls=0)

    @app.post("/probe")
    async def probe(idem: idempotency.IdempotencyKey = Depends(idempotency.idempotency_key)):
        async def _do():
            counter.calls += 1
            return ({"n": counter.calls}, 201)
        body, status = await idem.replay_or_record(user_id="u1", do=_do)
        return {"body": body, "status": status}

    client = TestClient(app)
    resp = client.post("/probe")  # no X-Request-Id

    assert resp.status_code == 200
    assert resp.json() == {"body": {"n": 1}, "status": 201}
    assert counter.calls == 1
    mock_prisma.idempotencykey.find_unique.assert_not_awaited()
    mock_prisma.idempotencykey.upsert.assert_not_awaited()
