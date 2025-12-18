"""
Pytest configuration and shared fixtures for the FastAPI tests.
"""
import os
import sys
import types
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

# Stub prisma import to avoid generation requirement during tests
def _make_prisma_stub():
    mock = MagicMock()
    mock.is_connected.return_value = False

    async def _connect():
        return None

    async def _disconnect():
        return None

    mock.connect = _connect
    mock.disconnect = _disconnect
    return mock


prisma_stub = types.ModuleType("prisma")
prisma_stub.Prisma = _make_prisma_stub
errors_stub = types.ModuleType("prisma.errors")
errors_stub.PrismaError = Exception
sys.modules.setdefault("prisma", prisma_stub)
sys.modules.setdefault("prisma.errors", errors_stub)

# Set test environment before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-testing-only")
os.environ.setdefault("ENVIRONMENT", "test")

from src.main import app
from src.schemas.auth import UserResponse


# ---------------------------------------------------------------------------
# Test User Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def test_user() -> UserResponse:
    """A standard test user (member role)."""
    return UserResponse(
        id="test-user-id-123",
        name="Test User",
        emailOrUsername="testuser@example.com",
        avatarUrl=None,
        role="member",
        familySpaceId="test-family-space-id",
        familySpaceName="Test Family",
    )


@pytest.fixture
def admin_user() -> UserResponse:
    """An admin test user."""
    return UserResponse(
        id="admin-user-id-456",
        name="Admin User",
        emailOrUsername="admin@example.com",
        avatarUrl=None,
        role="admin",
        familySpaceId="test-family-space-id",
        familySpaceName="Test Family",
    )


@pytest.fixture
def owner_user() -> UserResponse:
    """An owner test user."""
    return UserResponse(
        id="owner-user-id-789",
        name="Owner User",
        emailOrUsername="owner@example.com",
        avatarUrl=None,
        role="owner",
        familySpaceId="test-family-space-id",
        familySpaceName="Test Family",
    )


# ---------------------------------------------------------------------------
# Mock Database Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_prisma(mocker):
    """
    Create a mock Prisma client.
    
    Usage in tests:
        def test_something(mock_prisma):
            mock_prisma.user.find_unique.return_value = some_user
            # ... test code
    """
    mock = MagicMock()
    
    # Set up common async methods
    for model in ["user", "post", "comment", "reaction", "favorite", 
                  "cookedevent", "familyspace", "familymembership", "tag"]:
        model_mock = MagicMock()
        model_mock.find_unique = AsyncMock(return_value=None)
        model_mock.find_first = AsyncMock(return_value=None)
        model_mock.find_many = AsyncMock(return_value=[])
        model_mock.create = AsyncMock(return_value=None)
        model_mock.update = AsyncMock(return_value=None)
        model_mock.delete = AsyncMock(return_value=None)
        model_mock.delete_many = AsyncMock(return_value=None)
        model_mock.count = AsyncMock(return_value=0)
        setattr(mock, model, model_mock)
    
    # Patch the prisma instance in the db module
    mocker.patch("src.db.prisma", mock)
    
    return mock


# ---------------------------------------------------------------------------
# FastAPI Test Client Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """
    Create a test client for the FastAPI app.
    
    Note: This client does NOT mock the database.
    Use for testing routes that don't hit the DB, or combine with mock_prisma.
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def authenticated_client(client: TestClient, test_user: UserResponse, mocker) -> TestClient:
    """
    Create an authenticated test client by mocking the auth dependency.
    """
    from src.dependencies import get_current_user
    
    async def mock_get_current_user():
        return test_user
    
    app.dependency_overrides[get_current_user] = mock_get_current_user
    
    yield client
    
    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(client: TestClient, admin_user: UserResponse, mocker) -> TestClient:
    """
    Create an authenticated test client with admin privileges.
    """
    from src.dependencies import get_current_user
    
    async def mock_get_current_user():
        return admin_user
    
    app.dependency_overrides[get_current_user] = mock_get_current_user
    
    yield client
    
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def valid_signup_payload() -> dict:
    """Valid signup request payload."""
    return {
        "name": "New User",
        "emailOrUsername": "newuser@example.com",
        "password": "securepassword123",
        "familyMasterKey": "family-secret-key",
        "rememberMe": False,
    }


@pytest.fixture
def valid_login_payload() -> dict:
    """Valid login request payload."""
    return {
        "emailOrUsername": "testuser@example.com",
        "password": "password123",
        "rememberMe": False,
    }


@pytest.fixture
def valid_post_payload() -> dict:
    """Valid create post request payload."""
    return {
        "title": "Test Recipe",
        "caption": "A delicious test recipe",
        "recipe": {
            "origin": "Grandma's cookbook",
            "ingredients": [
                {"name": "flour", "unit": "cups", "quantity": 2},
                {"name": "sugar", "unit": "cups", "quantity": 1},
            ],
            "steps": [
                {"text": "Mix ingredients"},
                {"text": "Bake at 350F"},
            ],
            "totalTime": 60,
            "servings": 4,
            "course": "dessert",
            "difficulty": "easy",
            "tags": [],
        },
    }
