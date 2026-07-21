import json
import os
from typing import Optional

from pydantic import Field, field_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    jwt_secret: str = Field(default_factory=lambda: os.getenv("JWT_SECRET", ""))
    family_name: Optional[str] = None
    family_master_key: Optional[str] = None
    uploads_bucket: Optional[str] = None
    uploads_signed_url_ttl_seconds: int = 3600
    cookie_name: str = "session"
    environment: str = "development"

    # ----- v1 token-auth (issue #35) -----
    # JSON map of kid -> secret. Allows overlap-window key rotation.
    # If unset, falls back to {"v1": jwt_secret} so dev works out of the box.
    access_token_signing_keys: Optional[str] = None
    access_token_active_kid: str = "v1"
    access_token_ttl_seconds: int = 15 * 60  # 15 minutes
    refresh_token_ttl_default_seconds: int = 7 * 24 * 60 * 60   # 7 days
    refresh_token_ttl_remember_seconds: int = 30 * 24 * 60 * 60  # 30 days

    # HMAC pepper for refresh-token hashes; required in production.
    refresh_pepper: Optional[str] = None

    # Monotonic epoch used to invalidate every live access token at once
    # (e.g. on signing-key compromise). Bumping it forces a refresh-rotation.
    auth_epoch: int = 1

    # Master switch for the IP-keyed auth-surface rate limiters (issue #175:
    # login/signup/reset). On by default. Set AUTH_RATE_LIMIT_ENABLED=false for
    # the E2E suite, which logs in many times from a single IP and would
    # otherwise trip login_limiter (5/15min). This is the FastAPI parity for the
    # Next side globally mocking src/lib/rateLimit.ts in jest.setup.js — the
    # limiter's own behavior is covered by tests/unit/test_rate_limit.py, so the
    # functional E2E flows have no business being throttled. Never set false in
    # production.
    auth_rate_limit_enabled: bool = True

    # CORS origins for the v1 token flow (comma-separated). The legacy
    # session-cookie endpoints stay same-origin.
    cors_allow_origins: str = ""

    # Number of trusted reverse proxies in front of this service that append to
    # X-Forwarded-For. The real client IP is the `trusted_proxy_hops`-th entry
    # from the RIGHT of the chain; everything further left is client-supplied
    # and MUST NOT be trusted (issue #246 — the first entry is spoofable).
    #   0 = no proxy (local/dev): ignore XFF entirely, use the direct TCP peer.
    #   2 = deployed topology: browser → GFE(Next) → Next proxy → GFE(FastAPI),
    #       where the two Google front-ends append the trailing two entries.
    # Configurable via TRUSTED_PROXY_HOPS so the count can be corrected from the
    # #241 dev E2E observation without a code change. Defaults to 0 so a fresh
    # clone / test run never trusts a forwarded header it has no proxy to back.
    trusted_proxy_hops: int = 0

    # Refresh cookie attributes; production overrides via env.
    refresh_cookie_name: str = "refresh_token"
    csrf_cookie_name: str = "csrf_token"
    refresh_cookie_domain: Optional[str] = None
    refresh_cookie_samesite: str = "lax"  # 'lax' | 'strict' | 'none'

    # Token audience claim — clients should verify match.
    jwt_audience: str = "family-recipe-app"

    # ----- Recipe URL importer (issue #185) -----
    # Mirrors the Next-side env vars in src/lib/recipeImporter.ts so the
    # FastAPI service can target the same Cloud Run instance during Phase
    # 4 cutover. All optional — when `recipe_importer_url` is unset the
    # /v1/recipes/import handler returns 503 SERVICE_UNAVAILABLE rather
    # than 500, so misconfiguration surfaces clearly in dev.
    recipe_importer_url: Optional[str] = None
    recipe_importer_audience: Optional[str] = None  # defaults to URL
    recipe_importer_service_account_email: str = "default"
    # Test/dev escape hatch — pre-minted bearer for the importer call
    # path. When set, skips the GCE metadata-server identity-token fetch.
    recipe_importer_static_token: Optional[str] = None
    # Total budget for the importer call. The importer's own SPEC caps at
    # ~10s including headless; pad it slightly so we surface 504 GATEWAY_TIMEOUT
    # only when the upstream definitively missed the deadline.
    recipe_importer_timeout_seconds: float = 12.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url", "jwt_secret")
    @classmethod
    def _require_non_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("Missing required environment configuration")
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def signing_keys(self) -> dict[str, str]:
        """Map of kid -> signing secret. Used for access-token rotation overlap."""
        if self.access_token_signing_keys:
            try:
                parsed = json.loads(self.access_token_signing_keys)
                if not isinstance(parsed, dict) or not parsed:
                    raise ValueError("ACCESS_TOKEN_SIGNING_KEYS must be a non-empty JSON object")
                if self.access_token_active_kid not in parsed:
                    raise ValueError(
                        f"ACCESS_TOKEN_ACTIVE_KID '{self.access_token_active_kid}' "
                        "is not present in ACCESS_TOKEN_SIGNING_KEYS"
                    )
                return {str(k): str(v) for k, v in parsed.items()}
            except json.JSONDecodeError as exc:
                raise ValueError("ACCESS_TOKEN_SIGNING_KEYS must be valid JSON") from exc
        return {self.access_token_active_kid: self.jwt_secret}

    @property
    def effective_refresh_pepper(self) -> str:
        """Required pepper; falls back to jwt_secret in non-production.

        validate_settings() enforces this at startup in production, but we
        keep a local raise too: defense-in-depth for code paths that construct
        Settings outside the lifespan (tests, scripts, future entrypoints).
        """
        if self.refresh_pepper:
            return self.refresh_pepper
        if self.is_production:
            raise RuntimeError("REFRESH_PEPPER must be set in production")
        return self.jwt_secret

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


