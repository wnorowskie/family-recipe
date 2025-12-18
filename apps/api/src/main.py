from fastapi import FastAPI

from .db import connect_db, disconnect_db
from .routers import auth, comments, family, health, me, posts, profile, reactions, recipes, tags, timeline

app = FastAPI(title="Family Recipe API")


@app.on_event("startup")
async def on_startup() -> None:
    await connect_db()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await disconnect_db()


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
