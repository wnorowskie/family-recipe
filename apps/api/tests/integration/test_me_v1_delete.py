"""Integration tests for DELETE /v1/me/delete — issue #186.

Bearer-token auth via `dependencies_v1.get_current_user_v1`. The
handler relies on Postgres schema-level cascades for the actual
data deletion (see the router's module docstring), so these tests
focus on what the FastAPI layer *itself* owns:

  - The 204 contract
  - The owner/admin guard
  - Password verification
  - Confirmation-phrase validation
  - Refresh + csrf cookies cleared on the response

Cascade behaviour itself is verified by Prisma + the live DB
schema; mock-Prisma can't faithfully reproduce a multi-row cascade,
so we assert the handler issues exactly one `prisma.user.delete`
call with the right `where` and let the schema do the rest.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

from src import tokens
from src.settings import settings
from tests.helpers.error_envelope import assert_error_envelope
from tests.helpers.test_data import make_mock_membership, make_mock_user


# ---------------------------------------------------------------------------
# Helpers (mirror the pattern in test_feedback.py / test_recipes_import.py)
# ---------------------------------------------------------------------------


def _bearer_headers(
    user_id: str, family_space_id: str, role: str = "member"
) -> dict:
    token = tokens.mint_access_token(
        user_id=user_id, family_space_id=family_space_id, role=role
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_user_lookup(
    mock_prisma, user, family_space, *, role: str = "member"
):
    """Wire the /v1 bearer dep's `user.find_unique` to resolve our user.

    Also wires a second `find_unique` return for the handler's own
    password-fetch lookup. The bearer dep and the handler both call
    `prisma.user.find_unique`, but on the mock client they share a
    single `AsyncMock`, so a single `return_value` covers both.
    """
    membership = make_mock_membership(
        userId=user.id,
        familySpaceId=family_space.id,
        role=role,
        familySpace=family_space,
    )
    user_with_membership = make_mock_user(memberships=[membership], id=user.id)
    # Copy any password-hash override across so the password-verify
    # branch sees the right hash on the second `find_unique` call.
    if hasattr(user, "passwordHash"):
        user_with_membership.passwordHash = user.passwordHash
    mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)
    return user_with_membership


_VALID_PAYLOAD = {"currentPassword": "correct-password", "confirmation": "DELETE"}


# ---------------------------------------------------------------------------
# Auth gates
# ---------------------------------------------------------------------------


class TestUnauthenticated:
    def test_no_bearer_returns_401_envelope(self, client):
        response = client.request(
            "DELETE", "/v1/me/delete", json=_VALID_PAYLOAD
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_malformed_bearer_returns_401_envelope(self, client):
        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers={"Authorization": "Bearer not-a-jwt"},
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_legacy_session_cookie_does_not_authenticate_v1(
        self, client, member_auth
    ):
        # The legacy `session` cookie is the cookie-auth pathway and
        # is honoured only by /api/me/delete. /v1/me/delete is bearer-
        # only, so a cookie-only request must 401.
        response = client.request(
            "DELETE", "/v1/me/delete", json=_VALID_PAYLOAD, headers=member_auth
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")


# ---------------------------------------------------------------------------
# Role guard
# ---------------------------------------------------------------------------


class TestRoleGuard:
    def test_owner_cannot_delete_account(self, client, mock_prisma):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(id="owner_1")
        _seed_user_lookup(mock_prisma, user, family, role="owner")
        mock_prisma.user.delete = AsyncMock(return_value=None)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id, role="owner"),
        )

        assert_error_envelope(response, status_code=403, code="FORBIDDEN")
        # Guard fires before the destructive call.
        mock_prisma.user.delete.assert_not_called()

    def test_admin_cannot_delete_account(self, client, mock_prisma):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(id="admin_1")
        _seed_user_lookup(mock_prisma, user, family, role="admin")
        mock_prisma.user.delete = AsyncMock(return_value=None)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id, role="admin"),
        )

        assert_error_envelope(response, status_code=403, code="FORBIDDEN")
        mock_prisma.user.delete.assert_not_called()


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------


class TestRequestValidation:
    def test_missing_password_returns_400(self, client, mock_prisma):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user()
        _seed_user_lookup(mock_prisma, user, family)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json={"confirmation": "DELETE"},
            headers=_bearer_headers(user.id, family.id),
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_missing_confirmation_returns_400(self, client, mock_prisma):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user()
        _seed_user_lookup(mock_prisma, user, family)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json={"currentPassword": "x"},
            headers=_bearer_headers(user.id, family.id),
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_wrong_confirmation_phrase_returns_400(
        self, client, mock_prisma, monkeypatch
    ):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user()
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(return_value=None)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json={"currentPassword": "x", "confirmation": "delete-please"},
            headers=_bearer_headers(user.id, family.id),
        )

        assert_error_envelope(
            response,
            status_code=400,
            code="VALIDATION_ERROR",
            message_contains="DELETE",
        )
        mock_prisma.user.delete.assert_not_called()

    def test_case_insensitive_confirmation_is_accepted(
        self, client, mock_prisma, monkeypatch
    ):
        # Matches the Next handler's `val.toUpperCase() === 'DELETE'`
        # behaviour after trim.
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user()
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.me.verify_password", lambda *_: True)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json={"currentPassword": "x", "confirmation": "  delete  "},
            headers=_bearer_headers(user.id, family.id),
        )
        assert response.status_code == 204
        mock_prisma.user.delete.assert_awaited_once()


# ---------------------------------------------------------------------------
# Password verification
# ---------------------------------------------------------------------------


class TestPasswordVerification:
    def test_wrong_password_returns_401_invalid_credentials(
        self, client, mock_prisma, monkeypatch
    ):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(passwordHash="$2b$10$real-hash")
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(return_value=None)
        # Force verify_password to false to simulate a wrong password
        # without needing real bcrypt rounds in the test.
        monkeypatch.setattr("src.routers.v1.me.verify_password", lambda *_: False)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        assert_error_envelope(
            response, status_code=401, code="INVALID_CREDENTIALS"
        )
        # Critical: the delete must NOT fire on a bad password.
        mock_prisma.user.delete.assert_not_called()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestHappyPath:
    def test_member_delete_returns_204_no_body(
        self, client, mock_prisma, monkeypatch
    ):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(id="user_to_delete")
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.me.verify_password", lambda *_: True)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        assert response.status_code == 204
        # 204 must have no body; FastAPI/Starlette enforces this but we
        # also assert it because the contract is documented.
        assert response.content == b""

    def test_delete_targets_caller_only(
        self, client, mock_prisma, monkeypatch
    ):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(id="user_to_delete")
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.me.verify_password", lambda *_: True)

        client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        # The single delete call targets the caller's user id and
        # nothing else. Family-scoping is irrelevant at this call site
        # (the user row is unique by id), and cascade fan-out happens
        # in Postgres — see the router docstring.
        mock_prisma.user.delete.assert_awaited_once_with(
            where={"id": user.id}
        )

    def test_response_clears_refresh_and_csrf_cookies(
        self, client, mock_prisma, monkeypatch
    ):
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user()
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.me.verify_password", lambda *_: True)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        assert response.status_code == 204
        # Starlette serializes a cookie-clear as a Set-Cookie header
        # with an empty value and Max-Age=0 (or expires in the past).
        # We just assert both cookie names appear in Set-Cookie; the
        # cookie-attribute correctness is covered by tests in
        # test_auth_v1.py for /v1/auth/logout, which uses the same
        # helpers.
        set_cookies = response.headers.get_list("set-cookie")
        assert any(
            settings.refresh_cookie_name in c for c in set_cookies
        ), f"refresh cookie not cleared: {set_cookies}"
        assert any(
            settings.csrf_cookie_name in c for c in set_cookies
        ), f"csrf cookie not cleared: {set_cookies}"


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


class TestErrorPaths:
    def test_user_lookup_returns_none_yields_404(
        self, client, mock_prisma, monkeypatch
    ):
        # Race condition: the bearer dep resolved the user, but the
        # handler's own find_unique returns None (e.g. concurrent
        # delete won the race). We surface 404 because the requested
        # post-condition is already satisfied; treating this as 500
        # would mislead operators investigating logs.
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(memberships=[
            make_mock_membership(
                userId="user_test", familySpaceId=family.id,
                role="member", familySpace=family,
            )
        ])
        mock_prisma.user.find_unique = AsyncMock(
            side_effect=[user, None]  # bearer dep ok, handler lookup gone
        )
        mock_prisma.user.delete = AsyncMock(return_value=None)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        assert_error_envelope(response, status_code=404, code="NOT_FOUND")
        mock_prisma.user.delete.assert_not_called()

    def test_prisma_delete_failure_returns_500(
        self, client, mock_prisma, monkeypatch
    ):
        from prisma.errors import PrismaError
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user()
        _seed_user_lookup(mock_prisma, user, family)
        mock_prisma.user.delete = AsyncMock(
            side_effect=PrismaError("FK violation in a downstream cascade")
        )
        monkeypatch.setattr("src.routers.v1.me.verify_password", lambda *_: True)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        assert_error_envelope(response, status_code=500, code="INTERNAL_ERROR")

    def test_prisma_lookup_failure_returns_500(
        self, client, mock_prisma, monkeypatch
    ):
        # The bearer dep's lookup succeeds (mock returns a user), then
        # the handler's own lookup raises — covers the lookup-side
        # PrismaError path independently from the delete-side one.
        from prisma.errors import PrismaError
        from tests.helpers.test_data import make_mock_family_space
        family = make_mock_family_space()
        user = make_mock_user(memberships=[
            make_mock_membership(
                userId="user_test", familySpaceId=family.id,
                role="member", familySpace=family,
            )
        ])
        mock_prisma.user.find_unique = AsyncMock(
            side_effect=[user, PrismaError("connection lost")]
        )
        mock_prisma.user.delete = AsyncMock(return_value=None)

        response = client.request(
            "DELETE",
            "/v1/me/delete",
            json=_VALID_PAYLOAD,
            headers=_bearer_headers(user.id, family.id),
        )

        assert_error_envelope(response, status_code=500, code="INTERNAL_ERROR")
        mock_prisma.user.delete.assert_not_called()
