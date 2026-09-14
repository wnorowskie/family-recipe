"""Integration tests for GET/PATCH /v1/me/theme — issue #155.

The handlers in `src/routers/v1/me.py#get_theme`/`update_theme` read/write
the `theme` column ('grayscale' | 'warm', default 'grayscale') via the
same bearer-only `get_current_user_v1` auth as the rest of `me_router`.

Tests verify:
  - GET returns the current user's theme with no DB hit beyond auth
  - PATCH success updates via `prisma.user.update` and returns the new value
  - PATCH sets the non-sensitive `theme` cookie on success
  - PATCH with an invalid value -> 400 VALIDATION_ERROR
  - GET/PATCH with no auth header -> 401
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from tests.helpers.error_envelope import assert_error_envelope
from tests.helpers.test_data import make_mock_user

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")


def test_get_theme_returns_current_value(client, member_auth):
    response = client.get("/v1/me/theme", headers=member_auth)

    assert response.status_code == 200, response.json()
    assert response.json() == {"theme": "grayscale"}


def test_get_theme_reflects_warm_preference(client, mock_prisma, mock_user, mock_membership):
    mock_user.theme = "warm"
    mock_user.memberships = [mock_membership]
    mock_prisma.user.find_unique = AsyncMock(return_value=mock_user)
    from src import tokens

    token = tokens.mint_access_token(
        user_id=mock_user.id, family_space_id=mock_membership.familySpaceId, role="member"
    )

    response = client.get("/v1/me/theme", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200, response.json()
    assert response.json() == {"theme": "warm"}


def test_get_theme_requires_auth(client):
    response = client.get("/v1/me/theme")

    assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")


def test_patch_theme_success(client, mock_prisma, member_auth, mock_user):
    mock_prisma.user.update = AsyncMock(return_value=make_mock_user(theme="warm"))

    response = client.patch("/v1/me/theme", json={"theme": "warm"}, headers=member_auth)

    assert response.status_code == 200, response.json()
    assert response.json() == {"theme": "warm"}
    written = mock_prisma.user.update.await_args.kwargs
    assert written["where"] == {"id": mock_user.id}
    assert written["data"] == {"theme": "warm"}


def test_patch_theme_sets_theme_cookie(client, mock_prisma, member_auth):
    mock_prisma.user.update = AsyncMock(return_value=make_mock_user(theme="warm"))

    response = client.patch("/v1/me/theme", json={"theme": "warm"}, headers=member_auth)

    assert response.status_code == 200, response.json()
    set_cookie_headers = response.headers.get_list("set-cookie")
    theme_cookies = [h for h in set_cookie_headers if h.startswith("theme=")]
    assert theme_cookies, f"expected a `theme` Set-Cookie header, got: {set_cookie_headers}"
    assert "warm" in theme_cookies[0]


def test_patch_theme_rejects_invalid_value(client, mock_prisma, member_auth):
    response = client.patch("/v1/me/theme", json={"theme": "sepia"}, headers=member_auth)

    assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")
    assert mock_prisma.user.update.await_count == 0


def test_patch_theme_rejects_missing_field(client, mock_prisma, member_auth):
    response = client.patch("/v1/me/theme", json={}, headers=member_auth)

    assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")


def test_patch_theme_requires_auth(client):
    response = client.patch("/v1/me/theme", json={"theme": "warm"})

    assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")
