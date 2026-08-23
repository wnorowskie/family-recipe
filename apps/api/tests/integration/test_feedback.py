"""Integration tests for /v1/feedback — issue #183.

Bearer-token (access-token) auth via dependencies_v1. Mocks Prisma so the
full FastAPI dependency chain (header parsing, dep injection, response
shape, exception handler) runs without a real DB. Covers every acceptance
criterion in the ticket: happy POST, 401/403 auth gates, admin GET,
X-Request-Id idempotency, and the 21st-call-in-an-hour rate limit.

The rate-limit test resets the module-level limiter at function exit so
state from one test (counter incremented to 20) doesn't leak into the
next; this is a known cost of the in-process limiter design and is
explicitly the reason `feedback_limiter.reset()` exists in src/rate_limit.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional
from unittest.mock import AsyncMock

import pytest

from src import tokens
from src.rate_limit import feedback_limiter
from tests.helpers.error_envelope import assert_error_envelope
from tests.helpers.test_data import make_mock_membership, make_mock_user


def _bearer_headers(
    user_id: str, family_space_id: str, role: str = "member"
) -> dict:
    token = tokens.mint_access_token(
        user_id=user_id, family_space_id=family_space_id, role=role
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_user_lookup(mock_prisma, user, family_space, *, role: str = "member"):
    """Wire the /v1 bearer dep's `user.find_unique` to resolve our user."""
    membership = make_mock_membership(
        userId=user.id,
        familySpaceId=family_space.id,
        role=role,
        familySpace=family_space,
    )
    user_with_membership = make_mock_user(memberships=[membership], id=user.id)
    mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)
    return user_with_membership


def _make_feedback_row(
    *,
    id: str = "fb_1",
    category: str = "bug",
    message: str = "It broke when I clicked Save",
    user_id: Optional[str] = "user_test_123",
    family_space_id: Optional[str] = "family_test_123",
    contact_email: Optional[str] = None,
    page_url: Optional[str] = None,
    user_agent: Optional[str] = None,
    user_obj: Optional[SimpleNamespace] = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        category=category,
        message=message,
        userId=user_id,
        familySpaceId=family_space_id,
        contactEmail=contact_email,
        pageUrl=page_url,
        userAgent=user_agent,
        createdAt=datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
        user=user_obj,
    )


@pytest.fixture(autouse=True)
def _reset_feedback_limiter():
    """Each test starts with a fresh counter window.

    The limiter is module-scoped (single instance shared across the app),
    so without this fixture a test that exercises the 429 path would leave
    the next test's first request rate-limited.
    """
    feedback_limiter.reset()
    yield
    feedback_limiter.reset()


# ---------------------------------------------------------------------------
# POST /v1/feedback
# ---------------------------------------------------------------------------


