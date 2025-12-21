from fastapi import APIRouter, Depends, status
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import bad_request, internal_error, not_found
from ..schemas.auth import UserResponse
from ..schemas.reactions import ReactionRequest
from ..utils import is_cuid

router = APIRouter(prefix="/reactions", tags=["reactions"])


@router.post("", status_code=status.HTTP_200_OK)
async def toggle_reaction(payload: ReactionRequest, user: UserResponse = Depends(get_current_user)):
    try:
        if not is_cuid(payload.targetId):
            return not_found("Target not found")
        if payload.targetType == "post":
            target = await prisma.post.find_unique(where={"id": payload.targetId})
            if not target or target.familySpaceId != user.familySpaceId:
                return not_found("Post not found")
            post_id = payload.targetId
            comment_id = None
        else:
            comment = await prisma.comment.find_unique(
                where={"id": payload.targetId},
                include={"post": True},
            )
            if not comment or comment.post.familySpaceId != user.familySpaceId:
                return not_found("Comment not found")
            post_id = comment.postId
            comment_id = payload.targetId

        existing = await prisma.reaction.find_first(
            where={
                "targetType": payload.targetType,
                "targetId": payload.targetId,
                "userId": user.id,
                "emoji": payload.emoji,
            }
        )

        if existing:
            await prisma.reaction.delete(where={"id": existing.id})
            return {"reacted": False}

        await prisma.reaction.create(
            data={
                "targetType": payload.targetType,
                "targetId": payload.targetId,
                "userId": user.id,
                "emoji": payload.emoji,
                "postId": post_id,
                "commentId": comment_id,
            }
        )
        return {"reacted": True}
    except PrismaError:
        return internal_error("Failed to toggle reaction")
    except Exception:
        return bad_request("Invalid reaction payload")
