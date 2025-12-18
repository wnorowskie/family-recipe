"""
Integration tests for tags endpoint.
"""
import pytest
from unittest.mock import MagicMock


class TestTagsEndpoint:
    """Test GET /tags endpoint."""

    def test_tags_unauthenticated(self, client):
        """GET /tags without auth should return 401."""
        response = client.get("/tags")
        
        assert response.status_code == 401

    def test_tags_authenticated_empty(self, authenticated_client, mock_prisma):
        """GET /tags with auth should return tags list."""
        mock_prisma.tag.find_many.return_value = []
        
        response = authenticated_client.get("/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert "tags" in data
        assert data["tags"] == []

    def test_tags_authenticated_with_data(self, authenticated_client, mock_prisma):
        """GET /tags should return tag objects."""
        mock_prisma.tag.find_many.return_value = [
            MagicMock(id="tag-1", name="italian"),
            MagicMock(id="tag-2", name="quick"),
        ]
        
        response = authenticated_client.get("/tags")
        
        assert response.status_code == 200
        data = response.json()
        assert "tags" in data
