"""Integration tests for posts router create endpoints."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from typing import Optional

from prisma.errors import PrismaError

import pytest

from src.uploads import MAX_PHOTO_COUNT

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")
POST_ID = "ckpost1234567890123456789"


def _make_recipe_payload():
    return {
        "origin": "Italy",
        "ingredients": [{"name": "Tomato", "quantity": 2, "unit": "pcs"}],
        "steps": [{"text": "Chop"}, {"text": "Cook"}],
        "totalTime": 30,
        "servings": 4,
        "courses": ["dinner"],
        "difficulty": "easy",
        "tags": [],
    }


class TestCreatePost:
    def test_create_text_post(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(
            return_value={"id": "post-1", "title": "Hello", "caption": "Hi", "photos": [], "recipeDetails": None, "tags": []}
        )

        payload = {"title": "Hello", "caption": "Hi"}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["post"]["title"] == "Hello"
        assert body["post"]["photos"] == []

    def test_create_recipe_post(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(
            return_value={
                "id": "post-2",
                "title": "Pasta",
                "caption": "Yum",
                "photos": [],
                "recipeDetails": {
                    "origin": "Italy",
                    "ingredients": json.dumps([{"name": "Tomato", "unit": "pcs", "quantity": 2}]),
                    "steps": json.dumps([{"text": "Chop"}]),
                    "totalTime": 30,
                    "servings": 4,
                    "courses": json.dumps(["dinner"]),
                    "course": "dinner",
                    "difficulty": "easy",
                },
                "tags": [],
            }
        )

        payload = {"title": "Pasta", "caption": "Yum", "recipe": _make_recipe_payload()}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        body = response.json()["post"]
        assert body["recipeDetails"] is not None
        assert json.loads(body["recipeDetails"]["courses"])[0] == "dinner"

    def test_create_post_with_photos(self, client, mock_prisma, member_auth, monkeypatch):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(
            return_value={
                "id": "post-3",
                "title": "Photo Post",
                "caption": None,
                "photos": [
                    {"id": "ph1", "url": "https://cdn.test/p1.jpg", "sortOrder": 0},
                    {"id": "ph2", "url": "https://cdn.test/p2.jpg", "sortOrder": 1},
                ],
                "mainPhotoUrl": "https://cdn.test/p1.jpg",
                "recipeDetails": None,
                "tags": [],
            }
        )
        monkeypatch.setattr("src.routers.posts.save_photo_file", AsyncMock(side_effect=[{"url": "https://cdn.test/p1.jpg"}, {"url": "https://cdn.test/p2.jpg"}]))

        payload = {"title": "Photo Post"}
        files = [
            ("photos", ("p1.jpg", b"data1", "image/jpeg")),
            ("photos", ("p2.jpg", b"data2", "image/jpeg")),
        ]
        response = client.post("/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth)

        assert response.status_code == 201, response.json()
        body = response.json()["post"]
        assert body["mainPhotoUrl"] == "https://cdn.test/p1.jpg"
        assert len(body["photos"]) == 2

    def test_create_post_with_tags(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(
            return_value=[SimpleNamespace(id="t1", name="spicy"), SimpleNamespace(id="t2", name="quick")]
        )
        mock_prisma.post.create = AsyncMock(
            return_value={
                "id": "post-4",
                "title": "Tagged",
                "caption": None,
                "photos": [],
                "recipeDetails": None,
                "tags": [
                    {"tag": {"id": "t1", "name": "spicy"}},
                    {"tag": {"id": "t2", "name": "quick"}},
                ],
            }
        )

        payload = {"title": "Tagged", "recipe": {"tags": ["spicy", "quick"]}}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        tag_names = [t["tag"]["name"] for t in response.json()["post"]["tags"]]
        assert tag_names == ["spicy", "quick"]

    def test_create_post_invalid_tag_409(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])

        payload = {"title": "Bad Tags", "recipe": {"tags": ["missing"]}}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 409, response.json()
        assert response.json()["error"]["code"] == "CONFLICT"

    def test_create_post_max_photos_exceeded_409(self, client, member_auth):
        files = [("photos", (f"p{i}.jpg", b"data", "image/jpeg")) for i in range(MAX_PHOTO_COUNT + 1)]
        payload = {"title": "Too many"}

        response = client.post("/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth)

        assert response.status_code == 409
        assert "upload up to" in response.json()["error"]["message"].lower()

    def test_create_post_invalid_mime_type_409(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        payload = {"title": "Bad mime"}
        files = [("photos", ("bad.txt", b"data", "text/plain"))]

        response = client.post("/posts", data={"payload": json.dumps(payload)}, files=files, headers=member_auth)

        assert response.status_code == 409
        assert "only jpeg" in response.json()["error"]["message"].lower()

    def test_create_post_requires_auth(self, client):
        payload = {"title": "No auth"}

        response = client.post("/posts", data={"payload": json.dumps(payload)})

        assert response.status_code == 401

    def test_create_post_returns_post_shape(self, client, mock_prisma, member_auth):
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.post.create = AsyncMock(
            return_value={
                "id": "post-5",
                "title": "Shape",
                "caption": None,
                "photos": [],
                "recipeDetails": None,
                "tags": [],
            }
        )

        payload = {"title": "Shape"}
        response = client.post("/posts", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 201, response.json()
        post = response.json()["post"]
        for key in ["id", "title", "photos", "recipeDetails", "tags"]:
            assert key in post


class TestGetPostDetail:
    def _base_post(self, author_id="user_test_123"):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=POST_ID,
            title="Post",
            caption="Cap",
            createdAt=now,
            updatedAt=now,
            mainPhotoUrl=None,
            authorId=author_id,
            author=SimpleNamespace(id=author_id, name="Alice", avatarUrl=None),
            editor=None,
            lastEditNote=None,
            lastEditAt=None,
            photos=[],
            recipeDetails=None,
            tags=[],
        )

    def test_get_post_success(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["post"]["id"] == POST_ID
        assert body["canEdit"] is True

    def test_get_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=None)

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 404

    def test_get_post_invalid_cuid_404(self, client, member_auth):
        response = client.get("/posts/not-cuid", headers=member_auth)

        assert response.status_code == 404

    def test_get_post_includes_comments(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(
                    id="c1",
                    text="Nice",
                    photoUrl=None,
                    createdAt=now,
                    author=SimpleNamespace(id="u1", name="Bob", avatarUrl=None),
                ),
                SimpleNamespace(
                    id="c2",
                    text="Great",
                    photoUrl=None,
                    createdAt=now,
                    author=SimpleNamespace(id="u2", name="Ann", avatarUrl=None),
                ),
            ]
        )
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        comments = response.json()["post"]["comments"]
        assert len(comments) == 2
        assert {c["text"] for c in comments} == {"Nice", "Great"}

    def test_get_post_includes_reaction_summary(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(emoji="❤️", user=SimpleNamespace(id="u1", name="Bob", avatarUrl=None), targetType="post", targetId="post-1"),
                SimpleNamespace(emoji="❤️", user=SimpleNamespace(id="u2", name="Sue", avatarUrl=None), targetType="post", targetId="post-1"),
                SimpleNamespace(emoji="👍", user=SimpleNamespace(id="u3", name="Eve", avatarUrl=None), targetType="post", targetId="post-1"),
            ]
        )

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        summary = response.json()["post"]["reactionSummary"]
        counts = {item["emoji"]: item["count"] for item in summary}
        assert counts["❤️"] == 2
        assert counts["👍"] == 1

    def test_get_post_includes_is_favorited(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=SimpleNamespace(id="fav1"))
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        assert response.json()["post"]["isFavorited"] is True

    def test_get_post_includes_cooked_stats(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="k1", rating=5, note=None, createdAt=now, user=SimpleNamespace(id="u1", name="Bob", avatarUrl=None)),
                    SimpleNamespace(id="k2", rating=3, note=None, createdAt=now, user=SimpleNamespace(id="u2", name="Ann", avatarUrl=None)),
                ],
                [SimpleNamespace(id="k1", rating=5, note=None, createdAt=now), SimpleNamespace(id="k2", rating=3, note=None, createdAt=now)],
            ]
        )
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        stats = response.json()["post"]["cookedStats"]
        assert stats["timesCooked"] == 2
        assert stats["averageRating"] == 4

    def test_get_post_comments_pagination(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(id="c1", text="A", photoUrl=None, createdAt=now, author=None),
                SimpleNamespace(id="c2", text="B", photoUrl=None, createdAt=now, author=None),
            ]
        )
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}?commentLimit=1", headers=member_auth)

        assert response.status_code == 200
        page = response.json()["post"]["commentsPage"]
        assert page["hasMore"] is True
        assert page["nextOffset"] == 1

    def test_get_post_cooked_pagination(self, client, mock_prisma, member_auth):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post())
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="k1", rating=None, note=None, createdAt=now, user=None),
                    SimpleNamespace(id="k2", rating=None, note=None, createdAt=now, user=None),
                ],
                [SimpleNamespace(id="k1", rating=None, note=None, createdAt=now)],
            ]
        )
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}?cookedLimit=1", headers=member_auth)

        assert response.status_code == 200
        page = response.json()["post"]["recentCookedPage"]
        assert page["hasMore"] is True
        assert page["nextOffset"] == 1

    def test_get_post_includes_can_edit_false_for_other_author(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=self._base_post(author_id="other"))
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.favorite.find_unique = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200
        assert response.json()["canEdit"] is False

    def test_get_post_requires_auth(self, client):
        response = client.get("/posts/post-1")

        assert response.status_code == 401


class TestUpdatePost:
    def _post(
        self,
        *,
        author_id: str = "user_test_123",
        photos=None,
        recipe_details=None,
        tags=None,
        main_photo_url: Optional[str] = None,
        last_edit_note: Optional[str] = None,
        last_edit_at=None,
        title: str = "Post",
        caption: Optional[str] = "Cap",
    ):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=POST_ID,
            title=title,
            caption=caption,
            createdAt=now,
            updatedAt=now,
            mainPhotoUrl=main_photo_url,
            authorId=author_id,
            author=SimpleNamespace(id=author_id, name="Alice", avatarUrl=None),
            editor=None,
            lastEditNote=last_edit_note,
            lastEditAt=last_edit_at or now,
            photos=photos or [],
            recipeDetails=recipe_details,
            tags=tags or [],
        )

    def _photo(self, photo_id: str, sort_order: int = 0):
        return SimpleNamespace(id=photo_id, url=f"https://cdn.test/{photo_id}.jpg", sortOrder=sort_order)

    def _recipe_details(self):
        return SimpleNamespace(
            origin="Italy",
            ingredients=json.dumps([{"name": "Tomato", "unit": "pcs", "quantity": 2}]),
            steps=json.dumps([{"text": "Chop"}]),
            totalTime=30,
            servings=4,
            course="dinner",
            courses=json.dumps(["dinner"]),
            difficulty="easy",
        )

    def test_update_post_author_can_edit(self, client, mock_prisma, member_auth):
        initial = self._post()
        updated = self._post(title="Updated Title", caption="New", main_photo_url=None)
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Updated Title", "caption": "New"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["title"] == "Updated Title"

    def test_update_post_admin_can_edit(
        self, client, mock_prisma, admin_auth, mock_admin_user, mock_family_space
    ):
        mock_admin_user.memberships = [SimpleNamespace(role="admin", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_admin_user)

        initial = self._post(author_id="other")
        updated = self._post(author_id="other", title="Admin Edit")
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Admin Edit"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=admin_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["title"] == "Admin Edit"

    def test_update_post_owner_can_edit(
        self, client, mock_prisma, owner_auth, mock_owner_user, mock_family_space
    ):
        mock_owner_user.memberships = [SimpleNamespace(role="owner", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_owner_user)

        initial = self._post(author_id="another")
        updated = self._post(author_id="another", title="Owner Edit")
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Owner Edit"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=owner_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["title"] == "Owner Edit"

    def test_update_post_member_cannot_edit_others_403(self, client, mock_prisma, member_auth):
        initial = self._post(author_id="someone_else")
        mock_prisma.post.find_first = AsyncMock(return_value=initial)

        payload = {"title": "Nope"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 403

    def test_update_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=None)

        payload = {"title": "Missing"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 404

    def test_update_post_add_photos(self, client, mock_prisma, member_auth, monkeypatch):
        initial = self._post(photos=[])
        updated_photos = [self._photo("ph_new_1", 0), self._photo("ph_new_2", 1)]
        updated = self._post(photos=updated_photos, main_photo_url=updated_photos[0].url)

        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        monkeypatch.setattr("src.routers.posts.save_photo_file", AsyncMock(side_effect=[{"url": updated_photos[0].url}, {"url": updated_photos[1].url}]))
        monkeypatch.setattr("src.routers.posts.delete_uploads", AsyncMock())

        payload = {
            "title": "Photos",
            "photoOrder": [
                {"type": "new", "fileIndex": 0},
                {"type": "new", "fileIndex": 1},
            ],
        }
        files = [
            ("photos", ("p1.jpg", b"data1", "image/jpeg")),
            ("photos", ("p2.jpg", b"data2", "image/jpeg")),
        ]

        response = client.put(
            f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, files=files, headers=member_auth
        )

        assert response.status_code == 200, response.json()
        body = response.json()["post"]
        assert len(body["photos"]) == 2
        assert body["mainPhotoUrl"] == updated_photos[0].url

    def test_update_post_remove_photos(self, client, mock_prisma, member_auth, monkeypatch):
        existing_photos = [self._photo("ph1", 0), self._photo("ph2", 1)]
        initial = self._post(photos=existing_photos, main_photo_url=existing_photos[0].url)
        kept = self._photo("ph2", 0)
        updated = self._post(photos=[kept], main_photo_url=kept.url)

        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        delete_mock = AsyncMock()
        monkeypatch.setattr("src.routers.posts.delete_uploads", delete_mock)
        # Force router to respect explicit photo order by lowering max count so unreferenced photos are removed
        monkeypatch.setattr("src.routers.posts.MAX_PHOTO_COUNT", 1)

        payload = {"title": "Keep one", "photoOrder": [{"type": "existing", "id": "ph2"}]}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        photos = response.json()["post"]["photos"]
        assert len(photos) == 1
        assert photos[0]["url"] == kept.url
        delete_mock.assert_awaited_with([existing_photos[0].url])

    def test_update_post_reorder_photos(self, client, mock_prisma, member_auth, monkeypatch):
        existing_photos = [self._photo("ph1", 0), self._photo("ph2", 1)]
        initial = self._post(photos=existing_photos, main_photo_url=existing_photos[0].url)
        reordered = [self._photo("ph2", 0), self._photo("ph1", 1)]
        updated = self._post(photos=reordered, main_photo_url=reordered[0].url)

        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        monkeypatch.setattr("src.routers.posts.delete_uploads", AsyncMock())

        payload = {
            "title": "Reorder",
            "photoOrder": [
                {"type": "existing", "id": "ph2"},
                {"type": "existing", "id": "ph1"},
            ],
        }
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        photos = response.json()["post"]["photos"]
        assert [p["id"] for p in photos] == ["ph2", "ph1"]
        assert response.json()["post"]["mainPhotoUrl"] == reordered[0].url

    def test_update_post_change_tags(self, client, mock_prisma, member_auth):
        initial = self._post(tags=[SimpleNamespace(tag=SimpleNamespace(id="old", name="old"))])
        updated = self._post(tags=[SimpleNamespace(tag=SimpleNamespace(id="new", name="spicy"))])
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.tag.find_many = AsyncMock(return_value=[SimpleNamespace(id="t1", name="spicy")])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Tags", "recipe": {"tags": ["spicy"]}}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["tags"] == ["spicy"]

    def test_update_post_add_recipe(self, client, mock_prisma, member_auth):
        initial = self._post(recipe_details=None)
        recipe_details = self._recipe_details()
        updated = self._post(recipe_details=recipe_details)
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Add recipe", "recipe": _make_recipe_payload()}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        recipe = response.json()["post"]["recipe"]
        assert recipe["origin"] == "Italy"
        assert recipe["ingredients"][0]["name"] == "Tomato"

    def test_update_post_remove_recipe(self, client, mock_prisma, member_auth):
        existing_recipe = self._recipe_details()
        initial = self._post(recipe_details=existing_recipe)
        updated = self._post(recipe_details=None)
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.tag.find_many = AsyncMock(return_value=[])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Remove recipe"}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["recipe"] is None

    def test_update_post_change_note_recorded(self, client, mock_prisma, member_auth):
        initial = self._post()
        updated = self._post(last_edit_note="Fixed typo", last_edit_at=datetime(2024, 1, 2, tzinfo=timezone.utc))
        mock_prisma.post.find_first = AsyncMock(side_effect=[initial, updated])
        mock_prisma.comment.find_many = AsyncMock(return_value=[])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=[])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        payload = {"title": "Note", "changeNote": "  Fixed typo  "}
        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["post"]["lastEditNote"] == "Fixed typo"

    def test_update_post_requires_auth(self, client):
        payload = {"title": "No auth"}

        response = client.put(f"/posts/{POST_ID}", data={"payload": json.dumps(payload)})

        assert response.status_code == 401


class TestDeletePost:
    def _post(self, *, author_id: str = "user_test_123", photos=None, comments=None):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=POST_ID,
            authorId=author_id,
            familySpaceId="family_test_123",
            photos=photos or [],
            comments=comments or [],
            createdAt=now,
        )

    def _photo(self, photo_id: str):
        return SimpleNamespace(id=photo_id, url=f"https://cdn.test/{photo_id}.jpg")

    def _comment(self, comment_id: str, photo_url: Optional[str] = None):
        return SimpleNamespace(id=comment_id, photoUrl=photo_url)

    def test_delete_post_author_can_delete(self, client, mock_prisma, member_auth, monkeypatch):
        photos = [self._photo("ph1"), self._photo("ph2")]
        comments = [self._comment("c1", photo_url="https://cdn.test/c1.jpg")]
        post = self._post(author_id="user_test_123", photos=photos, comments=comments)
        mock_prisma.post.find_first = AsyncMock(return_value=post)
        mock_prisma.post.delete = AsyncMock(return_value=None)
        delete_mock = AsyncMock()
        monkeypatch.setattr("src.routers.posts.delete_uploads", delete_mock)

        response = client.delete(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 200, response.json()
        delete_mock.assert_awaited_once()
        assert set(delete_mock.await_args.args[0]) == {
            "https://cdn.test/ph1.jpg",
            "https://cdn.test/ph2.jpg",
            "https://cdn.test/c1.jpg",
        }

    def test_delete_post_admin_can_delete(self, client, mock_prisma, admin_auth, mock_admin_user, mock_family_space, monkeypatch):
        mock_admin_user.memberships = [SimpleNamespace(role="admin", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_admin_user)

        post = self._post(author_id="someone_else")
        mock_prisma.post.find_first = AsyncMock(return_value=post)
        mock_prisma.post.delete = AsyncMock(return_value=None)
        monkeypatch.setattr("src.routers.posts.delete_uploads", AsyncMock())

        response = client.delete(f"/posts/{POST_ID}", headers=admin_auth)

        assert response.status_code == 200, response.json()

    def test_delete_post_member_cannot_delete_others_403(self, client, mock_prisma, member_auth):
        post = self._post(author_id="other")
        mock_prisma.post.find_first = AsyncMock(return_value=post)

        response = client.delete(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 403

    def test_delete_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_first = AsyncMock(return_value=None)

        response = client.delete(f"/posts/{POST_ID}", headers=member_auth)

        assert response.status_code == 404

    def test_delete_post_requires_auth(self, client):
        response = client.delete(f"/posts/{POST_ID}")

        assert response.status_code == 401


class TestFavoritePost:
    def test_favorite_post_success(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.favorite.create = AsyncMock(return_value=None)

        response = client.post(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is True

    def test_favorite_post_idempotent(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.favorite.create = AsyncMock(side_effect=PrismaError("already favorited"))

        response = client.post(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is True

    def test_favorite_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=None)

        response = client.post(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 404

    def test_favorite_post_requires_auth(self, client):
        response = client.post(f"/posts/{POST_ID}/favorite")

        assert response.status_code == 401

    def test_unfavorite_post_success(self, client, mock_prisma, member_auth):
        mock_prisma.favorite.delete_many = AsyncMock(return_value=None)

        response = client.delete(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is False


class TestCookedEvents:
    def _event(self, event_id: str, rating=None, note=None, user=None, created_at=None):
        return SimpleNamespace(
            id=event_id,
            rating=rating,
            note=note,
            createdAt=created_at or datetime(2024, 1, 1, tzinfo=timezone.utc),
            user=user,
        )

    def test_log_cooked_success(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1"), self._event("e2")],
                [self._event("e2")],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"rating": None, "note": None}, headers=member_auth)

        assert response.status_code == 200, response.json()
        stats = response.json()["cookedStats"]
        assert stats["timesCooked"] == 2
        assert stats["averageRating"] is None

    def test_log_cooked_with_rating(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1", rating=5), self._event("e2", rating=3)],
                [self._event("e3", rating=5)],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"rating": 5, "note": None}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["cookedStats"]["averageRating"] == 4
        assert response.json()["recentCooked"][0]["rating"] == 5

    def test_log_cooked_with_note(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1", note="Great")],
                [self._event("e1", note="Great")],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"note": "Great"}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["recentCooked"][0]["note"] == "Great"

    def test_log_cooked_updates_stats(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.cookedevent.create = AsyncMock(return_value=None)
        mock_prisma.cookedevent.find_many = AsyncMock(
            side_effect=[
                [self._event("e1", rating=5), self._event("e2", rating=1), self._event("e3", rating=4)],
                [self._event("e3", rating=4), self._event("e2", rating=1)],
            ]
        )

        response = client.post(f"/posts/{POST_ID}/cooked", json={"rating": 4}, headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["cookedStats"]["averageRating"] == pytest.approx(10 / 3)
        assert response.json()["cookedStats"]["timesCooked"] == 3

    def test_log_cooked_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=None)

        response = client.post(f"/posts/{POST_ID}/cooked", json={}, headers=member_auth)

        assert response.status_code == 404

    def test_list_cooked_success(self, client, mock_prisma, member_auth):
        mock_prisma.cookedevent.find_many = AsyncMock(
            return_value=[
                self._event("e1", rating=5, note=None, user=SimpleNamespace(id="u1")),
                self._event("e2", rating=None, note="nice", user=SimpleNamespace(id="u2")),
            ]
        )

        response = client.get(f"/posts/{POST_ID}/cooked", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert len(body["cookedEvents"]) == 2
        assert body["hasMore"] is False
        assert body["nextOffset"] == 2

    def test_list_cooked_pagination(self, client, mock_prisma, member_auth):
        mock_prisma.cookedevent.find_many = AsyncMock(
            return_value=[self._event("e1"), self._event("e2")]
        )

        response = client.get(f"/posts/{POST_ID}/cooked?limit=1", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["hasMore"] is True
        assert body["nextOffset"] == 1

    def test_unfavorite_post_idempotent(self, client, mock_prisma, member_auth):
        mock_prisma.favorite.delete_many = AsyncMock(return_value=None)

        response = client.delete(f"/posts/{POST_ID}/favorite", headers=member_auth)

        assert response.status_code == 200, response.json()
        assert response.json()["favorited"] is False
