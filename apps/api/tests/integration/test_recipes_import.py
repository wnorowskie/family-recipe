"""Integration tests for POST /v1/recipes/import — issue #185.

Bearer-token (access-token) auth via dependencies_v1. The importer
network call is mocked at its import site in `src.routers.v1.recipes`
so the full FastAPI dependency chain runs without hitting GCE metadata
or the importer service.

Coverage:
- Unauthenticated → 401 (no bearer, bad bearer)
- Happy path → 200 with full ImporterResponse passthrough
- Bad URL payload → 400 VALIDATION_ERROR (HttpUrl rejection)
- Importer not configured → 503 SERVICE_UNAVAILABLE
- Importer timeout → 504 GATEWAY_TIMEOUT
- Importer 4xx (non-400) / 5xx → IMPORT_FAILED with upstream status
- Importer 400 → 400 VALIDATION_ERROR (user input fault)
- No DB write occurs (handler is a proxy, family scoping is downstream)
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src import tokens
from src.recipe_importer import (
    ImporterConfigError,
    ImporterRequestError,
    ImporterTimeoutError,
)
from tests.helpers.error_envelope import assert_error_envelope
from tests.helpers.test_data import make_mock_membership, make_mock_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bearer_headers(user_id: str, family_space_id: str, role: str = "member") -> dict:
    token = tokens.mint_access_token(
        user_id=user_id, family_space_id=family_space_id, role=role
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_user_lookup(mock_prisma, user, family_space, *, role: str = "member"):
    """Wire the bearer dep's user.find_unique to resolve our test user.

    Same pattern as test_feedback.py / test_notifications.py — the bearer
    dependency does a `user.find_unique(...include=memberships)` lookup,
    so we have to seed both the user shape and its membership row.
    """
    membership = make_mock_membership(
        userId=user.id,
        familySpaceId=family_space.id,
        role=role,
        familySpace=family_space,
    )
    user_with_membership = make_mock_user(memberships=[membership], id=user.id)
    mock_prisma.user.find_unique = AsyncMock(return_value=user_with_membership)
    return user_with_membership


def _make_importer_response(
    *,
    title: str = "Best Chili",
    confidence: float = 0.92,
    request_id: str = "req-test-123",
) -> dict:
    """Build a realistic importer response body.

    Matches the shape documented in apps/recipe-url-importer/SPEC.md
    §2.2 — the full set of fields the SPA expects to passthrough.
    """
    return {
        "request_id": request_id,
        "recipe": {
            "title": title,
            "ingredients": ["1 lb ground beef", "1 onion, diced"],
            "steps": ["Brown the beef.", "Add the onion."],
            "servings": "6",
            "total_time_minutes": 60,
            "image_url": "https://example.com/chili.jpg",
            "author": "Jane Doe",
            "source": {
                "url": "https://example.com/recipes/best-chili",
                "domain": "example.com",
                "strategy": "jsonld",
                "retrieved_at": "2025-12-23T17:10:22Z",
            },
        },
        "confidence": confidence,
        "warnings": [],
        "missing_fields": [],
    }


@pytest.fixture
def patch_importer(monkeypatch):
    """Patch the importer call at its router-side import site.

    The router does `from ...recipe_importer import import_recipe_from_url`,
    which binds the function into `src.routers.v1.recipes`'s namespace.
    Patching the original module would NOT intercept the call; patching
    the router-local binding does. Single-purpose helper to avoid the
    foot-gun of "I mocked it but the handler still called the real one".
    """

    def _install(*, return_value=None, side_effect=None) -> AsyncMock:
        mock = AsyncMock(return_value=return_value, side_effect=side_effect)
        monkeypatch.setattr(
            "src.routers.v1.recipes.import_recipe_from_url", mock
        )
        return mock

    return _install


# ---------------------------------------------------------------------------
# Auth gates
# ---------------------------------------------------------------------------


class TestAuth:
    def test_unauthenticated_returns_envelope_401(self, client):
        response = client.post(
            "/v1/recipes/import",
            json={"url": "https://example.com/recipes/best-chili"},
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")

    def test_invalid_bearer_returns_envelope_401(self, client):
        response = client.post(
            "/v1/recipes/import",
            headers={"Authorization": "Bearer not-a-jwt"},
            json={"url": "https://example.com/recipes/best-chili"},
        )
        assert_error_envelope(response, status_code=401, code="UNAUTHORIZED")


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestImportHappyPath:
    def test_returns_200_with_full_importer_response(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        importer_body = _make_importer_response()
        mock = patch_importer(return_value=importer_body)

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/best-chili"},
        )

        assert response.status_code == 200
        # Body is the importer response verbatim — passthrough, no
        # reshape. The migration-plan contract for this endpoint is "the
        # importer's RecipeDraft shape unchanged", so any field renaming
        # here would be a contract regression.
        body = response.json()
        assert body == importer_body

        # Sanity: the handler called the importer with the URL we sent.
        mock.assert_awaited_once()
        ((called_url,), _kwargs) = mock.call_args
        assert called_url == "https://example.com/recipes/best-chili"

    def test_no_db_write_occurs(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        """Handler is a proxy — no Post/RecipeDetails/Recipe rows are
        created on the import call itself. Family-scoped persistence
        happens downstream when the SPA submits the prefilled form to
        POST /v1/posts.
        """
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(return_value=_make_importer_response())

        client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/best-chili"},
        )

        # The single user.find_unique from the auth dep is allowed; no
        # other model should have been touched.
        assert mock_prisma.post.create.call_count == 0
        assert mock_prisma.post.find_first.call_count == 0
        assert mock_prisma.post.find_many.call_count == 0


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


class TestInputValidation:
    def test_missing_url_returns_400(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock = patch_importer(return_value={})

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={},
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")
        mock.assert_not_awaited()  # never hit the importer

    def test_invalid_url_returns_400(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock = patch_importer(return_value={})

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "not-a-url"},
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")
        mock.assert_not_awaited()

    def test_non_http_scheme_returns_400(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        """HttpUrl rejects schemes outside http(s). The importer service
        has its own SSRF check, but rejecting here saves a network call
        and matches the Next-side z.string().url() behaviour."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        mock = patch_importer(return_value={})

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "file:///etc/passwd"},
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")
        mock.assert_not_awaited()


