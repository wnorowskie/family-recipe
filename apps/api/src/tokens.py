"""Token-auth primitives for the FastAPI v1 endpoints.

Implements the design in docs/research/refresh-token-store.md:

- Short-lived access JWTs with `kid` header (signing-key rotation overlap)
  and an `epoch` claim (`AUTH_EPOCH` env) for global revocation.
- Refresh tokens delivered as `{jti}.{secret}` opaque cookie strings; the
  secret half is stored as HMAC-SHA256(REFRESH_PEPPER, secret).
- CSRF double-submit cookie helpers for /refresh.

Pure functions where possible — DB I/O lives in the routers.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from .settings import settings

logger = logging.getLogger(__name__)

JWT_ISSUER = "family-recipe-app"
JWT_ALGORITHM = "HS256"

# Revocation reasons — keep aligned with TS counterpart when one is added.
REVOKED_ROTATED = "rotated"
REVOKED_LOGOUT = "logout"
REVOKED_LOGOUT_ALL = "logout_all"
REVOKED_REUSE_DETECTED = "reuse_detected"
REVOKED_ADMIN = "admin"

VALID_REVOKED_REASONS = {
    REVOKED_ROTATED,
    REVOKED_LOGOUT,
    REVOKED_LOGOUT_ALL,
    REVOKED_REUSE_DETECTED,
    REVOKED_ADMIN,
}


# ---------------------------------------------------------------------------
# Access tokens
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AccessTokenClaims:
    sub: str
    family_space_id: str
    role: str
    jti: str
    epoch: int
    iss: str
    aud: str
    iat: int
    exp: int
    kid: str


def mint_access_token(
    *,
    user_id: str,
    family_space_id: str,
    role: str,
    now: Optional[datetime] = None,
) -> str:
    """Sign a short-lived access JWT using the active kid."""
    keys = settings.signing_keys
    kid = settings.access_token_active_kid
    secret = keys[kid]
    issued_at = now or datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(seconds=settings.access_token_ttl_seconds)
    payload = {
        "sub": user_id,
        "familySpaceId": family_space_id,
        "role": role,
        "epoch": settings.auth_epoch,
        "iss": JWT_ISSUER,
        "aud": settings.jwt_audience,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM, headers={"kid": kid})


def verify_access_token(token: str) -> Optional[AccessTokenClaims]:
    """Verify an access token against any known kid; reject if epoch is stale.

    During key rotation, both the old and new kid live in `signing_keys`;
    once the rotation overlap window passes (>= 2x access TTL), the old kid
    is removed from the map and tokens signed by it stop verifying.
    """
    keys = settings.signing_keys
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError:
        return None

    kid = unverified_header.get("kid")
    if not isinstance(kid, str) or kid not in keys:
        return None

    try:
        decoded = jwt.decode(
            token,
            keys[kid],
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=settings.jwt_audience,
        )
    except jwt.InvalidTokenError:
        return None

    # Epoch gate: any token minted before the current AUTH_EPOCH is dead.
    epoch = decoded.get("epoch")
    if not isinstance(epoch, int) or epoch < settings.auth_epoch:
        return None

    sub = decoded.get("sub")
    family_space_id = decoded.get("familySpaceId")
    role = decoded.get("role")
    jti = decoded.get("jti")
    if not (isinstance(sub, str) and isinstance(family_space_id, str)
            and isinstance(role, str) and isinstance(jti, str)):
        return None

    return AccessTokenClaims(
        sub=sub,
        family_space_id=family_space_id,
        role=role,
        jti=jti,
        epoch=epoch,
        iss=JWT_ISSUER,
        aud=settings.jwt_audience,
        iat=int(decoded.get("iat", 0)),
        exp=int(decoded.get("exp", 0)),
        kid=kid,
    )


# ---------------------------------------------------------------------------
# Refresh tokens
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IssuedRefreshToken:
    jti: str
    secret: str
    cookie_value: str          # what to set on the wire: "{jti}.{secret}"
    token_hash: str            # HMAC(pepper, secret) — store this
    expires_at: datetime
    chain_id: str
    remember_me: bool


def _hash_refresh_secret(secret: str) -> str:
    pepper = settings.effective_refresh_pepper.encode("utf-8")
    digest = hmac.new(pepper, secret.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def constant_time_hash_eq(stored_hash: str, candidate_secret: str) -> bool:
    return hmac.compare_digest(stored_hash, _hash_refresh_secret(candidate_secret))


def issue_refresh_token(
    *,
    chain_id: Optional[str] = None,
    remember_me: bool = False,
    now: Optional[datetime] = None,
) -> IssuedRefreshToken:
    """Mint a new refresh token. Caller is responsible for the DB insert."""
    issued_at = now or datetime.now(timezone.utc)
    ttl_seconds = (
        settings.refresh_token_ttl_remember_seconds
        if remember_me
        else settings.refresh_token_ttl_default_seconds
    )
    jti = uuid.uuid4().hex
    secret = secrets.token_urlsafe(32)
    return IssuedRefreshToken(
        jti=jti,
        secret=secret,
        cookie_value=f"{jti}.{secret}",
        token_hash=_hash_refresh_secret(secret),
        expires_at=issued_at + timedelta(seconds=ttl_seconds),
        chain_id=chain_id or uuid.uuid4().hex,
        remember_me=remember_me,
    )


def parse_refresh_cookie(cookie_value: str) -> Optional[tuple[str, str]]:
    """Split a `{jti}.{secret}` cookie. Returns None on malformed input."""
    if not cookie_value or "." not in cookie_value:
        return None
    jti, _, secret = cookie_value.partition(".")
    if not jti or not secret:
        return None
    return jti, secret


# ---------------------------------------------------------------------------
# CSRF double-submit
# ---------------------------------------------------------------------------


def mint_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_token_matches(cookie_value: Optional[str], header_value: Optional[str]) -> bool:
    if not cookie_value or not header_value:
        return False
    return hmac.compare_digest(cookie_value, header_value)
