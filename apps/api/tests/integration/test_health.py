"""Integration tests for the /health endpoint."""

import pytest


pytestmark = pytest.mark.usefixtures("mock_prisma")


def test_health_returns_ok(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_no_auth_required(client, monkeypatch):
    async def _fail_if_called():
        raise AssertionError("Auth dependency should not run for /health")

    monkeypatch.setattr("src.dependencies.get_current_user", _fail_if_called)

    response = client.get("/health")

    assert response.status_code == 200


def test_health_response_shape(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_v1_alias_serves_same_response_as_legacy_path(client):
    legacy = client.get("/health")
    v1 = client.get("/v1/health")

    assert legacy.status_code == v1.status_code == 200
    assert legacy.json() == v1.json()
