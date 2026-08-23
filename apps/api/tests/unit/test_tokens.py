"""Unit tests for src/tokens.py — issuance, verification, rotation primitives,
key-rotation overlap, and CSRF helpers."""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from src import tokens
from src.settings import settings


# ---------------------------------------------------------------------------
# Access tokens
# ---------------------------------------------------------------------------


class TestAccessTokenMintAndVerify:
    def test_mint_returns_three_part_jwt_with_kid_header(self):
        token = tokens.mint_access_token(
            user_id="u1", family_space_id="fs1", role="member"
        )
        parts = token.split(".")
        assert len(parts) == 3

        header = jwt.get_unverified_header(token)
        assert header["kid"] == settings.access_token_active_kid
        assert header["alg"] == "HS256"

    def test_verify_round_trip_returns_claims(self):
        token = tokens.mint_access_token(
            user_id="u1", family_space_id="fs1", role="owner"
        )
        claims = tokens.verify_access_token(token)
        assert claims is not None
        assert claims.sub == "u1"
        assert claims.family_space_id == "fs1"
        assert claims.role == "owner"
        assert claims.epoch == settings.auth_epoch
        assert claims.kid == settings.access_token_active_kid
        # jti should be a hex uuid (32 chars)
        assert len(claims.jti) == 32

    def test_verify_returns_none_for_garbage(self):
        assert tokens.verify_access_token("not.a.jwt") is None
        assert tokens.verify_access_token("") is None

    def test_verify_returns_none_for_expired_token(self):
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        token = tokens.mint_access_token(
            user_id="u1", family_space_id="fs1", role="member", now=past
        )
        # mint with `now` in the past makes exp also in the past
        time.sleep(0)  # no-op; emphasizes that the mint set exp from `past`
        assert tokens.verify_access_token(token) is None

    def test_verify_rejects_token_with_lower_epoch(self, monkeypatch):
        token = tokens.mint_access_token(
            user_id="u1", family_space_id="fs1", role="member"
        )
        # Bump server's epoch — the issued token's epoch is now stale.
        monkeypatch.setattr(settings, "auth_epoch", settings.auth_epoch + 1)
        assert tokens.verify_access_token(token) is None

    def test_verify_rejects_token_with_unknown_kid(self):
        # Sign a token with a kid that isn't in the keys map.
        payload = {
            "sub": "u1",
            "familySpaceId": "fs1",
            "role": "member",
            "epoch": settings.auth_epoch,
            "iss": tokens.JWT_ISSUER,
            "aud": settings.jwt_audience,
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "jti": "x",
        }
        bad = jwt.encode(payload, "irrelevant", algorithm="HS256", headers={"kid": "ghost"})
        assert tokens.verify_access_token(bad) is None

    def test_verify_rejects_wrong_audience(self):
        # Sign with the right key but the wrong aud claim.
        secret = settings.signing_keys[settings.access_token_active_kid]
        payload = {
            "sub": "u1",
            "familySpaceId": "fs1",
            "role": "member",
            "epoch": settings.auth_epoch,
            "iss": tokens.JWT_ISSUER,
            "aud": "some-other-app",
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "jti": "x",
        }
        bad = jwt.encode(
            payload, secret, algorithm="HS256",
            headers={"kid": settings.access_token_active_kid},
        )
        assert tokens.verify_access_token(bad) is None


class TestKeyRotationOverlap:
    """During rotation, both the old and new kid live in `signing_keys`.
    Tokens signed by either kid must verify until the old kid is removed."""

    def test_token_signed_with_previous_kid_still_verifies(self, monkeypatch):
        active_kid = settings.access_token_active_kid
        active_secret = settings.signing_keys[active_kid]
        previous_secret = "previous-rotation-secret-value"
        rotation_keys = json.dumps({"v0": previous_secret, active_kid: active_secret})

        monkeypatch.setattr(settings, "access_token_signing_keys", rotation_keys)

        # Sign a token by hand with the previous kid.
        payload = {
            "sub": "u1",
            "familySpaceId": "fs1",
            "role": "member",
            "epoch": settings.auth_epoch,
            "iss": tokens.JWT_ISSUER,
            "aud": settings.jwt_audience,
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "jti": "x",
        }
        legacy_token = jwt.encode(
            payload, previous_secret, algorithm="HS256", headers={"kid": "v0"}
        )
        claims = tokens.verify_access_token(legacy_token)
        assert claims is not None
        assert claims.kid == "v0"
        assert claims.sub == "u1"

    def test_token_stops_verifying_after_old_kid_removed(self, monkeypatch):
        # No "v0" in keys map => previous-kid tokens stop verifying.
        previous_secret = "previous-rotation-secret-value"
        monkeypatch.setattr(
            settings, "access_token_signing_keys",
            json.dumps({settings.access_token_active_kid: settings.jwt_secret}),
        )
        payload = {
            "sub": "u1", "familySpaceId": "fs1", "role": "member",
            "epoch": settings.auth_epoch,
            "iss": tokens.JWT_ISSUER, "aud": settings.jwt_audience,
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "jti": "x",
        }
        stale = jwt.encode(payload, previous_secret, algorithm="HS256", headers={"kid": "v0"})
        assert tokens.verify_access_token(stale) is None


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------


