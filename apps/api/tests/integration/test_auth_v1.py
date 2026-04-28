"""Integration tests for /v1/auth/* — token-based auth (issue #35).

These tests use the mock-Prisma fixture and a real test client so they
exercise the full FastAPI middleware/dependency chain, but skip a real DB
round-trip. Concurrency behavior is validated via a fake-DB harness in
TestRefreshConcurrency at the bottom of the file.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src import tokens
from src.settings import settings
from tests.helpers.test_data import (
    make_mock_family_space,
    make_mock_membership,
    make_mock_refresh_token,
    make_mock_user,
)


def _setup_signup_tx(mock_prisma, user, membership):
    """Mirror the legacy test_auth helper for the v1 signup transaction."""
    tx_client = MagicMock()
    tx_client.user.create = AsyncMock(return_value=user)
    tx_client.familymembership.create = AsyncMock(return_value=membership)
    tx_manager = MagicMock()
    tx_manager.__aenter__ = AsyncMock(return_value=tx_client)
    tx_manager.__aexit__ = AsyncMock(return_value=False)
    mock_prisma.tx = MagicMock(return_value=tx_manager)
    return tx_client


def _refresh_tx_fixture(mock_prisma, locked_row):
    """Stand up a tx context whose `find_unique` returns the locked row,
    plus stub `update`+`create` so the rotation path completes.

    Returns the tx_client mock so tests can assert on what was written.
    """
    tx_client = MagicMock()
    tx_client.execute_raw = AsyncMock(return_value=0)
    tx_client.refreshtoken = MagicMock()
    tx_client.refreshtoken.find_unique = AsyncMock(return_value=locked_row)
    tx_client.refreshtoken.update = AsyncMock(return_value=None)
    tx_client.refreshtoken.create = AsyncMock(return_value=None)
    tx_manager = MagicMock()
    tx_manager.__aenter__ = AsyncMock(return_value=tx_client)
    tx_manager.__aexit__ = AsyncMock(return_value=False)
    mock_prisma.tx = MagicMock(return_value=tx_manager)
    return tx_client


# ---------------------------------------------------------------------------
# /v1/auth/login + /v1/auth/signup happy path
# ---------------------------------------------------------------------------


class TestV1Login:
    def test_login_returns_access_token_and_sets_cookies(
        self, client, mock_prisma, monkeypatch
    ):
        family = make_mock_family_space()
        membership = make_mock_membership(familySpaceId=family.id, familySpace=family)
        user = make_mock_user(memberships=[membership])
        mock_prisma.user.find_first.return_value = user
        mock_prisma.refreshtoken.create = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.auth.verify_password", lambda *_: True)

        response = client.post(
            "/v1/auth/login",
            json={"emailOrUsername": user.email, "password": "password123"},
        )

        assert response.status_code == 200
        body = response.json()
        assert "accessToken" in body
        assert body["user"]["id"] == user.id

        # Both cookies must land on the response.
        cookie_header = response.headers.get("set-cookie", "")
        assert settings.refresh_cookie_name in cookie_header
        assert settings.csrf_cookie_name in cookie_header

        # The access token must verify with our own helper.
        claims = tokens.verify_access_token(body["accessToken"])
        assert claims is not None
        assert claims.sub == user.id
        assert claims.family_space_id == family.id

    def test_login_invalid_credentials(self, client, mock_prisma, monkeypatch):
        mock_prisma.user.find_first.return_value = None
        response = client.post(
            "/v1/auth/login",
            json={"emailOrUsername": "missing@example.com", "password": "password123"},
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"

    def test_login_remember_me_extends_cookie_max_age(
        self, client, mock_prisma, monkeypatch
    ):
        family = make_mock_family_space()
        membership = make_mock_membership(familySpaceId=family.id, familySpace=family)
        user = make_mock_user(memberships=[membership])
        mock_prisma.user.find_first.return_value = user
        mock_prisma.refreshtoken.create = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.auth.verify_password", lambda *_: True)

        response = client.post(
            "/v1/auth/login",
            json={"emailOrUsername": user.email, "password": "password123", "rememberMe": True},
        )

        assert response.status_code == 200
        cookies_raw = response.headers.get("set-cookie", "")
        assert str(settings.refresh_token_ttl_remember_seconds) in cookies_raw


class TestV1Signup:
    def test_signup_first_user_owner_returns_token(
        self, client, mock_prisma, monkeypatch
    ):
        family = make_mock_family_space()
        mock_prisma.user.find_first.return_value = None
        mock_prisma.familyspace.find_first.return_value = family
        mock_prisma.familymembership.count.return_value = 0
        user = make_mock_user(id="user_signup_1", email="new@example.com")
        membership = make_mock_membership(
            userId=user.id, familySpaceId=family.id, role="owner", familySpace=family
        )
        _setup_signup_tx(mock_prisma, user, membership)
        mock_prisma.refreshtoken.create = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.v1.auth.verify_password", lambda *_: True)

        response = client.post(
            "/v1/auth/signup",
            json={
                "name": "New User",
                "email": "new@example.com",
                "username": "newuser",
                "password": "password123",
                "familyMasterKey": "secret-key",
                "rememberMe": False,
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert "accessToken" in body
        assert body["user"]["role"] == "owner"

        cookie_header = response.headers.get("set-cookie", "")
        assert settings.refresh_cookie_name in cookie_header
        assert settings.csrf_cookie_name in cookie_header


# ---------------------------------------------------------------------------
# /v1/auth/me — access-token bearer auth
# ---------------------------------------------------------------------------


class TestV1Me:
    def test_me_without_authorization_header_returns_401(self, client):
        response = client.get("/v1/auth/me")
        assert response.status_code == 401

    def test_me_with_valid_access_token_returns_user(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        membership = make_mock_membership(
            userId=mock_user.id,
            familySpaceId=mock_family_space.id,
            familySpace=mock_family_space,
        )
        user_with_membership = make_mock_user(memberships=[membership], id=mock_user.id)
        mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)

        access_token = tokens.mint_access_token(
            user_id=mock_user.id, family_space_id=mock_family_space.id, role="member"
        )

        response = client.get(
            "/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        assert response.status_code == 200
        assert response.json()["user"]["id"] == mock_user.id

    def test_me_rejects_expired_access_token(self, client):
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        token = tokens.mint_access_token(
            user_id="u1", family_space_id="fs1", role="member", now=past
        )
        response = client.get(
            "/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# /v1/auth/refresh — happy path + every negative case the AC lists
# ---------------------------------------------------------------------------


class TestV1Refresh:
    def _seed_active_row(
        self, mock_prisma, *, secret: str, jti: str = "jti_active",
        chain_id: str = "chain_a", remember_me: bool = False, user_id: str = "u1",
        family_space_id: str = "fs1",
    ):
        token_hash = tokens._hash_refresh_secret(secret)
        row = make_mock_refresh_token(
            jti=jti,
            tokenHash=token_hash,
            chainId=chain_id,
            rememberMe=remember_me,
            userId=user_id,
            familySpaceId=family_space_id,
            expiresAt=datetime.now(timezone.utc) + timedelta(days=7),
        )
        mock_prisma.refreshtoken.find_unique = AsyncMock(return_value=row)
        return row

    def test_refresh_happy_path_rotates_and_returns_new_access_token(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        secret = "secret-original"
        row = self._seed_active_row(
            mock_prisma, secret=secret, user_id=mock_user.id,
            family_space_id=mock_family_space.id,
        )
        # Membership lookup post-rotation
        membership = make_mock_membership(
            userId=mock_user.id,
            familySpaceId=mock_family_space.id,
            familySpace=mock_family_space,
        )
        user_with_membership = make_mock_user(memberships=[membership], id=mock_user.id)
        mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)

        tx_client = _refresh_tx_fixture(mock_prisma, row)

        client.cookies.set(settings.refresh_cookie_name, f"{row.jti}.{secret}")
        client.cookies.set(settings.csrf_cookie_name, "csrf-abc")

        response = client.post(
            "/v1/auth/refresh",
            headers={"X-CSRF-Token": "csrf-abc"},
        )

        assert response.status_code == 200
        body = response.json()
        assert "accessToken" in body
        # New refresh + CSRF cookies set
        cookie_header = response.headers.get("set-cookie", "")
        assert settings.refresh_cookie_name in cookie_header
        assert settings.csrf_cookie_name in cookie_header
        # Rotation must have called update (mark old rotated) and create (new row)
        tx_client.refreshtoken.update.assert_awaited_once()
        tx_client.refreshtoken.create.assert_awaited_once()

    def test_refresh_missing_csrf_returns_401(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        row = self._seed_active_row(mock_prisma, secret="s", user_id=mock_user.id)
        client.cookies.set(settings.refresh_cookie_name, f"{row.jti}.s")
        client.cookies.set(settings.csrf_cookie_name, "csrf-abc")

        # No X-CSRF-Token header
        response = client.post("/v1/auth/refresh")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_refresh_csrf_mismatch_returns_401(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        row = self._seed_active_row(mock_prisma, secret="s", user_id=mock_user.id)
        client.cookies.set(settings.refresh_cookie_name, f"{row.jti}.s")
        client.cookies.set(settings.csrf_cookie_name, "csrf-cookie-value")

        response = client.post(
            "/v1/auth/refresh",
            headers={"X-CSRF-Token": "different-value"},
        )
        assert response.status_code == 401

    def test_refresh_missing_cookie_returns_401(self, client, mock_prisma):
        client.cookies.set(settings.csrf_cookie_name, "x")
        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "x"})
        assert response.status_code == 401

    def test_refresh_unknown_jti_returns_401(self, client, mock_prisma):
        mock_prisma.refreshtoken.find_unique = AsyncMock(return_value=None)
        client.cookies.set(settings.refresh_cookie_name, "ghost-jti.some-secret")
        client.cookies.set(settings.csrf_cookie_name, "x")
        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "x"})
        assert response.status_code == 401

    def test_refresh_wrong_secret_returns_401_without_chain_revoke(
        self, client, mock_prisma
    ):
        # Active (non-rotated) row but caller has a wrong secret. This MUST NOT
        # escalate to chain revocation — only reuse of an already-rotated jti
        # triggers the chain-burn per the design doc.
        self._seed_active_row(mock_prisma, secret="real-secret", jti="jti_x")
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)

        client.cookies.set(settings.refresh_cookie_name, "jti_x.WRONG-secret")
        client.cookies.set(settings.csrf_cookie_name, "x")
        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "x"})

        assert response.status_code == 401
        # No chain revocation triggered.
        mock_prisma.refreshtoken.update_many.assert_not_called()

    def test_refresh_reused_rotated_jti_revokes_whole_chain(
        self, client, mock_prisma
    ):
        # Row was already rotated (revokedAt set, reason='rotated'). Replaying
        # this cookie is the textbook reuse signal — chain gets revoked.
        secret = "stolen-secret"
        token_hash = tokens._hash_refresh_secret(secret)
        revoked_row = make_mock_refresh_token(
            jti="jti_old",
            tokenHash=token_hash,
            chainId="chain_compromised",
            revokedAt=datetime.now(timezone.utc) - timedelta(minutes=1),
            revokedReason=tokens.REVOKED_ROTATED,
        )
        mock_prisma.refreshtoken.find_unique = AsyncMock(return_value=revoked_row)
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)

        client.cookies.set(settings.refresh_cookie_name, f"jti_old.{secret}")
        client.cookies.set(settings.csrf_cookie_name, "x")

        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "x"})

        assert response.status_code == 401
        mock_prisma.refreshtoken.update_many.assert_awaited_once()
        call_kwargs = mock_prisma.refreshtoken.update_many.await_args.kwargs
        assert call_kwargs["where"]["chainId"] == "chain_compromised"
        assert call_kwargs["data"]["revokedReason"] == tokens.REVOKED_REUSE_DETECTED

    def test_refresh_reused_logout_jti_does_not_escalate(
        self, client, mock_prisma
    ):
        # A row whose reason is 'logout' (or 'logout_all'/'reuse_detected') —
        # replay returns 401 but does NOT trigger chain revoke.
        secret = "s"
        token_hash = tokens._hash_refresh_secret(secret)
        row = make_mock_refresh_token(
            jti="jti_loggedout",
            tokenHash=token_hash,
            chainId="chain_z",
            revokedAt=datetime.now(timezone.utc) - timedelta(minutes=1),
            revokedReason=tokens.REVOKED_LOGOUT,
        )
        mock_prisma.refreshtoken.find_unique = AsyncMock(return_value=row)
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)

        client.cookies.set(settings.refresh_cookie_name, f"jti_loggedout.{secret}")
        client.cookies.set(settings.csrf_cookie_name, "x")

        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "x"})

        assert response.status_code == 401
        mock_prisma.refreshtoken.update_many.assert_not_called()

    def test_refresh_carries_remember_me_through_rotation(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        secret = "rm-secret"
        row = self._seed_active_row(
            mock_prisma, secret=secret, jti="rm_jti",
            chain_id="rm_chain", remember_me=True,
            user_id=mock_user.id, family_space_id=mock_family_space.id,
        )
        membership = make_mock_membership(
            userId=mock_user.id, familySpaceId=mock_family_space.id,
            familySpace=mock_family_space,
        )
        user_with_membership = make_mock_user(memberships=[membership], id=mock_user.id)
        mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)

        tx_client = _refresh_tx_fixture(mock_prisma, row)

        client.cookies.set(settings.refresh_cookie_name, f"{row.jti}.{secret}")
        client.cookies.set(settings.csrf_cookie_name, "csrf")
        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "csrf"})

        assert response.status_code == 200
        # The new refresh row inherits rememberMe=True
        create_kwargs = tx_client.refreshtoken.create.await_args.kwargs
        assert create_kwargs["data"]["rememberMe"] is True
        # And the cookie's Max-Age uses the extended TTL.
        cookies_raw = response.headers.get("set-cookie", "")
        assert str(settings.refresh_token_ttl_remember_seconds) in cookies_raw


# ---------------------------------------------------------------------------
# /v1/auth/logout — revokes the row, clears cookies
# ---------------------------------------------------------------------------


class TestV1Logout:
    def test_logout_revokes_token_and_clears_cookies(self, client, mock_prisma):
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)
        client.cookies.set(settings.refresh_cookie_name, "jti_to_kill.some-secret")
        response = client.post("/v1/auth/logout")

        assert response.status_code == 204
        mock_prisma.refreshtoken.update_many.assert_awaited_once()
        call_kwargs = mock_prisma.refreshtoken.update_many.await_args.kwargs
        assert call_kwargs["where"]["jti"] == "jti_to_kill"
        assert call_kwargs["data"]["revokedReason"] == tokens.REVOKED_LOGOUT
        # Both cookies cleared (Max-Age=0 in deletion)
        cookie_header = response.headers.get("set-cookie", "")
        assert settings.refresh_cookie_name in cookie_header
        assert settings.csrf_cookie_name in cookie_header

    def test_logout_without_refresh_cookie_still_returns_204(self, client, mock_prisma):
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)
        response = client.post("/v1/auth/logout")
        assert response.status_code == 204
        mock_prisma.refreshtoken.update_many.assert_not_called()

    def test_logout_then_refresh_returns_401_without_chain_revoke(
        self, client, mock_prisma
    ):
        # Sanity check on top of the unit-level logout test: a refresh
        # attempt against a logged-out jti should fail with 401, not burn
        # the chain (already covered by test_refresh_reused_logout_jti_does_not_escalate
        # but exercising the end-to-end flow shape gives confidence the
        # router wires reasons correctly).
        secret = "s"
        token_hash = tokens._hash_refresh_secret(secret)
        row = make_mock_refresh_token(
            jti="jti_after_logout",
            tokenHash=token_hash,
            revokedAt=datetime.now(timezone.utc),
            revokedReason=tokens.REVOKED_LOGOUT,
        )
        mock_prisma.refreshtoken.find_unique = AsyncMock(return_value=row)
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)
        client.cookies.set(settings.refresh_cookie_name, f"{row.jti}.{secret}")
        client.cookies.set(settings.csrf_cookie_name, "x")
        response = client.post("/v1/auth/refresh", headers={"X-CSRF-Token": "x"})
        assert response.status_code == 401
        mock_prisma.refreshtoken.update_many.assert_not_called()


# ---------------------------------------------------------------------------
# Concurrency: parallel /refresh calls don't double-issue
# ---------------------------------------------------------------------------


class TestRefreshConcurrency:
    """The AC requires concurrent /refresh calls to not double-issue or lose
    reuse detection. We can't meaningfully test that with the FastAPI test
    client (single thread, single connection). Instead we exercise the router
    function directly with a hand-rolled async-locking 'DB' that simulates
    `SELECT … FOR UPDATE` so two coroutines race on the same jti."""

    @pytest.mark.asyncio
    async def test_two_concurrent_refreshes_only_one_succeeds(
        self, mock_prisma, mock_user, mock_family_space, monkeypatch
    ):
        """Two concurrent /refresh callers race. The first to acquire the
        SELECT…FOR UPDATE lock rotates and returns 200. The second blocks
        on the lock, sees the row's revokedAt populated when it unblocks,
        and bails out with 401 — without double-issuing a successor."""
        from src.routers.v1.auth import refresh as refresh_handler
        from fastapi.responses import JSONResponse
        from fastapi import Response

        secret = "race-secret"
        jti = "race_jti"
        token_hash = tokens._hash_refresh_secret(secret)
        chain_id = "race_chain"

        # Stateful row mutated as the first caller's transaction commits.
        row_state = SimpleNamespace(
            jti=jti, tokenHash=token_hash, chainId=chain_id,
            rememberMe=False, userId=mock_user.id,
            familySpaceId=mock_family_space.id,
            expiresAt=datetime.now(timezone.utc) + timedelta(days=7),
            revokedAt=None, revokedReason=None, ipAddress=None,
            id="r1", rotatedFromJti=None,
            issuedAt=datetime.now(timezone.utc), userAgent=None,
        )

        lock = asyncio.Lock()
        mock_prisma.refreshtoken.find_unique = AsyncMock(return_value=row_state)
        mock_prisma.refreshtoken.update_many = AsyncMock(return_value=None)

        membership = make_mock_membership(
            userId=mock_user.id, familySpaceId=mock_family_space.id,
            familySpace=mock_family_space,
        )
        user_with_membership = make_mock_user(memberships=[membership], id=mock_user.id)
        mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)

        rotation_count = {"value": 0}

        class TxCtx:
            def __init__(self):
                self.refreshtoken = MagicMock()
                self.refreshtoken.update = AsyncMock(side_effect=self._update)
                self.refreshtoken.create = AsyncMock(return_value=None)
                self.refreshtoken.find_unique = AsyncMock(side_effect=self._find_unique)
                self.execute_raw = AsyncMock(side_effect=self._execute_raw)
                self._holds_lock = False

            async def _execute_raw(self, *_args, **_kwargs):
                # Block until lock is free — mirrors SELECT … FOR UPDATE.
                await lock.acquire()
                self._holds_lock = True
                # Yield once so the other coroutine has a chance to wake up
                # and find itself blocked (deterministic interleaving).
                await asyncio.sleep(0)
                return 0

            async def _find_unique(self, *args, **kwargs):
                return row_state

            async def _update(self, *args, **kwargs):
                rotation_count["value"] += 1
                row_state.revokedAt = datetime.now(timezone.utc)
                row_state.revokedReason = tokens.REVOKED_ROTATED
                return None

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                if self._holds_lock and lock.locked():
                    lock.release()
                return False

        mock_prisma.tx = MagicMock(side_effect=lambda: TxCtx())

        async def _make_call():
            req = MagicMock()
            req.cookies = {
                settings.refresh_cookie_name: f"{jti}.{secret}",
                settings.csrf_cookie_name: "csrf",
            }
            req.headers = {}
            req.client = None
            resp = Response()
            return await refresh_handler(request=req, response=resp, x_csrf_token="csrf")

        results = await asyncio.gather(_make_call(), _make_call())

        # Exactly one rotation happened — the loser's tx-scope find_unique
        # saw revokedAt != None and bailed out before calling update().
        assert rotation_count["value"] == 1

        # Loser returns a JSONResponse (401) directly; winner returns the
        # AccessTokenResponse pydantic model (FastAPI wraps it for the wire).
        success = [r for r in results if not isinstance(r, JSONResponse)]
        failure = [r for r in results if isinstance(r, JSONResponse)]
        assert len(success) == 1, f"expected 1 success, got {success}"
        assert len(failure) == 1, f"expected 1 failure, got {failure}"
        assert failure[0].status_code == 401
