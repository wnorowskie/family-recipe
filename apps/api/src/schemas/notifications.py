"""Request/response shapes for /v1/notifications/*.

Mirrors the JSON the Next.js handlers at src/app/api/notifications/* return,
so the frontend can swap base URLs without other changes during dual-mode.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from ..utils import is_cuid


NotificationType = Literal["comment", "reaction_batch", "cooked"]


class NotificationActor(BaseModel):
    id: str
    name: str
    avatarUrl: Optional[str] = None


class NotificationPost(BaseModel):
    id: str
    title: str
    mainPhotoUrl: Optional[str] = None


class ReactionEmojiCount(BaseModel):
    emoji: str
    count: int


class ReactionSummary(BaseModel):
    totalCount: int
    emojiCounts: List[ReactionEmojiCount]
    lastEmoji: Optional[str] = None


class NotificationItem(BaseModel):
    id: str
    type: NotificationType
    createdAt: str
    updatedAt: str
    readAt: Optional[str] = None
    actor: NotificationActor
    post: NotificationPost
    commentText: Optional[str] = None
    cookedNote: Optional[str] = None
    cookedRating: Optional[int] = None
    reactionSummary: Optional[ReactionSummary] = None


class NotificationsListResponse(BaseModel):
    notifications: List[NotificationItem]
    unreadCount: int
    hasMore: bool
    nextOffset: int


class MarkNotificationsReadRequest(BaseModel):
    # Optional list of IDs to mark; omitted/empty = mark all unread for caller.
    # Cap + CUID shape mirror the Next.js Zod (`markNotificationsSchema` in
    # src/lib/validation.ts) so both surfaces reject the same payloads at the
    # schema boundary instead of relying on the recipientId/familySpaceId
    # filter to silently zero-out junk IDs (issue #198).
    ids: Optional[List[str]] = Field(default=None, max_length=50)

    @field_validator("ids")
    @classmethod
    def _ids_are_cuids(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for entry in v:
            if not isinstance(entry, str) or not is_cuid(entry):
                raise ValueError("Invalid notification ID")
        return v


class MarkNotificationsReadResponse(BaseModel):
    status: Literal["ok"]
    unreadCount: int


class UnreadCountResponse(BaseModel):
    unreadCount: int
