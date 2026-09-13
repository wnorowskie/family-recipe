"""
Unit tests for security module (password hashing, session cookie clearing).
"""
from unittest.mock import MagicMock

from src.security import (
    clear_session_cookie,
    hash_password,
    verify_password,
)


# ---------------------------------------------------------------------------
# Tests for password hashing
# ---------------------------------------------------------------------------

class TestPasswordHashing:
    def test_hash_password_returns_string(self):
        """hash_password should return a bcrypt hash string."""
        password = "securepassword123"
        hashed = hash_password(password)

        assert isinstance(hashed, str)
        assert hashed != password
        assert hashed.startswith("$2b$")  # bcrypt prefix

    def test_hash_password_produces_different_hashes(self):
        """Same password should produce different hashes (due to salt)."""
        password = "securepassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2

    def test_verify_password_correct(self):
        """verify_password should return True for correct password."""
        password = "securepassword123"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """verify_password should return False for wrong password."""
        password = "securepassword123"
        hashed = hash_password(password)

        assert verify_password("wrongpassword", hashed) is False

    def test_verify_password_invalid_hash(self):
        """verify_password should return False for invalid hash."""
        assert verify_password("password", "invalid-hash") is False

    def test_verify_password_empty_hash(self):
        """verify_password should return False for empty hash."""
        assert verify_password("password", "") is False


# ---------------------------------------------------------------------------
# Tests for session cookie helpers
# ---------------------------------------------------------------------------

class TestSessionCookies:
    def test_clear_session_cookie(self):
        """clear_session_cookie should delete the session cookie."""
        mock_response = MagicMock()

        clear_session_cookie(mock_response)

        mock_response.delete_cookie.assert_called_once()
        call_kwargs = mock_response.delete_cookie.call_args[1]

        assert call_kwargs["httponly"] is True
        assert call_kwargs["samesite"] == "lax"
        assert call_kwargs["path"] == "/"
