from fastapi import APIRouter, Depends, Path
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import forbidden, internal_error, not_found
from ..permissions import can_remove_member
from ..schemas.auth import UserResponse
from ..utils import is_cuid

router = APIRouter(prefix="/family/members", tags=["family"])


@router.get("")
async def list_members(user: UserResponse = Depends(get_current_user)):
    try:
        memberships = await prisma.familymembership.find_many(
            where={"familySpaceId": user.familySpaceId},
            include={"user": {"include": {"posts": True}}},
            order={"createdAt": "asc"},
        )
        members = [
            {
                "userId": m.userId,
                "membershipId": m.id,
                "name": m.user.name,
                "emailOrUsername": m.user.emailOrUsername,
                "avatarUrl": m.user.avatarUrl,
                "role": m.role,
                "joinedAt": m.createdAt.isoformat(),
                "postCount": len(m.user.posts) if m.user.posts else 0,
            }
            for m in memberships
            if m.user
        ]
        return {"members": members}
    except PrismaError:
        return internal_error("Failed to load members")


@router.delete("/{user_id}")
async def remove_member(
    user_id: str = Path(..., min_length=1), current_user: UserResponse = Depends(get_current_user)
):
    try:
        if not is_cuid(user_id):
            return not_found("Member not found")
        membership = await prisma.familymembership.find_first(
            where={"familySpaceId": current_user.familySpaceId, "userId": user_id},
            include={"user": True},
        )
        if not membership:
            return not_found("Member not found")

        if not can_remove_member(current_user, membership.userId, membership.role):
            return forbidden("You do not have permission to remove this member")

        await prisma.familymembership.delete(where={"id": membership.id})
        return {"message": "Member removed"}
    except PrismaError:
        return internal_error("Failed to remove member")
