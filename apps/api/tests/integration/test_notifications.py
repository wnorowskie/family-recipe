"""Integration tests for /v1/notifications/* — issue #182.

Bearer-token (access-token) auth via dependencies_v1. Mocks Prisma so tests
exercise the full FastAPI dependency chain without a real DB. Covers the
acceptance criteria from the ticket: happy path, 401 unauth, family scoping,
unreadOnly filter, mark-read selective vs. all.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src import tokens
from tests.helpers.test_data import make_mock_membership, make_mock_user


def _bearer_headers(user_id: str, family_space_id: str, role: str = "member") -> dict:
    token = tokens.mint_access_token(
        user_id=user_id, family_space_id=family_space_id, role=role
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_user_lookup(mock_prisma, user, family_space):
    """Wire the /v1 dependency's `user.find_unique` so the bearer dep
    resolves to the test user with a membership in the test family."""
    membership = make_mock_membership(
        userId=user.id,
        familySpaceId=family_space.id,
        familySpace=family_space,
    )
    user_with_membership = make_mock_user(memberships=[membership], id=user.id)
    mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)
    return user_with_membership


def _make_notification_row(
    *,
    id: str = "notif_1",
    notif_type: str = "comment",
    recipient_id: str = "user_test_123",
    family_space_id: str = "family_test_123",
    actor_id: str = "actor_1",
    post_id: str = "post_1",
    read_at: datetime | None = None,
    metadata: dict | None = None,
    emoji_counts: list | None = None,
    total_count: int | None = None,
) -> SimpleNamespace:
    now = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=id,
        type=notif_type,
        recipientId=recipient_id,
        familySpaceId=family_space_id,
        actorId=actor_id,
        postId=post_id,
        commentId=None,
        cookedEventId=None,
        emojiCounts=emoji_counts,
        totalCount=total_count,
        metadata=metadata or {},
        createdAt=now,
        updatedAt=now,
        readAt=read_at,
        actor=SimpleNamespace(
            id=actor_id, name="Actor Name", avatarStorageKey=None
        ),
        post=SimpleNamespace(
            id=post_id, title="Post Title", mainPhotoStorageKey=None
        ),
    )


# ---------------------------------------------------------------------------
# GET /v1/notifications
# ---------------------------------------------------------------------------


class TestListNotifications:
    def test_unauthenticated_returns_envelope_401(self, client):
        response = client.get("/v1/notifications")
        assert response.status_code == 401
        assert response.json() == {
            "error": {"code": "UNAUTHORIZED", "message": "Unauthorized"}
        }

    def test_invalid_bearer_returns_envelope_401(self, client):
        response = client.get(
            "/v1/notifications", headers={"Authorization": "Bearer not-a-jwt"}
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_happy_path_returns_items_and_unread_count(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        rows = [
            _make_notification_row(
                id="n1",
                recipient_id=mock_user.id,
                family_space_id=mock_family_space.id,
                metadata={"commentText": "Looks great!"},
            ),
            _make_notification_row(
                id="n2",
                notif_type="reaction_batch",
                recipient_id=mock_user.id,
                family_space_id=mock_family_space.id,
                emoji_counts=[{"emoji": "❤️", "count": 2}, {"emoji": "🔥", "count": 1}],
                total_count=3,
                metadata={"lastEmoji": "🔥"},
            ),
        ]
        mock_prisma.notification.find_many = AsyncMock(return_value=rows)
        mock_prisma.notification.count = AsyncMock(return_value=1)

        response = client.get(
            "/v1/notifications",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["unreadCount"] == 1
        assert body["hasMore"] is False
        assert body["nextOffset"] == 2
        assert len(body["notifications"]) == 2
        assert body["notifications"][0]["id"] == "n1"
        assert body["notifications"][0]["commentText"] == "Looks great!"
        assert body["notifications"][1]["reactionSummary"]["totalCount"] == 3
        assert body["notifications"][1]["reactionSummary"]["lastEmoji"] == "🔥"

    def test_has_more_when_take_returns_extra_row(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        # Request limit=2 → router asks for 3; returning 3 means hasMore=True.
        rows = [
            _make_notification_row(
                id=f"n{i}",
                recipient_id=mock_user.id,
                family_space_id=mock_family_space.id,
            )
            for i in range(3)
        ]
        mock_prisma.notification.find_many = AsyncMock(return_value=rows)
        mock_prisma.notification.count = AsyncMock(return_value=0)

        response = client.get(
            "/v1/notifications?limit=2",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["hasMore"] is True
        assert len(body["notifications"]) == 2

    def test_query_is_family_scoped(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        """Family scoping is implicit but load-bearing — the where clause
        must include familySpaceId so a user moving families can't see
        old-family notifications."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.find_many = AsyncMock(return_value=[])
        mock_prisma.notification.count = AsyncMock(return_value=0)

        response = client.get(
            "/v1/notifications",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        call_kwargs = mock_prisma.notification.find_many.await_args.kwargs
        assert call_kwargs["where"]["recipientId"] == mock_user.id
        assert call_kwargs["where"]["familySpaceId"] == mock_family_space.id

    def test_unread_only_filter_adds_read_at_null(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.find_many = AsyncMock(return_value=[])
        mock_prisma.notification.count = AsyncMock(return_value=0)

        response = client.get(
            "/v1/notifications?unreadOnly=true",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        call_kwargs = mock_prisma.notification.find_many.await_args.kwargs
        assert call_kwargs["where"]["readAt"] is None

    def test_default_does_not_filter_by_read_at(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.find_many = AsyncMock(return_value=[])
        mock_prisma.notification.count = AsyncMock(return_value=0)

        response = client.get(
            "/v1/notifications",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        call_kwargs = mock_prisma.notification.find_many.await_args.kwargs
        assert "readAt" not in call_kwargs["where"]

    def test_invalid_limit_returns_422_envelope_or_envelope(
        self, client, mock_user, mock_family_space, mock_prisma
    ):
        # Pydantic validation on Query params returns FastAPI's default 422
        # shape. The error-shape audit (#190) is the ticket that converts
        # this to the standard envelope; for now we just assert the request
        # is rejected.
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        response = client.get(
            "/v1/notifications?limit=999",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code in (400, 422)


# ---------------------------------------------------------------------------
# POST /v1/notifications/mark-read
# ---------------------------------------------------------------------------


class TestMarkRead:
    def test_unauthenticated_returns_envelope_401(self, client):
        response = client.post("/v1/notifications/mark-read", json={})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_mark_all_when_ids_omitted(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.update_many = AsyncMock(return_value=None)
        mock_prisma.notification.count = AsyncMock(return_value=0)

        response = client.post(
            "/v1/notifications/mark-read",
            json={},
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        body = response.json()
        assert body == {"status": "ok", "unreadCount": 0}
        call_kwargs = mock_prisma.notification.update_many.await_args.kwargs
        # When `ids` is omitted, the where clause must NOT contain `id` —
        # otherwise we'd silently mark zero rows.
        assert "id" not in call_kwargs["where"]
        assert call_kwargs["where"]["recipientId"] == mock_user.id
        assert call_kwargs["where"]["familySpaceId"] == mock_family_space.id
        assert call_kwargs["where"]["readAt"] is None

    def test_mark_specific_ids_passes_in_filter(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.update_many = AsyncMock(return_value=None)
        mock_prisma.notification.count = AsyncMock(return_value=2)

        response = client.post(
            "/v1/notifications/mark-read",
            json={"ids": ["n1", "n2"]},
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        assert response.json()["unreadCount"] == 2
        call_kwargs = mock_prisma.notification.update_many.await_args.kwargs
        assert call_kwargs["where"]["id"] == {"in": ["n1", "n2"]}
        assert call_kwargs["where"]["recipientId"] == mock_user.id

    def test_cannot_mark_other_users_notifications(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        """Even when the caller passes IDs they don't own, the where clause
        scopes to recipientId=user.id so the update_many silently affects
        zero rows — confirmed by inspecting the actual DB query, since the
        mock can't simulate row-level filtering."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.update_many = AsyncMock(return_value=None)
        mock_prisma.notification.count = AsyncMock(return_value=0)

        response = client.post(
            "/v1/notifications/mark-read",
            json={"ids": ["someone_elses_id"]},
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        call_kwargs = mock_prisma.notification.update_many.await_args.kwargs
        # The recipientId predicate is what enforces cross-user safety.
        assert call_kwargs["where"]["recipientId"] == mock_user.id

    def test_too_many_ids_rejected_by_schema(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        response = client.post(
            "/v1/notifications/mark-read",
            json={"ids": [f"id_{i}" for i in range(51)]},
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code in (400, 422)


# ---------------------------------------------------------------------------
# GET /v1/notifications/unread-count
# ---------------------------------------------------------------------------


class TestUnreadCount:
    def test_unauthenticated_returns_envelope_401(self, client):
        response = client.get("/v1/notifications/unread-count")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"

    def test_returns_count_for_caller(
        self, client, mock_prisma, mock_user, mock_family_space
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock_prisma.notification.count = AsyncMock(return_value=7)

        response = client.get(
            "/v1/notifications/unread-count",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
        )
        assert response.status_code == 200
        assert response.json() == {"unreadCount": 7}
        call_kwargs = mock_prisma.notification.count.await_args.kwargs
        assert call_kwargs["where"]["recipientId"] == mock_user.id
        assert call_kwargs["where"]["readAt"] is None
