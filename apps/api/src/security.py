import bcrypt
from fastapi import Response

from .settings import settings


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def clear_session_cookie(response: Response) -> None:
    """Delete the legacy `session` cookie, if a caller's browser still has one.

    Nothing sets this cookie any more (#311 removed the last reader too, in
    `dependencies.py`) — this is pure defense-in-depth cleanup on sensitive
    account changes, in case a pre-cutover browser session is still carrying
    the cookie around.
    """
    response.delete_cookie(
        settings.cookie_name,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )
