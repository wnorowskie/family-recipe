"""Integration tests for the profile router endpoints."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")

_NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _make_post(idx: int = 1, **overrides) -> SimpleNamespace:
    data = {
        "id": overrides.get("id", f"post-{idx}"),
        "title": overrides.get("title", f"Family Dish {idx}"),
        "mainPhotoUrl": overrides.get("mainPhotoUrl", f"https://cdn.test/post-{idx}.jpg"),
        "createdAt": overrides.get("createdAt", _NOW),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_cooked_event(idx: int = 1, **overrides) -> SimpleNamespace:
    post = overrides.get("post", _make_post(idx))
    data = {
        "id": overrides.get("id", f"cooked-{idx}"),
        "postId": overrides.get("postId", post.id),
        "createdAt": overrides.get("createdAt", _NOW),
        "rating": overrides.get("rating", 5),
        "note": overrides.get("note", f"note-{idx}"),
        "post": post,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_favorite(idx: int = 1, **overrides) -> SimpleNamespace:
    author = overrides.get("author", SimpleNamespace(name=f"Chef {idx}"))
    post = overrides.get(
        "post",
        SimpleNamespace(
            id=f"post-{idx}",
            title=f"Favorite {idx}",
            mainPhotoUrl=f"https://cdn.test/favorite-{idx}.jpg",
            author=author,
        ),
    )
    data = {
        "id": overrides.get("id", f"favorite-{idx}"),
        "createdAt": overrides.get("createdAt", _NOW),
        "post": post,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


# ---------------------------------------------------------------------------
# /profile/posts
# ---------------------------------------------------------------------------


def test_my_posts_success(client, mock_prisma, member_auth):
    post = _make_post()
    mock_prisma.post.find_many = AsyncMock(return_value=[post])
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])

    response = client.get("/profile/posts", headers=member_auth)

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "items": [
            {
                "id": post.id,
                "title": post.title,
                "mainPhotoUrl": post.mainPhotoUrl,
                "createdAt": _NOW.isoformat(),
                "cookedStats": {"timesCooked": 0, "averageRating": None},
            }
        ],
        "hasMore": False,
        "nextOffset": 1,
    }


def test_my_posts_pagination(client, mock_prisma, member_auth):
    posts = [_make_post(idx=i) for i in range(3)]
    mock_prisma.post.find_many = AsyncMock(return_value=posts)
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])

    response = client.get("/profile/posts?limit=2&offset=5", headers=member_auth)

    assert response.status_code == 200
    payload = response.json()
    assert payload["hasMore"] is True
    assert len(payload["items"]) == 2
    assert payload["nextOffset"] == 7
    call_kwargs = mock_prisma.post.find_many.await_args.kwargs
    assert call_kwargs["take"] == 3  # limit + 1 fetch
    assert call_kwargs["skip"] == 5


def test_my_posts_includes_cooked_stats(client, mock_prisma, member_auth):
    post = _make_post(id="post-cooked")
    cooked_events = [
        SimpleNamespace(postId="post-cooked", rating=5),
        SimpleNamespace(postId="post-cooked", rating=3),
        SimpleNamespace(postId="post-cooked", rating=None),
    ]
    mock_prisma.post.find_many = AsyncMock(return_value=[post])
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=cooked_events)

    response = client.get("/profile/posts", headers=member_auth)

    assert response.status_code == 200
    stats = response.json()["items"][0]["cookedStats"]
    assert stats == {"timesCooked": 3, "averageRating": 4}


def test_my_posts_only_own_posts(client, mock_prisma, member_auth, prisma_user_with_membership):
    mock_prisma.post.find_many = AsyncMock(return_value=[])
    response = client.get("/profile/posts", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.post.find_many.await_args.kwargs["where"]
    expected_family_id = prisma_user_with_membership.memberships[0].familySpaceId
    assert where == {"authorId": prisma_user_with_membership.id, "familySpaceId": expected_family_id}


def test_my_posts_requires_auth(client):
    response = client.get("/profile/posts")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /profile/cooked
# ---------------------------------------------------------------------------


def test_my_cooked_success(client, mock_prisma, member_auth):
    event = _make_cooked_event()
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=[event])

    response = client.get("/profile/cooked", headers=member_auth)

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "items": [
            {
                "id": event.id,
                "createdAt": _NOW.isoformat(),
                "rating": event.rating,
                "note": event.note,
                "post": {
                    "id": event.post.id,
                    "title": event.post.title,
                    "mainPhotoUrl": event.post.mainPhotoUrl,
                },
            }
        ],
        "hasMore": False,
        "nextOffset": 1,
    }


def test_my_cooked_pagination(client, mock_prisma, member_auth):
    events = [_make_cooked_event(idx=i) for i in range(2)]
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=events)

    response = client.get("/profile/cooked?limit=1&offset=10", headers=member_auth)

    assert response.status_code == 200
    data = response.json()
    assert data["hasMore"] is True
    assert len(data["items"]) == 1
    assert data["nextOffset"] == 11
    call_kwargs = mock_prisma.cookedevent.find_many.await_args.kwargs
    assert call_kwargs["take"] == 2
    assert call_kwargs["skip"] == 10


def test_my_cooked_includes_post(client, mock_prisma, member_auth):
    event = _make_cooked_event(post=_make_post(title="Winter Stew"))
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=[event])

    response = client.get("/profile/cooked", headers=member_auth)

    assert response.status_code == 200
    post_summary = response.json()["items"][0]["post"]
    assert post_summary == {
        "id": event.post.id,
        "title": "Winter Stew",
        "mainPhotoUrl": event.post.mainPhotoUrl,
    }


def test_my_cooked_only_own_events(client, mock_prisma, member_auth, prisma_user_with_membership):
    mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])

    response = client.get("/profile/cooked", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.cookedevent.find_many.await_args.kwargs["where"]
    expected_family_id = prisma_user_with_membership.memberships[0].familySpaceId
    assert where == {"userId": prisma_user_with_membership.id, "post": {"familySpaceId": expected_family_id}}


def test_my_cooked_requires_auth(client):
    response = client.get("/profile/cooked")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /profile/favorites
# ---------------------------------------------------------------------------


def test_my_favorites_success(client, mock_prisma, member_auth):
    favorite = _make_favorite()
    mock_prisma.favorite.find_many = AsyncMock(return_value=[favorite])

    response = client.get("/profile/favorites", headers=member_auth)

    assert response.status_code == 200
    body = response.json()
    assert body == {
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


def test_my_favorites_pagination(client, mock_prisma, member_auth):
    favorites = [_make_favorite(idx=i) for i in range(3)]
    mock_prisma.favorite.find_many = AsyncMock(return_value=favorites)

    response = client.get("/profile/favorites?limit=2&offset=3", headers=member_auth)

    assert response.status_code == 200
    data = response.json()
    assert data["hasMore"] is True
    assert len(data["items"]) == 2
    assert data["nextOffset"] == 5
    call_kwargs = mock_prisma.favorite.find_many.await_args.kwargs
    assert call_kwargs["take"] == 3
    assert call_kwargs["skip"] == 3


def test_my_favorites_includes_post(client, mock_prisma, member_auth):
    favorite = _make_favorite(
        post=SimpleNamespace(
            id="post-55",
            title="Holiday Roast",
            mainPhotoUrl="https://cdn.test/holiday.jpg",
            author=SimpleNamespace(name="Grandma"),
        )
    )
    mock_prisma.favorite.find_many = AsyncMock(return_value=[favorite])

    response = client.get("/profile/favorites", headers=member_auth)

    assert response.status_code == 200
    post_summary = response.json()["items"][0]["post"]
    assert post_summary == {
        "id": "post-55",
        "title": "Holiday Roast",
        "mainPhotoUrl": "https://cdn.test/holiday.jpg",
        "authorName": "Grandma",
    }


def test_my_favorites_only_own(client, mock_prisma, member_auth, prisma_user_with_membership):
    mock_prisma.favorite.find_many = AsyncMock(return_value=[])

    response = client.get("/profile/favorites", headers=member_auth)

    assert response.status_code == 200
    where = mock_prisma.favorite.find_many.await_args.kwargs["where"]
    expected_family_id = prisma_user_with_membership.memberships[0].familySpaceId
    assert where == {"userId": prisma_user_with_membership.id, "post": {"familySpaceId": expected_family_id}}


def test_my_favorites_requires_auth(client):
    response = client.get("/profile/favorites")

    assert response.status_code == 401