# ---------------------------------------------------------------------------
# Upstream / configuration failures
# ---------------------------------------------------------------------------


class TestUpstreamFailures:
    def test_unconfigured_returns_503(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(
            side_effect=ImporterConfigError("RECIPE_IMPORTER_URL is not configured")
        )

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/best-chili"},
        )
        assert_error_envelope(
            response, status_code=503, code="SERVICE_UNAVAILABLE"
        )

    def test_timeout_returns_504(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(
            side_effect=ImporterTimeoutError("Importer request timed out after 12.0s")
        )

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/best-chili"},
        )
        assert_error_envelope(response, status_code=504, code="GATEWAY_TIMEOUT")

    def test_upstream_400_becomes_validation_error(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        """Importer 400 (INVALID_URL / BLOCKED_HOST) is user-input fault;
        re-emit as 400 VALIDATION_ERROR so the SPA's standard error
        handling applies."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(
            side_effect=ImporterRequestError(
                "Blocked host: metadata.google.internal",
                400,
                {"error": {"code": "BLOCKED_HOST"}},
            )
        )

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/best-chili"},
        )
        assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")

    def test_upstream_502_becomes_import_failed(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        """Upstream non-400 4xx/5xx surfaces as IMPORT_FAILED at the
        importer's status — 502 from fetch failure flows through as 502."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(
            side_effect=ImporterRequestError(
                "Upstream fetch failed",
                502,
                {"error": {"code": "UPSTREAM_FETCH_FAILED"}},
            )
        )

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/best-chili"},
        )
        assert_error_envelope(response, status_code=502, code="IMPORT_FAILED")

    def test_upstream_2xx_shape_violation_surfaces_as_502(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        """The client maps a 2xx-with-non-dict-body to a synthetic 502
        (see recipe_importer.py rationale). The route then re-emits it
        as IMPORT_FAILED at 502 — not the upstream's original 200 status
        which would produce an incoherent `IMPORT_FAILED 200`."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(
            side_effect=ImporterRequestError(
                "Unexpected importer response shape",
                502,
                ["garbage", "array"],
            )
        )

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://example.com/recipes/x"},
        )
        assert_error_envelope(response, status_code=502, code="IMPORT_FAILED")

    def test_upstream_408_passes_through_as_import_failed(
        self, client, mock_prisma, mock_user, mock_family_space, patch_importer
    ):
        """Importer's own 408 FETCH_TIMEOUT (HTTP-level timeout against
        the target site, distinct from our overall budget timeout) goes
        through as IMPORT_FAILED 408 — distinguishable in logs from our
        own 504."""
        _seed_user_lookup(mock_prisma, mock_user, mock_family_space)
        patch_importer(
            side_effect=ImporterRequestError("Target site timed out", 408, None)
        )

        response = client.post(
            "/v1/recipes/import",
            headers=_bearer_headers(mock_user.id, mock_family_space.id),
            json={"url": "https://slow.example.com/recipes/x"},
        )
        assert_error_envelope(response, status_code=408, code="IMPORT_FAILED")
