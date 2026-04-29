from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .db import connect_db, disconnect_db
from .errors import ApiError, error_response
from .routers import auth, comments, family, health, me, posts, profile, reactions, recipes, tags, timeline
from .routers.v1 import auth as auth_v1
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


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(auth_v1.router)
app.include_router(posts.router)
app.include_router(comments.comments_router)
app.include_router(comments.delete_router)
app.include_router(reactions.router)
app.include_router(timeline.router)
app.include_router(recipes.router)
app.include_router(profile.router)
app.include_router(family.router)
app.include_router(tags.router)
app.include_router(me.router)
