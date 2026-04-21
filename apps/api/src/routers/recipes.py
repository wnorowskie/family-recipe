from typing import List, Optional, cast

from fastapi import APIRouter, Depends, Query
from prisma.errors import PrismaError
from prisma.models import CookedEvent

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import internal_error
from ..schemas.auth import UserResponse
from ..uploads import create_signed_url_resolver

router = APIRouter(prefix="/recipes", tags=["recipes"])

COURSE_VALUES = {"breakfast", "lunch", "dinner", "dessert", "snack", "other"}
DIFFICULTY_VALUES = {"easy", "medium", "hard"}
MAX_INGREDIENTS = 5
# Mirror of RATING_SORT_CANDIDATE_LIMIT in src/lib/recipes.ts. Keep values
# identical so the Node and Python services paginate the same candidate set.
RATING_SORT_CANDIDATE_LIMIT = 500


def _dedupe(values: Optional[List[str]]) -> List[str]:
    if not values:
        return []
    return list(dict.fromkeys([v for v in values if v]))


def _parse_courses(courses: Optional[List[str]]) -> List[str]:
    if not courses:
        return []
    return [c for c in _dedupe(courses) if c in COURSE_VALUES]


def _parse_difficulties(diff: Optional[List[str]]) -> List[str]:
    if not diff:
        return []
    return [d for d in _dedupe(diff) if d in DIFFICULTY_VALUES]


def _parse_courses_from_recipe_details(recipe_details: Optional[object]) -> List[str]:
    if not recipe_details or not hasattr(recipe_details, "courses"):
        return []
    try:
        courses_raw = recipe_details.courses  # type: ignore[attr-defined]
        if isinstance(courses_raw, str):
            import json as _json

            parsed = _json.loads(courses_raw)
            if isinstance(parsed, list):
                return [c for c in parsed if isinstance(c, str) and c in COURSE_VALUES]
        if isinstance(courses_raw, list):
            return [c for c in courses_raw if isinstance(c, str) and c in COURSE_VALUES]
    except Exception:
        return []
    return []


