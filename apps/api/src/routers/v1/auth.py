"""/v1/auth/* — token-based auth (issue #35).

Replaces the legacy single-cookie JWT flow with:
  - short-lived `accessToken` returned in the JSON response body
  - rotating refresh token in an httpOnly `refresh_token` cookie
  - CSRF double-submit `csrf_token` cookie + `X-CSRF-Token` header on /refresh

Design: docs/research/refresh-token-store.md
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request, Response, status
from prisma.errors import PrismaError

from ...cookies import (
    clear_csrf_cookie,
    clear_refresh_cookie,
    set_csrf_cookie,
    set_refresh_cookie,
)
from ...db import prisma
from ...dependencies_v1 import get_current_user_v1
from ...errors import bad_request, forbidden, internal_error, invalid_credentials, unauthorized
from ...schemas.auth import LoginRequest, SignupRequest, UserResponse
from ...schemas.auth_v1 import AccessTokenResponse, AuthTokenResponse, MeResponse
from ...security import hash_password, verify_password
from ...settings import settings
from ...tokens import (
    REVOKED_LOGOUT,
    REVOKED_REUSE_DETECTED,
    REVOKED_ROTATED,
    constant_time_hash_eq,
    csrf_token_matches,
    issue_refresh_token,
    mint_access_token,
    mint_csrf_token,
    parse_refresh_cookie,
)
from ...uploads import get_signed_upload_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/auth", tags=["auth-v1"])


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _user_agent(request: Request) -> Optional[str]:
    ua = request.headers.get("user-agent")
    return ua[:500] if ua else None


async def _persist_refresh_and_set_cookies(
    *,
    response: Response,
    request: Request,
    user_id: str,
    family_space_id: str,
    chain_id: Optional[str],
    rotated_from_jti: Optional[str],
    remember_me: bool,
) -> int:
    """Insert a fresh RefreshToken row and set both cookies. Returns max-age seconds."""
    issued = issue_refresh_token(chain_id=chain_id, remember_me=remember_me)
    await prisma.refreshtoken.create(
        data={
            "userId": user_id,
            "familySpaceId": family_space_id,
            "jti": issued.jti,
            "tokenHash": issued.token_hash,
            "chainId": issued.chain_id,
            "rotatedFromJti": rotated_from_jti,
            "rememberMe": remember_me,
            "expiresAt": issued.expires_at,
            "userAgent": _user_agent(request),
            "ipAddress": _client_ip(request),
        }
    )
    max_age = (
        settings.refresh_token_ttl_remember_seconds
        if remember_me
        else settings.refresh_token_ttl_default_seconds
    )
    set_refresh_cookie(response, issued.cookie_value, max_age)
    set_csrf_cookie(response, mint_csrf_token(), max_age)
    return max_age


async def _build_user_response(user, membership) -> UserResponse:
    avatar_url = await get_signed_upload_url(getattr(user, "avatarStorageKey", None))
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        username=user.username,
        emailOrUsername=user.email,
        avatarUrl=avatar_url,
        role=membership.role,
        familySpaceId=membership.familySpaceId,
        familySpaceName=membership.familySpace.name if membership.familySpace else None,
    )


async def _validate_refresh_cookie(
    *, refresh_cookie: Optional[str], csrf_cookie: Optional[str], x_csrf_token: Optional[str]
):
    """Shared validation for /v1/auth/refresh and /v1/auth/session.

    Returns the row on success. Raises (returns) the unauthorized() response on
    failure. Critically, this helper does NOT trigger reuse-detection — that
    side effect is exclusive to /refresh because rotation is the canonical
    reuse signal. /session must be replay-safe so SSR can call it on every
    page render without burning the chain.
    """
    if not csrf_token_matches(csrf_cookie, x_csrf_token):
        return None, unauthorized("Invalid CSRF token")

    parsed = parse_refresh_cookie(refresh_cookie or "")
    if not parsed:
        return None, unauthorized("Missing or malformed refresh token")
    jti, secret = parsed

    row = await prisma.refreshtoken.find_unique(where={"jti": jti})
    if row is None:
        return None, unauthorized("Refresh token not recognized")

    now = datetime.now(timezone.utc)
    if row.expiresAt <= now:
        return None, unauthorized("Refresh token expired")
    if row.revokedAt is not None:
        return None, unauthorized("Refresh token revoked")
    if not constant_time_hash_eq(row.tokenHash, secret):
        return None, unauthorized("Refresh token invalid")

    return row, None


# ---------------------------------------------------------------------------
# POST /v1/auth/signup
# ---------------------------------------------------------------------------
@router.post("/signup", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, request: Request, response: Response):
    try:
        email = payload.email.strip()
        username = payload.username.strip()

        existing_user = await prisma.user.find_first(
            where={"OR": [{"email": email}, {"username": username}]}
        )
        if existing_user:
            return bad_request("A user with this email or username already exists")

        family_space = await prisma.familyspace.find_first()
        if not family_space:
            return internal_error("No family space found. Please contact the administrator.")

        if not verify_password(payload.familyMasterKey, family_space.masterKeyHash):
            return bad_request("Invalid Family Master Key")

        members_count = await prisma.familymembership.count(
            where={"familySpaceId": family_space.id}
        )
        role = "owner" if members_count == 0 else "member"

        async with prisma.tx() as tx:
            user = await tx.user.create(
                data={
                    "name": payload.name,
                    "email": email,
                    "username": username,
                    "passwordHash": hash_password(payload.password),
                }
            )
            membership = await tx.familymembership.create(
                data={
                    "familySpaceId": family_space.id,
                    "userId": user.id,
                    "role": role,
                }
            )

        access_token = mint_access_token(
            user_id=user.id,
            family_space_id=membership.familySpaceId,
            role=membership.role,
        )

        await _persist_refresh_and_set_cookies(
            response=response,
            request=request,
            user_id=user.id,
            family_space_id=membership.familySpaceId,
            chain_id=None,
            rotated_from_jti=None,
            remember_me=payload.rememberMe,
        )

        membership_with_space = type("M", (), {
            "role": membership.role,
            "familySpaceId": membership.familySpaceId,
            "familySpace": family_space,
        })
        user_response = await _build_user_response(user, membership_with_space)
        return AuthTokenResponse(accessToken=access_token, user=user_response)
    except PrismaError as error:
        logger.exception("auth_v1.signup.prisma_error: %s", error)
        return internal_error("Database error during signup")
    except Exception as error:  # noqa: BLE001
        logger.exception("auth_v1.signup.error: %s", error)
        return internal_error("Failed to signup")


# ---------------------------------------------------------------------------
# POST /v1/auth/login
# ---------------------------------------------------------------------------
@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest, request: Request, response: Response):
    try:
        identifier = payload.emailOrUsername.strip()
        user = await prisma.user.find_first(
            where={"OR": [{"email": identifier}, {"username": identifier}]},
            include={"memberships": {"include": {"familySpace": True}}},
        )

        if not user:
            logger.info("auth_v1.login.invalid_credentials: user not found")
            return invalid_credentials()

        if not verify_password(payload.password, user.passwordHash):
            logger.info("auth_v1.login.invalid_credentials: bad password")
            return invalid_credentials()

        if not user.memberships:
            logger.info("auth_v1.login.no_membership: userId=%s", user.id)
            return forbidden("User is not a member of any family space")

        membership = user.memberships[0]

        access_token = mint_access_token(
            user_id=user.id,
            family_space_id=membership.familySpaceId,
            role=membership.role,
        )

        await _persist_refresh_and_set_cookies(
            response=response,
            request=request,
            user_id=user.id,
            family_space_id=membership.familySpaceId,
            chain_id=None,
            rotated_from_jti=None,
            remember_me=payload.rememberMe,
        )

        user_response = await _build_user_response(user, membership)
        return AuthTokenResponse(accessToken=access_token, user=user_response)
    except PrismaError as error:
        logger.exception("auth_v1.login.prisma_error: %s", error)
        return internal_error("Database error during login")
    except Exception as error:  # noqa: BLE001
        logger.exception("auth_v1.login.error: %s", error)
        return internal_error("Failed to login")


# ---------------------------------------------------------------------------
# POST /v1/auth/refresh
# ---------------------------------------------------------------------------
@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(
    request: Request,
    response: Response,
    x_csrf_token: Optional[str] = Header(default=None, alias="X-CSRF-Token"),
):
    refresh_cookie = request.cookies.get(settings.refresh_cookie_name)
    csrf_cookie = request.cookies.get(settings.csrf_cookie_name)

    # CSRF double-submit gate — must precede DB work so a malformed request
    # cannot probe the token store.
    if not csrf_token_matches(csrf_cookie, x_csrf_token):
        return unauthorized("Invalid CSRF token")

    parsed = parse_refresh_cookie(refresh_cookie or "")
    if not parsed:
        return unauthorized("Missing or malformed refresh token")
    jti, secret = parsed

    try:
        row = await prisma.refreshtoken.find_unique(where={"jti": jti})
        now = datetime.now(timezone.utc)

        # If the cookie hashes back to a row we've already marked 'rotated',
        # this is the textbook reuse signal — burn the chain.
        if row is None:
            return unauthorized("Refresh token not recognized")

        is_expired = row.expiresAt <= now
        is_revoked = row.revokedAt is not None
        hash_ok = constant_time_hash_eq(row.tokenHash, secret)

        if (is_expired or is_revoked or not hash_ok) and row.revokedReason == REVOKED_ROTATED:
            await prisma.refreshtoken.update_many(
                where={"chainId": row.chainId, "revokedAt": None},
                data={"revokedAt": now, "revokedReason": REVOKED_REUSE_DETECTED},
            )
            logger.warning(
                "auth_v1.refresh.reuse_detected userId=%s chainId=%s issuanceIp=%s replayIp=%s",
                row.userId, row.chainId, row.ipAddress, _client_ip(request),
            )
            clear_refresh_cookie(response)
            clear_csrf_cookie(response)
            return unauthorized("Refresh token reuse detected")

        if is_expired or is_revoked or not hash_ok:
            return unauthorized("Refresh token invalid")

        # Rotate inside a single transaction so two concurrent /refresh callers
        # cannot both insert a successor row.
        async with prisma.tx() as tx:
            # SELECT … FOR UPDATE: lock the row before we mutate.
            await tx.execute_raw(
                'SELECT id FROM "refresh_tokens" WHERE jti = $1 FOR UPDATE',
                jti,
            )
            # Re-read inside the lock; another caller may have rotated us.
            locked = await tx.refreshtoken.find_unique(where={"jti": jti})
            if locked is None or locked.revokedAt is not None:
                return unauthorized("Refresh token invalid")

            await tx.refreshtoken.update(
                where={"jti": jti},
                data={"revokedAt": now, "revokedReason": REVOKED_ROTATED},
            )

            # The new row inherits the chain + remember_me — caller's flag is
            # set once at login and carried forward so /refresh doesn't silently
            # downgrade a remember-me session.
            issued = issue_refresh_token(chain_id=locked.chainId, remember_me=locked.rememberMe)
            await tx.refreshtoken.create(
                data={
                    "userId": locked.userId,
                    "familySpaceId": locked.familySpaceId,
                    "jti": issued.jti,
                    "tokenHash": issued.token_hash,
                    "chainId": issued.chain_id,
                    "rotatedFromJti": jti,
                    "rememberMe": locked.rememberMe,
                    "expiresAt": issued.expires_at,
                    "userAgent": _user_agent(request),
                    "ipAddress": _client_ip(request),
                }
            )

        # Membership lookup happens outside the transaction; tx scope is
        # narrow on purpose to keep the row lock short-lived.
        user = await prisma.user.find_unique(
            where={"id": locked.userId},
            include={
                "memberships": {
                    "where": {"familySpaceId": locked.familySpaceId},
                }
            },
        )
        if not user or not user.memberships:
            return unauthorized("Membership no longer valid")

        membership = user.memberships[0]
        access_token = mint_access_token(
            user_id=locked.userId,
            family_space_id=locked.familySpaceId,
            role=membership.role,
        )

        max_age = (
            settings.refresh_token_ttl_remember_seconds
            if locked.rememberMe
            else settings.refresh_token_ttl_default_seconds
        )
        set_refresh_cookie(response, issued.cookie_value, max_age)
        set_csrf_cookie(response, mint_csrf_token(), max_age)

        return AccessTokenResponse(accessToken=access_token)
    except PrismaError as error:
        logger.exception("auth_v1.refresh.prisma_error: %s", error)
        return internal_error("Database error during refresh")
    except Exception as error:  # noqa: BLE001
        logger.exception("auth_v1.refresh.error: %s", error)
        return internal_error("Failed to refresh")


# ---------------------------------------------------------------------------
# POST /v1/auth/logout
# ---------------------------------------------------------------------------
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response):
    refresh_cookie = request.cookies.get(settings.refresh_cookie_name)
    parsed = parse_refresh_cookie(refresh_cookie or "")
    if parsed:
        jti, _ = parsed
        try:
            await prisma.refreshtoken.update_many(
                where={"jti": jti, "revokedAt": None},
                data={"revokedAt": datetime.now(timezone.utc), "revokedReason": REVOKED_LOGOUT},
            )
        except PrismaError as error:
            # Logout should be best-effort; we still want to clear the client
            # cookie even if the DB write fails. Log loudly so we notice.
            logger.exception("auth_v1.logout.prisma_error: %s", error)

    clear_refresh_cookie(response)
    clear_csrf_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


# ---------------------------------------------------------------------------
# GET /v1/auth/me
# ---------------------------------------------------------------------------
@router.get("/me", response_model=MeResponse)
async def me(user: UserResponse = Depends(get_current_user_v1)):
    return MeResponse(user=user)


# ---------------------------------------------------------------------------
# GET /v1/auth/session
# ---------------------------------------------------------------------------
# Non-rotating session-verify endpoint. Used by Next SSR (issue #173) so that
# server components can prefetch the user without advancing the refresh-token
# chain. Returns the same shape as /me but accepts the refresh + CSRF cookies
# instead of a Bearer access token.
#
# This endpoint is replay-safe by design: validating the same refresh cookie
# repeatedly does NOT mark the row as rotated and does NOT trigger reuse
# detection. Rotation and the reuse signal remain exclusive to /v1/auth/refresh.
@router.get("/session", response_model=MeResponse)
async def session(
    request: Request,
    x_csrf_token: Optional[str] = Header(default=None, alias="X-CSRF-Token"),
):
    refresh_cookie = request.cookies.get(settings.refresh_cookie_name)
    csrf_cookie = request.cookies.get(settings.csrf_cookie_name)

    try:
        row, error_response = await _validate_refresh_cookie(
            refresh_cookie=refresh_cookie,
            csrf_cookie=csrf_cookie,
            x_csrf_token=x_csrf_token,
        )
        if error_response is not None:
            return error_response

        user = await prisma.user.find_unique(
            where={"id": row.userId},
            include={
                "memberships": {
                    "where": {"familySpaceId": row.familySpaceId},
                    "include": {"familySpace": True},
                }
            },
        )
        if not user or not user.memberships:
            return unauthorized("Membership no longer valid")

        user_response = await _build_user_response(user, user.memberships[0])
        return MeResponse(user=user_response)
    except PrismaError as error:
        logger.exception("auth_v1.session.prisma_error: %s", error)
        return internal_error("Database error during session check")
    except Exception as error:  # noqa: BLE001
        logger.exception("auth_v1.session.error: %s", error)
        return internal_error("Failed to validate session")
