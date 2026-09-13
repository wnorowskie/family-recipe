"""Guards the #311 fix: a legacy `session` cookie must never authenticate.

`dependencies.py` used to fall back to a `session`-cookie JWT when no
`Authorization: Bearer` header was present; #311 deleted that module and
moved every route it served onto the Bearer-only `get_current_user_v1`.
These tests hit one representative endpoint per formerly-affected router
(the nine listed in the issue) with only a `session` cookie — forged with
a real, correctly-issued JWT (right `iss`, and a userId/familySpaceId that
resolve via `prisma_user_with_membership`) so a regression that merely
re-adds cookie *parsing* would still be caught, not just one that skips a
bad-signature or missing-user check — and no `Authorization` header, and
assert every one now 401s instead of resolving the caller from the cookie.
"""
from __future__ import annotations

import jwt as pyjwt
import pytest

from src import tokens
from src.settings import settings
from tests.helpers.error_envelope import assert_error_envelope

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")


@pytest.fixture
def session_cookie_headers(mock_user, mock_family_space):
    token = pyjwt.encode(
        {
            "userId": mock_user.id,
            "familySpaceId": mock_family_space.id,
            "role": "member",
            "iss": tokens.JWT_ISSUER,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    return {"Cookie": f"{settings.cookie_name}={token}"}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/v1/tags"),
        ("GET", "/v1/timeline"),
        ("GET", "/v1/family/members"),
        ("GET", "/v1/profile/favorites"),
        ("GET", "/v1/posts/cpost0000000000000001/comments"),
        ("GET", "/v1/recipes"),
        ("GET", "/v1/posts/cpost0000000000000001"),
        ("GET", "/v1/me/favorites"),
    ],
)
def test_session_cookie_alone_is_401(client, session_cookie_headers, method, path):
    response = client.request(method, path, headers=session_cookie_headers)
    assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")


def test_session_cookie_alone_is_401_on_reactions(client, session_cookie_headers):
    response = client.post(
        "/v1/reactions",
        headers=session_cookie_headers,
        json={"targetType": "post", "targetId": "cpost0000000000000001", "emoji": "🔥"},
    )
    assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")
