"""Request/response shapes for /v1/auth/* — distinct from the legacy
session-cookie schemas in auth.py because the v1 contract returns an
access token alongside the user payload."""
from __future__ import annotations

from pydantic import BaseModel

from .auth import LoginRequest, SignupRequest, UserResponse

__all__ = [
    "LoginRequest",
    "SignupRequest",
    "UserResponse",
    "AccessTokenResponse",
    "AuthTokenResponse",
    "MeResponse",
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
