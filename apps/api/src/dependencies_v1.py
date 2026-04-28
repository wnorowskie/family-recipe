"""Bearer-token auth dependencies for /v1/* endpoints.

Mirrors src/dependencies.py but reads `Authorization: Bearer <jwt>` instead
of the legacy session cookie. Kept in a separate module so a single import
site doesn't accidentally accept both auth modes.
"""
from __future__ import annotations

from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import prisma
from .errors import ApiError
from .schemas.auth import UserResponse
from .tokens import verify_access_token
from .uploads import get_signed_upload_url

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized() -> ApiError:
    return ApiError("UNAUTHORIZED", "Unauthorized", status.HTTP_401_UNAUTHORIZED)


async def get_current_user_v1(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserResponse:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    claims = verify_access_token(credentials.credentials)
    if claims is None:
        raise _unauthorized()

    user = await prisma.user.find_unique(
        where={"id": claims.sub},
        include={
            "memberships": {
                "where": {"familySpaceId": claims.family_space_id},
                "include": {"familySpace": True},
            }
        },
    )
    if not user or not user.memberships:
        raise _unauthorized()

    membership = user.memberships[0]
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
