import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, File, Form, Path, UploadFile, status
from prisma.errors import PrismaError

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import conflict, forbidden, internal_error, not_found
from ..permissions import can_edit_post
from ..schemas.auth import UserResponse
from ..schemas.posts import CookedRequest, CreatePostRequest, FavoriteResponse, UpdatePostRequest
from ..uploads import ALLOWED_MIME_TYPES, MAX_PHOTO_COUNT, delete_uploads, save_photo_file
from ..utils import iso, is_cuid

router = APIRouter(prefix="/posts", tags=["posts"])
COURSE_VALUES = {"breakfast", "lunch", "dinner", "dessert", "snack", "other"}


def _parse_courses_from_recipe_details(details: Any) -> List[str]:
    if not details:
        return []
    courses_raw = getattr(details, "courses", None)
    values: List[str] = []
    try:
        if isinstance(courses_raw, str):
            parsed = json.loads(courses_raw)
            if isinstance(parsed, list):
                values = [c for c in parsed if isinstance(c, str) and c in COURSE_VALUES]
        elif isinstance(courses_raw, list):
            values = [c for c in courses_raw if isinstance(c, str) and c in COURSE_VALUES]
    except Exception:
        values = []
    if not values and getattr(details, "course", None) in COURSE_VALUES:
        values = [getattr(details, "course")]
    return list(dict.fromkeys(values))


def _clamp_limit(value: Optional[int], default: int, max_value: int) -> int:
    if value is None:
        return default
    try:
        v = int(value)
    except Exception:
        return default
    v = max(1, v)
    return min(v, max_value)


def _normalize_courses(recipe: Optional[Dict[str, Any]]) -> List[str]:
    if not recipe:
        return []
    courses = recipe.get("courses") or []
    if recipe.get("course") and not courses:
        courses = [recipe["course"]]
    return courses


def _build_recipe_data(recipe: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not recipe:
        return None
    courses = _normalize_courses(recipe)
    return {
        "origin": recipe.get("origin"),
        "ingredients": json.dumps(
            [
                {
                    "name": ing.get("name"),
                    "unit": ing.get("unit"),
                    "quantity": ing.get("quantity") if isinstance(ing.get("quantity"), (int, float)) else None,
                }
                for ing in recipe.get("ingredients", [])
                if isinstance(ing, dict)
            ]
        ),
        "steps": json.dumps(
            [{"text": step.get("text")} for step in recipe.get("steps", []) if isinstance(step, dict)]
        ),
        "totalTime": recipe.get("totalTime"),
        "servings": recipe.get("servings"),
        "course": courses[0] if courses else None,
        "courses": json.dumps(courses) if courses else None,
        "difficulty": recipe.get("difficulty"),
    }


async def _resolve_tags(tag_names: Optional[List[str]]) -> List[Dict[str, str]]:
    if not tag_names:
        return []
    tags = await prisma.tag.find_many(
        where={"name": {"in": tag_names}},
    )
    if len(tags) != len(tag_names):
        raise ValueError("INVALID_TAG")
    return [{"id": t.id, "name": t.name} for t in tags]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: str = Form(...),
    photos: List[UploadFile] = File(default_factory=list),
    user: UserResponse = Depends(get_current_user),
):
    try:
        try:
            payload_data = json.loads(payload)
        except json.JSONDecodeError:
            return conflict("Payload must be valid JSON")

        post_payload = CreatePostRequest.model_validate(payload_data)
        tag_names = post_payload.recipe.tags if post_payload.recipe and post_payload.recipe.tags else []
        tags = await _resolve_tags(tag_names)

        recipe_data = _build_recipe_data(post_payload.recipe.model_dump() if post_payload.recipe else None)

        if len(photos) > MAX_PHOTO_COUNT:
            return conflict(f"You can upload up to {MAX_PHOTO_COUNT} photos")

        saved_photos = []
        for upload in photos:
            if (upload.content_type or "") not in ALLOWED_MIME_TYPES:
                return conflict("Only JPEG, PNG, WEBP, or GIF images are allowed")
            saved_photos.append(await save_photo_file(upload))

        created = await prisma.post.create(
            data={
                "familySpaceId": user.familySpaceId,
                "authorId": user.id,
                "title": post_payload.title,
                "caption": post_payload.caption,
                "hasRecipeDetails": bool(recipe_data),
                "recipeDetails": {"create": recipe_data} if recipe_data else None,
                "mainPhotoUrl": saved_photos[0]["url"] if saved_photos else None,
                "photos": {
                    "create": [
                        {"url": photo["url"], "sortOrder": idx} for idx, photo in enumerate(saved_photos)
                    ]
                }
                if saved_photos
                else None,
                "tags": {
                    "create": [{"tag": {"connect": {"id": tag["id"]}}} for tag in tags]
                }
                if tags
                else None,
            },
            include={
                "photos": True,
                "recipeDetails": True,
                "tags": {"include": {"tag": True}},
            },
        )
        return {"post": created}
    except ValueError as exc:
        if str(exc) == "INVALID_TAG":
            return conflict("One or more tags are not available")
        return internal_error("Failed to create post")
    except PrismaError:
        return internal_error("Failed to create post")
    except Exception:
        return internal_error("Failed to create post")