# Minimum entropy for HMAC secrets in production. 32 bytes ≈ 256 bits, the
# standard floor for HMAC-SHA256 keying material.
_MIN_PROD_SECRET_LEN = 32


def validate_settings(s: Settings) -> None:
    """Fail-fast validation called from main.py's lifespan in production.

    Raises RuntimeError with all problems concatenated so a misconfigured
    deploy surfaces every issue at once instead of fixing them one at a time.
    No-op outside production — dev runs intentionally tolerate weak/missing
    values so a fresh clone works without ceremony.
    """
    if not s.is_production:
        return

    problems: list[str] = []

    if not s.refresh_pepper:
        problems.append("REFRESH_PEPPER must be set in production")
    elif len(s.refresh_pepper) < _MIN_PROD_SECRET_LEN:
        problems.append(
            f"REFRESH_PEPPER must be at least {_MIN_PROD_SECRET_LEN} characters in production"
        )

    if len(s.jwt_secret) < _MIN_PROD_SECRET_LEN:
        problems.append(
            f"JWT_SECRET must be at least {_MIN_PROD_SECRET_LEN} characters in production"
        )

    samesite = s.refresh_cookie_samesite.lower()
    if samesite not in ("lax", "strict"):
        # SameSite=None requires a documented cross-site need. Frontend and
        # API are same-origin in prod, so this is almost certainly a misconfig.
        problems.append(
            "REFRESH_COOKIE_SAMESITE must be 'lax' or 'strict' in production "
            f"(got {s.refresh_cookie_samesite!r})"
        )

    if s.access_token_signing_keys:
        try:
            _ = s.signing_keys
        except ValueError as exc:
            problems.append(f"ACCESS_TOKEN_SIGNING_KEYS invalid: {exc}")

    if problems:
        raise RuntimeError(
            "Invalid production configuration:\n  - " + "\n  - ".join(problems)
        )


settings = Settings()
