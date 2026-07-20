import asyncio
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, status
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import bad_request, internal_error, not_found
from ..schemas.auth import UserResponse
from ..schemas.reactions import ReactionRequest
from ..uploads import create_signed_url_resolver
from ..utils import is_cuid

router = APIRouter(prefix="/reactions", tags=["reactions"])


async def _build_reaction_summary(
    target_type: str, target_id: str
) -> List[Dict[str, Any]]:
    rows = await prisma.reaction.find_many(
        where={"targetType": target_type, "targetId": target_id},
        order={"createdAt": "asc"},
        include={"user": True},
    )
    resolve_avatar = create_signed_url_resolver()
    # Pre-resolve every distinct avatar key concurrently so the per-row awaits
    # below are cache hits — otherwise N distinct reactors mean N sequential
    # signed-URL calls. The resolver memoizes per key, so this seeds its cache.
    distinct_keys = {
        r.user.avatarStorageKey for r in rows if r.user and r.user.avatarStorageKey
    }
    if distinct_keys:
        await asyncio.gather(*(resolve_avatar(key) for key in distinct_keys))
    summary: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        entry = summary.get(r.emoji) or {"emoji": r.emoji, "count": 0, "users": []}
        entry["count"] += 1
        entry["users"].append(
            {
                "id": r.user.id,
                "name": r.user.name,
                "avatarUrl": await resolve_avatar(r.user.avatarStorageKey),
            }
        )
        summary[r.emoji] = entry
    return list(summary.values())


@router.post("", status_code=status.HTTP_200_OK)
async def toggle_reaction(
    payload: ReactionRequest, user: UserResponse = Depends(get_current_user)
):
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
        else:
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

        reactions = await _build_reaction_summary(payload.targetType, payload.targetId)
        return {"reactions": reactions}
    except PrismaError:
        return internal_error("Failed to toggle reaction")
    except (ValueError, TypeError, AttributeError, KeyError):
        return bad_request("Invalid reaction payload")
