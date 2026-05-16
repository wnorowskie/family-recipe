"""Unit tests for src/idempotency.py — X-Request-Id replay (issue #180)
and at-most-once handler execution via INSERT ... ON CONFLICT (issue #196).

Setup notes
-----------

The helper now goes through `prisma.query_first` (claim, takeover) and
`prisma.execute_raw` (fill, delete) instead of `find_unique` + `upsert`.
The shared `mock_prisma` fixture in tests/conftest.py covers the model-
shaped methods (find_unique etc.) but not the connection-level raw
helpers — so each test wires those up locally with `AsyncMock`.

Each test composes the same three building blocks:

- `_install_winning_claim()`  — `query_first` returns `{"id": "claim-X"}`
- `_install_losing_claim()`   — `query_first` returns `None`
- `_install_existing_row(...)`— `find_unique` returns the given row

The tests assert on observable behaviour (handler runs N times, body
content) plus the minimum query-shape checks needed to guarantee the
at-most-once contract (only one winner runs `do()` per key).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src import idempotency
from src.errors import ApiError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _do_once_factory():
    """Return a (handler, counter) pair; counter.calls counts handler runs."""
    counter = SimpleNamespace(calls=0)

    async def handler():
        counter.calls += 1
        return ({"created": counter.calls}, 201)

    return handler, counter


def _install_winning_claim(mock_prisma, claim_id: str = "claim-A") -> None:
    """Make the next query_first call return a winning claim row.

    `query_first` is used for both claim-INSERT and stale-takeover-UPDATE;
    a single-shot return value is fine for tests that exercise just one
    of those paths.
    """
    mock_prisma.query_first = AsyncMock(return_value={"id": claim_id})
    mock_prisma.execute_raw = AsyncMock(return_value=1)


def _install_losing_claim(mock_prisma) -> None:
    """Make the next query_first call return None (lost the race)."""
    mock_prisma.query_first = AsyncMock(return_value=None)
    mock_prisma.execute_raw = AsyncMock(return_value=1)


def _install_existing_row(mock_prisma, row) -> None:
    mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=row)


def _row(*, status_code: int, body, created_at=None, row_id: str = "row-1"):
    return SimpleNamespace(
        id=row_id,
        statusCode=status_code,
        responseBody=body,
        createdAt=created_at or datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Existing AC: header semantics, replay window, per-user scoping, 5xx skip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_request_id_runs_handler_and_skips_store(mock_prisma):
    handler, counter = await _do_once_factory()
    mock_prisma.query_first = AsyncMock()
    mock_prisma.execute_raw = AsyncMock()

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id=None, do=handler
    )

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    mock_prisma.query_first.assert_not_awaited()
    mock_prisma.execute_raw.assert_not_awaited()
    mock_prisma.idempotencykey.find_unique.assert_not_awaited()


@pytest.mark.asyncio
async def test_winner_runs_handler_then_fills_claim(mock_prisma):
    """First call wins the claim → handler runs → row gets filled via UPDATE."""
    handler, counter = await _do_once_factory()
    _install_winning_claim(mock_prisma, claim_id="claim-fresh")

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-A", do=handler
    )

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    # One INSERT (the claim) + one UPDATE (the fill).
    assert mock_prisma.query_first.await_count == 1
    assert mock_prisma.execute_raw.await_count == 1
    fill_args = mock_prisma.execute_raw.await_args.args
    assert fill_args[0].lstrip().startswith("UPDATE")
    assert fill_args[1] == 201
    assert fill_args[3] == "claim-fresh"


@pytest.mark.asyncio
async def test_loser_with_filled_row_replays_without_running_handler(mock_prisma):
    """Second call loses the claim → finds a filled row → replays it."""
    handler, counter = await _do_once_factory()
    _install_losing_claim(mock_prisma)
    _install_existing_row(
        mock_prisma,
        _row(status_code=201, body={"created": 1}),
    )

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-A", do=handler
    )

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 0, "handler must not run on replay"


@pytest.mark.asyncio
async def test_different_request_ids_each_run_the_handler(mock_prisma):
    """Different X-Request-Ids must each get their own claim + handler run."""
    handler, counter = await _do_once_factory()
    # Both calls win their own claim (different keys → no conflict).
    mock_prisma.query_first = AsyncMock(
        side_effect=[{"id": "claim-A"}, {"id": "claim-B"}]
    )
    mock_prisma.execute_raw = AsyncMock(return_value=1)

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
    """User A's request id must not collide with user B's same id.

    Both users win their own claims because the unique constraint is
    `(user_id, request_id)` — different user_id means no conflict, even
    with identical request_id.
    """
    handler, counter = await _do_once_factory()
    mock_prisma.query_first = AsyncMock(
        side_effect=[{"id": "claim-A"}, {"id": "claim-B"}]
    )
    mock_prisma.execute_raw = AsyncMock(return_value=1)

    await idempotency.replay_or_record(user_id="userA", request_id="shared", do=handler)
    await idempotency.replay_or_record(user_id="userB", request_id="shared", do=handler)
    assert counter.calls == 2

    # Confirm both INSERTs went through with user_id as a positional arg.
    # Positional layout of _try_claim's INSERT: (sql, id, user_id, request_id, status, body)
    insert_calls = mock_prisma.query_first.await_args_list
    assert insert_calls[0].args[2] == "userA"
    assert insert_calls[1].args[2] == "userB"


@pytest.mark.asyncio
async def test_stale_row_is_taken_over_and_handler_runs_again(mock_prisma):
    """A row past REPLAY_WINDOW must NOT replay; the helper takes it over
    and runs the handler again.

    The dispatch path is: lose initial claim → find_unique returns a
    stale row → guarded UPDATE (query_first) refreshes it → handler runs
    → fill UPDATE (execute_raw).
    """
    handler, counter = await _do_once_factory()
    stale = _row(
        status_code=201,
        body={"created": "stale"},
        created_at=datetime.now(timezone.utc) - idempotency.REPLAY_WINDOW - timedelta(seconds=1),
        row_id="stale-1",
    )
    # query_first is called twice: once for the losing claim INSERT
    # (returns None), then again for the takeover UPDATE (returns the
    # refreshed row id).
    mock_prisma.query_first = AsyncMock(
        side_effect=[None, {"id": "stale-1"}]
    )
    mock_prisma.execute_raw = AsyncMock(return_value=1)
    _install_existing_row(mock_prisma, stale)

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-old", do=handler
    )

    assert body == {"created": 1}
    assert status == 201
    assert counter.calls == 1, "stale row must not short-circuit the handler"
    # The fill UPDATE ran against the refreshed row.
    fill_args = mock_prisma.execute_raw.await_args.args
    assert fill_args[3] == "stale-1"


@pytest.mark.asyncio
async def test_5xx_response_deletes_claim_and_does_not_cache(mock_prisma):
    """A handler that returns 5xx must NOT have its result cached.

    Rationale (see idempotency.py module docstring "Server errors (5xx)
    are NOT cached"): a transient backend failure is not deterministic;
    caching it would convert a recoverable error into a sticky one for
    the next 24h under the same X-Request-Id. The new flow expresses
    this by DELETEing the claim row instead of UPDATEing it, so the next
    retry is free to claim again.
    """
    counter = SimpleNamespace(calls=0)

    async def flaky_handler():
        counter.calls += 1
        if counter.calls == 1:
            return ({"error": {"code": "INTERNAL_ERROR", "message": "boom"}}, 500)
        return ({"created": counter.calls}, 201)

    # Both calls win their own fresh claim.
    mock_prisma.query_first = AsyncMock(
        side_effect=[{"id": "claim-1"}, {"id": "claim-2"}]
    )
    mock_prisma.execute_raw = AsyncMock(return_value=1)

    body1, status1 = await idempotency.replay_or_record(
        user_id="u1", request_id="req-flaky", do=flaky_handler
    )
    assert (body1, status1) == (
        {"error": {"code": "INTERNAL_ERROR", "message": "boom"}}, 500,
    )
    # The 5xx call DELETEs its claim — assert by SQL prefix on the first
    # execute_raw call.
    first_exec = mock_prisma.execute_raw.await_args_list[0].args
    assert first_exec[0].lstrip().startswith("DELETE")
    assert first_exec[1] == "claim-1"

    body2, status2 = await idempotency.replay_or_record(
        user_id="u1", request_id="req-flaky", do=flaky_handler
    )
    assert (body2, status2) == ({"created": 2}, 201)
    assert counter.calls == 2

    # The 2xx call FILLs its claim (UPDATE).
    second_exec = mock_prisma.execute_raw.await_args_list[1].args
    assert second_exec[0].lstrip().startswith("UPDATE")


@pytest.mark.asyncio
async def test_4xx_response_is_cached(mock_prisma):
    """Client errors (4xx) reflect deterministic input/auth state and MUST
    cache so a retry returns the same envelope rather than letting the
    client "shake out" a different outcome by hammering the same id."""
    counter = SimpleNamespace(calls=0)

    async def validation_failing_handler():
        counter.calls += 1
        return ({"error": {"code": "VALIDATION_ERROR", "message": "bad"}}, 400)

    _install_winning_claim(mock_prisma, claim_id="claim-400")

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-400", do=validation_failing_handler
    )
    assert (body, status) == (
        {"error": {"code": "VALIDATION_ERROR", "message": "bad"}}, 400,
    )
    # 4xx fills the claim (UPDATE), it does NOT delete.
    assert mock_prisma.execute_raw.await_count == 1
    fill_sql = mock_prisma.execute_raw.await_args.args[0]
    assert fill_sql.lstrip().startswith("UPDATE")


@pytest.mark.asyncio
async def test_handler_exception_deletes_claim(mock_prisma):
    """An unhandled exception in `do()` must drop the claim so a retry
    can run fresh — same rationale as 5xx. Without this, a buggy handler
    would lock its key for 24h: the loser would 409 forever and the
    winner can't replay either (no row was ever filled)."""
    _install_winning_claim(mock_prisma, claim_id="claim-boom")

    async def crashing_handler():
        raise RuntimeError("kaboom")

    with pytest.raises(RuntimeError, match="kaboom"):
        await idempotency.replay_or_record(
            user_id="u1", request_id="req-crash", do=crashing_handler
        )

    # The claim was DELETEd, not filled.
    assert mock_prisma.execute_raw.await_count == 1
    sql = mock_prisma.execute_raw.await_args.args[0]
    assert sql.lstrip().startswith("DELETE")


@pytest.mark.asyncio
async def test_naive_created_at_from_prisma_is_treated_as_utc(mock_prisma):
    """Python Prisma client returns naive datetimes; the stale-row
    detection must promote them to aware UTC before comparing against
    `now(tz=UTC)`. A fresh naive row must replay (not be treated as stale)."""
    handler, counter = await _do_once_factory()
    fresh_naive = _row(
        status_code=201,
        body={"created": 99},
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),  # naive — no tzinfo
    )
    _install_losing_claim(mock_prisma)
    _install_existing_row(mock_prisma, fresh_naive)

    body, status = await idempotency.replay_or_record(
        user_id="u1", request_id="req-naive", do=handler
    )

    assert body == {"created": 99}
    assert status == 201
    assert counter.calls == 0, "fresh naive-utc row must replay, not run handler"


