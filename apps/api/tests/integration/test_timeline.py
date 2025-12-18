"""
Integration tests for timeline endpoint.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock


class TestTimelineEndpoint:
    """Test GET /timeline endpoint."""

    def test_timeline_unauthenticated(self, client):
        """GET /timeline without auth should return 401."""
        response = client.get("/timeline")
        
        assert response.status_code == 401

    def test_timeline_authenticated_empty(self, authenticated_client, mock_prisma):
        """GET /timeline with auth but no data should return empty items."""
        # All find_many calls return empty lists by default
        response = authenticated_client.get("/timeline")
        
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "hasMore" in data
        assert "nextOffset" in data
        assert data["items"] == []
        assert data["hasMore"] is False

    def test_timeline_pagination_params(self, authenticated_client, mock_prisma):
        """GET /timeline should accept limit and offset params."""
        response = authenticated_client.get("/timeline?limit=10&offset=5")
        
        assert response.status_code == 200

    def test_timeline_invalid_limit(self, authenticated_client):
        """GET /timeline with invalid limit should return 422."""
        response = authenticated_client.get("/timeline?limit=0")
        
        assert response.status_code == 422

    def test_timeline_invalid_offset(self, authenticated_client):
        """GET /timeline with negative offset should return 422."""
        response = authenticated_client.get("/timeline?offset=-1")
        
        assert response.status_code == 422
