"""Request/response shapes for /v1/auth/* — distinct from the legacy
session-cookie schemas in auth.py because the v1 contract returns an
access token alongside the user payload."""
from __future__ import annotations

from pydantic import BaseModel

from .auth import LoginRequest, ResetPasswordRequest, SignupRequest, UserResponse

__all__ = [
    "LoginRequest",
    "ResetPasswordRequest",
    "SignupRequest",
    "UserResponse",
    "AccessTokenResponse",
    "AuthTokenResponse",
    "MeResponse",
    "ResetPasswordResponse",
]


class AccessTokenResponse(BaseModel):
    """Returned by /v1/auth/refresh — only the access token rotates here.
    The user does not change between rotations."""
    accessToken: str


class AuthTokenResponse(BaseModel):
    """Returned by /v1/auth/{login,signup} — full bootstrap payload."""
    accessToken: str
    user: UserResponse


class MeResponse(BaseModel):
    user: UserResponse


class ResetPasswordResponse(BaseModel):
    """Returned by /v1/auth/reset on success — mirrors the legacy Next
    handler's `{ status: "reset" }` body so existing clients don't have to
    branch during the Phase 3 → 4 cutover."""
    status: str = "reset"
