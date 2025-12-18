import json
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Path, UploadFile, status
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import forbidden, internal_error, not_found
from ..permissions import can_delete_comment
from ..schemas.auth import UserResponse
from ..schemas.comments import CreateCommentRequest
from ..uploads import ALLOWED_MIME_TYPES, delete_uploads, save_photo_file
from ..utils import iso, is_cuid

router = APIRouter(prefix="/posts/{post_id}/comments", tags=["comments"])

MAX_COMMENT_LIMIT = 50


def _clamp_limit(value: Optional[int], default: int, max_value: int) -> int:
    if value is None:
        return default
    try:
        v = int(value)
    except Exception:
        return default
    v = max(1, v)
    return min(v, max_value)


@router.get("")
async def list_comments(
    post_id: str = Path(..., min_length=1),
    limit: int = 20,
    offset: int = 0,
    user: UserResponse = Depends(get_current_user),
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")
        limit_clamped = _clamp_limit(limit, 20, MAX_COMMENT_LIMIT)
        comments = await prisma.comment.find_many(
            where={"postId": post_id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=limit_clamped + 1,
            skip=offset,
            include={"author": True},
        )
        has_more = len(comments) > limit_clamped
        comments = comments[:limit_clamped]
        ids = [c.id for c in comments]
        reaction_map: Dict[str, List[Dict[str, object]]] = {}
        if ids:
            reactions = await prisma.reaction.find_many(
                where={"targetType": "comment", "targetId": {"in": ids}},
                order={"createdAt": "asc"},
                include={"user": True},
            )
            for r in reactions:
                lst = reaction_map.get(r.targetId) or []
                found = next((entry for entry in lst if entry["emoji"] == r.emoji), None)
                if not found:
                    found = {"emoji": r.emoji, "count": 0, "users": []}
                    lst.append(found)
                    reaction_map[r.targetId] = lst
                found["count"] += 1
                found["users"].append(
                    {"id": r.user.id, "name": r.user.name, "avatarUrl": r.user.avatarUrl}
                )

        serialized = [
            {
                "id": c.id,
                "text": c.text,
                "photoUrl": c.photoUrl,
                "createdAt": iso(c.createdAt),
                "author": {"id": c.author.id, "name": c.author.name, "avatarUrl": c.author.avatarUrl} if c.author else None,
                "reactions": reaction_map.get(c.id, []),
            }
            for c in reversed(comments)
        ]
        return {"comments": serialized, "hasMore": has_more, "nextOffset": offset + len(serialized)}
    except PrismaError:
        return internal_error("Failed to load comments")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_comment(
    payload: str = Form(...),
    photo: Optional[UploadFile] = File(default=None),
    post_id: str = Path(..., min_length=1),
    user: UserResponse = Depends(get_current_user),
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")
        post = await prisma.post.find_unique(where={"id": post_id})
        if not post or post.familySpaceId != user.familySpaceId:
            return not_found("Post not found")

        try:
            payload_data = json.loads(payload)
        except json.JSONDecodeError:
            return internal_error("Invalid payload")

        comment_payload = CreateCommentRequest.model_validate(payload_data)

        photo_url: Optional[str] = None
        if photo:
            if (photo.content_type or "") not in ALLOWED_MIME_TYPES:
                return forbidden("Only JPEG, PNG, WEBP, or GIF images are allowed")
            saved = await save_photo_file(photo)
            photo_url = saved["url"]

        comment = await prisma.comment.create(
            data={
                "postId": post_id,
                "authorId": user.id,
                "text": comment_payload.text,
                "photoUrl": photo_url,
            },
            include={"author": True},
        )
        return {
            "comment": {
                "id": comment.id,
                "text": comment.text,
                "photoUrl": comment.photoUrl,
                "createdAt": iso(comment.createdAt),
                "author": {"id": comment.author.id, "name": comment.author.name, "avatarUrl": comment.author.avatarUrl} if comment.author else None,
                "reactions": [],
            }
        }
    except PrismaError:
        return internal_error("Failed to create comment")


comments_router = router


# Standalone deletion route for /comments/{comment_id}
delete_router = APIRouter(prefix="/comments", tags=["comments"])


@delete_router.delete("/{comment_id}")
async def delete_comment(
    comment_id: str = Path(..., min_length=1), user: UserResponse = Depends(get_current_user)
):
    try:
        if not is_cuid(comment_id):
            return not_found("Comment not found")
        comment = await prisma.comment.find_unique(
            where={"id": comment_id},
            include={"author": True, "post": True},
        )
        if not comment:
            return not_found("Comment not found")
        if comment.post.familySpaceId != user.familySpaceId:
            return not_found("Comment not found")
        if not can_delete_comment(user, comment.authorId):
            return forbidden("You do not have permission to delete this comment")

        await prisma.comment.delete(where={"id": comment_id})
        await delete_uploads([comment.photoUrl])
        return {"message": "Comment deleted"}
    except PrismaError:
        return internal_error("Failed to delete comment")
