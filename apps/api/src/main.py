from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .db import connect_db, disconnect_db
from .errors import ApiError, error_response, validation_error
from .routers.v1 import (
    comments,
    family,
    health,
    posts,
    profile,
    reactions,
    tags,
    timeline,
)
from .routers.v1 import auth as auth_v1
from .routers.v1 import feedback as feedback_v1
from .routers.v1 import me as me_v1
from .routers.v1 import notifications as notifications_v1
from .routers.v1 import recipes as recipes_v1
from .settings import settings, validate_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail-fast on misconfigured prod env BEFORE accepting traffic. A bad
    # config used to surface lazily on the first /v1/auth/login call (silent
    # 500s); now uvicorn exits non-zero before /health becomes reachable.
    validate_settings(settings)
    await connect_db()
    try:
        yield
    finally:
        await disconnect_db()


app = FastAPI(title="Family Recipe API", lifespan=lifespan)


@app.exception_handler(ApiError)
async def _api_error_handler(_request: Request, exc: ApiError):
    return error_response(exc.code, exc.message, exc.status_code)


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(_request: Request, _exc: RequestValidationError):
    # FastAPI's default 422 `{detail: [...]}` shape is not the documented
    # contract — the migration plan specifies 400 VALIDATION_ERROR for every
    # endpoint. Per-field detail is intentionally dropped: the envelope is
    # public surface, the field list is not.
    return validation_error("Invalid input")


if settings.cors_origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Request-Id"],
    )


# Every endpoint is served under `/v1` only. Each router hardcodes its full
# `/v1/...` prefix (matching `v1/auth.py`) and is included once with no prefix
# kwarg. The un-prefixed rollout aliases and the legacy session-cookie
# `auth.router` were removed in #233 (Phase 4.5), after the cutover (#38).
#
# The two merged modules each expose two routers under one `/v1` namespace,
# split by auth mode: `recipes_v1` = `browse_router` (GET /v1/recipes,
# cookie-capable) + `router` (POST /v1/recipes/import, bearer); `me_v1` =
# `me_router` (favorites/profile/password, cookie-capable) + `router`
# (DELETE /v1/me/delete, bearer). See their module docstrings.
_ROUTERS = (
    health.router,
    posts.router,
    comments.comments_router,
    comments.delete_router,
    reactions.router,
    timeline.router,
    recipes_v1.browse_router,
    recipes_v1.router,
    profile.router,
    family.router,
    tags.router,
    me_v1.me_router,
    me_v1.router,
    auth_v1.router,
    notifications_v1.router,
    feedback_v1.router,
)

for _router in _ROUTERS:
    app.include_router(_router)
