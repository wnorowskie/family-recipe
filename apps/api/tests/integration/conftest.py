"""Shared fixtures for integration tests.

These fixtures keep tests aligned with the integration blueprint by
providing auth cookies, mock Prisma, and common mock entities.
"""

from datetime import datetime, timezone
from typing import Dict
from unittest.mock import AsyncMock

import pytest

from src import db
from src.security import sign_token
from src.settings import settings
from tests.helpers.mock_prisma import create_mock_prisma_client, reset_mock_prisma
from tests.helpers.test_data import make_mock_family_space, make_mock_membership, make_mock_user


# ---------------------------------------------------------------------------
# Mock Prisma
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_prisma(monkeypatch):
    mock = create_mock_prisma_client()
    monkeypatch.setattr(db, "prisma", mock)
    monkeypatch.setattr("src.routers.auth.prisma", mock)
    monkeypatch.setattr("src.dependencies.prisma", mock)
    yield mock
    reset_mock_prisma(mock)


# ---------------------------------------------------------------------------
# Mock entities
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_user() -> Dict:
    return make_mock_user()


@pytest.fixture
def mock_admin_user() -> Dict:
    return make_mock_user(id="admin_123", name="Admin", emailOrUsername="admin@example.com")


@pytest.fixture
def mock_owner_user() -> Dict:
    return make_mock_user(id="owner_123", name="Owner", emailOrUsername="owner@example.com")


@pytest.fixture
def mock_family_space() -> Dict:
    return make_mock_family_space()


@pytest.fixture
def mock_membership(mock_user, mock_family_space) -> Dict:
    return make_mock_membership(
        userId=mock_user["id"],
        familySpaceId=mock_family_space["id"],
        role="member",
        familySpace=mock_family_space,
    )


# ---------------------------------------------------------------------------
# Auth cookies using real JWT signing
# ---------------------------------------------------------------------------


def _make_cookie(role: str, user_id: str, family_space_id: str, remember_me: bool = False) -> Dict[str, str]:
    token = sign_token(
        {
            "userId": user_id,
            "familySpaceId": family_space_id,
            "role": role,
        },
        remember_me=remember_me,
    )
    return {"Cookie": f"{settings.cookie_name}={token}"}


@pytest.fixture
def member_auth(mock_user, mock_family_space):
    return _make_cookie("member", mock_user["id"], mock_family_space["id"])


@pytest.fixture
def admin_auth(mock_admin_user, mock_family_space):
    return _make_cookie("admin", mock_admin_user["id"], mock_family_space["id"])


@pytest.fixture
def owner_auth(mock_owner_user, mock_family_space):
    return _make_cookie("owner", mock_owner_user["id"], mock_family_space["id"])


# ---------------------------------------------------------------------------
# Convenience: mock get_current_user via prisma lookup
# ---------------------------------------------------------------------------


@pytest.fixture
def prisma_user_with_membership(mock_prisma, mock_user, mock_membership):
    user_with_membership = {**mock_user, "memberships": [mock_membership]}
    mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)
    return user_with_membership
