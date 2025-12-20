"""Integration tests for comments router."""

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional
from unittest.mock import AsyncMock

import pytest

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")
POST_ID = "ckpost1234567890123456789"
COMMENT_ID = "ckcomment1234567890123456789"


class TestListComments:
    def _comment(self, comment_id: str, text: str = "Hi", author_id: str = "user-1"):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=comment_id,
            text=text,
            photoUrl=None,
            createdAt=now,
            author=SimpleNamespace(id=author_id, name=f"User {author_id}", avatarUrl=None),
        )

    def test_list_comments_success(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_many = AsyncMock(return_value=[self._comment("c1"), self._comment("c2", text="Yo")])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}/comments", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert len(body["comments"]) == 2
        assert body["hasMore"] is False
        assert body["nextOffset"] == 2

    def test_list_comments_pagination(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_many = AsyncMock(return_value=[self._comment("c1"), self._comment("c2")])
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.get(f"/posts/{POST_ID}/comments?limit=1", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["hasMore"] is True
        assert body["nextOffset"] == 1

    def test_list_comments_includes_reactions(self, client, mock_prisma, member_auth):
        comment = self._comment("c1")
        mock_prisma.comment.find_many = AsyncMock(return_value=[comment])
        mock_prisma.reaction.find_many = AsyncMock(
            return_value=[
                SimpleNamespace(
                    targetId="c1",
                    emoji="❤️",
                    user=SimpleNamespace(id="u1", name="Alice", avatarUrl=None),
                ),
                SimpleNamespace(
                    targetId="c1",
                    emoji="❤️",
                    user=SimpleNamespace(id="u2", name="Bob", avatarUrl=None),
                ),
                SimpleNamespace(
                    targetId="c1",
                    emoji="👍",
                    user=SimpleNamespace(id="u3", name="Cara", avatarUrl=None),
                ),
            ]
        )

        response = client.get(f"/posts/{POST_ID}/comments", headers=member_auth)

        assert response.status_code == 200, response.json()
        reactions = response.json()["comments"][0]["reactions"]
        counts = {item["emoji"]: item["count"] for item in reactions}
        assert counts["❤️"] == 2
        assert counts["👍"] == 1

    def test_list_comments_post_not_found_404(self, client, member_auth):
        response = client.get("/posts/invalid/comments", headers=member_auth)

        assert response.status_code == 404

    def test_list_comments_requires_auth(self, client):
        response = client.get(f"/posts/{POST_ID}/comments")

        assert response.status_code == 401


class TestCreateComment:
    def _comment(self, text: str = "Great post", photo_url: Optional[str] = None):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return SimpleNamespace(
            id=COMMENT_ID,
            text=text,
            photoUrl=photo_url,
            createdAt=now,
            author=SimpleNamespace(id="user-1", name="Test User", avatarUrl=None),
        )

    def test_create_comment_text_only(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.comment.create = AsyncMock(return_value=self._comment())

        response = client.post(
            f"/posts/{POST_ID}/comments",
            data={"payload": json.dumps({"text": "Great post"})},
            headers=member_auth,
        )

        assert response.status_code == 201, response.json()
        assert response.json()["comment"]["text"] == "Great post"

    def test_create_comment_with_photo(self, client, mock_prisma, member_auth, monkeypatch):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        saved_comment = self._comment(photo_url="https://cdn.test/pic.jpg")
        mock_prisma.comment.create = AsyncMock(return_value=saved_comment)
        monkeypatch.setattr("src.routers.comments.save_photo_file", AsyncMock(return_value={"url": "https://cdn.test/pic.jpg"}))

        response = client.post(
            f"/posts/{POST_ID}/comments",
            data={"payload": json.dumps({"text": "Photo"})},
            files={"photo": ("pic.jpg", b"data", "image/jpeg")},
            headers=member_auth,
        )

        assert response.status_code == 201, response.json()
        assert response.json()["comment"]["photoUrl"] == "https://cdn.test/pic.jpg"

    def test_create_comment_invalid_mime_403(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))

        response = client.post(
            f"/posts/{POST_ID}/comments",
            data={"payload": json.dumps({"text": "Bad"})},
            files={"photo": ("doc.txt", b"data", "text/plain")},
            headers=member_auth,
        )

        assert response.status_code == 403

    def test_create_comment_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=None)

        response = client.post(
            f"/posts/{POST_ID}/comments",
            data={"payload": json.dumps({"text": "Missing"})},
            headers=member_auth,
        )

        assert response.status_code == 404

    def test_create_comment_requires_auth(self, client):
        response = client.post(
            f"/posts/{POST_ID}/comments",
            data={"payload": json.dumps({"text": "No auth"})},
        )

        assert response.status_code == 401

    def test_create_comment_returns_shape(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=SimpleNamespace(id=POST_ID, familySpaceId="family_test_123"))
        mock_prisma.comment.create = AsyncMock(return_value=self._comment())

        response = client.post(
            f"/posts/{POST_ID}/comments",
            data={"payload": json.dumps({"text": "Shape"})},
            headers=member_auth,
        )

        assert response.status_code == 201, response.json()
        for key in ["id", "text", "photoUrl", "author", "reactions"]:
            assert key in response.json()["comment"]


class TestDeleteComment:
    def _comment(self, *, author_id: str, photo_url: Optional[str] = None, family_space_id: str = "family_test_123"):
        return SimpleNamespace(
            id=COMMENT_ID,
            authorId=author_id,
            photoUrl=photo_url,
            post=SimpleNamespace(familySpaceId=family_space_id),
        )

    def test_delete_comment_author_can_delete(self, client, mock_prisma, member_auth, monkeypatch):
        comment = self._comment(author_id="user_test_123", photo_url="https://cdn.test/c.jpg")
        mock_prisma.comment.find_unique = AsyncMock(return_value=comment)
        mock_prisma.comment.delete = AsyncMock(return_value=None)
        delete_mock = AsyncMock()
        monkeypatch.setattr("src.routers.comments.delete_uploads", delete_mock)

        response = client.delete(f"/comments/{COMMENT_ID}", headers=member_auth)

        assert response.status_code == 200, response.json()
        delete_mock.assert_awaited_once_with(["https://cdn.test/c.jpg"])

    def test_delete_comment_admin_can_delete(
        self,
        client,
        mock_prisma,
        admin_auth,
        mock_admin_user,
        mock_family_space,
    ):
        mock_admin_user.memberships = [SimpleNamespace(role="admin", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_admin_user)
        comment = self._comment(author_id="other")
        mock_prisma.comment.find_unique = AsyncMock(return_value=comment)
        mock_prisma.comment.delete = AsyncMock(return_value=None)

        response = client.delete(f"/comments/{COMMENT_ID}", headers=admin_auth)

        assert response.status_code == 200, response.json()

    def test_delete_comment_owner_can_delete(
        self,
        client,
        mock_prisma,
        owner_auth,
        mock_owner_user,
        mock_family_space,
    ):
        mock_owner_user.memberships = [SimpleNamespace(role="owner", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
        mock_prisma.user.find_unique = AsyncMock(return_value=mock_owner_user)
        comment = self._comment(author_id="other")
        mock_prisma.comment.find_unique = AsyncMock(return_value=comment)
        mock_prisma.comment.delete = AsyncMock(return_value=None)

        response = client.delete(f"/comments/{COMMENT_ID}", headers=owner_auth)

        assert response.status_code == 200, response.json()

    def test_delete_comment_member_cannot_delete_others_403(self, client, mock_prisma, member_auth):
        comment = self._comment(author_id="different")
        mock_prisma.comment.find_unique = AsyncMock(return_value=comment)

        response = client.delete(f"/comments/{COMMENT_ID}", headers=member_auth)

        assert response.status_code == 403

    def test_delete_comment_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_unique = AsyncMock(return_value=None)

        response = client.delete(f"/comments/{COMMENT_ID}", headers=member_auth)

        assert response.status_code == 404

    def test_delete_comment_invalid_id_404(self, client, member_auth):
        response = client.delete("/comments/not-a-cuid", headers=member_auth)

        assert response.status_code == 404

    def test_delete_comment_requires_auth(self, client):
        response = client.delete(f"/comments/{COMMENT_ID}")

        assert response.status_code == 401