class TestCreateFeedback:
    def test_unauthenticated_returns_envelope_401(self, client):
        response = client.post(
            "/v1/feedback",
            json={"category": "bug", "message": "ten chars minimum"},
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_invalid_bearer_returns_envelope_401(self, client):
        response = client.post(
            "/v1/feedback",
            headers={"Authorization": "Bearer not-a-jwt"},
            json={"category": "bug", "message": "ten chars minimum"},
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_happy_path_returns_201_with_feedback(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        created = _make_feedback_row(
            id="fb_new",
            user_id=mock_user.id,
            family_space_id=mock_family_space.id,
        )
        mock_prisma.feedbacksubmission.create = AsyncMock(return_value=created)

        response = client.post(
            "/v1/feedback",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"category": "bug", "message": "It broke when I clicked Save"},
        )

        assert response.status_code == 201
        body = response.json()
        assert "feedback" in body
        assert body["feedback"]["id"] == "fb_new"
        assert body["feedback"]["category"] == "bug"
        assert body["feedback"]["userId"] == mock_user.id
        assert body["feedback"]["familySpaceId"] == mock_family_space.id

        # Confirm familySpaceId was scoped from the JWT — without this assertion
        # we'd miss a regression where the handler accepts a payload field that
        # spoofs the family.
        call_args = mock_prisma.feedbacksubmission.create.call_args
        assert call_args.kwargs["data"]["familySpaceId"] == mock_family_space.id
        assert call_args.kwargs["data"]["userId"] == mock_user.id

    def test_message_too_short_returns_400(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        response = client.post(
            "/v1/feedback",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"category": "bug", "message": "too short"},
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_invalid_category_returns_400(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        response = client.post(
            "/v1/feedback",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"category": "complaint", "message": "valid length message"},
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_user_agent_persisted_from_header(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.feedbacksubmission.create = AsyncMock(
            return_value=_make_feedback_row(
                user_id=mock_user.id, family_space_id=mock_family_space.id
            )
        )

        headers = _bearer_headers(mock_user.id, mock_family_space.id)
        headers["User-Agent"] = "test-agent/1.0"
        client.post(
            "/v1/feedback",
            headers=headers,
            json={"category": "suggestion", "message": "the new layout is great"},
        )

        call_args = mock_prisma.feedbacksubmission.create.call_args
        assert call_args.kwargs["data"]["userAgent"] == "test-agent/1.0"


# ---------------------------------------------------------------------------
# X-Request-Id idempotency
# ---------------------------------------------------------------------------


class TestIdempotency:
    def test_same_request_id_replays_original_response(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        """First call records; second call with same X-Request-Id returns the
        cached body without re-running the handler.

        Helper now uses INSERT … ON CONFLICT (issue #196): the first call
        wins the claim via `query_first`, runs the handler, then `execute_raw`
        fills the row. The second call loses the claim (`query_first` → None)
        and replays via `find_unique`.
        """
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        created = _make_feedback_row(
            id="fb_idem_1",
            user_id=mock_user.id,
            family_space_id=mock_family_space.id,
        )
        mock_prisma.feedbacksubmission.create = AsyncMock(return_value=created)

        # First call: wins the claim. Capture what gets stored on the
        # fill UPDATE so the second call can replay it.
        mock_prisma.query_first = AsyncMock(return_value={"id": "claim-feedback"})
        filled: dict = {}

        async def _record_fill(*args, **kwargs):
            # _fill_claim's args: (sql, status_code, body_json, claim_id)
            if args and args[0].lstrip().startswith("UPDATE"):
                filled["statusCode"] = args[1]
                filled["responseBodyJson"] = args[2]
                filled["claimId"] = args[3]
            return 1

        mock_prisma.execute_raw = AsyncMock(side_effect=_record_fill)

        headers = _bearer_headers(mock_user.id, mock_family_space.id)
        headers["X-Request-Id"] = "req-abc-123"
        first = client.post(
            "/v1/feedback",
            headers=headers,
            json={"category": "bug", "message": "first call should land"},
        )
        assert first.status_code == 201
        assert filled.get("statusCode") == 201, "fill UPDATE must run on the winner path"

        # Second call: loses the claim → finds the just-filled row → replays.
        # The Prisma model returns the JSON body parsed (not as a string), so
        # synthesise the row by re-parsing what the fill captured.
        import json as _json
        cached_row = SimpleNamespace(
            id=filled["claimId"],
            statusCode=filled["statusCode"],
            responseBody=_json.loads(filled["responseBodyJson"]),
            createdAt=datetime.now(timezone.utc),
        )
        mock_prisma.query_first = AsyncMock(return_value=None)
        mock_prisma.idempotencykey.find_unique = AsyncMock(return_value=cached_row)
        # If the handler ran again, create would be called twice — assert it
        # is NOT.
        mock_prisma.feedbacksubmission.create.reset_mock()

        second = client.post(
            "/v1/feedback",
            headers=headers,
            json={"category": "bug", "message": "second call should replay"},
        )
        assert second.status_code == 201
        assert second.json() == first.json()
        assert mock_prisma.feedbacksubmission.create.call_count == 0


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


class TestRateLimit:
    def test_21st_call_in_window_returns_429_with_retry_after(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        """20 submissions/hour/user is the documented limit. The 21st must
        return 429 RATE_LIMITED with a Retry-After header (migration plan §
        Rate Limits)."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.feedbacksubmission.create = AsyncMock(
            return_value=_make_feedback_row(
                user_id=mock_user.id, family_space_id=mock_family_space.id
            )
        )

        headers = _bearer_headers(mock_user.id, mock_family_space.id)
        payload = {"category": "bug", "message": "valid length message body"}

        for i in range(20):
            r = client.post("/v1/feedback", headers=headers, json=payload)
            assert r.status_code == 201, f"call {i + 1} should be allowed"

        denied = client.post("/v1/feedback", headers=headers, json=payload)
        assert_error_envelope(denied, status_code=429, code="RATE_LIMITED")
        assert "Retry-After" in denied.headers
        # Retry-After is whole seconds, ≤ window (3600). The exact value
        # depends on test wall-clock pacing, so just assert the bounds.
        retry = int(denied.headers["Retry-After"])
        assert 1 <= retry <= 3600


# ---------------------------------------------------------------------------
# GET /v1/feedback (admin)
# ---------------------------------------------------------------------------


class TestListFeedback:
    def test_unauthenticated_returns_envelope_401(self, client):
        response = client.get("/v1/feedback")
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_non_admin_returns_403(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space, role="member")
        response = client.get(
            "/v1/feedback",
            headers=_bearer_headers(mock_user.id, mock_family_space.id, role="member"),
        )
        assert_error_envelope(response, status_code=403, code="FORBIDDEN")

    def test_admin_gets_items_and_total(
        self, client, mock_prisma, mock_admin_user, mock_family_space
    ):
        _seed_user_lookup(
            mock_prisma, mock_admin_user, mock_family_space, role="admin"
        )
        user_obj = SimpleNamespace(
            id="author_1", name="Alice", email="alice@example.com"
        )
        rows = [
            _make_feedback_row(
                id="fb_a", user_id="author_1", family_space_id=mock_family_space.id,
                user_obj=user_obj,
            ),
            _make_feedback_row(
                id="fb_b", category="suggestion", user_id=None,
                family_space_id=None, contact_email="anon@example.com",
            ),
        ]
        mock_prisma.feedbacksubmission.find_many = AsyncMock(return_value=rows)
        mock_prisma.feedbacksubmission.count = AsyncMock(return_value=2)

        response = client.get(
            "/v1/feedback",
            headers=_bearer_headers(
                mock_admin_user.id, mock_family_space.id, role="admin"
            ),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert len(body["items"]) == 2
        assert body["items"][0]["id"] == "fb_a"
        assert body["items"][0]["userName"] == "Alice"
        assert body["items"][0]["userEmail"] == "alice@example.com"
        # Anonymous row (no user) has null author fields.
        assert body["items"][1]["userName"] is None
        assert body["items"][1]["userEmail"] is None

    def test_owner_role_is_also_allowed(
        self, client, mock_prisma, mock_owner_user, mock_family_space
    ):
        _seed_user_lookup(
            mock_prisma, mock_owner_user, mock_family_space, role="owner"
        )
        mock_prisma.feedbacksubmission.find_many = AsyncMock(return_value=[])
        mock_prisma.feedbacksubmission.count = AsyncMock(return_value=0)

        response = client.get(
            "/v1/feedback",
            headers=_bearer_headers(
                mock_owner_user.id, mock_family_space.id, role="owner"
            ),
        )
        assert response.status_code == 200
        assert response.json() == {"items": [], "total": 0}

    def test_category_filter_invalid_value_returns_400(
        self, client, mock_prisma, mock_admin_user, mock_family_space
    ):
        _seed_user_lookup(
            mock_prisma, mock_admin_user, mock_family_space, role="admin"
        )
        response = client.get(
            "/v1/feedback?category=complaint",
            headers=_bearer_headers(
                mock_admin_user.id, mock_family_space.id, role="admin"
            ),
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_admin_query_applies_includeOrphaned_default(
        self, client, mock_prisma, mock_admin_user, mock_family_space
    ):
        """Default `includeOrphaned=true` should add the OR-on-null clause so
        admins see anonymous submissions from the legacy Next handler."""
        _seed_user_lookup(
            mock_prisma, mock_admin_user, mock_family_space, role="admin"
        )
        mock_prisma.feedbacksubmission.find_many = AsyncMock(return_value=[])
        mock_prisma.feedbacksubmission.count = AsyncMock(return_value=0)

        client.get(
            "/v1/feedback",
            headers=_bearer_headers(
                mock_admin_user.id, mock_family_space.id, role="admin"
            ),
        )
        where = mock_prisma.feedbacksubmission.find_many.call_args.kwargs["where"]
        assert "OR" in where
        assert {"familySpaceId": mock_family_space.id} in where["OR"]
        assert {"familySpaceId": None} in where["OR"]

    def test_admin_query_includeOrphaned_false_scopes_only_to_family(
        self, client, mock_prisma, mock_admin_user, mock_family_space
    ):
        _seed_user_lookup(
            mock_prisma, mock_admin_user, mock_family_space, role="admin"
        )
        mock_prisma.feedbacksubmission.find_many = AsyncMock(return_value=[])
        mock_prisma.feedbacksubmission.count = AsyncMock(return_value=0)

        client.get(
            "/v1/feedback?includeOrphaned=false",
            headers=_bearer_headers(
                mock_admin_user.id, mock_family_space.id, role="admin"
            ),
        )
        where = mock_prisma.feedbacksubmission.find_many.call_args.kwargs["where"]
        assert "OR" not in where
        assert where["familySpaceId"] == mock_family_space.id
