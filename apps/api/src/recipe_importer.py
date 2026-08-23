"""HTTP client for the standalone recipe-url-importer service (issue #185).

Mirrors `src/lib/recipeImporter.ts` on the Next side:

- Reads `RECIPE_IMPORTER_URL` / `RECIPE_IMPORTER_AUDIENCE` /
  `RECIPE_IMPORTER_SERVICE_ACCOUNT_EMAIL` from settings.
- Mints a Google-issued ID token from the GCE metadata server (the
  importer's Cloud Run service requires OIDC invoker auth — see
  apps/recipe-url-importer/SPEC.md §2.10 "Auth").
- Posts `{ "url": <url> }` to `<base>/v1/parse` and returns the parsed
  importer response as a plain dict.

The dict-not-pydantic return is deliberate: this module is a thin
proxy. Re-shaping the response into a Pydantic model would either
constrain the wire contract to a frozen point-in-time view (defeating
the "additive importer fields show through to the SPA" property) or
require us to mirror every importer field change in two places. The
Next-side client uses the same shape-passthrough strategy for the same
reason; see src/lib/recipeImporter.ts ImporterResponse zod.

`ImporterRequestError` carries the upstream status + payload so the
route handler can translate them — the importer's 408 / 502 / etc.
each map to a distinct error envelope, and burning that information
inside a generic 500 would force the SPA to retry without context.
"""
from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import quote

import httpx

from .settings import settings

logger = logging.getLogger(__name__)

# GCE metadata server endpoint for service-account identity tokens.
# Documented at https://cloud.google.com/run/docs/securing/service-identity
_METADATA_BASE = "http://metadata.google.internal/computeMetadata/v1"


class ImporterConfigError(RuntimeError):
    """Raised when `RECIPE_IMPORTER_URL` is unset.

    Distinct from `ImporterRequestError` so the handler can translate
    misconfiguration into 503 SERVICE_UNAVAILABLE rather than a 5xx
    from the importer — a missing env var is operator error, not a
    transient upstream failure.
    """


class ImporterRequestError(Exception):
    """Non-2xx response from the importer service.

    `status` is the upstream HTTP status (200..599); the route handler
    maps it onto the FastAPI error envelope. `payload` is the raw
    response body (parsed JSON when available, else None) so callers
    can surface importer-specific warnings/codes if useful for debug.
    """

    def __init__(self, message: str, status: int, payload: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.payload = payload


class ImporterTimeoutError(Exception):
    """The httpx call exceeded `recipe_importer_timeout_seconds`.

    Surfaces as 504 GATEWAY_TIMEOUT — the upstream took too long, but
    we don't know if it succeeded or failed (no in-flight write here,
    so retries are safe).
    """


def _resolve_endpoint(base_url: str) -> str:
    """Append `/v1/parse` to the base URL exactly once.

    Mirrors the JS client: tolerate both `https://host` and
    `https://host/v1/parse` configured values so swapping the env var
    between forms is harmless.
    """
    if base_url.endswith("/v1/parse"):
        return base_url
    return f"{base_url.rstrip('/')}/v1/parse"


async def _fetch_identity_token(
    *, audience: str, service_account_email: str, client: httpx.AsyncClient
) -> str:
    """Pull a Google-issued ID token for the importer's audience.

    Single-shot fetch; no caching. The token's exp is ~1h and importer
    calls are user-driven (paste-and-click), so per-call minting is
    cheap and avoids holding stale tokens across a long-lived process.
    Caching can be added later if traffic patterns shift.
    """
    url = (
        f"{_METADATA_BASE}/instance/service-accounts/"
        f"{quote(service_account_email, safe='@.')}/identity"
        f"?audience={quote(audience, safe='')}"
    )
    response = await client.get(url, headers={"Metadata-Flavor": "Google"})
    if response.status_code != 200:
        raise RuntimeError(
            f"Identity-token fetch failed: {response.status_code} {response.reason_phrase}"
        )
    return response.text


async def import_recipe_from_url(url: str) -> dict:
    """Proxy `url` to the importer service and return its response body.

    Raises `ImporterConfigError` when the importer is unconfigured,
    `ImporterTimeoutError` on httpx-level timeout, and
    `ImporterRequestError` for any non-2xx response (carrying the
    upstream status + payload).
    """
    base = settings.recipe_importer_url
    if not base:
        raise ImporterConfigError("RECIPE_IMPORTER_URL is not configured")

    audience = settings.recipe_importer_audience or base
    sa_email = settings.recipe_importer_service_account_email
    static_token = settings.recipe_importer_static_token
    endpoint = _resolve_endpoint(base)
    timeout = settings.recipe_importer_timeout_seconds

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if static_token:
                # Local-dev / test path — the importer's auth is
                # bypassed via the same env var the Next service uses.
                # Never set in production (CI gates against it via
                # validate_settings if we decide to enforce later).
                id_token = static_token
            else:
                id_token = await _fetch_identity_token(
                    audience=audience,
                    service_account_email=sa_email,
                    client=client,
                )

            response = await client.post(
                endpoint,
                json={"url": url},
                headers={
                    "Authorization": f"Bearer {id_token}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.TimeoutException as exc:
        # httpx wraps both connect and read timeouts in TimeoutException;
        # we don't disambiguate because both map to 504 from the route
        # handler's perspective.
        raise ImporterTimeoutError(
            f"Importer request timed out after {timeout}s"
        ) from exc

    payload: Optional[Any]
    try:
        payload = response.json()
    except ValueError:
        # Importer is supposed to always reply JSON; tolerate
        # non-JSON so a misbehaving upstream still surfaces with a
        # useful status code rather than a 500 from json parse.
        payload = None

    if response.status_code >= 400:
        message = _extract_error_message(payload, response.status_code)
        raise ImporterRequestError(message, response.status_code, payload)

    if not isinstance(payload, dict):
        # 2xx with a non-object body is a contract break by the upstream.
        # Surface as a synthetic 502 BAD_GATEWAY rather than the original
        # 2xx status — "upstream sent something we can't parse" is exactly
        # what 502 means semantically. Returning the upstream 2xx here
        # would propagate as IMPORT_FAILED 200 through the route handler,
        # which is incoherent (review feedback on PR #208).
        raise ImporterRequestError(
            "Unexpected importer response shape",
            502,
            payload,
        )

    return payload


def _extract_error_message(payload: Any, status_code: int) -> str:
    """Pull the best human-readable message out of an importer error body.

    The importer's SPEC §2.2 documents a `{"error": {"code", "message"}}`
    envelope for 4xx/5xx; some legacy paths emit `{"message": ...}`
    directly. Tolerate both — and fall back to the bare status string
    when neither is present.
    """
    if isinstance(payload, dict):
        if isinstance(payload.get("error"), dict):
            msg = payload["error"].get("message")
            if isinstance(msg, str) and msg:
                return msg
        msg = payload.get("message")
        if isinstance(msg, str) and msg:
            return msg
    return f"Importer request failed with status {status_code}"
