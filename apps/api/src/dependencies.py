from fastapi import Request, status

from .db import prisma
from .errors import ApiError
from .schemas.auth import UserResponse
from .security import verify_token
from .settings import settings
from .tokens import verify_access_token
from .uploads import get_signed_upload_url


def _unauthorized() -> ApiError:
    return ApiError("UNAUTHORIZED", "Unauthorized", status.HTTP_401_UNAUTHORIZED)


async def _load_user_by_id(user_id: str, family_space_id: str) -> UserResponse:
    user = await prisma.user.find_unique(
        where={"id": user_id},
        include={
            "memberships": {
                "where": {"familySpaceId": family_space_id},
                "include": {"familySpace": True},
            }
        },
    )
    if not user or not user.memberships:
        raise _unauthorized()

    membership = user.memberships[0]
    avatar_url = await get_signed_upload_url(user.avatarStorageKey)
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


async def get_current_user(request: Request) -> UserResponse:
    # Phase 4: the dual-mounted routers (no /v1/ prefix for legacy callers,
    # /v1/ prefix for the SPA's Bearer-token flow) need to accept both auth
    # modes. Try Bearer first; fall back to the legacy session cookie so
    # existing cookie-authenticated callers keep working.
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        bearer = auth_header[7:].strip()
        claims = verify_access_token(bearer)
        if claims is None:
            raise _unauthorized()
        return await _load_user_by_id(claims.sub, claims.family_space_id)

    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise _unauthorized()

    payload = verify_token(token)
    if not payload:
        raise _unauthorized()

    return await _load_user_by_id(payload["userId"], payload["familySpaceId"])
