"""
Integration tests for auth endpoints.

These tests use the FastAPI TestClient with mocked database.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock


class TestHealthEndpoint:
    """Test the health check endpoint (no auth required)."""

    def test_health_returns_ok(self, client):
        """GET /health should return status ok."""
        response = client.get("/health")
        
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestAuthMe:
    """Test GET /auth/me endpoint."""

    def test_me_unauthenticated(self, client):
        """GET /auth/me without auth should return 401."""
        response = client.get("/auth/me")
        
        assert response.status_code == 401

    def test_me_authenticated(self, authenticated_client, test_user):
        """GET /auth/me with auth should return user info."""
        response = authenticated_client.get("/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert data["user"]["id"] == test_user.id
        assert data["user"]["name"] == test_user.name


class TestAuthLogout:
    """Test POST /auth/logout endpoint."""

    def test_logout_unauthenticated(self, client):
        """POST /auth/logout without auth should return 401."""
        response = client.post("/auth/logout")
        
        assert response.status_code == 401

    def test_logout_authenticated(self, authenticated_client):
        """POST /auth/logout with auth should succeed and clear cookie."""
        response = authenticated_client.post("/auth/logout")
        
        assert response.status_code == 200
        assert response.json()["message"] == "Logged out successfully"


# Note: Login and Signup tests require more complex DB mocking
# and are better suited for a test database setup.
# Below is a skeleton for when that's ready:

class TestAuthSignup:
    """Test POST /auth/signup endpoint."""

    @pytest.mark.skip(reason="Requires DB mock setup")
    def test_signup_success(self, client, mock_prisma, valid_signup_payload):
        """POST /auth/signup with valid data should create user."""
        # Setup mock returns
        mock_prisma.user.find_unique.return_value = None  # No existing user
        mock_prisma.familyspace.find_first.return_value = MagicMock(
            id="family-123",
            name="Test Family",
            masterKeyHash="$2b$10$...",  # bcrypt hash of familyMasterKey
        )
        mock_prisma.familymembership.count.return_value = 0  # First member = owner
        
        response = client.post("/auth/signup", json=valid_signup_payload)
        
        assert response.status_code == 201
        assert "user" in response.json()

    def test_signup_invalid_payload(self, client):
        """POST /auth/signup with invalid data should return 422."""
        response = client.post("/auth/signup", json={
            "name": "",  # Invalid: empty
            "emailOrUsername": "ab",  # Invalid: too short
            "password": "123",  # Invalid: too short
            "familyMasterKey": "key",  # Invalid: too short
        })
        
        assert response.status_code == 422


class TestAuthLogin:
    """Test POST /auth/login endpoint."""

    @pytest.mark.skip(reason="Requires DB mock setup")
    def test_login_success(self, client, mock_prisma, valid_login_payload):
        """POST /auth/login with valid credentials should return user."""
        # Would need to set up mock user with hashed password
        pass

    def test_login_invalid_payload(self, client):
        """POST /auth/login with invalid data should return 422."""
        response = client.post("/auth/login", json={
            "emailOrUsername": "ab",  # Invalid: too short
            "password": "123",  # Invalid: too short
        })
        
        assert response.status_code == 422