# ---------------------------------------------------------------------------
# Issue #196: at-most-once under concurrent retries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_callers_run_handler_at_most_once(mock_prisma, monkeypatch):
    """Two simultaneous replay_or_record calls with the same key:
    only the winner runs `do()`, the loser short-polls and replays.

    This is the core #196 invariant. We simulate Postgres's serialisation
    by handing out a single winning claim (first query_first call →
    {"id": "claim"}) and then `None` to every subsequent caller. A
    `barrier` keeps the winner's handler suspended long enough for the
    loser to enter its short-poll loop; once the winner fills the claim,
    the loser's polled find_unique sees the filled row and replays.
    """
    handler_runs = SimpleNamespace(calls=0)
    handler_started = asyncio.Event()
    release_handler = asyncio.Event()

    async def slow_handler():
        handler_runs.calls += 1
        handler_started.set()
        await release_handler.wait()
        return ({"created": handler_runs.calls}, 201)

    # First query_first wins; every subsequent query_first loses (None).
    # query_first is also used for stale takeover, but we never go down
    # that path in this test (the row is always fresh).
    claim_calls = SimpleNamespace(n=0)

    async def query_first_dispatcher(*args, **kwargs):
        claim_calls.n += 1
        return {"id": "the-only-claim"} if claim_calls.n == 1 else None

    mock_prisma.query_first = AsyncMock(side_effect=query_first_dispatcher)
    mock_prisma.execute_raw = AsyncMock(return_value=1)

    # find_unique is the loser's window into the in-flight claim. Before
    # the winner fills, it returns the in-flight sentinel; after, the
    # filled row. Toggle by reading a flag the winner sets via the fill
    # `execute_raw` call.
    fill_done = SimpleNamespace(done=False)

    async def find_unique_dispatcher(**kwargs):
        if fill_done.done:
            return _row(status_code=201, body={"created": 1}, row_id="the-only-claim")
        return _row(
            status_code=idempotency._IN_FLIGHT_STATUS,
            body={},
            row_id="the-only-claim",
        )

    mock_prisma.idempotencykey.find_unique = AsyncMock(
        side_effect=find_unique_dispatcher
    )

    # Wrap execute_raw to flip fill_done.done as soon as the winner's
    # fill UPDATE runs — this is what the loser's poll waits to see.
    real_exec = mock_prisma.execute_raw

    async def execute_raw_with_fill_signal(*args, **kwargs):
        result = await real_exec(*args, **kwargs)
        if args and args[0].lstrip().startswith("UPDATE"):
            fill_done.done = True
        return result

    mock_prisma.execute_raw = AsyncMock(side_effect=execute_raw_with_fill_signal)

    # Tighten the poll interval so the test doesn't take 1s wall time.
    monkeypatch.setattr(idempotency, "_POLL_INTERVAL_S", 0.01)

    async def winner_task():
        return await idempotency.replay_or_record(
            user_id="u1", request_id="rid-shared", do=slow_handler
        )

    async def loser_task():
        # Wait until the winner is past its claim and inside the handler
        # before we start — this guarantees the second query_first sees
        # the loser branch.
        await handler_started.wait()
        result = await idempotency.replay_or_record(
            user_id="u1", request_id="rid-shared", do=slow_handler
        )
        # Once the loser is in its poll loop, release the winner so the
        # poll observes the fill and replays.
        return result

    async def release_after_loser_polls():
        # Give the loser one poll tick to land in _wait_for_winner... then
        # release the winner.
        await handler_started.wait()
        await asyncio.sleep(0.03)  # ≥ one _POLL_INTERVAL_S tick (0.01s)
        release_handler.set()

    winner_result, loser_result, _ = await asyncio.gather(
        winner_task(), loser_task(), release_after_loser_polls()
    )

    assert winner_result == ({"created": 1}, 201)
    assert loser_result == ({"created": 1}, 201)
    assert handler_runs.calls == 1, "handler must run exactly once across both callers"


