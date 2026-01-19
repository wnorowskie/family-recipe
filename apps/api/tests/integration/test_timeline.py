"""Integration tests for the timeline router."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")

BASE_TIME = datetime(2024, 1, 1, tzinfo=timezone.utc)


class TestTimelineRouter:
    def _ts(self, minutes: int = 0) -> datetime:
        return BASE_TIME + timedelta(minutes=minutes)

    def _actor(self, suffix: str = "1") -> SimpleNamespace:
        return SimpleNamespace(id=f"user-{suffix}", name=f"User {suffix}", avatarUrl=f"https://cdn.test/{suffix}.jpg")

    def _post(
        self,
        *,
        post_id: str = "post-1",
        created_at: datetime | None = None,
        author: SimpleNamespace | None = None,
        title: str | None = None,
        main_photo: str | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=post_id,
            title=title or f"Post {post_id}",
            mainPhotoUrl=main_photo,
            familySpaceId="family_test_123",
            createdAt=created_at or self._ts(),
            author=author or self._actor(post_id),
            lastEditAt=None,
            lastEditNote=None,
            editor=None,
        )

    def _post_summary(self, post_id: str = "post-s", title: str | None = None) -> SimpleNamespace:
        return SimpleNamespace(id=post_id, title=title or f"Post {post_id}", mainPhotoUrl="https://cdn.test/post.jpg", familySpaceId="family_test_123")

    def _comment(
        self,
        *,
        comment_id: str = "comment-1",
        created_at: datetime | None = None,
        post: SimpleNamespace | None = None,
        text: str = "Nice post",
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=comment_id,
            text=text,
            createdAt=created_at or self._ts(1),
            author=self._actor("comment"),
            post=post or self._post_summary(comment_id),
        )

    def _reaction(
        self,
        *,
        reaction_id: str = "reaction-1",
        created_at: datetime | None = None,
        post: SimpleNamespace | None = None,
        emoji: str = ":)",
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=reaction_id,
            createdAt=created_at or self._ts(2),
            emoji=emoji,
            user=self._actor("reaction"),
            post=post or self._post_summary(reaction_id),
        )

    def _cooked(
        self,
        *,
        cooked_id: str = "cooked-1",
        created_at: datetime | None = None,
        post: SimpleNamespace | None = None,
        rating: int = 5,
        note: str | None = "Tasty",
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=cooked_id,
            createdAt=created_at or self._ts(3),
            rating=rating,
            note=note,
            user=self._actor("cook"),
            post=post or self._post_summary(cooked_id),
        )

    def _mock_events(
        self,
        mock_prisma,
        *,
        posts: list[SimpleNamespace] | None = None,
        comments: list[SimpleNamespace] | None = None,
        reactions: list[SimpleNamespace] | None = None,
        cooked: list[SimpleNamespace] | None = None,
    ) -> None:
        mock_prisma.post.find_many = AsyncMock(return_value=posts or [])
        mock_prisma.comment.find_many = AsyncMock(return_value=comments or [])
        mock_prisma.reaction.find_many = AsyncMock(return_value=reactions or [])
        mock_prisma.cookedevent.find_many = AsyncMock(return_value=cooked or [])

    def test_timeline_returns_mixed_events(self, client, mock_prisma, member_auth):
        post = self._post(post_id="post-mixed", created_at=self._ts(10))
        comment = self._comment(comment_id="comment-mixed", created_at=self._ts(9))
        reaction = self._reaction(reaction_id="reaction-mixed", created_at=self._ts(8))
        cooked = self._cooked(cooked_id="cooked-mixed", created_at=self._ts(7))
        self._mock_events(mock_prisma, posts=[post], comments=[comment], reactions=[reaction], cooked=[cooked])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        types = {item["type"] for item in body["items"]}
        assert types == {"post_created", "comment_added", "reaction_added", "cooked_logged"}

    def test_timeline_post_created_event(self, client, mock_prisma, member_auth):
        post = self._post(post_id="post-created", created_at=self._ts(5), title="Fresh Post")
        self._mock_events(mock_prisma, posts=[post])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        item = response.json()["items"][0]
        assert item["type"] == "post_created"
        assert item["post"]["title"] == "Fresh Post"

    def test_timeline_comment_added_event(self, client, mock_prisma, member_auth):
        comment = self._comment(comment_id="comment-2", text="Great work", created_at=self._ts(6))
        self._mock_events(mock_prisma, comments=[comment])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        item = response.json()["items"][0]
        assert item["type"] == "comment_added"
        assert item["comment"]["text"] == "Great work"

    def test_timeline_reaction_added_event(self, client, mock_prisma, member_auth):
        reaction = self._reaction(emoji="thumbs-up", created_at=self._ts(6))
        self._mock_events(mock_prisma, reactions=[reaction])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        item = response.json()["items"][0]
        assert item["type"] == "reaction_added"
        assert item["reaction"]["emoji"] == "thumbs-up"

    def test_timeline_cooked_logged_event(self, client, mock_prisma, member_auth):
        cooked = self._cooked(rating=3, note="Could be spicier", created_at=self._ts(6))
        self._mock_events(mock_prisma, cooked=[cooked])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        item = response.json()["items"][0]
        assert item["type"] == "cooked_logged"
        assert item["cooked"] == {"rating": 3, "note": "Could be spicier"}

    def test_timeline_sorted_by_date(self, client, mock_prisma, member_auth):
        older = self._post(post_id="post-old", created_at=self._ts(1))
        newer = self._post(post_id="post-new", created_at=self._ts(5))
        self._mock_events(mock_prisma, posts=[older, newer])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        items = response.json()["items"]
        assert items[0]["post"]["id"] == "post-new"
        assert items[1]["post"]["id"] == "post-old"

    def test_timeline_pagination(self, client, mock_prisma, member_auth):
        posts = [self._post(post_id=f"post-{i}", created_at=self._ts(10 - i)) for i in range(3)]
        self._mock_events(mock_prisma, posts=posts)

        response = client.get("/timeline?limit=2", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert len(body["items"]) == 2
        assert body["hasMore"] is True
        assert body["nextOffset"] == 2

    def test_timeline_limit_parameter(self, client, mock_prisma, member_auth):
        posts = [self._post(post_id="post-limit", created_at=self._ts(4))]
        self._mock_events(mock_prisma, posts=posts)

        response = client.get("/timeline?limit=1", headers=member_auth)

        assert response.status_code == 200, response.json()
        post_calls = mock_prisma.post.find_many.await_args_list
        assert post_calls[0].kwargs["take"] == 6  # limit + offset + buffer
        assert len(response.json()["items"]) == 1

    def test_timeline_offset_parameter(self, client, mock_prisma, member_auth):
        posts = [self._post(post_id=f"post-{i}", created_at=self._ts(10 - i)) for i in range(3)]
        self._mock_events(mock_prisma, posts=posts)

        response = client.get("/timeline?offset=1", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["items"][0]["post"]["id"] == "post-1"
        assert body["nextOffset"] == 1 + len(body["items"])

    def test_timeline_includes_action_text(self, client, mock_prisma, member_auth):
        post = self._post(post_id="post-action", created_at=self._ts(11))
        comment = self._comment(comment_id="comment-action", created_at=self._ts(10))
        reaction = self._reaction(reaction_id="reaction-action", created_at=self._ts(9))
        cooked = self._cooked(cooked_id="cooked-action", created_at=self._ts(8))
        self._mock_events(mock_prisma, posts=[post], comments=[comment], reactions=[reaction], cooked=[cooked])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        mapping = {item["type"]: item["actionText"] for item in response.json()["items"]}
        assert mapping["post_created"] == "posted"
        assert mapping["comment_added"] == "commented on"
        assert mapping["reaction_added"] == "reacted to"
        assert mapping["cooked_logged"] == "cooked"

    def test_timeline_includes_actor(self, client, mock_prisma, member_auth):
        actor = self._actor("special")
        post = self._post(post_id="post-actor", author=actor, created_at=self._ts(3))
        self._mock_events(mock_prisma, posts=[post])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        item = response.json()["items"][0]
        assert item["actor"] == {"id": actor.id, "name": actor.name, "avatarUrl": actor.avatarUrl}

    def test_timeline_includes_post_summary(self, client, mock_prisma, member_auth):
        reaction = self._reaction(post=self._post_summary("post-summary", "Summary"), created_at=self._ts(4))
        self._mock_events(mock_prisma, reactions=[reaction])

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        post = response.json()["items"][0]["post"]
        assert post == {"id": "post-summary", "title": "Summary", "mainPhotoUrl": "https://cdn.test/post.jpg"}

    def test_timeline_family_scoped(self, client, mock_prisma, member_auth):
        self._mock_events(mock_prisma)

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        post_calls = mock_prisma.post.find_many.await_args_list
        assert post_calls[0].kwargs["where"] == {"familySpaceId": "family_test_123"}
        assert mock_prisma.comment.find_many.await_args.kwargs["where"]["post"]["familySpaceId"] == "family_test_123"
        assert mock_prisma.reaction.find_many.await_args.kwargs["where"]["post"]["familySpaceId"] == "family_test_123"
        assert mock_prisma.cookedevent.find_many.await_args.kwargs["where"]["post"]["familySpaceId"] == "family_test_123"

    def test_timeline_requires_auth(self, client):
        response = client.get("/timeline")

        assert response.status_code == 401

    def test_timeline_empty_returns_empty_array(self, client, mock_prisma, member_auth):
        self._mock_events(mock_prisma)

        response = client.get("/timeline", headers=member_auth)

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["items"] == []
        assert body["hasMore"] is False
        assert body["nextOffset"] == 0
