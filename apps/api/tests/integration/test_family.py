"""Integration tests for the family router endpoints."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.security import sign_token
from src.settings import settings

pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")

_NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)
_VALID_CUID = "cl0123456789abcdefghijklmn"


def _make_user(idx: int = 1, **overrides) -> SimpleNamespace:
    data = {
        "id": overrides.get("id", f"user-{idx}"),
        "name": overrides.get("name", f"Member {idx}"),
        "emailOrUsername": overrides.get("emailOrUsername", f"member{idx}@example.com"),
        "avatarUrl": overrides.get("avatarUrl", f"https://cdn.test/avatar-{idx}.jpg"),
        "posts": overrides.get("posts", []),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _make_membership(user: SimpleNamespace, **overrides) -> SimpleNamespace:
    data = {
        "id": overrides.get("id", f"membership-{user.id}"),
        "userId": overrides.get("userId", user.id),
        "familySpaceId": overrides.get("familySpaceId", "family_test_123"),
        "role": overrides.get("role", "member"),
        "createdAt": overrides.get("createdAt", _NOW),
        "user": user,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


# ---------------------------------------------------------------------------
# GET /family/members
# ---------------------------------------------------------------------------


def test_list_members_success(client, mock_prisma, member_auth):
    user = _make_user(idx=1, posts=[SimpleNamespace(id="p1")])
    membership = _make_membership(user, role="admin")
    mock_prisma.familymembership.find_many = AsyncMock(return_value=[membership])

    response = client.get("/family/members", headers=member_auth)

    assert response.status_code == 200
    assert response.json() == {
        "members": [
            {
                "userId": membership.userId,
                "membershipId": membership.id,
                "name": user.name,
                "emailOrUsername": user.emailOrUsername,
                "avatarUrl": user.avatarUrl,
                "role": "admin",
                "joinedAt": _NOW.isoformat(),
                "postCount": 1,
            }
        ]
    }


def test_list_members_includes_post_count(client, mock_prisma, member_auth):
    user = _make_user(idx=2, posts=[SimpleNamespace(id="p1"), SimpleNamespace(id="p2")])
    membership = _make_membership(user)
    mock_prisma.familymembership.find_many = AsyncMock(return_value=[membership])

    response = client.get("/family/members", headers=member_auth)

    assert response.status_code == 200
    assert response.json()["members"][0]["postCount"] == 2


def test_list_members_includes_role(client, mock_prisma, member_auth):
    membership = _make_membership(_make_user(), role="owner")
    mock_prisma.familymembership.find_many = AsyncMock(return_value=[membership])

    response = client.get("/family/members", headers=member_auth)

    assert response.status_code == 200
    assert response.json()["members"][0]["role"] == "owner"


def test_list_members_sorted_by_join_date(client, mock_prisma, member_auth):
    memberships = [_make_membership(_make_user(idx=idx)) for idx in range(2)]
    mock_prisma.familymembership.find_many = AsyncMock(return_value=memberships)

    response = client.get("/family/members", headers=member_auth)

    assert response.status_code == 200
    assert mock_prisma.familymembership.find_many.await_args.kwargs["order"] == {"createdAt": "asc"}


def test_list_members_requires_auth(client):
    response = client.get("/family/members")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /family/members/{id}
# ---------------------------------------------------------------------------


def _set_current_user(mock_prisma, user, family_space, role: str):
    user.memberships = [SimpleNamespace(role=role, familySpaceId=family_space.id, familySpace=family_space)]
    mock_prisma.user.find_unique = AsyncMock(return_value=user)


def _setup_membership(mock_family_space, role: str = "member", user_id: str = _VALID_CUID):
    user = _make_user(idx=5, id=user_id)
    return _make_membership(user, role=role, userId=user_id, familySpaceId=mock_family_space.id)


def test_remove_member_admin_removes_member(client, mock_prisma, admin_auth, mock_admin_user, mock_family_space):
    _set_current_user(mock_prisma, mock_admin_user, mock_family_space, "admin")
    membership = _setup_membership(mock_family_space, role="member")
    mock_prisma.familymembership.find_first = AsyncMock(return_value=membership)
    mock_prisma.familymembership.delete = AsyncMock(return_value=None)

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=admin_auth)

    assert response.status_code == 200
    assert response.json() == {"message": "Member removed"}
    mock_prisma.familymembership.delete.assert_awaited_with(where={"id": membership.id})


def test_remove_member_owner_removes_member(client, mock_prisma, owner_auth, mock_owner_user, mock_family_space):
    _set_current_user(mock_prisma, mock_owner_user, mock_family_space, "owner")
    membership = _setup_membership(mock_family_space, role="member")
    mock_prisma.familymembership.find_first = AsyncMock(return_value=membership)
    mock_prisma.familymembership.delete = AsyncMock(return_value=None)

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=owner_auth)

    assert response.status_code == 200
    mock_prisma.familymembership.delete.assert_awaited()


def test_remove_member_owner_removes_admin(client, mock_prisma, owner_auth, mock_owner_user, mock_family_space):
    _set_current_user(mock_prisma, mock_owner_user, mock_family_space, "owner")
    membership = _setup_membership(mock_family_space, role="admin")
    mock_prisma.familymembership.find_first = AsyncMock(return_value=membership)
    mock_prisma.familymembership.delete = AsyncMock(return_value=None)

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=owner_auth)

    assert response.status_code == 200
    mock_prisma.familymembership.delete.assert_awaited()


def test_remove_member_member_cannot_remove_403(client, mock_prisma, member_auth, mock_family_space):
    membership = _setup_membership(mock_family_space, role="member")
    mock_prisma.familymembership.find_first = AsyncMock(return_value=membership)
    mock_prisma.familymembership.delete = AsyncMock()

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=member_auth)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
    assert mock_prisma.familymembership.delete.await_count == 0


def test_remove_member_admin_cannot_remove_owner_403(client, mock_prisma, admin_auth, mock_admin_user, mock_family_space):
    _set_current_user(mock_prisma, mock_admin_user, mock_family_space, "admin")
    membership = _setup_membership(mock_family_space, role="owner")
    mock_prisma.familymembership.find_first = AsyncMock(return_value=membership)
    mock_prisma.familymembership.delete = AsyncMock()

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=admin_auth)

    assert response.status_code == 403
    assert mock_prisma.familymembership.delete.await_count == 0


def test_remove_member_cannot_remove_self_403(client, mock_prisma, mock_family_space):
    current_user = _make_user(idx=8, id=_VALID_CUID)
    current_user.memberships = [SimpleNamespace(role="owner", familySpaceId=mock_family_space.id, familySpace=mock_family_space)]
    mock_prisma.user.find_unique = AsyncMock(return_value=current_user)
    membership = _setup_membership(mock_family_space, role="member", user_id=_VALID_CUID)
    mock_prisma.familymembership.find_first = AsyncMock(return_value=membership)
    mock_prisma.familymembership.delete = AsyncMock()
    headers = {"Cookie": f"{settings.cookie_name}=" + sign_token({"userId": _VALID_CUID, "familySpaceId": mock_family_space.id, "role": "owner"})}

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=headers)

    assert response.status_code == 403
    assert mock_prisma.familymembership.delete.await_count == 0


def test_remove_member_not_found_404(client, mock_prisma, admin_auth, mock_admin_user, mock_family_space):
    _set_current_user(mock_prisma, mock_admin_user, mock_family_space, "admin")
    mock_prisma.familymembership.find_first = AsyncMock(return_value=None)

    response = client.delete(f"/family/members/{_VALID_CUID}", headers=admin_auth)

    assert response.status_code == 404


def test_remove_member_invalid_id_404(client, mock_prisma, admin_auth):
    mock_prisma.familymembership.find_first = AsyncMock()

    response = client.delete("/family/members/not-a-cuid", headers=admin_auth)

    assert response.status_code == 404
    assert mock_prisma.familymembership.find_first.await_count == 0


def test_remove_member_requires_auth(client):
    response = client.delete(f"/family/members/{_VALID_CUID}")

    assert response.status_code == 401
