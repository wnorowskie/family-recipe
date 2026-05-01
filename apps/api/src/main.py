from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .db import connect_db, disconnect_db
from .errors import ApiError, error_response
from .routers import auth, comments, family, health, me, posts, profile, reactions, recipes, tags, timeline
from .routers.v1 import auth as auth_v1
from .routers.v1 import notifications as notifications_v1
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


if settings.cors_origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Request-Id"],
    )


# Per the migration plan, every endpoint is reachable under `/v1`. Each
# resource router is included twice — once at its native prefix (the
# un-prefixed alias kept for the duration of the rollout) and once under `/v1`.
# The aliases sunset after the Phase 4 cutover (#38).
#
# `auth.router` is the legacy session-cookie auth path and is NOT dual-included
# — `/v1/auth/*` is owned by `auth_v1.router`, which implements the
# token+refresh flow and is a deliberate behavioural divergence from
# `auth.router`, not a path alias.
_DUAL_INCLUDED_ROUTERS = (
    health.router,
    posts.router,
    comments.comments_router,
    comments.delete_router,
    reactions.router,
    timeline.router,
    recipes.router,
    profile.router,
    family.router,
    tags.router,
    me.router,
)

for _router in _DUAL_INCLUDED_ROUTERS:
    app.include_router(_router)
    app.include_router(_router, prefix="/v1")

app.include_router(auth.router)
app.include_router(auth_v1.router)
# `/v1/notifications/*` is owned exclusively by the v1 namespace — Bearer
# auth, no cookie-auth twin. The Phase 2 frontend only hits these endpoints
# when `USE_FASTAPI_AUTH` is on (and is therefore already sending access
# tokens); a dual-mounted unprefixed cookie-auth alias would have no caller.
app.include_router(notifications_v1.router)
