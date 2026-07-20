"""/v1/recipes/* — recipe browse/search + the importer proxy.

This module hosts two router objects under the same `/v1/recipes` namespace:

- `browse_router` — `GET /v1/recipes` browse/search, cookie-capable
  `get_current_user`. Moved here from the legacy `routers/recipes.py` in
  #233 (Phase 4.5), when the un-prefixed aliases were removed and every
  resource router was collapsed under `routers/v1/`.
- `router` — `POST /v1/recipes/import`, bearer-only `get_current_user_v1`
  (issue #185). Details below.

They share a resource namespace but keep **separate** router objects so each
owns exactly one auth dependency — no single router mixes auth modes.

## /v1/recipes/import — proxy to the standalone recipe-url-importer (issue #185)

Sub-task of #37 (Phase 3-B). Mirrors the Next handler at
`src/app/api/recipes/import/route.ts` — the cookie-auth-keyed version
that the production frontend hits today. The contract here is
deliberately identical (NOT the `(TBD) 201 { recipe }` shape sketched in
the migration plan); see PR for the discussion.

## Contract — matches the Next handler 1:1

- `POST /v1/recipes/import`
- Request: `{ "url": <string> }`
- Success: **200** with the full importer response body — `request_id`,
  `recipe`, `confidence`, `warnings`, `missing_fields`. No DB write
  happens here; the frontend uses the result to prefill `AddPostForm`,
  which then calls `POST /v1/posts` separately for the family-scoped
  persistence step.
- Errors (standard envelope):
  - 400 VALIDATION_ERROR — bad/missing url
  - 401 UNAUTHORIZED — no/invalid bearer
  - 503 SERVICE_UNAVAILABLE — importer not configured (env var missing)
  - 504 GATEWAY_TIMEOUT — importer call exceeded the per-request budget
  - Upstream 4xx/5xx is re-raised as IMPORT_FAILED with the upstream
    status, using the canonical `{code, message}` envelope. The Next
    handler additionally returns the upstream payload under a third
    `payload` field; we deliberately drop that here because the v1
    envelope is a closed `{code, message}` set per the migration plan
    (and the importer's `warnings` / `missing_fields` are reachable
    again on retry — they're not write-state we'd lose by re-querying).
  - A 2xx response from the importer with a non-object body is mapped
    to **502 BAD_GATEWAY** at the client layer (see
    `recipe_importer.py`) — preserving the upstream 2xx status here
    would route through as `IMPORT_FAILED 200`, an incoherent pairing
    of a 200 HTTP code with an error envelope body.

## No rate-limiting (yet)

The Next handler is unrate-limited, and the migration plan's rate-limit
section does not mention `/recipes/import`. The importer service has
its own per-IP/per-domain backstop (apps/recipe-url-importer/SPEC.md
§2.5). When the abuse surface widens (multi-family, public sharing) a
limiter belongs here; for V1 single-family it's overhead without a real
threat model.
"""
from __future__ import annotations

import json
import logging
from typing import List, Optional, cast

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from prisma.errors import PrismaError
from prisma.models import CookedEvent
from pydantic import BaseModel, HttpUrl

from ...db import prisma
from ...dependencies import get_current_user
from ...dependencies_v1 import get_current_user_v1
from ...errors import error_response, internal_error, validation_error
from ...recipe_importer import (
    ImporterConfigError,
    ImporterRequestError,
    ImporterTimeoutError,
    import_recipe_from_url,
)
from ...schemas.auth import UserResponse
from ...uploads import create_signed_url_resolver

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/recipes", tags=["recipes-import"])


class ImportRecipeRequest(BaseModel):
    """Mirrors `importRequestSchema` in src/app/api/recipes/import/route.ts.

    `HttpUrl` rejects empty strings and non-http(s) schemes; bad input
    surfaces as 400 VALIDATION_ERROR via the global RequestValidationError
    handler in main.py. Anything else (length caps, SSRF, etc.) is the
    importer service's responsibility — pushing those checks here would
    duplicate the importer's own URL-validation module.
    """

    url: HttpUrl


