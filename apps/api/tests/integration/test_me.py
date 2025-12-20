"""Integration tests for the me router endpoints."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")

_NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _make_author(name: str = "Chef 1") -> SimpleNamespace:
    return SimpleNamespace(name=name)


def _make_post(idx: int = 1, **overrides) -> SimpleNamespace:
    data = {
        "id": overrides.get("id", f"post-{idx}"),
        "title": overrides.get("title", f"Favorite Dish {idx}"),
        "mainPhotoUrl": overrides.get("mainPhotoUrl", f"https://cdn.test/favorite-{idx}.jpg"),
        "author": overrides.get("author", _make_author()),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_favorite(idx: int = 1, **overrides) -> SimpleNamespace:
    post = overrides.get("post", _make_post(idx=idx))
    data = {
        "id": overrides.get("id", f"favorite-{idx}"),
        "createdAt": overrides.get("createdAt", _NOW),
        "post": post,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


# ---------------------------------------------------------------------------
# /me/favorites
# ---------------------------------------------------------------------------


def test_me_favorites_success(client, mock_prisma, member_auth):
    favorite = _make_favorite()
    mock_prisma.favorite.find_many = AsyncMock(return_value=[favorite])

    response = client.get("/me/favorites", headers=member_auth)

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "id": favorite.id,
                "createdAt": _NOW.isoformat(),
                "post": {
                    "id": favorite.post.id,
                    "title": favorite.post.title,
                    "mainPhotoUrl": favorite.post.mainPhotoUrl,
                    "authorName": favorite.post.author.name,
                },
            }
        ],
        "hasMore": False,
        "nextOffset": 1,
    }


def test_me_favorites_pagination(client, mock_prisma, member_auth):
    favorites = [_make_favorite(idx=i) for i in range(3)]
    mock_prisma.favorite.find_many = AsyncMock(return_value=favorites)

    response = client.get("/me/favorites?limit=2&offset=4", headers=member_auth)

    assert response.status_code == 200
    payload = response.json()
    assert payload["hasMore"] is True
    assert len(payload["items"]) == 2
    assert payload["nextOffset"] == 6
    call_kwargs = mock_prisma.favorite.find_many.await_args.kwargs
    assert call_kwargs["take"] == 3
    assert call_kwargs["skip"] == 4


def test_me_favorites_shape_handles_missing_author(client, mock_prisma, member_auth):
    favorite = _make_favorite(post=_make_post(author=None))
    mock_prisma.favorite.find_many = AsyncMock(return_value=[favorite])

    response = client.get("/me/favorites", headers=member_auth)

    assert response.status_code == 200
    post_summary = response.json()["items"][0]["post"]
    assert post_summary == {
        "id": favorite.post.id,
        "title": favorite.post.title,
        "mainPhotoUrl": favorite.post.mainPhotoUrl,
        "authorName": None,
    }


def test_me_favorites_requires_auth(client):
    response = client.get("/me/favorites")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /me/profile
# ---------------------------------------------------------------------------


def test_update_profile_success(client, mock_prisma, member_auth):
    updated_user = SimpleNamespace(id="user_test_123", name="New Name", emailOrUsername="new@example.com", avatarUrl="https://cdn.test/avatar.jpg")
    mock_prisma.user.update = AsyncMock(return_value=updated_user)

    response = client.put(
        "/me/profile",
        headers=member_auth,
        json={"name": "  New Name  ", "emailOrUsername": "  new@example.com  "},
    )

    assert response.status_code == 200
    assert response.json()["user"] == {
        "id": updated_user.id,
        "name": updated_user.name,
        "emailOrUsername": updated_user.emailOrUsername,
        "avatarUrl": updated_user.avatarUrl,
    }
    call_kwargs = mock_prisma.user.update.await_args.kwargs
    assert call_kwargs["data"] == {"name": "New Name", "emailOrUsername": "new@example.com"}


def test_update_profile_missing_name_400(client, member_auth):
    response = client.put("/me/profile", headers=member_auth, json={"emailOrUsername": "test@example.com"})

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Name is required"


def test_update_profile_missing_email_400(client, member_auth):
    response = client.put("/me/profile", headers=member_auth, json={"name": "Test"})

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Email or username is required"


def test_update_profile_returns_updated_user_shape(client, mock_prisma, member_auth):
    updated_user = SimpleNamespace(id="user_test_123", name="Tester", emailOrUsername="tester", avatarUrl=None)
    mock_prisma.user.update = AsyncMock(return_value=updated_user)

    response = client.put(
        "/me/profile",
        headers=member_auth,
        json={"name": "Tester", "emailOrUsername": "tester"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "id": updated_user.id,
            "name": "Tester",
            "emailOrUsername": "tester",
            "avatarUrl": None,
        }
    }


def test_update_profile_requires_auth(client):
    response = client.put("/me/profile", json={"name": "Test", "emailOrUsername": "test"})

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /me/password
# ---------------------------------------------------------------------------


def test_change_password_success(client, mock_prisma, member_auth, prisma_user_with_membership, monkeypatch):
    record = SimpleNamespace(id="user_test_123", passwordHash="stored")

    async def fake_find_unique(*_, **kwargs):
        if kwargs.get("include"):
            return prisma_user_with_membership
        return record

    mock_prisma.user.find_unique = AsyncMock(side_effect=fake_find_unique)
    mock_prisma.user.update = AsyncMock(return_value=record)

    captured = {}

    def fake_verify(password: str, hashed: str) -> bool:
        captured["verified"] = (password, hashed)
        return True

    def fake_hash(password: str) -> str:
        captured["hashed"] = f"hashed:{password}"
        return captured["hashed"]

    monkeypatch.setattr("src.routers.me.verify_password", fake_verify)
    monkeypatch.setattr("src.routers.me.hash_password", fake_hash)

    response = client.put(
        "/me/password",
        headers=member_auth,
        json={"currentPassword": "oldpass", "newPassword": "newpassword"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Password updated"}
    assert captured["verified"] == ("oldpass", "stored")
    updated_data = mock_prisma.user.update.await_args.kwargs["data"]
    assert updated_data["passwordHash"] == "hashed:newpassword"


def test_change_password_wrong_current_400(client, mock_prisma, member_auth, prisma_user_with_membership, monkeypatch):
    record = SimpleNamespace(id="user_test_123", passwordHash="stored")

    async def fake_find_unique(*_, **kwargs):
        if kwargs.get("include"):
            return prisma_user_with_membership
        return record

    mock_prisma.user.find_unique = AsyncMock(side_effect=fake_find_unique)
    mock_prisma.user.update = AsyncMock()

    def fake_verify(password: str, hashed: str) -> bool:
        return False

    monkeypatch.setattr("src.routers.me.verify_password", fake_verify)

    response = client.put(
        "/me/password",
        headers=member_auth,
        json={"currentPassword": "oldpass", "newPassword": "newpassword"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Current password is incorrect"
    assert mock_prisma.user.update.await_count == 0


def test_change_password_too_short_400(client, member_auth):
    response = client.put(
        "/me/password",
        headers=member_auth,
        json={"currentPassword": "oldpass", "newPassword": "short"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "New password must be at least 8 characters"


def test_change_password_missing_current_400(client, member_auth):
    response = client.put(
        "/me/password",
        headers=member_auth,
        json={"newPassword": "newpassword"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Current password is required"


def test_change_password_missing_new_400(client, member_auth):
    response = client.put(
        "/me/password",
        headers=member_auth,
        json={"currentPassword": "oldpass"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "New password must be at least 8 characters"


def test_change_password_requires_auth(client):
    response = client.put("/me/password", json={"currentPassword": "old", "newPassword": "newpassword"})

    assert response.status_code == 401
