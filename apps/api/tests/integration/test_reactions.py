"""Integration tests for reactions router."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")

POST_ID = "ckpost1234567890123456789"
COMMENT_ID = "ckcomment1234567890123456"


class TestToggleReaction:
    def _post(self, *, family_space_id: str = "family_test_123") -> SimpleNamespace:
        return SimpleNamespace(id=POST_ID, familySpaceId=family_space_id)

    def _comment(self, *, family_space_id: str = "family_test_123") -> SimpleNamespace:
        return SimpleNamespace(id=COMMENT_ID, postId=POST_ID, post=SimpleNamespace(familySpaceId=family_space_id))

    def test_toggle_reaction_add_to_post(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

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
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "❤️"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert "reactions" in response.json()
        mock_prisma.reaction.delete.assert_awaited_once_with(where={"id": "rx_post"})

    def test_toggle_reaction_add_to_comment(self, client, mock_prisma, member_auth):
        mock_prisma.comment.find_unique = AsyncMock(return_value=self._comment())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

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
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.post(
            "/reactions",
            json={"targetType": "comment", "targetId": COMMENT_ID, "emoji": "🔥"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert "reactions" in response.json()
        mock_prisma.reaction.delete.assert_awaited_once_with(where={"id": "rx_comment"})

    def test_toggle_reaction_add_returns_reactions_list(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)
        user = SimpleNamespace(id="u1", name="Alice", avatarStorageKey=None)
        mock_prisma.reaction.find_many = AsyncMock(
            return_value=[SimpleNamespace(emoji="👍", user=user)]
        )

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "👍"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        body = response.json()
        assert "reactions" in body
        assert body["reactions"][0]["emoji"] == "👍"
        assert body["reactions"][0]["count"] == 1

    def test_toggle_reaction_remove_returns_empty_reactions(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=SimpleNamespace(id="rx_remove"))
        mock_prisma.reaction.delete = AsyncMock(return_value=None)
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        response = client.post(
            "/reactions",
            json={"targetType": "post", "targetId": POST_ID, "emoji": "👍"},
            headers=member_auth,
        )

        assert response.status_code == 200, response.json()
        assert response.json()["reactions"] == []

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
        mock_prisma.reaction.find_many = AsyncMock(return_value=[])

        first_payload = {"targetType": "post", "targetId": POST_ID, "emoji": "❤️"}
        second_payload = {"targetType": "post", "targetId": POST_ID, "emoji": "🔥"}

        first_response = client.post("/reactions", json=first_payload, headers=member_auth)
        second_response = client.post("/reactions", json=second_payload, headers=member_auth)

        assert first_response.status_code == 200, first_response.json()
        assert second_response.status_code == 200, second_response.json()
        assert "reactions" in second_response.json()
        assert mock_prisma.reaction.create.await_count == 2
        emojis = [call.kwargs["data"]["emoji"] for call in mock_prisma.reaction.create.await_args_list]
        assert emojis == ["❤️", "🔥"]


class TestReactionSummaryAvatarBatching:
    """The reaction summary resolves each avatar signed-URL once per distinct
    storage key (batched via the memoizing resolver), not once per reactor."""

    def _post(self, *, family_space_id: str = "family_test_123") -> SimpleNamespace:
        return SimpleNamespace(id=POST_ID, familySpaceId=family_space_id)

    def test_signs_once_per_distinct_avatar_key(self, client, mock_prisma, member_auth):
        mock_prisma.post.find_unique = AsyncMock(return_value=self._post())
        mock_prisma.reaction.find_first = AsyncMock(return_value=None)
        mock_prisma.reaction.create = AsyncMock(return_value=None)
        # 4 reactors across 2 emojis, but only 2 distinct non-null avatar keys
        # (a.jpg is shared by Alice + Cara; Dave has no avatar).
        rows = [
            SimpleNamespace(emoji="👍", user=SimpleNamespace(id="u1", name="Alice", avatarStorageKey="a.jpg")),
            SimpleNamespace(emoji="👍", user=SimpleNamespace(id="u2", name="Bob", avatarStorageKey="b.jpg")),
            SimpleNamespace(emoji="🔥", user=SimpleNamespace(id="u3", name="Cara", avatarStorageKey="a.jpg")),
            SimpleNamespace(emoji="🔥", user=SimpleNamespace(id="u4", name="Dave", avatarStorageKey=None)),
        ]
        mock_prisma.reaction.find_many = AsyncMock(return_value=rows)

        async def fake_sign(key):
            return f"/uploads/{key}"

        with patch(
            "src.uploads.get_signed_upload_url", new=AsyncMock(side_effect=fake_sign)
        ) as mock_sign:
            response = client.post(
                "/reactions",
                json={"targetType": "post", "targetId": POST_ID, "emoji": "👍"},
                headers=member_auth,
            )

        assert response.status_code == 200, response.json()
        # Signed exactly twice (a.jpg, b.jpg) despite 4 reactors — the None key
        # short-circuits in the resolver and never reaches the signer.
        assert mock_sign.await_count == 2
        # Response shape/values are unchanged by the batching.
        by_emoji = {e["emoji"]: e for e in response.json()["reactions"]}
        assert [u["avatarUrl"] for u in by_emoji["👍"]["users"]] == [
            "/uploads/a.jpg",
            "/uploads/b.jpg",
        ]
        assert [u["avatarUrl"] for u in by_emoji["🔥"]["users"]] == ["/uploads/a.jpg", None]
