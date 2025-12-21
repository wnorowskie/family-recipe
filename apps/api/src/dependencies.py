from fastapi import HTTPException, Request, status

from .db import prisma
from .schemas.auth import UserResponse
from .security import verify_token
from .settings import settings


async def get_current_user(request: Request) -> UserResponse:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    payload = verify_token(token)

    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    membership = user.memberships[0]
    return UserResponse(
        id=user.id,
        name=user.name,
        emailOrUsername=user.emailOrUsername,
        avatarUrl=user.avatarUrl,
        role=membership.role,
        familySpaceId=membership.familySpaceId,
        familySpaceName=membership.familySpace.name if membership.familySpace else None,
    )
