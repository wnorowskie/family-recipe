from fastapi import Request, status

from .db import prisma
from .errors import ApiError
from .schemas.auth import UserResponse
from .security import verify_token
from .settings import settings
from .uploads import get_signed_upload_url


def _unauthorized() -> ApiError:
    return ApiError("UNAUTHORIZED", "Unauthorized", status.HTTP_401_UNAUTHORIZED)


async def get_current_user(request: Request) -> UserResponse:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise _unauthorized()

    payload = verify_token(token)

    if not payload:
        raise _unauthorized()

    user = await prisma.user.find_unique(
        where={"id": payload["userId"]},
        include={
            "memberships": {
                "where": {"familySpaceId": payload["familySpaceId"]},
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