@router.post("/import")
async def import_recipe(
    payload: ImportRecipeRequest,
    user: UserResponse = Depends(get_current_user_v1),
) -> JSONResponse:
    """Proxy a URL to the importer and return its full RecipeDraft response.

    `user` is required only as an auth gate — the importer call carries
    no per-user state and no DB write happens here. The family-scoped
    persistence step lives downstream in `POST /v1/posts`, which the
    frontend invokes after the user reviews / edits the prefilled form.
    """
    try:
        # `HttpUrl` rendered as `str()` produces the canonical IRI form
        # (lowercased scheme/host, default port stripped). The importer
        # SPEC accepts any normalised http(s) URL.
        body = await import_recipe_from_url(str(payload.url))
        # Match the Next handler's 200 status (NOT the 201 the migration
        # plan's `(TBD)` row sketched). The Next contract is the cutover
        # invariant; the plan row will be updated in the same PR.
        return JSONResponse(content=body, status_code=200)
    except ImporterConfigError:
        # 503 over 500 so ops sees "service unavailable" in dashboards
        # and the SPA can show a "feature temporarily disabled" CTA
        # rather than a hard "something went wrong".
        logger.error("recipes.import.unconfigured user=%s", user.id)
        return error_response(
            "SERVICE_UNAVAILABLE",
            "Recipe import is not available",
            503,
        )
    except ImporterTimeoutError as exc:
        # 504 GATEWAY_TIMEOUT explicitly distinguishes "upstream slow"
        # from "upstream errored" so the SPA can offer a retry button
        # without an error toast (timeouts are usually transient).
        logger.warning(
            "recipes.import.timeout user=%s url=%s msg=%s",
            user.id, payload.url, exc,
        )
        return error_response(
            "GATEWAY_TIMEOUT",
            "Recipe import timed out",
            504,
        )
    except ImporterRequestError as exc:
        # Re-emit the importer's status verbatim. The body retains the
        # upstream payload (warnings/missing_fields/error code) so the
        # SPA can build a precise UX without a second importer call.
        logger.info(
            "recipes.import.upstream_error user=%s status=%s url=%s",
            user.id, exc.status, payload.url,
        )
        if exc.status == 400:
            # The importer's 400 INVALID_URL / BLOCKED_HOST belong to
            # the user (bad input). Re-emit as VALIDATION_ERROR so the
            # frontend's standard 400-handling path applies.
            return validation_error(str(exc))
        return error_response("IMPORT_FAILED", str(exc), exc.status)


# ---------------------------------------------------------------------------
# Recipe browse/search — GET /v1/recipes. Moved from routers/recipes.py in
# #233 (Phase 4.5). Cookie-capable `get_current_user` (the SPA sends a Bearer
# token; the legacy session cookie still resolves via the fallback in
# dependencies.py). Its own router object so the browse endpoint's auth stays
# separate from the bearer-only importer above.
# ---------------------------------------------------------------------------

browse_router = APIRouter(prefix="/v1/recipes", tags=["recipes"])

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
            parsed = json.loads(courses_raw)
            if isinstance(parsed, list):
                return [c for c in parsed if isinstance(c, str) and c in COURSE_VALUES]
        if isinstance(courses_raw, list):
            return [c for c in courses_raw if isinstance(c, str) and c in COURSE_VALUES]
    except (json.JSONDecodeError, TypeError):
        return []
    return []


@browse_router.get("")
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
        # Same resolver caches avatar + post-photo keys for this request.
        resolve_photo = resolve_avatar
        items = []
        for post in posts:
            courses = _parse_courses_from_recipe_details(post.recipeDetails)
            item = {
                "id": post.id,
                "title": post.title,
                "mainPhotoUrl": await resolve_photo(post.mainPhotoStorageKey),
                "author": {
                    "id": post.author.id,
                    "name": post.author.name,
                    "avatarUrl": await resolve_avatar(post.author.avatarStorageKey),
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
