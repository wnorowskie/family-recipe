"""Lightweight test data builders for integration tests."""

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any


def make_mock_user(**overrides: Any) -> SimpleNamespace:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    data = {
        "id": overrides.get("id", "user_test_123"),
        "name": overrides.get("name", "Test User"),
        "emailOrUsername": overrides.get("emailOrUsername", "test@example.com"),
        "passwordHash": overrides.get("passwordHash", "$2b$10$hashed"),
        "avatarUrl": overrides.get("avatarUrl", None),
        "createdAt": overrides.get("createdAt", now),
        "updatedAt": overrides.get("updatedAt", now),
        "memberships": overrides.get("memberships", []),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def make_mock_family_space(**overrides: Any) -> SimpleNamespace:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    data = {
        "id": overrides.get("id", "family_test_123"),
        "name": overrides.get("name", "Test Family"),
        "masterKeyHash": overrides.get("masterKeyHash", "$2b$10$masterkey"),
        "createdAt": overrides.get("createdAt", now),
        "updatedAt": overrides.get("updatedAt", now),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def make_mock_membership(**overrides: Any) -> SimpleNamespace:
    now = datetime(2024, 1, 1, tzinfo=timezone.utc)
    data = {
        "id": overrides.get("id", "membership_test_123"),
        "userId": overrides.get("userId", "user_test_123"),
        "familySpaceId": overrides.get("familySpaceId", "family_test_123"),
        "role": overrides.get("role", "member"),
        "joinedAt": overrides.get("joinedAt", now),
        "familySpace": overrides.get("familySpace", None),
    }
    data.update(overrides)
    return SimpleNamespace(**data)
