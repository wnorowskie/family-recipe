"""Integration tests for auth endpoints (FastAPI)."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.security import COOKIE_MAX_AGE_EXTENDED
from tests.helpers.auth import make_auth_cookie
from tests.helpers.test_data import make_mock_family_space, make_mock_membership, make_mock_user


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestAuthMe:
    def test_me_unauthenticated(self, client):
        response = client.get("/auth/me")

        assert response.status_code == 401

    def test_me_authenticated(self, client, mock_prisma, mock_user, mock_family_space):
        membership = make_mock_membership(
            userId=mock_user.id,
            familySpaceId=mock_family_space.id,
            familySpace=mock_family_space,
        )
        user_with_membership = make_mock_user(memberships=[membership], id=mock_user.id)
        mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)

        cookies = make_auth_cookie(mock_user.id, mock_family_space.id, "member")
        response = client.get("/auth/me", headers=cookies)

        assert response.status_code == 200
        data = response.json()
        assert data["user"]["id"] == mock_user.id
        assert data["user"]["familySpaceId"] == mock_family_space.id


class TestAuthLogout:
    def test_logout_unauthenticated(self, client):
        response = client.post("/auth/logout")

        assert response.status_code == 401

    def test_logout_authenticated(self, client, mock_prisma, mock_user, mock_family_space):
        membership = make_mock_membership(
            userId=mock_user.id,
            familySpaceId=mock_family_space.id,
            familySpace=mock_family_space,
        )
        user_with_membership = make_mock_user(memberships=[membership], id=mock_user.id)
        mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)

        cookies = make_auth_cookie(mock_user.id, mock_family_space.id, "member")
        response = client.post("/auth/logout", headers=cookies)

        assert response.status_code == 200
        assert response.json()["message"] == "Logged out successfully"
        assert "set-cookie" in response.headers


class TestAuthSignup:
    def _setup_tx(self, mock_prisma, user, membership):
        tx_client = MagicMock()
        tx_client.user.create = AsyncMock(return_value=user)
        tx_client.familymembership.create = AsyncMock(return_value=membership)

        tx_manager = MagicMock()
        tx_manager.__aenter__ = AsyncMock(return_value=tx_client)
        tx_manager.__aexit__ = AsyncMock(return_value=False)
        mock_prisma.tx = MagicMock(return_value=tx_manager)
        return tx_client, tx_manager

    def test_signup_first_user_becomes_owner(self, client, mock_prisma, monkeypatch):
        payload = {
            "name": "New User",
            "emailOrUsername": "new@example.com",
            "password": "password123",
            "familyMasterKey": "secret-key",
            "rememberMe": False,
        }

        family = make_mock_family_space(masterKeyHash="$2b$10$dummyhashforfamily")

        mock_prisma.user.find_unique.return_value = None
        mock_prisma.familyspace.find_first.return_value = family
        mock_prisma.familymembership.count.return_value = 0

        user = make_mock_user(id="user_1", emailOrUsername=payload["emailOrUsername"], name=payload["name"])
        membership = make_mock_membership(userId=user.id, familySpaceId=family.id, role="owner", familySpace=family)
        self._setup_tx(mock_prisma, user, membership)

        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: True)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: True)

        response = client.post("/auth/signup", json=payload)

        assert response.status_code == 201
        body = response.json()
        assert body["user"]["role"] == "owner"
        assert "set-cookie" in response.headers

    def test_signup_subsequent_user_becomes_member(self, client, mock_prisma, monkeypatch):
        payload = {
            "name": "Next User",
            "emailOrUsername": "next@example.com",
            "password": "password123",
            "familyMasterKey": "secret-key",
            "rememberMe": False,
        }

        family = make_mock_family_space()
        mock_prisma.user.find_unique.return_value = None
        mock_prisma.familyspace.find_first.return_value = family
        mock_prisma.familymembership.count.return_value = 1

        user = make_mock_user(id="user_2", emailOrUsername=payload["emailOrUsername"], name=payload["name"])
        membership = make_mock_membership(userId=user.id, familySpaceId=family.id, role="member", familySpace=family)
        self._setup_tx(mock_prisma, user, membership)

        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: True)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: True)

        response = client.post("/auth/signup", json=payload)

        assert response.status_code == 201
        assert response.json()["user"]["role"] == "member"

    def test_signup_rejects_duplicate_email(self, client, mock_prisma):
        mock_prisma.user.find_unique.return_value = make_mock_user()

        response = client.post(
            "/auth/signup",
            json={
                "name": "Dup User",
                "emailOrUsername": "test@example.com",
                "password": "password123",
                "familyMasterKey": "secret-key",
                "rememberMe": False,
            },
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "BAD_REQUEST"

    def test_signup_invalid_master_key(self, client, mock_prisma, monkeypatch):
        family = make_mock_family_space(masterKeyHash="$2b$10$hash")
        mock_prisma.user.find_unique.return_value = None
        mock_prisma.familyspace.find_first.return_value = family
        mock_prisma.familymembership.count.return_value = 0
        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: False)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: False)

        response = client.post(
            "/auth/signup",
            json={
                "name": "User",
                "emailOrUsername": "user@example.com",
                "password": "password123",
                "familyMasterKey": "wrongkey",
                "rememberMe": False,
            },
        )

        assert response.status_code == 400
        assert response.json()["error"]["code"] == "BAD_REQUEST"

    def test_signup_no_family_space(self, client, mock_prisma):
        mock_prisma.user.find_unique.return_value = None
        mock_prisma.familyspace.find_first.return_value = None

        response = client.post(
            "/auth/signup",
            json={
                "name": "User",
                "emailOrUsername": "user@example.com",
                "password": "password123",
                "familyMasterKey": "secret-key",
                "rememberMe": False,
            },
        )

        assert response.status_code == 500
        assert response.json()["error"]["code"] == "INTERNAL_ERROR"


class TestAuthLogin:
    def test_login_invalid_payload(self, client):
        response = client.post(
            "/auth/login",
            json={"emailOrUsername": "ab", "password": "123"},
        )

        assert response.status_code == 422

    def test_login_user_not_found(self, client, mock_prisma):
        mock_prisma.user.find_unique.return_value = None

        response = client.post(
            "/auth/login",
            json={"emailOrUsername": "missing@example.com", "password": "password123"},
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_wrong_password(self, client, mock_prisma, monkeypatch):
        family = make_mock_family_space()
        membership = make_mock_membership(familySpaceId=family.id, familySpace=family)
        user = make_mock_user(memberships=[membership])
        mock_prisma.user.find_unique.return_value = user
        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: False)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: False)

        response = client.post(
            "/auth/login",
            json={"emailOrUsername": user.emailOrUsername, "password": "wrongpwd"},
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_no_membership_forbidden(self, client, mock_prisma, monkeypatch):
        user = make_mock_user(memberships=[])
        mock_prisma.user.find_unique.return_value = user
        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: True)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: True)

        response = client.post(
            "/auth/login",
            json={"emailOrUsername": user.emailOrUsername, "password": "password123"},
        )

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_login_success_sets_cookie(self, client, mock_prisma, monkeypatch):
        family = make_mock_family_space()
        membership = make_mock_membership(familySpaceId=family.id, familySpace=family)
        user = make_mock_user(memberships=[membership])
        mock_prisma.user.find_unique.return_value = user
        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: True)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: True)

        response = client.post(
            "/auth/login",
            json={"emailOrUsername": user.emailOrUsername, "password": "password123"},
        )

        assert response.status_code == 200
        assert "set-cookie" in response.headers
        body = response.json()
        assert body["user"]["id"] == user.id

    def test_login_remember_me_extends_cookie(self, client, mock_prisma, monkeypatch):
        family = make_mock_family_space()
        membership = make_mock_membership(familySpaceId=family.id, familySpace=family)
        user = make_mock_user(memberships=[membership])
        mock_prisma.user.find_unique.return_value = user
        monkeypatch.setattr("src.security.verify_password", lambda pwd, hash: True)
        monkeypatch.setattr("src.routers.auth.verify_password", lambda pwd, hash: True)

        response = client.post(
            "/auth/login",
            json={"emailOrUsername": user.emailOrUsername, "password": "password123", "rememberMe": True},
        )

        assert response.status_code == 200
        set_cookie = response.headers.get("set-cookie", "")
        assert "Max-Age=" in set_cookie
        assert str(COOKIE_MAX_AGE_EXTENDED) in set_cookie

