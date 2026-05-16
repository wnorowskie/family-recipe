"""Factory helpers for a mocked Prisma client used in integration tests."""

from unittest.mock import AsyncMock, MagicMock


MODEL_NAMES = [
    "user",
    "post",
    "postphoto",
    "comment",
    "reaction",
    "favorite",
    "cookedevent",
    "familyspace",
    "familymembership",
    "tag",
    "refreshtoken",
    "idempotencykey",
    "notification",
    "feedbacksubmission",
]


def _make_model_mock() -> MagicMock:
    model_mock = MagicMock()
    model_mock.find_unique = AsyncMock(return_value=None)
    model_mock.find_first = AsyncMock(return_value=None)
    model_mock.find_many = AsyncMock(return_value=[])
    model_mock.create = AsyncMock(return_value=None)
    model_mock.update = AsyncMock(return_value=None)
    model_mock.update_many = AsyncMock(return_value=None)
    model_mock.upsert = AsyncMock(return_value=None)
    model_mock.delete = AsyncMock(return_value=None)
    model_mock.delete_many = AsyncMock(return_value=None)
    model_mock.count = AsyncMock(return_value=0)
    return model_mock


def create_mock_prisma_client() -> MagicMock:
    """Create a Prisma client mock with common async methods stubbed."""
    mock = MagicMock()
    mock.connect = AsyncMock(return_value=None)
    mock.disconnect = AsyncMock(return_value=None)
    # Connection-level raw helpers used by src/idempotency.py (issue #196).
    # Defaults model the "first caller wins" path: query_first returns a
    # claim row on every call (tests that exercise the loser path override
    # this), execute_raw is a no-op affecting 1 row.
    #
    # NOTE for future test authors: this default means *every* test gets
    # a phantom "winning claim" response from query_first, even tests that
    # don't touch idempotency. If you ever write a test that needs to
    # assert `mock.query_first.assert_not_awaited()`, override this default
    # to `AsyncMock()` (no return_value) in your test setup first.
    mock.query_first = AsyncMock(return_value={"id": "test-claim-id"})
    mock.execute_raw = AsyncMock(return_value=1)
    for name in MODEL_NAMES:
        setattr(mock, name, _make_model_mock())

    class TxContext:
        def __init__(self, prisma_mock: MagicMock):
            self.post = prisma_mock.post
            self.postphoto = prisma_mock.postphoto
            self.user = prisma_mock.user
            self.familymembership = prisma_mock.familymembership
            self.refreshtoken = prisma_mock.refreshtoken
            self.execute_raw = AsyncMock(return_value=0)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):  # pragma: no cover - simple passthrough
            return False

    mock.tx = MagicMock(side_effect=lambda: TxContext(mock))
    return mock


def reset_mock_prisma(mock_prisma: MagicMock) -> None:
    """Reset all mocked methods on the Prisma client."""
    for raw_method in ("query_first", "execute_raw"):
        method = getattr(mock_prisma, raw_method, None)
        if method:
            method.reset_mock(return_value=True, side_effect=True)
    # Restore the "first caller wins" defaults so the next test starts
    # from a clean baseline rather than the previous test's overrides.
    mock_prisma.query_first.return_value = {"id": "test-claim-id"}
    mock_prisma.execute_raw.return_value = 1
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
            "update_many",
            "upsert",
            "delete",
            "delete_many",
            "count",
        ]:
            method = getattr(model_mock, method_name, None)
            if method:
                method.reset_mock(return_value=True, side_effect=True)
