"""
Unit tests for permissions module.
"""
import pytest

from src.permissions import can_delete_comment, can_edit_post, can_remove_member, is_owner_or_admin
from src.schemas.auth import UserResponse


# ---------------------------------------------------------------------------
# Fixtures for different user roles
# ---------------------------------------------------------------------------

@pytest.fixture
def member_user() -> UserResponse:
    return UserResponse(
        id="member-123",
        name="Member User",
        emailOrUsername="member@example.com",
        avatarUrl=None,
        role="member",
        familySpaceId="family-space-1",
        familySpaceName="Test Family",
    )


@pytest.fixture
def admin_user() -> UserResponse:
    return UserResponse(
        id="admin-456",
        name="Admin User",
        emailOrUsername="admin@example.com",
        avatarUrl=None,
        role="admin",
        familySpaceId="family-space-1",
        familySpaceName="Test Family",
    )


@pytest.fixture
def owner_user() -> UserResponse:
    return UserResponse(
        id="owner-789",
        name="Owner User",
        emailOrUsername="owner@example.com",
        avatarUrl=None,
        role="owner",
        familySpaceId="family-space-1",
        familySpaceName="Test Family",
    )


# ---------------------------------------------------------------------------
# Tests for is_owner_or_admin
# ---------------------------------------------------------------------------

class TestIsOwnerOrAdmin:
    def test_owner_returns_true(self, owner_user):
        assert is_owner_or_admin(owner_user) is True

    def test_admin_returns_true(self, admin_user):
        assert is_owner_or_admin(admin_user) is True

    def test_member_returns_false(self, member_user):
        assert is_owner_or_admin(member_user) is False


# ---------------------------------------------------------------------------
# Tests for can_edit_post
# ---------------------------------------------------------------------------

class TestCanEditPost:
    def test_author_can_edit_own_post(self, member_user):
        """Post author can always edit their own post."""
        assert can_edit_post(member_user, member_user.id) is True

    def test_member_cannot_edit_others_post(self, member_user):
        """Regular member cannot edit another user's post."""
        assert can_edit_post(member_user, "other-user-id") is False

    def test_admin_can_edit_any_post(self, admin_user):
        """Admin can edit any post."""
        assert can_edit_post(admin_user, "other-user-id") is True

    def test_owner_can_edit_any_post(self, owner_user):
        """Owner can edit any post."""
        assert can_edit_post(owner_user, "other-user-id") is True


# ---------------------------------------------------------------------------
# Tests for can_delete_comment
# ---------------------------------------------------------------------------

class TestCanDeleteComment:
    def test_author_can_delete_own_comment(self, member_user):
        """Comment author can delete their own comment."""
        assert can_delete_comment(member_user, member_user.id) is True

    def test_member_cannot_delete_others_comment(self, member_user):
        """Regular member cannot delete another user's comment."""
        assert can_delete_comment(member_user, "other-user-id") is False

    def test_admin_can_delete_any_comment(self, admin_user):
        """Admin can delete any comment."""
        assert can_delete_comment(admin_user, "other-user-id") is True

    def test_owner_can_delete_any_comment(self, owner_user):
        """Owner can delete any comment."""
        assert can_delete_comment(owner_user, "other-user-id") is True


# ---------------------------------------------------------------------------
# Tests for can_remove_member
# ---------------------------------------------------------------------------

class TestCanRemoveMember:
    def test_member_cannot_remove_anyone(self, member_user):
        """Regular member cannot remove any member."""
        assert can_remove_member(member_user, "other-user-id", "member") is False

    def test_admin_can_remove_member(self, admin_user):
        """Admin can remove a regular member."""
        assert can_remove_member(admin_user, "other-user-id", "member") is True

    def test_owner_can_remove_member(self, owner_user):
        """Owner can remove a regular member."""
        assert can_remove_member(owner_user, "other-user-id", "member") is True

    def test_admin_can_remove_other_admin(self, admin_user):
        """Admin can remove another admin."""
        assert can_remove_member(admin_user, "other-admin-id", "admin") is True

    def test_admin_cannot_remove_owner(self, admin_user):
        """Admin cannot remove the owner."""
        assert can_remove_member(admin_user, "owner-id", "owner") is False

    def test_owner_cannot_remove_self(self, owner_user):
        """Owner cannot remove themselves."""
        assert can_remove_member(owner_user, owner_user.id, "owner") is False

    def test_admin_cannot_remove_self(self, admin_user):
        """Admin cannot remove themselves."""
        assert can_remove_member(admin_user, admin_user.id, "admin") is False

    def test_owner_can_remove_admin(self, owner_user):
        """Owner can remove an admin."""
        assert can_remove_member(owner_user, "admin-id", "admin") is True
