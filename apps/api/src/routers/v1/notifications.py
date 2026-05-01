"""/v1/notifications/* — list, mark-read, unread-count.

Mirrors the Next.js handlers at src/app/api/notifications/* (issue #182,
sub-task of #37). Bearer-token auth via get_current_user_v1; never mounted
unprefixed — there is no cookie-auth twin because the Phase 2 frontend only
hits this surface when USE_FASTAPI_AUTH is on (which means it's already
sending access tokens).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from prisma.errors import PrismaError

from ...db import prisma
from ...dependencies_v1 import get_current_user_v1
from ...errors import internal_error, validation_error
from ...schemas.auth import UserResponse
from ...schemas.notifications import (
    MarkNotificationsReadRequest,
    MarkNotificationsReadResponse,
    NotificationsListResponse,
    UnreadCountResponse,
)
from ...uploads import create_signed_url_resolver
from ...utils import iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])


def _emoji_counts_total(emoji_counts: list[Any] | None) -> int:
    if not emoji_counts:
        return 0
    total = 0
    for entry in emoji_counts:
        # Stored as JSON; can come back as either dicts or model objects.
        if isinstance(entry, dict):
            total += int(entry.get("count", 0) or 0)
        else:
            total += int(getattr(entry, "count", 0) or 0)
    return total


def _emoji_counts_to_list(emoji_counts: list[Any] | None) -> list[dict]:
    if not emoji_counts:
        return []
    out: list[dict] = []
    for entry in emoji_counts:
        if isinstance(entry, dict):
            out.append({"emoji": entry.get("emoji", ""), "count": int(entry.get("count", 0) or 0)})
        else:
            out.append({"emoji": getattr(entry, "emoji", ""), "count": int(getattr(entry, "count", 0) or 0)})
    return out


def _metadata_get(metadata: Any, key: str) -> Any:
    if metadata is None:
        return None
    if isinstance(metadata, dict):
        return metadata.get(key)
    return getattr(metadata, key, None)


@router.get("", response_model=NotificationsListResponse)
async def list_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    unreadOnly: bool = Query(default=False),
    user: UserResponse = Depends(get_current_user_v1),
):
    try:
        # Two reads, one count — mirrors fetchNotifications() in
        # src/lib/notifications.ts. The limit+1 take is the standard
        # has-more probe used by the rest of this codebase.
        where: dict = {"recipientId": user.id, "familySpaceId": user.familySpaceId}
        if unreadOnly:
            where["readAt"] = None
        rows = await prisma.notification.find_many(
            where=where,
            order=[{"updatedAt": "desc"}, {"createdAt": "desc"}],
            take=limit + 1,
            skip=offset,
            include={
                "actor": True,
                "post": True,
            },
        )
        # The Next handler counts unread for the recipient regardless of
        # family scope (recipient implicitly belongs to one family). Match
        # that for parity.
        unread_count = await prisma.notification.count(
            where={"recipientId": user.id, "readAt": None},
        )

        has_more = len(rows) > limit
        slice_rows = rows[:limit]

        resolve_url = create_signed_url_resolver()
        items: list[dict] = []
        for row in slice_rows:
            actor = row.actor
            post = row.post
            metadata = getattr(row, "metadata", None)
            row_type = row.type
            entry: dict = {
                "id": row.id,
                "type": row_type,
                "createdAt": iso(row.createdAt),
                "updatedAt": iso(row.updatedAt),
                "readAt": iso(row.readAt) if row.readAt else None,
                "actor": {
                    "id": actor.id,
                    "name": actor.name,
                    "avatarUrl": await resolve_url(getattr(actor, "avatarStorageKey", None)),
                },
                "post": {
                    "id": post.id,
                    "title": post.title,
                    "mainPhotoUrl": await resolve_url(getattr(post, "mainPhotoStorageKey", None)),
                },
                "commentText": _metadata_get(metadata, "commentText"),
                "cookedNote": _metadata_get(metadata, "note"),
                "cookedRating": _metadata_get(metadata, "rating") if isinstance(_metadata_get(metadata, "rating"), int) else None,
            }
            if row_type == "reaction_batch":
                emoji_counts = _emoji_counts_to_list(getattr(row, "emojiCounts", None))
                total = getattr(row, "totalCount", None)
                if total is None:
                    total = _emoji_counts_total(emoji_counts)
                entry["reactionSummary"] = {
                    "totalCount": total,
                    "emojiCounts": emoji_counts,
                    "lastEmoji": _metadata_get(metadata, "lastEmoji"),
                }
            items.append(entry)

        return {
            "notifications": items,
            "unreadCount": unread_count,
            "hasMore": has_more,
            "nextOffset": offset + len(items),
        }
    except PrismaError as e:
        logger.exception("notifications.list.prisma_error: %s", e)
        return internal_error("Failed to load notifications")
    except (ValueError, TypeError, AttributeError, KeyError) as e:
        logger.exception("notifications.list.error: %s", e)
        return internal_error("Failed to load notifications")


@router.post("/mark-read", response_model=MarkNotificationsReadResponse)
async def mark_read(
    payload: MarkNotificationsReadRequest,
    user: UserResponse = Depends(get_current_user_v1),
):
    ids = payload.ids
    if ids is not None and any(not isinstance(i, str) or not i for i in ids):
        return validation_error("Invalid notification ID")

    try:
        # Family scoping: even though `recipientId == user.id` is enough to
        # prevent cross-user writes, we add familySpaceId so a stale ID from
        # a different space (post-membership-change) cannot be marked. Mirrors
        # the implicit invariant in the Next handler, where recipient implies
        # family.
        where: dict = {
            "recipientId": user.id,
            "familySpaceId": user.familySpaceId,
            "readAt": None,
        }
        if ids:
            where["id"] = {"in": ids}

        await prisma.notification.update_many(
            where=where,
            data={"readAt": datetime.now(timezone.utc)},
        )

        unread_count = await prisma.notification.count(
            where={"recipientId": user.id, "readAt": None},
        )
        return {"status": "ok", "unreadCount": unread_count}
    except PrismaError as e:
        logger.exception("notifications.mark_read.prisma_error: %s", e)
        return internal_error("Failed to mark notifications as read")
    except (ValueError, TypeError, AttributeError, KeyError) as e:
        logger.exception("notifications.mark_read.error: %s", e)
        return internal_error("Failed to mark notifications as read")


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(user: UserResponse = Depends(get_current_user_v1)):
    try:
        count = await prisma.notification.count(
            where={"recipientId": user.id, "readAt": None},
        )
        return {"unreadCount": count}
    except PrismaError as e:
        logger.exception("notifications.unread_count.prisma_error: %s", e)
        return internal_error("Failed to fetch unread notifications")
    except (ValueError, TypeError, AttributeError) as e:
        logger.exception("notifications.unread_count.error: %s", e)
        return internal_error("Failed to fetch unread notifications")
