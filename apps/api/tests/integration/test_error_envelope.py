"""Contract tests for the global error envelope (issue #190).

These exercise the global exception handlers in src/main.py end-to-end.
Per-endpoint failing-path tests still assert their specific code/status;
this file is the focused regression net for the *envelope* itself —
i.e., that nothing leaks `{"detail": ...}` (FastAPI's default shape) or
a 422 status code (the migration plan specifies 400 VALIDATION_ERROR for
every endpoint).
"""
from __future__ import annotations

import pytest

from tests.helpers.error_envelope import assert_error_envelope


class TestPydanticValidationEnvelope:
    """RequestValidationError → 400 VALIDATION_ERROR (not FastAPI's default 422)."""

    def test_invalid_json_body_returns_400_envelope(self, client):
        # Missing required fields trigger Pydantic validation; the global
        # handler wraps the error rather than letting FastAPI's default
        # 422 `{detail: [...]}` shape leak.
        response = client.post("/auth/login", json={})

        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    @pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")
    def test_invalid_query_param_returns_400_envelope(self, client, member_auth):
        # Validation runs before the route body, so the prisma stub doesn't
        # need any specific return value here — the request never reaches
        # the handler.
        response = client.get("/recipes?sort=popularity", headers=member_auth)

        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_validation_error_does_not_leak_detail_key(self, client):
        response = client.post("/auth/login", json={})

        body = response.json()
        assert "detail" not in body, (
            "FastAPI's default `detail` key leaked through — RequestValidationError "
            "handler is missing or misconfigured"
        )


class TestCookieAuthUnauthorizedEnvelope:
    """Legacy cookie-auth dependency raises ApiError, not HTTPException."""

    def test_missing_cookie_returns_envelope(self, client):
        response = client.get("/auth/me")

        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_invalid_cookie_returns_envelope(self, client):
        response = client.get("/auth/me", headers={"Cookie": "session=not-a-real-jwt"})

        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")