async def _load_post_detail(
    post_id: str,
    user: UserResponse,
    comment_limit: int,
    comment_offset: int,
    cooked_limit: int,
    cooked_offset: int,
) -> Optional[Dict[str, Any]]:
    post = await prisma.post.find_first(
        where={"id": post_id, "familySpaceId": user.familySpaceId},
        include={
            "author": True,
            "editor": True,
            "photos": True,
            "recipeDetails": True,
            "tags": {"include": {"tag": True}},
        },
    )
    if not post:
        return None

    # Sort photos by sortOrder manually since we can't use orderBy in include
    photos_sorted = sorted(post.photos, key=lambda p: p.sortOrder or 0) if post.photos else []

    comments_records = await prisma.comment.find_many(
        where={"postId": post_id, "post": {"familySpaceId": user.familySpaceId}},
        order={"createdAt": "desc"},
        take=comment_limit + 1,
        skip=comment_offset,
        include={"author": True},
    )
    cooked_records = await prisma.cookedevent.find_many(
        where={"postId": post_id, "post": {"familySpaceId": user.familySpaceId}},
        order={"createdAt": "desc"},
        take=cooked_limit + 1,
        skip=cooked_offset,
        include={"user": True},
    )

    # Calculate cooked stats manually (Prisma Python doesn't have aggregate or select)
    all_cooked_for_stats = await prisma.cookedevent.find_many(
        where={"postId": post_id},
    )
    times_cooked = len(all_cooked_for_stats)
    ratings = [c.rating for c in all_cooked_for_stats if c.rating is not None]
    average_rating = sum(ratings) / len(ratings) if ratings else None
    cooked_summary = {"timesCooked": times_cooked, "averageRating": average_rating}

    is_favorited = bool(
        await prisma.favorite.find_unique(where={"userId_postId": {"userId": user.id, "postId": post_id}})
    )

    post_reactions = await prisma.reaction.find_many(
        where={"targetType": "post", "targetId": post_id},
        order={"createdAt": "asc"},
        include={"user": True},
    )
    reaction_summary_map: Dict[str, Dict[str, Any]] = {}
    for r in post_reactions:
        entry = reaction_summary_map.get(r.emoji) or {"emoji": r.emoji, "count": 0, "users": []}
        entry["count"] += 1
        entry["users"].append(
            {"id": r.user.id, "name": r.user.name, "avatarUrl": r.user.avatarUrl}
        )
        reaction_summary_map[r.emoji] = entry

    has_more_comments = len(comments_records) > comment_limit
    comments_records = comments_records[:comment_limit]
    comment_ids = [c.id for c in comments_records]
    comment_reactions = []
    if comment_ids:
        comment_reactions = await prisma.reaction.find_many(
            where={"targetType": "comment", "targetId": {"in": comment_ids}},
            order={"createdAt": "asc"},
            include={"user": True},
        )
    comment_reaction_map: Dict[str, List[Dict[str, Any]]] = {}
    for r in comment_reactions:
        lst = comment_reaction_map.get(r.targetId) or []
        found = next((x for x in lst if x["emoji"] == r.emoji), None)
        if not found:
            found = {"emoji": r.emoji, "count": 0, "users": []}
            lst.append(found)
            comment_reaction_map[r.targetId] = lst
        found["count"] += 1
        found["users"].append(
            {"id": r.user.id, "name": r.user.name, "avatarUrl": r.user.avatarUrl}
        )

    comments = []
    for c in reversed(comments_records):
        comments.append(
            {
                "id": c.id,
                "text": c.text,
                "photoUrl": c.photoUrl,
                "createdAt": iso(c.createdAt),
                "author": {"id": c.author.id, "name": c.author.name, "avatarUrl": c.author.avatarUrl} if c.author else None,
                "reactions": comment_reaction_map.get(c.id, []),
            }
        )

    has_more_cooked = len(cooked_records) > cooked_limit
    cooked_records = cooked_records[:cooked_limit]
    cooked = [
        {
            "id": e.id,
            "rating": e.rating,
            "note": e.note,
            "createdAt": iso(e.createdAt),
            "user": {"id": e.user.id, "name": e.user.name, "avatarUrl": e.user.avatarUrl} if e.user else None,
        }
        for e in cooked_records
    ]

    courses_out = _parse_courses_from_recipe_details(post.recipeDetails) if hasattr(post, "recipeDetails") else []

    return {
        "post": {
            "id": post.id,
            "title": post.title,
            "caption": post.caption,
            "createdAt": iso(post.createdAt),
            "updatedAt": iso(post.updatedAt),
            "mainPhotoUrl": post.mainPhotoUrl,
            "isFavorited": is_favorited,
            "author": {"id": post.author.id, "name": post.author.name, "avatarUrl": post.author.avatarUrl} if post.author else None,
            "editor": {"id": post.editor.id, "name": post.editor.name} if post.editor else None,
            "lastEditNote": post.lastEditNote,
            "lastEditAt": iso(post.lastEditAt),
            "photos": [{"id": p.id, "url": p.url} for p in photos_sorted],
            "recipe": post.recipeDetails
            and {
                "origin": post.recipeDetails.origin,
                "ingredients": json.loads(post.recipeDetails.ingredients) if post.recipeDetails.ingredients else [],
                "steps": json.loads(post.recipeDetails.steps) if post.recipeDetails.steps else [],
                "totalTime": post.recipeDetails.totalTime,
                "servings": post.recipeDetails.servings,
                "courses": courses_out,
                "primaryCourse": courses_out[0] if courses_out else post.recipeDetails.course,
                "difficulty": post.recipeDetails.difficulty,
            },
            "tags": [t.tag.name for t in post.tags],
            "reactionSummary": list(reaction_summary_map.values()),
            "cookedStats": cooked_summary,
            "comments": comments,
            "commentsPage": {"hasMore": has_more_comments, "nextOffset": comment_offset + len(comments)},
            "recentCooked": cooked,
            "recentCookedPage": {"hasMore": has_more_cooked, "nextOffset": cooked_offset + len(cooked)},
        },
        "canEdit": can_edit_post(user, post.authorId),
    }


