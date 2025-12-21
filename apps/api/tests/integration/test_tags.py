"""Integration tests for the tags router."""

from unittest.mock import AsyncMock

import pytest


pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")


def _make_tag(idx: int = 1, **overrides):
    data = {
        "id": overrides.get("id", f"tag-{idx}"),
        "name": overrides.get("name", f"Tag {idx}"),
    }
    data.update(overrides)
    return data


def test_list_tags_success(client, mock_prisma, member_auth):
    tags = [_make_tag(name="Breakfast"), _make_tag(idx=2, name="Dinner")]
    mock_prisma.tag.find_many = AsyncMock(return_value=tags)

    response = client.get("/tags", headers=member_auth)

    assert response.status_code == 200
    assert response.json() == {"tags": tags}


def test_list_tags_sorted_alphabetically(client, mock_prisma, member_auth):
    tags = [_make_tag(idx=1, name="Appetizer"), _make_tag(idx=2, name="Zesty")]
    mock_prisma.tag.find_many = AsyncMock(return_value=tags)

    response = client.get("/tags", headers=member_auth)

    assert response.status_code == 200
    assert mock_prisma.tag.find_many.await_args.kwargs["order"] == {"name": "asc"}


def test_list_tags_empty(client, mock_prisma, member_auth):
    mock_prisma.tag.find_many = AsyncMock(return_value=[])

    response = client.get("/tags", headers=member_auth)

    assert response.status_code == 200
    assert response.json() == {"tags": []}


def test_list_tags_requires_auth(client):
    response = client.get("/tags")

    assert response.status_code == 401
