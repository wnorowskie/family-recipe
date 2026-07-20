"""Integration tests for the /v1/health endpoint."""

import pytest


pytestmark = pytest.mark.usefixtures("mock_prisma")


def test_health_returns_ok(client):
    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_no_auth_required(client, monkeypatch):
    async def _fail_if_called():
        raise AssertionError("Auth dependency should not run for /v1/health")

    monkeypatch.setattr("src.dependencies.get_current_user", _fail_if_called)

    response = client.get("/v1/health")

    assert response.status_code == 200


def test_health_response_shape(client):
    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
