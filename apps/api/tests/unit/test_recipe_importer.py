"""Unit tests for src/recipe_importer.py — issue #185.

The integration tests in tests/integration/test_recipes_import.py mock
the client at the router boundary; these tests exercise the client
internals directly. Specifically:

- `_resolve_endpoint` URL normalisation (idempotent vs. naive append)
- Identity-token path: GCE metadata-server fetch + Authorization header
- Static-token path: skips metadata fetch, sends configured token verbatim
- Misconfigured `RECIPE_IMPORTER_URL` raises ImporterConfigError
- httpx TimeoutException → ImporterTimeoutError
- Non-2xx response → ImporterRequestError carrying upstream status/payload
- 2xx non-dict body → ImporterRequestError (contract guard)
- `_extract_error_message` precedence (error.message > message > status fallback)
"""
from __future__ import annotations

import httpx
import pytest

from src import recipe_importer
from src.recipe_importer import (
    ImporterConfigError,
    ImporterRequestError,
    ImporterTimeoutError,
    _extract_error_message,
    _resolve_endpoint,
    import_recipe_from_url,
)


# ---------------------------------------------------------------------------
# _resolve_endpoint
# ---------------------------------------------------------------------------


class TestResolveEndpoint:
    def test_appends_v1_parse_to_bare_host(self):
        assert _resolve_endpoint("https://importer.example.com") == (
            "https://importer.example.com/v1/parse"
        )

    def test_strips_trailing_slash_before_appending(self):
        assert _resolve_endpoint("https://importer.example.com/") == (
            "https://importer.example.com/v1/parse"
        )

    def test_idempotent_when_already_includes_v1_parse(self):
        # The env-var-as-full-endpoint form is the alternate shape the
        # JS client tolerates; mirror that here so swapping the env
        # between forms doesn't break the call.
        url = "https://importer.example.com/v1/parse"
        assert _resolve_endpoint(url) == url


# ---------------------------------------------------------------------------
# _extract_error_message — error-shape variations from the importer
# ---------------------------------------------------------------------------


class TestExtractErrorMessage:
    def test_envelope_error_message_wins(self):
        msg = _extract_error_message(
            {"error": {"code": "BLOCKED_HOST", "message": "Blocked"}}, 400
        )
        assert msg == "Blocked"

    def test_legacy_top_level_message_used_when_no_envelope(self):
        # Older importer paths emit `{"message": "..."}` without the
        # nested envelope. The client tolerates both.
        assert _extract_error_message({"message": "Fetch failed"}, 502) == (
            "Fetch failed"
        )

    def test_falls_back_to_status_when_no_message_present(self):
        assert _extract_error_message({}, 500) == (
            "Importer request failed with status 500"
        )

    def test_falls_back_when_payload_is_not_a_dict(self):
        # Non-JSON / scalar bodies don't carry a message field; we still
        # produce a useful string for logging.
        assert _extract_error_message("garbage", 500) == (
            "Importer request failed with status 500"
        )

    def test_empty_string_message_falls_back(self):
        # An empty message is useless — skip it rather than surface a
        # blank message to the SPA.
        assert _extract_error_message(
            {"error": {"message": ""}}, 502
        ) == "Importer request failed with status 502"


# ---------------------------------------------------------------------------
# import_recipe_from_url — configuration gate
# ---------------------------------------------------------------------------


class TestConfiguration:
    @pytest.mark.asyncio
    async def test_raises_when_url_unconfigured(self, monkeypatch):
        monkeypatch.setattr(recipe_importer.settings, "recipe_importer_url", None)
        with pytest.raises(ImporterConfigError):
            await import_recipe_from_url("https://example.com/recipe")


# ---------------------------------------------------------------------------
# import_recipe_from_url — HTTP I/O paths
# ---------------------------------------------------------------------------


def _stub_transport(handler):
    """Build an httpx MockTransport that delegates to `handler(request)`.

    `handler` is a sync callable that returns an `httpx.Response`. The
    transport monkeypatch below substitutes this for `httpx.AsyncClient`'s
    default transport so no real network is required.
    """
    return httpx.MockTransport(handler)


@pytest.fixture
def configure_importer(monkeypatch):
    """Set the required env vars to non-empty values for each test."""
    monkeypatch.setattr(
        recipe_importer.settings,
        "recipe_importer_url",
        "https://importer.example.com",
    )
    monkeypatch.setattr(
        recipe_importer.settings, "recipe_importer_audience", None
    )
    monkeypatch.setattr(
        recipe_importer.settings,
        "recipe_importer_service_account_email",
        "runner@proj.iam.gserviceaccount.com",
    )
    monkeypatch.setattr(
        recipe_importer.settings, "recipe_importer_static_token", None
    )
    monkeypatch.setattr(
        recipe_importer.settings, "recipe_importer_timeout_seconds", 5.0
    )