@router.get("")
async def browse_recipes(
    q: Optional[str] = Query(default=None, max_length=200),
    course: Optional[List[str]] = Query(default=None),
    tags: Optional[List[str]] = Query(default=None),
    difficulty: Optional[List[str]] = Query(default=None),
    authorId: Optional[List[str]] = Query(default=None, alias="authorId"),
    totalTimeMin: Optional[int] = Query(default=None, ge=0),
    totalTimeMax: Optional[int] = Query(default=None, ge=0),
    servingsMin: Optional[int] = Query(default=None, ge=1),
    servingsMax: Optional[int] = Query(default=None, ge=1),
    ingredients: Optional[List[str]] = Query(default=None),
    sort: str = Query(default="recent", pattern="^(recent|alpha|rating)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserResponse = Depends(get_current_user),
):
    try:
        where: dict = {"familySpaceId": user.familySpaceId, "hasRecipeDetails": True}
        and_filters: List[dict] = []

        if q:
            search_value = q.strip()
            if search_value:
                and_filters.append({"title": {"contains": search_value, "mode": "insensitive"}})

        authors = _dedupe(authorId)
        if authors:
            and_filters.append({"authorId": {"in": authors}})

        parsed_courses = _parse_courses(course)
        if parsed_courses:
            course_filters = []
            for c in parsed_courses:
                course_filters.append(
                    {
                        "recipeDetails": {
                            "is": {
                                "OR": [
                                    {"course": c},
                                    {"courses": {"contains": c, "mode": "insensitive"}},
                                ]
                            }
                        }
                    }
                )
            and_filters.append({"OR": course_filters})

        tag_filters = _dedupe(tags)
        if tag_filters:
            for tag in tag_filters:
                and_filters.append({"tags": {"some": {"tag": {"name": tag}}}})

        parsed_difficulty = _parse_difficulties(difficulty)
        if parsed_difficulty:
            and_filters.append(
                {
                    "recipeDetails": {
                        "is": {"difficulty": {"in": parsed_difficulty}},
                    }
                }
            )

        if totalTimeMin is not None or totalTimeMax is not None:
            time_filter: dict = {}
            if totalTimeMin is not None:
                time_filter["gte"] = totalTimeMin
            if totalTimeMax is not None:
                time_filter["lte"] = totalTimeMax
            and_filters.append({"recipeDetails": {"is": {"totalTime": time_filter}}})

        if servingsMin is not None or servingsMax is not None:
            servings_filter: dict = {}
            if servingsMin is not None:
                servings_filter["gte"] = servingsMin
            if servingsMax is not None:
                servings_filter["lte"] = servingsMax
            and_filters.append({"recipeDetails": {"is": {"servings": servings_filter}}})

        ingredient_filters = _dedupe(ingredients)[:MAX_INGREDIENTS]
        if ingredient_filters:
            for keyword in ingredient_filters:
                and_filters.append(
                    {"recipeDetails": {"is": {"ingredients": {"contains": keyword}}}}
                )

        if and_filters:
            where["AND"] = and_filters

        order_by = [{"createdAt": "desc"}]
        if sort == "alpha":
            order_by = [{"title": "asc"}, {"createdAt": "desc"}]

        include_shape = {
            "author": True,
            "recipeDetails": True,
            "tags": {"include": {"tag": True}},
        }

        if sort == "rating":
            # Rating sort joins against a CookedEvent aggregate that Prisma
            # cannot express in a single order clause. Fetch bounded matches,
            # compute stats, sort in memory, then paginate. The cap matches
            # the Node service so both paginate the same candidate set.
            all_posts = await prisma.post.find_many(
                where=where,
                order=[{"createdAt": "desc"}],
                take=RATING_SORT_CANDIDATE_LIMIT,
                include=include_shape,
            )
            ids = [item.id for item in all_posts]
            posts = []  # Populated below after stats + sort.
            has_more = False
        else:
            all_posts = None
            posts = await prisma.post.find_many(
                where=where,
                order=order_by,
                take=limit + 1,
                skip=offset,
                include=include_shape,
            )
            has_more = len(posts) > limit
            posts = posts[:limit]
            ids = [item.id for item in posts]

        # Manually calculate grouped stats (Prisma Python doesn't have group_by with aggregates)
        cooked_map: dict = {}
        if ids:
            all_cooked_raw = await prisma.cookedevent.find_many(
                where={"postId": {"in": ids}},
            )
            all_cooked: List[CookedEvent] = cast(List[CookedEvent], all_cooked_raw)
            from collections import defaultdict
            grouped: dict[str, List[Optional[int]]] = defaultdict(list)
            for c in all_cooked:
                post_id = getattr(c, "postId", None)
                rating: Optional[int] = getattr(c, "rating", None)
                if not isinstance(post_id, str):
                    continue
                grouped[post_id].append(rating if isinstance(rating, int) else None)
            for post_id, ratings in grouped.items():
                valid_ratings = [r for r in ratings if r is not None]
                cooked_map[post_id] = {
                    "timesCooked": len(ratings),
                    "averageRating": sum(valid_ratings) / len(valid_ratings) if valid_ratings else None,
                }

        if sort == "rating" and all_posts is not None:
            def _sort_key(post):
                stats = cooked_map.get(post.id, {"timesCooked": 0, "averageRating": None})
                avg = stats["averageRating"]
                # Tuple places unrated (avg is None) last, then ranks by avg desc,
                # timesCooked desc, createdAt desc. Negate numeric values to flip
                # the default ascending sort to descending.
                is_unrated = avg is None
                avg_key = 0.0 if avg is None else -avg
                cooked_key = -stats["timesCooked"]
                created_key = -post.createdAt.timestamp()
                return (is_unrated, avg_key, cooked_key, created_key)

            sorted_posts = sorted(all_posts, key=_sort_key)
            has_more = len(sorted_posts) > offset + limit
            posts = sorted_posts[offset : offset + limit]

        resolve_avatar = create_signed_url_resolver()
        items = []
        for post in posts:
            courses = _parse_courses_from_recipe_details(post.recipeDetails)
            item = {
                "id": post.id,
                "title": post.title,
                "mainPhotoUrl": post.mainPhotoUrl,
                "author": {
                    "id": post.author.id,
                    "name": post.author.name,
                    "avatarUrl": await resolve_avatar(getattr(post.author, "avatarStorageKey", None)),
                },
                "courses": courses,
                "primaryCourse": courses[0] if courses else post.recipeDetails.course if getattr(post.recipeDetails, "course", None) else None,
                "difficulty": post.recipeDetails.difficulty if post.recipeDetails else None,
                "tags": [t.tag.name for t in post.tags],
                "totalTime": post.recipeDetails.totalTime if post.recipeDetails else None,
                "servings": post.recipeDetails.servings if post.recipeDetails else None,
                "cookedStats": cooked_map.get(post.id, {"timesCooked": 0, "averageRating": None}),
            }
            items.append(item)

        return {
            "items": items,
            "hasMore": has_more,
            "nextOffset": offset + len(items),
        }
    except PrismaError:
        return internal_error("Failed to load recipes")
