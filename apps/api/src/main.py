from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import connect_db, disconnect_db
from .routers import auth, comments, family, health, me, posts, profile, reactions, recipes, tags, timeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    try:
        yield
    finally:
        await disconnect_db()


app = FastAPI(title="Family Recipe API", lifespan=lifespan)


app.include_router(health.router)
app.include_router(auth.router)
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