@pytest.fixture
def install_transport(monkeypatch):
    """Replace httpx.AsyncClient's default transport with a MockTransport.

    Wraps the real `__init__` so we still honour the `timeout=` kwarg
    the client passes — that argument has to round-trip cleanly because
    our `ImporterTimeoutError` test relies on the timeout being read.
    """
    original_init = httpx.AsyncClient.__init__

    def _install(handler):
        def patched_init(self, *args, **kwargs):
            kwargs["transport"] = _stub_transport(handler)
            return original_init(self, *args, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)

    return _install


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_static_token_skips_metadata_fetch(
        self, monkeypatch, configure_importer, install_transport
    ):
        """When a static token is configured, the metadata server is
        never queried — the configured token goes through as-is.

        This is the dev/test path; production runs without the static
        token and hits the metadata server.
        """
        monkeypatch.setattr(
            recipe_importer.settings,
            "recipe_importer_static_token",
            "dev-fake-token",
        )

        recorded: list[httpx.Request] = []
        importer_body = {
            "request_id": "req-1",
            "recipe": {"title": "X"},
            "confidence": 0.9,
            "warnings": [],
            "missing_fields": [],
        }

        def handler(request: httpx.Request) -> httpx.Response:
            recorded.append(request)
            # Test invariant: the metadata-server URL is never called.
            assert "metadata.google.internal" not in str(request.url)
            return httpx.Response(200, json=importer_body)

        install_transport(handler)

        result = await import_recipe_from_url("https://example.com/recipe")
        assert result == importer_body

        # Exactly one call: the importer POST, with the static token
        # as bearer.
        assert len(recorded) == 1
        post = recorded[0]
        assert post.method == "POST"
        assert post.url.path == "/v1/parse"
        assert post.headers["authorization"] == "Bearer dev-fake-token"
        assert post.headers["content-type"] == "application/json"

    @pytest.mark.asyncio
    async def test_metadata_token_fetched_when_no_static_token(
        self, configure_importer, install_transport
    ):
        """No static token → identity-token fetch from GCE metadata, then
        POST to the importer with that token as bearer."""

        def handler(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            if "metadata.google.internal" in url:
                # Audience must be passed through as a query param.
                assert "audience=" in url
                assert "importer.example.com" in url  # URL-encoded inside
                return httpx.Response(200, text="metadata-issued-token")
            assert request.headers["authorization"] == "Bearer metadata-issued-token"
            return httpx.Response(
                200,
                json={
                    "request_id": "req-2",
                    "recipe": {"title": "Y"},
                    "confidence": 0.9,
                    "warnings": [],
                    "missing_fields": [],
                },
            )

        install_transport(handler)

        result = await import_recipe_from_url("https://example.com/recipe")
        assert result["recipe"]["title"] == "Y"


class TestErrorPaths:
    @pytest.mark.asyncio
    async def test_timeout_raises_importer_timeout(
        self, monkeypatch, configure_importer, install_transport
    ):
        # Static token to avoid the metadata branch tripping first.
        monkeypatch.setattr(
            recipe_importer.settings, "recipe_importer_static_token", "tok"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("read timed out", request=request)

        install_transport(handler)

        with pytest.raises(ImporterTimeoutError):
            await import_recipe_from_url("https://example.com/recipe")

    @pytest.mark.asyncio
    async def test_4xx_raises_importer_request_error(
        self, monkeypatch, configure_importer, install_transport
    ):
        monkeypatch.setattr(
            recipe_importer.settings, "recipe_importer_static_token", "tok"
        )
        body = {"error": {"code": "BLOCKED_HOST", "message": "Blocked"}}

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, json=body)

        install_transport(handler)

        with pytest.raises(ImporterRequestError) as exc_info:
            await import_recipe_from_url("https://example.com/recipe")
        assert exc_info.value.status == 400
        assert exc_info.value.payload == body
        assert "Blocked" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_5xx_raises_importer_request_error(
        self, monkeypatch, configure_importer, install_transport
    ):
        monkeypatch.setattr(
            recipe_importer.settings, "recipe_importer_static_token", "tok"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            # Importer's 502 UPSTREAM_FETCH_FAILED — DNS, TLS, etc.
            return httpx.Response(
                502, json={"error": {"code": "UPSTREAM_FETCH_FAILED"}}
            )

        install_transport(handler)

        with pytest.raises(ImporterRequestError) as exc_info:
            await import_recipe_from_url("https://example.com/recipe")
        assert exc_info.value.status == 502

    @pytest.mark.asyncio
    async def test_2xx_non_object_body_raises_request_error(
        self, monkeypatch, configure_importer, install_transport
    ):
        """A 200 with a non-dict body breaks the importer contract;
        treat it as an error so garbage doesn't pass through to the SPA."""
        monkeypatch.setattr(
            recipe_importer.settings, "recipe_importer_static_token", "tok"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=["not", "an", "object"])

        install_transport(handler)

        with pytest.raises(ImporterRequestError) as exc_info:
            await import_recipe_from_url("https://example.com/recipe")
        # Status preserves the upstream 200 — the failure is shape, not status.
        assert exc_info.value.status == 200
        assert exc_info.value.payload == ["not", "an", "object"]

    @pytest.mark.asyncio
    async def test_non_json_4xx_body_still_raises_request_error(
        self, monkeypatch, configure_importer, install_transport
    ):
        """Importer sometimes returns text/html on edge errors (e.g.
        Cloud Run cold-start 502 page). We must not 500 on json parse —
        re-raise as ImporterRequestError with payload=None."""
        monkeypatch.setattr(
            recipe_importer.settings, "recipe_importer_static_token", "tok"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                502, content=b"<html>Bad Gateway</html>",
                headers={"content-type": "text/html"},
            )

        install_transport(handler)

        with pytest.raises(ImporterRequestError) as exc_info:
            await import_recipe_from_url("https://example.com/recipe")
        assert exc_info.value.status == 502
        assert exc_info.value.payload is None

    @pytest.mark.asyncio
    async def test_metadata_token_fetch_failure_surfaces_as_runtime_error(
        self, configure_importer, install_transport
    ):
        """If the metadata server itself errors (e.g. running outside GCE
        without a static token), we surface a RuntimeError — operator
        misconfig, not a transient upstream issue, and distinct from
        ImporterConfigError which is the URL-unset case."""

        def handler(request: httpx.Request) -> httpx.Response:
            if "metadata.google.internal" in str(request.url):
                return httpx.Response(404, text="not found")
            pytest.fail("importer should not be called when token fetch fails")

        install_transport(handler)

        with pytest.raises(RuntimeError, match="Identity-token fetch failed"):
            await import_recipe_from_url("https://example.com/recipe")
