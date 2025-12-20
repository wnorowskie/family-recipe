from datetime import datetime, timedelta, timezone
from typing import Optional, TypedDict

import bcrypt
from fastapi import Response
import jwt

from .settings import settings

JWT_ISSUER = "family-recipe-app"
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_IN_DAYS = 7
JWT_EXPIRES_IN_EXTENDED_DAYS = 30

COOKIE_MAX_AGE_DEFAULT = 7 * 24 * 60 * 60
COOKIE_MAX_AGE_EXTENDED = 30 * 24 * 60 * 60


class JWTPayload(TypedDict):
    userId: str
    familySpaceId: str
    role: str


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def sign_token(payload: JWTPayload, remember_me: bool = False) -> str:
    expires_in_days = JWT_EXPIRES_IN_EXTENDED_DAYS if remember_me else JWT_EXPIRES_IN_DAYS
    expiration = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
    to_encode = {**payload, "exp": expiration, "iss": JWT_ISSUER}
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[JWTPayload]:
    try:
        decoded = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
        )

        user_id = decoded.get("userId")
        family_space_id = decoded.get("familySpaceId")
        role = decoded.get("role")

        if isinstance(user_id, str) and isinstance(family_space_id, str) and isinstance(role, str):
            return {
                "userId": user_id,
                "familySpaceId": family_space_id,
                "role": role,
            }
        return None
    except jwt.InvalidTokenError:
        return None


def set_session_cookie(response: Response, token: str, remember_me: bool = False) -> None:
    max_age = COOKIE_MAX_AGE_EXTENDED if remember_me else COOKIE_MAX_AGE_DEFAULT
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.cookie_name,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )
