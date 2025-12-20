"""Integration tests for reactions router."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")

POST_ID = "ckpost1234567890123456789"
COMMENT_ID = "ckcomment1234567890123456789"


class TestToggleReaction:
    def _post(self, *, family_space_id: str = "family_test_123") -> SimpleNamespace:
        return SimpleNamespace(id=POST_ID, familySpaceId=family_space_id)

    def _comment(self, *, family_space_id: str = "family_test_123") -> SimpleNamespace:
        return SimpleNamespace(id=COMMENT_ID, postId=POST_ID, post=SimpleNamespace(familySpaceId=family_space_id))

    def test_toggle_reaction_add_to_post(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "❤️"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        mock_prisma.reaction.create.assert_awaited_once()
        data = mock_prisma.reaction.create.await_args.kwargs["data"]
        assert data["postId"] == POST_ID
        assert data["commentId"] is None

    def test_toggle_reaction_remove_from_post(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        existing = SimpleNamespace(id="rx_post")
        mock_prisma.reaction.find_first = AsyncMock(return_value=existing)
        mock_prisma.reaction.delete = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "❤️"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert response.json()["reacted"] is False
        mock_prisma.reaction.delete.assert_awaited_once_with(where={"id": "rx_post"})

    def test_toggle_reaction_add_to_comment(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_unique = AsyncMock(return_value=self._comment())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "comment", "targetId": COMMENT_ID, "emoji": "🔥"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        data = mock_prisma.reaction.create.await_args.kwargs["data"]
        assert data["commentId"] == COMMENT_ID
        assert data["postId"] == POST_ID

    def test_toggle_reaction_remove_from_comment(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_unique = AsyncMock(return_value=self._comment())
        existing = SimpleNamespace(id="rx_comment")
        mock_prisma.reaction.find_first = AsyncMock(return_value=existing)
        mock_prisma.reaction.delete = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "comment", "targetId": COMMENT_ID, "emoji": "🔥"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert response.json()["reacted"] is False
        mock_prisma.reaction.delete.assert_awaited_once_with(where={"id": "rx_comment"})

    def test_toggle_reaction_returns_reacted_true(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "👍"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert response.json()["reacted"] is True

    def test_toggle_reaction_returns_reacted_false(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=SimpleNamespace(id="rx_remove"))
        mock_prisma.reaction.delete = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "👍"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert response.json()["reacted"] is False

    def test_toggle_reaction_post_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "❤️"},
            headers=member_auth,
        )

        assert response.status_code == 404

    def test_toggle_reaction_comment_not_found_404(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_unique = AsyncMock(return_value=None)

        response = client.post(
            "/reactions",
            json={"targetType": "comment", "targetId": COMMENT_ID, "emoji": "🔥"},
            headers=member_auth,
        )

        assert response.status_code == 404

    def test_toggle_reaction_invalid_target_id_404(self, client, member_auth):
        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": "not-a-cuid", "emoji": "❤️"},
            headers=member_auth,
        )

        assert response.status_code == 404

    def test_toggle_reaction_wrong_family_404(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post(family_space_id="other_family"))

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "❤️"},
            headers=member_auth,
        )

        assert response.status_code == 404

    def test_toggle_reaction_requires_auth(self, client):
        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "❤️"},
        )

        assert response.status_code == 401

    def test_toggle_reaction_multiple_emojis_same_target(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(side_effect=[None, None])
        mock_prisma.reaction.create = AsyncMock(return_value=None)

        first_payload = {"targetType": "post", "targetId": POST_ID, "emoji": "❤️"}
        second_payload = {"targetType": "post", "targetId": POST_ID, "emoji": "🔥"}

        first_response = client.post("/reactions", json=first_payload, headers=member_auth)
        second_response = client.post("/reactions", json=second_payload, headers=member_auth)

        assert first_response.status_code == 200, first_response.json()
        assert second_response.status_code == 200, second_response.json()
        assert second_response.json()["reacted"] is True
        assert mock_prisma.reaction.create.await_count == 2
        emojis = [call.kwargs["data"]["emoji"] for call in mock_prisma.reaction.create.await_args_list]
        assert emojis == ["❤️", "🔥"]
