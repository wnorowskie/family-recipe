from fastapi import APIRouter, Depends
from prisma.errors import PrismaError
import logging

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import bad_request, internal_error
from ..schemas.auth import UserResponse
from ..security import hash_password, verify_password
from ..utils import iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/favorites")
async def my_favorites(limit: int = 20, offset: int = 0, user: UserResponse = Depends(get_current_user)):
    try:
        favorites = await prisma.favorite.find_many(
            where={"userId": user.id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=limit + 1,
            skip=offset,
            include={"post": {"include": {"author": True}}},
        )
        has_more = len(favorites) > limit
        favorites = favorites[:limit]
        items = [
            {
                "id": fav.id,
                "createdAt": iso(fav.createdAt),
                "post": {
                    "id": fav.post.id,
                    "title": fav.post.title,
                    "mainPhotoUrl": fav.post.mainPhotoUrl,
                    "authorName": fav.post.author.name if fav.post.author else None,
                },
            }
            for fav in favorites
        ]
        return {"items": items, "hasMore": has_more, "nextOffset": offset + len(items)}
    except PrismaError as e:
        logger.exception("me.favorites.prisma_error: %s", e)
        return internal_error("Failed to load favorites")
    except Exception as e:
        logger.exception("me.favorites.error: %s", e)
        return internal_error("Failed to load favorites")


@router.put("/profile")
async def update_profile(
    payload: dict, user: UserResponse = Depends(get_current_user)
):  # simple dict validation to mirror existing behavior
    name = payload.get("name")
    email_or_username = payload.get("emailOrUsername")
    if not isinstance(name, str) or not name.strip():
        return bad_request("Name is required")
    if not isinstance(email_or_username, str) or not email_or_username.strip():
        return bad_request("Email or username is required")

    try:
        updated = await prisma.user.update(
            where={"id": user.id},
            data={"name": name.strip(), "emailOrUsername": email_or_username.strip()},
        )
        return {"user": {"id": updated.id, "name": updated.name, "emailOrUsername": updated.emailOrUsername, "avatarUrl": updated.avatarUrl}}
    except PrismaError:
        return internal_error("Failed to update profile")
    except Exception:
        return internal_error("Failed to update profile")


@router.put("/password")
async def change_password(payload: dict, user: UserResponse = Depends(get_current_user)):
    current_password = payload.get("currentPassword")
    new_password = payload.get("newPassword")
    if not isinstance(current_password, str) or not current_password:
        return bad_request("Current password is required")
    if not isinstance(new_password, str) or len(new_password) < 8:
        return bad_request("New password must be at least 8 characters")

    try:
        record = await prisma.user.find_unique(where={"id": user.id})
        if not record or not verify_password(current_password, record.passwordHash):
            return bad_request("Current password is incorrect")

        await prisma.user.update(
            where={"id": user.id},
            data={"passwordHash": hash_password(new_password)},
        )
        return {"message": "Password updated"}
    except PrismaError:
        return internal_error("Failed to update password")
    except Exception:
        return internal_error("Failed to update password")
