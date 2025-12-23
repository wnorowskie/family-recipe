import pytest

from recipe_url_importer.config import Settings
from recipe_url_importer.exceptions import BlockedHostError, InvalidUrlError
from recipe_url_importer.security.url_validation import validate_url_target


def test_rejects_private_and_blocked_hosts():
    settings = Settings()
    with pytest.raises(BlockedHostError):
        validate_url_target("http://127.0.0.1", settings)
    with pytest.raises(BlockedHostError):
        validate_url_target("http://169.254.169.254", settings)
    with pytest.raises(InvalidUrlError):
        validate_url_target("ftp://example.com/resource", settings)


def test_allows_public_ip():
    settings = Settings()
    url = validate_url_target("http://8.8.8.8", settings)
    assert url.startswith("http://8.8.8.8")
