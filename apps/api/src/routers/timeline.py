from fastapi import APIRouter, Depends, Query
from prisma.errors import PrismaError
import logging

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import internal_error
from ..schemas.auth import UserResponse
from ..utils import iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("")
async def get_timeline(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserResponse = Depends(get_current_user),
):
    try:
        take = limit + offset + 5

        post_events = await prisma.post.find_many(
            where={"familySpaceId": user.familySpaceId},
            order={"createdAt": "desc"},
            take=take,
            include={"author": True},
        )
        comment_events = await prisma.comment.find_many(
            where={"post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=take,
            include={"author": True, "post": True},
        )
        reaction_events = await prisma.reaction.find_many(
            where={"targetType": "post", "postId": {"not": None}, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=take,
            include={"user": True, "post": True},
        )
        cooked_events = await prisma.cookedevent.find_many(
            where={"post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=take,
            include={"user": True, "post": True},
        )
        edit_events = await prisma.post.find_many(
            where={"familySpaceId": user.familySpaceId, "lastEditAt": {"not": None}},
            order={"lastEditAt": "desc"},
            take=take,
            include={"editor": True, "author": True},
        )

        def _post_summary(post):
            """Extract only the fields we need from a post object."""
            if not post:
                return None
            return {"id": post.id, "title": post.title, "mainPhotoUrl": post.mainPhotoUrl}

        raw = []
        for event in post_events:
            raw.append(
                {
                    "id": f"post-{event.id}",
                    "createdAt": event.createdAt,
                    "type": "post_created",
                    "actor": event.author,
                    "post": {"id": event.id, "title": event.title, "mainPhotoUrl": event.mainPhotoUrl},
                }
            )
        for event in comment_events:
            raw.append(
                {
                    "id": f"comment-{event.id}",
                    "createdAt": event.createdAt,
                    "type": "comment_added",
                    "actor": event.author,
                    "post": _post_summary(event.post),
                    "comment": {"id": event.id, "text": event.text},
                }
            )
        for event in reaction_events:
            raw.append(
                {
                    "id": f"reaction-{event.id}",
                    "createdAt": event.createdAt,
                    "type": "reaction_added",
                    "actor": event.user,
                    "post": _post_summary(event.post),
                    "reaction": {"emoji": event.emoji},
                }
            )
        for event in cooked_events:
            raw.append(
                {
                    "id": f"cooked-{event.id}",
                    "createdAt": event.createdAt,
                    "type": "cooked_logged",
                    "actor": event.user,
                    "post": _post_summary(event.post),
                    "cooked": {"rating": event.rating, "note": event.note},
                }
            )
        for event in edit_events:
            if not event.lastEditAt:
                continue
            actor = event.editor or event.author
            if not actor:
                continue
            if event.lastEditAt == event.createdAt:
                continue
            raw.append(
                {
                    "id": f"edit-{event.id}-{int(event.lastEditAt.timestamp()*1000)}",
                    "createdAt": event.lastEditAt,
                    "type": "post_edited",
                    "actor": actor,
                    "post": {"id": event.id, "title": event.title, "mainPhotoUrl": event.mainPhotoUrl},
                    "edit": {"note": event.lastEditNote},
                }
            )

        raw.sort(key=lambda e: e["createdAt"], reverse=True)
        slice_items = raw[offset : offset + limit]
        has_more = len(raw) > offset + limit

        def action_text(entry_type: str) -> str:
            mapping = {
                "post_created": "posted",
                "comment_added": "commented on",
                "reaction_added": "reacted to",
                "cooked_logged": "cooked",
                "post_edited": "updated",
            }
            return mapping.get(entry_type, "shared")

        items = [
            {
                "id": entry["id"],
                "type": entry["type"],
                "timestamp": iso(entry["createdAt"]),
                "actor": {
                    "id": entry["actor"].id,
                    "name": entry["actor"].name,
                    "avatarUrl": entry["actor"].avatarUrl,
                },
                "post": entry["post"],
                "actionText": action_text(entry["type"]),
                **({"comment": entry["comment"]} if "comment" in entry else {}),
                **({"reaction": entry["reaction"]} if "reaction" in entry else {}),
                **({"cooked": entry["cooked"]} if "cooked" in entry else {}),
                **({"edit": entry["edit"]} if "edit" in entry else {}),
            }
            for entry in slice_items
        ]

        return {"items": items, "hasMore": has_more, "nextOffset": offset + len(items)}
    except PrismaError as e:
        logger.exception("timeline.prisma_error: %s", e)
        return internal_error("Failed to load timeline")
    except Exception as e:
        logger.exception("timeline.error: %s", e)
        return internal_error("Failed to load timeline")