@router.get("/{post_id}")
async def get_post(
    post_id: str = Path(..., min_length=1),
    commentLimit: int = 20,
    commentOffset: int = 0,
    cookedLimit: int = 5,
    cookedOffset: int = 0,
    user: UserResponse = Depends(get_current_user),
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")

        comment_limit = _clamp_limit(commentLimit, 20, 50)
        cooked_limit = _clamp_limit(cookedLimit, 5, 50)

        result = await _load_post_detail(
            post_id, user, comment_limit, commentOffset, cooked_limit, cookedOffset
        )
        if not result:
            return not_found("Post not found")
        return result
    except PrismaError:
        return internal_error("Failed to load post")


@router.put("/{post_id}")
async def update_post(
    payload: str = Form(...),
    photos: List[UploadFile] = File(default_factory=list),
    post_id: str = Path(..., min_length=1),
    user: UserResponse = Depends(get_current_user),
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")
        post = await prisma.post.find_first(
            where={"id": post_id, "familySpaceId": user.familySpaceId},
            include={"recipeDetails": True, "tags": {"include": {"tag": True}}, "photos": {"orderBy": {"sortOrder": "asc"}}},
        )
        if not post:
            return not_found("Post not found")

        if not can_edit_post(user, post.authorId):
            return forbidden("You do not have permission to edit this post")

        try:
            payload_data = json.loads(payload)
        except json.JSONDecodeError:
            return conflict("Payload must be valid JSON")

        update_payload = UpdatePostRequest.model_validate(payload_data)
        photo_order: List[Dict[str, Any]] = payload_data.get("photoOrder") or []

        tag_names = update_payload.recipe.tags if update_payload.recipe and update_payload.recipe.tags else []
        tags = await _resolve_tags(tag_names)
        recipe_data = _build_recipe_data(update_payload.recipe.model_dump() if update_payload.recipe else None)

        if len(photo_order) > MAX_PHOTO_COUNT:
            return conflict(f"You can include up to {MAX_PHOTO_COUNT} photos")

        saved_photos = [await save_photo_file(upload) for upload in photos]

        existing_map = {p.id: p for p in post.photos}
        used_existing: Set[str] = set()
        resolved_photos: List[Tuple[str, str]] = []  # (url, source: existing_id or "new-idx")

        for entry in photo_order:
            if not isinstance(entry, dict) or "type" not in entry:
                continue
            if entry["type"] == "existing":
                existing_id = entry.get("id")
                if (
                    isinstance(existing_id, str)
                    and existing_id in existing_map
                    and existing_id not in used_existing
                ):
                    used_existing.add(existing_id)
                    resolved_photos.append((existing_map[existing_id].url, existing_id))
            elif entry["type"] == "new":
                file_index_raw = entry.get("fileIndex")
                if not isinstance(file_index_raw, (str, int)):
                    continue
                try:
                    file_index = int(file_index_raw)
                except Exception:
                    continue
                if 0 <= file_index < len(saved_photos):
                    resolved_photos.append((saved_photos[file_index]["url"], f"new-{file_index}"))

        # Append any remaining existing photos not referenced until limit
        for p in post.photos:
            if p.id not in used_existing and len(resolved_photos) < MAX_PHOTO_COUNT:
                resolved_photos.append((p.url, p.id))

        # Append any remaining new uploads not referenced until limit
        for idx, photo in enumerate(saved_photos):
            key = f"new-{idx}"
            if all(src != key for _, src in resolved_photos) and len(resolved_photos) < MAX_PHOTO_COUNT:
                resolved_photos.append((photo["url"], key))

        if len(resolved_photos) > MAX_PHOTO_COUNT:
            return conflict(f"You can include up to {MAX_PHOTO_COUNT} photos")

        keep_existing_ids = {src for _, src in resolved_photos if not src.startswith("new-")}
        removed_urls = [p.url for p in post.photos if p.id not in keep_existing_ids]
        change_note = None
        if update_payload.changeNote:
            change_note = update_payload.changeNote.strip() or None

        recipe_details_data: Optional[Dict[str, Any]] = None
        if recipe_data:
            recipe_details_data = {"upsert": {"create": recipe_data, "update": recipe_data}}
        elif post.recipeDetails:
            recipe_details_data = {"delete": True}

        update_data: Dict[str, Any] = {
            "title": update_payload.title if update_payload.title is not None else post.title,
            "caption": update_payload.caption if update_payload.caption is not None else post.caption,
            "hasRecipeDetails": bool(recipe_data),
            "recipeDetails": recipe_details_data,
            "tags": {
                "deleteMany": {},
                "create": [{"tag": {"connect": {"id": tag["id"]}}} for tag in tags],
            }
            if tags is not None
            else None,
            "mainPhotoUrl": resolved_photos[0][0] if resolved_photos else None,
            "lastEditNote": change_note,
            "lastEditedBy": user.id,
            "lastEditAt": datetime.now(timezone.utc),
            "photos": {"deleteMany": {"id": {"notIn": list(keep_existing_ids) if keep_existing_ids else [""]}}},
        }

        async with prisma.tx() as tx:
            await tx.post.update(
                where={"id": post_id},
                data=update_data,
                include={
                    "photos": {"orderBy": {"sortOrder": "asc"}},
                    "recipeDetails": True,
                    "tags": {"include": {"tag": True}},
                },
            )

            # Recreate order for existing kept photos
            sort_order = 0
            for url, src in resolved_photos:
                if not src.startswith("new-"):
                    await tx.postphoto.update(where={"id": src}, data={"sortOrder": sort_order})
                    sort_order += 1
            # Create new photos
            for url, src in resolved_photos:
                if src.startswith("new-"):
                    await tx.postphoto.create(
                        data={"postId": post_id, "url": url, "sortOrder": sort_order}
                    )
                    sort_order += 1

            _ = await tx.post.find_unique(
                where={"id": post_id},
                include={
                    "photos": {"orderBy": {"sortOrder": "asc"}},
                    "recipeDetails": True,
                    "tags": {"include": {"tag": True}},
                },
            )

        await delete_uploads(removed_urls)
        refreshed = await _load_post_detail(post_id, user, 20, 0, 5, 0)
        return refreshed or not_found("Post not found")
    except ValueError as exc:
        if str(exc) == "INVALID_TAG":
            return conflict("One or more tags are not available")
        return internal_error("Failed to update post")
    except PrismaError:
        return internal_error("Failed to update post")
    except Exception:
        return internal_error("Failed to update post")


@router.delete("/{post_id}", status_code=status.HTTP_200_OK)
async def delete_post(
    post_id: str = Path(..., min_length=1), user: UserResponse = Depends(get_current_user)
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")
        post = await prisma.post.find_first(
            where={"id": post_id, "familySpaceId": user.familySpaceId},
            include={"photos": True, "comments": True},
        )
        if not post:
            return not_found("Post not found")
        if not can_edit_post(user, post.authorId):
            return forbidden("You do not have permission to delete this post")

        await prisma.post.delete(where={"id": post_id})
        await delete_uploads([p.url for p in post.photos] + [c.photoUrl for c in post.comments])
        return {"message": "Post deleted"}
    except PrismaError:
        return internal_error("Failed to delete post")
    except Exception:
        return internal_error("Failed to delete post")


@router.post("/{post_id}/favorite", response_model=FavoriteResponse)
async def favorite_post(
    post_id: str = Path(..., min_length=1), user: UserResponse = Depends(get_current_user)
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")
        post = await prisma.post.find_unique(where={"id": post_id, "familySpaceId": user.familySpaceId})
        if not post:
            return not_found("Post not found")
        await prisma.favorite.create(
            data={
                "userId": user.id,
                "postId": post_id,
            }
        )
        return FavoriteResponse(favorited=True)
    except PrismaError:
        # Assume conflict means already favorited; treat as idempotent
        return FavoriteResponse(favorited=True)


@router.delete("/{post_id}/favorite", response_model=FavoriteResponse)
async def unfavorite_post(
    post_id: str = Path(..., min_length=1), user: UserResponse = Depends(get_current_user)
):
    try:
        await prisma.favorite.delete_many(
            where={
                "userId": user.id,
                "postId": post_id,
            }
        )
        return FavoriteResponse(favorited=False)
    except PrismaError:
        return internal_error("Failed to unfavorite")


@router.post("/{post_id}/cooked")
async def log_cooked(
    payload: CookedRequest,
    post_id: str = Path(..., min_length=1),
    user: UserResponse = Depends(get_current_user),
):
    try:
        if not is_cuid(post_id):
            return not_found("Post not found")
        post = await prisma.post.find_unique(where={"id": post_id, "familySpaceId": user.familySpaceId})
        if not post:
            return not_found("Post not found")
        await prisma.cookedevent.create(
            data={
                "postId": post_id,
                "userId": user.id,
                "rating": payload.rating,
                "note": payload.note,
            }
        )
        # Calculate cooked stats manually (Prisma Python doesn't have aggregate)
        all_cooked = await prisma.cookedevent.find_many(
            where={"postId": post_id},
        )
        times_cooked = len(all_cooked)
        ratings = [c.rating for c in all_cooked if c.rating is not None]
        average_rating = sum(ratings) / len(ratings) if ratings else None

        cooked_page = await prisma.cookedevent.find_many(
            where={"postId": post_id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=5 + 1,
            include={"user": True},
        )
        has_more = len(cooked_page) > 5
        cooked_page = cooked_page[:5]
        recent_cooked = [
            {
                "id": e.id,
                "rating": e.rating,
                "note": e.note,
                "createdAt": iso(e.createdAt),
                "user": {"id": e.user.id, "name": e.user.name, "avatarUrl": e.user.avatarUrl} if e.user else None,
            }
            for e in cooked_page
        ]
        return {
            "cookedStats": {"timesCooked": times_cooked, "averageRating": average_rating},
            "recentCooked": recent_cooked,
            "recentCookedPage": {"hasMore": has_more, "nextOffset": len(recent_cooked)},
        }
    except PrismaError:
        return internal_error("Failed to record cooked event")


@router.get("/{post_id}/cooked")
async def list_cooked(
    post_id: str = Path(..., min_length=1),
    limit: int = 20,
    offset: int = 0,
    user: UserResponse = Depends(get_current_user),
):
    try:
        limit_clamped = _clamp_limit(limit, 5, 50)
        events = await prisma.cookedevent.find_many(
            where={"postId": post_id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=limit_clamped + 1,
            skip=offset,
            include={"user": True},
        )
        has_more = len(events) > limit_clamped
        events = events[:limit_clamped]
        return {
            "cookedEvents": [
                {
                    "id": e.id,
                    "rating": e.rating,
                    "note": e.note,
                    "createdAt": iso(e.createdAt),
                    "user": e.user,
                }
                for e in events
            ],
            "hasMore": has_more,
            "nextOffset": offset + len(events),
        }
    except PrismaError:
        return internal_error("Failed to load cooked events")
