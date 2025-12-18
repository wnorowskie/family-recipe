from fastapi import APIRouter, Depends, Query
from prisma.errors import PrismaError
import logging

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import internal_error
from ..schemas.auth import UserResponse
from ..utils import iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/posts")
async def my_posts(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserResponse = Depends(get_current_user),
):
    try:
        posts = await prisma.post.find_many(
            where={"authorId": user.id, "familySpaceId": user.familySpaceId},
            order={"createdAt": "desc"},
            take=limit + 1,
            skip=offset,
        )
        has_more = len(posts) > limit
        slice_posts = posts[:limit]
        ids = [p.id for p in slice_posts]

        cooked_map = {}
        if ids:
            # Manually calculate grouped stats (Prisma Python doesn't have group_by with aggregates)
            all_cooked = await prisma.cookedevent.find_many(
                where={"postId": {"in": ids}},
            )
            # Group by postId manually
            from collections import defaultdict
            grouped: dict = defaultdict(list)
            for c in all_cooked:
                grouped[c.postId].append(c.rating)
            for post_id, ratings in grouped.items():
                valid_ratings = [r for r in ratings if r is not None]
                cooked_map[post_id] = {
                    "timesCooked": len(ratings),
                    "averageRating": sum(valid_ratings) / len(valid_ratings) if valid_ratings else None,
                }

        items = [
            {
                "id": p.id,
                "title": p.title,
                "mainPhotoUrl": p.mainPhotoUrl,
                "createdAt": iso(p.createdAt),
                "cookedStats": cooked_map.get(p.id, {"timesCooked": 0, "averageRating": None}),
            }
            for p in slice_posts
        ]

        return {"items": items, "hasMore": has_more, "nextOffset": offset + len(items)}
    except PrismaError:
        return internal_error("Failed to load posts")


@router.get("/cooked")
async def my_cooked(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserResponse = Depends(get_current_user),
):
    try:
        events = await prisma.cookedevent.find_many(
            where={"userId": user.id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=limit + 1,
            skip=offset,
            include={"post": True},
        )
        has_more = len(events) > limit
        events = events[:limit]
        cooked_items = [
            {
                "id": e.id,
                "createdAt": iso(e.createdAt),
                "rating": e.rating,
                "note": e.note,
                "post": {"id": e.post.id, "title": e.post.title, "mainPhotoUrl": e.post.mainPhotoUrl},
            }
            for e in events
        ]
        return {"items": cooked_items, "hasMore": has_more, "nextOffset": offset + len(cooked_items)}
    except PrismaError as e:
        logger.exception("profile.cooked.prisma_error: %s", e)
        return internal_error("Failed to load cooked events")
    except Exception as e:
        logger.exception("profile.cooked.error: %s", e)
        return internal_error("Failed to load cooked events")


@router.get("/favorites")
async def my_favorites(
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserResponse = Depends(get_current_user),
):
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
        favorite_items = [
            {
                "id": f.id,
                "createdAt": iso(f.createdAt),
                "post": {
                    "id": f.post.id,
                    "title": f.post.title,
                    "mainPhotoUrl": f.post.mainPhotoUrl,
                    "authorName": f.post.author.name if f.post.author else None,
                },
            }
            for f in favorites
        ]
        return {"items": favorite_items, "hasMore": has_more, "nextOffset": offset + len(favorite_items)}
    except PrismaError as e:
        logger.exception("profile.favorites.prisma_error: %s", e)
        return internal_error("Failed to load favorites")
    except Exception as e:
        logger.exception("profile.favorites.error: %s", e)
        return internal_error("Failed to load favorites")
