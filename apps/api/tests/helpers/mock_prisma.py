"""Factory helpers for a mocked Prisma client used in integration tests."""

from unittest.mock import AsyncMock, MagicMock


MODEL_NAMES = [
    "user",
    "post",
    "comment",
    "reaction",
    "favorite",
    "cookedevent",
    "familyspace",
    "familymembership",
    "tag",
]


def _make_model_mock() -> MagicMock:
    model_mock = MagicMock()
    model_mock.find_unique = AsyncMock(return_value=None)
    model_mock.find_first = AsyncMock(return_value=None)
    model_mock.find_many = AsyncMock(return_value=[])
    model_mock.create = AsyncMock(return_value=None)
    model_mock.update = AsyncMock(return_value=None)
    model_mock.delete = AsyncMock(return_value=None)
    model_mock.delete_many = AsyncMock(return_value=None)
    model_mock.count = AsyncMock(return_value=0)
    return model_mock


def create_mock_prisma_client() -> MagicMock:
    """Create a Prisma client mock with common async methods stubbed."""
    mock = MagicMock()
    for name in MODEL_NAMES:
        setattr(mock, name, _make_model_mock())
    return mock


def reset_mock_prisma(mock_prisma: MagicMock) -> None:
    """Reset all mocked methods on the Prisma client."""
    for name in MODEL_NAMES:
        model_mock = getattr(mock_prisma, name, None)
        if not model_mock:
            continue
        for method_name in [
            "find_unique",
            "find_first",
            "find_many",
            "create",
            "update",
            "delete",
            "delete_many",
            "count",
        ]:
            method = getattr(model_mock, method_name, None)
            if method:
                method.reset_mock(return_value=True, side_effect=True)