@pytest.mark.asyncio
async def test_loser_409s_when_poll_window_expires(mock_prisma, monkeypatch):
    """If the winner's handler outlives the loser's poll window, the
    loser surfaces 409 IDEMPOTENCY_IN_FLIGHT instead of waiting forever.

    This caps tail latency on duplicate retries — a 30s handler doesn't
    pin a duplicate request's HTTP worker for 30s.
    """
    _install_losing_claim(mock_prisma)
    _install_existing_row(
        mock_prisma,
        _row(
            status_code=idempotency._IN_FLIGHT_STATUS,
            body={},
            row_id="in-flight-1",
        ),
    )
    # Tighten the poll so the test exits in ~5ms, not ~1s.
    monkeypatch.setattr(idempotency, "_POLL_INTERVAL_S", 0.001)

    async def handler():
        # Should NEVER run — the loser path doesn't invoke the handler.
        raise AssertionError("handler must not run on the loser path")

    with pytest.raises(ApiError) as exc_info:
        await idempotency.replay_or_record(
            user_id="u1", request_id="rid-stuck", do=handler
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "IDEMPOTENCY_IN_FLIGHT"


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
    """`IdempotencyKey.replay_or_record` must share the store with the
    module function — calling either should hit the same claim INSERT
    against the same (user_id, request_id) positional args."""
    handler, counter = await _do_once_factory()
    _install_winning_claim(mock_prisma, claim_id="claim-via-dep")
    key = idempotency.IdempotencyKey(request_id="req-via-dep")

    body, status = await key.replay_or_record(user_id="u1", do=handler)

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    # Confirms the dependency went through the same claim path.
    # Positional layout of _try_claim's INSERT: (sql, id, user_id, request_id, status, body)
    insert_args = mock_prisma.query_first.await_args.args
    assert insert_args[2] == "u1"           # user_id
    assert insert_args[3] == "req-via-dep"  # request_id


@pytest.mark.asyncio
async def test_idempotency_key_method_no_request_id_skips_store(mock_prisma):
    """Missing header → dependency yields request_id=None → handler runs,
    store is untouched."""
    handler, counter = await _do_once_factory()
    mock_prisma.query_first = AsyncMock()
    mock_prisma.execute_raw = AsyncMock()
    key = idempotency.IdempotencyKey(request_id=None)

    body, status = await key.replay_or_record(user_id="u1", do=handler)

    assert (body, status) == ({"created": 1}, 201)
    assert counter.calls == 1
    mock_prisma.query_first.assert_not_awaited()
    mock_prisma.execute_raw.assert_not_awaited()


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

    # First call: wins the claim → handler runs → fill.
    _install_winning_claim(mock_prisma, claim_id="claim-rid-1")
    resp1 = client.post("/probe", headers={"X-Request-Id": "rid-1"})
    assert resp1.status_code == 200
    assert resp1.json() == {"body": {"n": 1}, "status": 201}
    assert counter.calls == 1

    # Second call: loses the claim → finds the filled row → replays.
    _install_losing_claim(mock_prisma)
    _install_existing_row(
        mock_prisma,
        _row(status_code=201, body={"n": 1}, row_id="claim-rid-1"),
    )
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

    mock_prisma.query_first = AsyncMock()
    mock_prisma.execute_raw = AsyncMock()
    client = TestClient(app)
    resp = client.post("/probe")  # no X-Request-Id

    assert resp.status_code == 200
    assert resp.json() == {"body": {"n": 1}, "status": 201}
    assert counter.calls == 1
    mock_prisma.query_first.assert_not_awaited()
    mock_prisma.execute_raw.assert_not_awaited()


@pytest.mark.asyncio
async def test_in_flight_409_surfaces_as_standard_error_envelope(
    mock_prisma, monkeypatch
):
    """End-to-end shape check: when the loser-409 path fires through a
    real route, the response body must be `{error: {code, message}}` —
    the documented envelope — not FastAPI's default `{detail: ...}`.

    The helper raises `ApiError` (not `HTTPException`) precisely so the
    global handler in src/main.py unwraps it into the standard envelope.
    Without this end-to-end test the 409's response shape could silently
    diverge from every other error in the API and only surface in SPA
    bug reports (SPA keys off `error.code`)."""
    from fastapi import Depends
    from fastapi.testclient import TestClient

    from src.main import app  # registered ApiError handler is on this app

    counter = SimpleNamespace(calls=0)

    @app.post("/_probe_in_flight")
    async def probe(idem: idempotency.IdempotencyKey = Depends(idempotency.idempotency_key)):
        async def _do():
            counter.calls += 1
            return ({"n": counter.calls}, 201)
        body, status = await idem.replay_or_record(user_id="u1", do=_do)
        return {"body": body, "status": status}

    try:
        # Force the loser-in-flight path: lose the claim, find an in-flight
        # row, never let it fill. Tighten the poll so the test exits fast.
        _install_losing_claim(mock_prisma)
        _install_existing_row(
            mock_prisma,
            _row(
                status_code=idempotency._IN_FLIGHT_STATUS,
                body={},
                row_id="in-flight-e2e",
            ),
        )
        monkeypatch.setattr(idempotency, "_POLL_INTERVAL_S", 0.001)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/_probe_in_flight", headers={"X-Request-Id": "rid-stuck"})

        assert resp.status_code == 409
        assert resp.json() == {
            "error": {
                "code": "IDEMPOTENCY_IN_FLIGHT",
                "message": "A request with this X-Request-Id is still being processed. Retry shortly.",
            }
        }
        assert counter.calls == 0, "handler must not run on the loser path"
    finally:
        # Remove the test-only route so the app stays clean for other tests.
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/_probe_in_flight"]
