"""Unit tests for validate_settings() — the prod-only fail-fast guard."""
import pytest

from src.settings import Settings, validate_settings


def _prod_settings(**overrides) -> Settings:
    """Build a Settings instance with valid prod defaults; override per-test."""
    base: dict[str, object] = {
        "environment": "production",
        "database_url": "postgresql://user:pass@host/db",
        "jwt_secret": "x" * 32,
        "refresh_pepper": "y" * 32,
        "refresh_cookie_samesite": "lax",
    }
    base.update(overrides)
    return Settings(**base)


class TestValidateSettings:
    def test_dev_environment_skips_validation(self):
        """Outside production, validate_settings is a no-op even with bad values."""
        s = Settings(
            environment="development",
            database_url="postgresql://x/y",
            jwt_secret="short",
            refresh_pepper=None,
            refresh_cookie_samesite="none",
        )
        validate_settings(s)  # must not raise

    def test_valid_prod_config_passes(self):
        validate_settings(_prod_settings())

    def test_strict_samesite_is_accepted_in_prod(self):
        validate_settings(_prod_settings(refresh_cookie_samesite="strict"))

    def test_missing_refresh_pepper_fails_in_prod(self):
        s = _prod_settings(refresh_pepper=None)
        with pytest.raises(RuntimeError, match="REFRESH_PEPPER must be set"):
            validate_settings(s)

    def test_short_refresh_pepper_fails_in_prod(self):
        s = _prod_settings(refresh_pepper="short")
        with pytest.raises(RuntimeError, match="REFRESH_PEPPER must be at least 32"):
            validate_settings(s)

    def test_short_jwt_secret_fails_in_prod(self):
        s = _prod_settings(jwt_secret="short")
        with pytest.raises(RuntimeError, match="JWT_SECRET must be at least 32"):
            validate_settings(s)

    def test_samesite_none_rejected_in_prod(self):
        s = _prod_settings(refresh_cookie_samesite="none")
        with pytest.raises(RuntimeError, match="REFRESH_COOKIE_SAMESITE"):
            validate_settings(s)

    def test_invalid_samesite_value_rejected_in_prod(self):
        s = _prod_settings(refresh_cookie_samesite="bogus")
        with pytest.raises(RuntimeError, match="REFRESH_COOKIE_SAMESITE"):
            validate_settings(s)

    def test_invalid_signing_keys_json_rejected_in_prod(self):
        s = _prod_settings(access_token_signing_keys="{not valid json")
        with pytest.raises(RuntimeError, match="ACCESS_TOKEN_SIGNING_KEYS"):
            validate_settings(s)

    def test_signing_keys_missing_active_kid_rejected_in_prod(self):
        s = _prod_settings(
            access_token_signing_keys='{"v2": "secret-value"}',
            access_token_active_kid="v1",
        )
        with pytest.raises(RuntimeError, match="ACCESS_TOKEN_SIGNING_KEYS"):
            validate_settings(s)

    def test_valid_signing_keys_with_active_kid_passes(self):
        validate_settings(
            _prod_settings(
                access_token_signing_keys='{"v1": "active-key", "v2": "rotation"}',
                access_token_active_kid="v1",
            )
        )

    def test_all_problems_reported_together(self):
        """A misconfig with multiple issues surfaces them all in one error."""
        s = _prod_settings(
            refresh_pepper=None,
            jwt_secret="short",
            refresh_cookie_samesite="none",
        )
        with pytest.raises(RuntimeError) as exc_info:
            validate_settings(s)
        msg = str(exc_info.value)
        assert "REFRESH_PEPPER" in msg
        assert "JWT_SECRET" in msg
        assert "REFRESH_COOKIE_SAMESITE" in msg


class TestEffectiveRefreshPepper:
    def test_uses_pepper_when_set(self):
        s = Settings(
            environment="production",
            database_url="postgresql://x/y",
            jwt_secret="x" * 32,
            refresh_pepper="explicit-pepper-value",
        )
        assert s.effective_refresh_pepper == "explicit-pepper-value"

    def test_falls_back_to_jwt_secret_in_dev(self):
        """In dev, missing pepper silently falls back to jwt_secret (no ceremony)."""
        s = Settings(
            environment="development",
            database_url="postgresql://x/y",
            jwt_secret="dev-secret",
            refresh_pepper=None,
        )
        assert s.effective_refresh_pepper == "dev-secret"

    def test_raises_in_prod_when_pepper_missing(self):
        """Defense-in-depth: even if validate_settings() is bypassed, prod fails loud."""
        s = Settings(
            environment="production",
            database_url="postgresql://x/y",
            jwt_secret="x" * 32,
            refresh_pepper=None,
        )
        with pytest.raises(RuntimeError, match="REFRESH_PEPPER must be set"):
            _ = s.effective_refresh_pepper
