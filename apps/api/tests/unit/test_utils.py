"""
Unit tests for utils module.
"""
from datetime import datetime, timezone

from src.utils import is_cuid, iso


# ---------------------------------------------------------------------------
# Tests for is_cuid
# ---------------------------------------------------------------------------

class TestIsCuid:
    def test_valid_cuid(self):
        """is_cuid should return True for valid CUIDs."""
        # CUIDs are 25+ lowercase alphanumeric characters
        valid_cuids = [
            "cjld2cjxh0000qzrmn831i7rn",
            "cjld2cyuq0000t3rmniod1foy",
            "cm1234567890abcdefghijklm",
            "abcdefghijklmnopqrstuvwxy",
        ]
        for cuid in valid_cuids:
            assert is_cuid(cuid) is True, f"Expected {cuid} to be valid"

    def test_invalid_cuid_too_short(self):
        """is_cuid should return False for strings shorter than 25 chars."""
        assert is_cuid("abc123") is False
        assert is_cuid("cjld2cjxh0000qzrmn831i7r") is False  # 24 chars

    def test_invalid_cuid_uppercase(self):
        """is_cuid should return False for uppercase characters."""
        assert is_cuid("CJLD2CJXH0000QZRMN831I7RN") is False
        assert is_cuid("cjld2cjxh0000qzrmn831i7rN") is False  # mixed case

    def test_invalid_cuid_special_chars(self):
        """is_cuid should return False for special characters."""
        assert is_cuid("cjld2cjxh0000-zrmn831i7rn") is False
        assert is_cuid("cjld2cjxh0000_zrmn831i7rn") is False

    def test_invalid_cuid_empty(self):
        """is_cuid should return False for empty string."""
        assert is_cuid("") is False


# ---------------------------------------------------------------------------
# Tests for iso (datetime to ISO string)
# ---------------------------------------------------------------------------

class TestIso:
    def test_iso_with_datetime(self):
        """iso should convert datetime to ISO format string."""
        dt = datetime(2024, 12, 25, 10, 30, 45, tzinfo=timezone.utc)
        result = iso(dt)
        
        assert isinstance(result, str)
        assert "2024-12-25" in result
        assert "10:30:45" in result

    def test_iso_with_none(self):
        """iso should return None for None input."""
        assert iso(None) is None

    def test_iso_preserves_timezone(self):
        """iso should preserve timezone information."""
        dt = datetime(2024, 12, 25, 10, 30, 45, tzinfo=timezone.utc)
        result = iso(dt)
        
        # Should contain UTC indicator
        assert result is not None
        assert "+" in result or "Z" in result or "00:00" in result

    def test_iso_naive_datetime(self):
        """iso should handle naive datetime (no timezone)."""
        dt = datetime(2024, 12, 25, 10, 30, 45)
        result = iso(dt)
        
        assert isinstance(result, str)
        assert "2024-12-25" in result