class TestRefreshTokenIssuance:
    def test_issue_returns_split_cookie_format(self):
        issued = tokens.issue_refresh_token()
        # `{jti}.{secret}` shape
        assert "." in issued.cookie_value
        parts = issued.cookie_value.split(".", 1)
        assert parts[0] == issued.jti
        assert parts[1] == issued.secret

    def test_issue_uses_fresh_chain_when_none_provided(self):
        a = tokens.issue_refresh_token()
        b = tokens.issue_refresh_token()
        assert a.chain_id != b.chain_id

    def test_issue_carries_chain_when_provided(self):
        chain = "fixed-chain-id"
        issued = tokens.issue_refresh_token(chain_id=chain)
        assert issued.chain_id == chain

    def test_remember_me_extends_expiry(self):
        short = tokens.issue_refresh_token(remember_me=False)
        long_ = tokens.issue_refresh_token(remember_me=True)
        # Difference roughly equals the configured TTL gap (30d - 7d).
        delta = long_.expires_at - short.expires_at
        expected = (
            settings.refresh_token_ttl_remember_seconds
            - settings.refresh_token_ttl_default_seconds
        )
        # Allow 5s for the two issue calls happening at slightly different times.
        assert abs(delta.total_seconds() - expected) < 5

    def test_token_hash_matches_via_constant_time_eq(self):
        issued = tokens.issue_refresh_token()
        assert tokens.constant_time_hash_eq(issued.token_hash, issued.secret) is True
        assert tokens.constant_time_hash_eq(issued.token_hash, "wrong-secret") is False

    def test_two_issues_with_same_secret_input_produce_same_hash(self):
        # Determinism check — HMAC with a fixed pepper is deterministic.
        h1 = tokens._hash_refresh_secret("the-same-secret")
        h2 = tokens._hash_refresh_secret("the-same-secret")
        assert h1 == h2

    def test_changing_pepper_changes_hash(self, monkeypatch):
        secret = "abc123"
        h1 = tokens._hash_refresh_secret(secret)
        monkeypatch.setattr(settings, "refresh_pepper", "different-pepper-value")
        h2 = tokens._hash_refresh_secret(secret)
        assert h1 != h2


class TestParseRefreshCookie:
    def test_parse_well_formed(self):
        out = tokens.parse_refresh_cookie("abc.xyz")
        assert out == ("abc", "xyz")

    def test_parse_handles_secret_containing_dot(self):
        # token_urlsafe never produces dots, but the parser should be safe
        # regardless: only the FIRST dot splits jti from secret.
        out = tokens.parse_refresh_cookie("jti.part1.part2")
        assert out == ("jti", "part1.part2")

    @pytest.mark.parametrize("value", ["", ".", "no-dot", ".onlysecret", "onlyjti."])
    def test_parse_rejects_malformed(self, value):
        assert tokens.parse_refresh_cookie(value) is None


# ---------------------------------------------------------------------------
# CSRF helpers
# ---------------------------------------------------------------------------


class TestCsrfHelpers:
    def test_mint_returns_url_safe_string(self):
        a = tokens.mint_csrf_token()
        b = tokens.mint_csrf_token()
        assert a != b
        assert len(a) >= 32

    def test_match_requires_both_present(self):
        assert tokens.csrf_token_matches(None, "x") is False
        assert tokens.csrf_token_matches("x", None) is False
        assert tokens.csrf_token_matches("", "") is False

    def test_match_only_when_equal(self):
        assert tokens.csrf_token_matches("same", "same") is True
        assert tokens.csrf_token_matches("same", "Same") is False
