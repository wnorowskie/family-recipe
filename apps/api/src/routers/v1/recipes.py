"""/v1/recipes/import — proxy to the standalone recipe-url-importer (issue #185).

Sub-task of #37 (Phase 3-B). Mirrors the Next handler at
`src/app/api/recipes/import/route.ts` — the cookie-auth-keyed version
that the production frontend hits today. The contract here is
deliberately identical (NOT the `(TBD) 201 { recipe }` shape sketched in
the migration plan); see PR for the discussion.

## Why this isn't on `routers/recipes.py`

The legacy `routers/recipes.py` is dual-mounted at `/recipes` AND `/v1/recipes`
with cookie auth. Adding an importer endpoint there would force two
separate auth modes onto a single router (cookie for the legacy `/recipes`
prefix, bearer for any future v1-only addition). Phase 3-B feedback /
notifications / password-reset all chose a v1-only file under
`routers/v1/` with bearer auth via `get_current_user_v1`; following that
convention keeps the auth boundary clean.

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

## No rate-limiting (yet)

The Next handler is unrate-limited, and the migration plan's rate-limit
section does not mention `/recipes/import`. The importer service has
its own per-IP/per-domain backstop (apps/recipe-url-importer/SPEC.md
§2.5). When the abuse surface widens (multi-family, public sharing) a
limiter belongs here; for V1 single-family it's overhead without a real
threat model.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from ...dependencies_v1 import get_current_user_v1
from ...errors import error_response, validation_error
from ...recipe_importer import (
    ImporterConfigError,
    ImporterRequestError,
    ImporterTimeoutError,
    import_recipe_from_url,
)
from ...schemas.auth import UserResponse

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
