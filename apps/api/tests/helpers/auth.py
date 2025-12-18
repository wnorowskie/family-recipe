"""Auth helpers for integration tests."""

from datetime import datetime, timedelta, timezone
from typing import Dict

from src.security import sign_token
from src.settings import settings


def make_auth_cookie(user_id: str, family_space_id: str, role: str, remember_me: bool = False) -> Dict[str, str]:
    """Create cookie header dict with a signed JWT token."""
    payload = {
        "userId": user_id,
        "familySpaceId": family_space_id,
        "role": role,
    }
    token = sign_token(payload, remember_me)
    return {"Cookie": f"{settings.cookie_name}={token}"}
