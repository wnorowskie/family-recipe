"""
Unit tests for security module (password hashing, JWT, cookies).
"""
import pytest
from unittest.mock import MagicMock

from src.security import (
    clear_session_cookie,
    hash_password,
    set_session_cookie,
    sign_token,
    verify_password,
    verify_token,
    COOKIE_MAX_AGE_DEFAULT,
    COOKIE_MAX_AGE_EXTENDED,
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
# Tests for JWT token signing and verification
# ---------------------------------------------------------------------------

class TestJWTTokens:
    @pytest.fixture
    def valid_payload(self):
        return {
            "userId": "user-123",
            "familySpaceId": "family-456",
            "role": "member",
        }

    def test_sign_token_returns_string(self, valid_payload):
        """sign_token should return a JWT string."""
        token = sign_token(valid_payload)
        
        assert isinstance(token, str)
        assert len(token) > 0
        # JWT has 3 parts separated by dots
        assert len(token.split(".")) == 3

    def test_sign_token_default_expiry(self, valid_payload):
        """Default token should have 7 day expiry."""
        token = sign_token(valid_payload, remember_me=False)
        decoded = verify_token(token)
        
        assert decoded is not None
        assert decoded["userId"] == valid_payload["userId"]

    def test_sign_token_extended_expiry(self, valid_payload):
        """Remember me token should have 30 day expiry."""
        token = sign_token(valid_payload, remember_me=True)
        decoded = verify_token(token)
        
        assert decoded is not None
        assert decoded["userId"] == valid_payload["userId"]

    def test_verify_token_valid(self, valid_payload):
        """verify_token should decode a valid token."""
        token = sign_token(valid_payload)
        decoded = verify_token(token)
        
        assert decoded is not None
        assert decoded["userId"] == valid_payload["userId"]
        assert decoded["familySpaceId"] == valid_payload["familySpaceId"]
        assert decoded["role"] == valid_payload["role"]

    def test_verify_token_invalid(self):
        """verify_token should return None for invalid token."""
        assert verify_token("invalid.token.here") is None

    def test_verify_token_empty(self):
        """verify_token should return None for empty token."""
        assert verify_token("") is None

    def test_verify_token_tampered(self, valid_payload):
        """verify_token should return None for tampered token."""
        token = sign_token(valid_payload)
        # Tamper with the token
        tampered = token[:-5] + "XXXXX"
        
        assert verify_token(tampered) is None


# ---------------------------------------------------------------------------
# Tests for session cookie helpers
# ---------------------------------------------------------------------------

class TestSessionCookies:
    def test_set_session_cookie_default(self):
        """set_session_cookie should set cookie with default max age."""
        mock_response = MagicMock()
        token = "test-token"
        
        set_session_cookie(mock_response, token, remember_me=False)
        
        mock_response.set_cookie.assert_called_once()
        call_kwargs = mock_response.set_cookie.call_args[1]
        
        assert call_kwargs["max_age"] == COOKIE_MAX_AGE_DEFAULT
        assert call_kwargs["httponly"] is True
        assert call_kwargs["samesite"] == "lax"
        assert call_kwargs["path"] == "/"

    def test_set_session_cookie_remember_me(self):
        """set_session_cookie with remember_me should use extended max age."""
        mock_response = MagicMock()
        token = "test-token"
        
        set_session_cookie(mock_response, token, remember_me=True)
        
        call_kwargs = mock_response.set_cookie.call_args[1]
        assert call_kwargs["max_age"] == COOKIE_MAX_AGE_EXTENDED

    def test_clear_session_cookie(self):
        """clear_session_cookie should delete the session cookie."""
        mock_response = MagicMock()
        
        clear_session_cookie(mock_response)
        
        mock_response.delete_cookie.assert_called_once()
        call_kwargs = mock_response.delete_cookie.call_args[1]
        
        assert call_kwargs["httponly"] is True
        assert call_kwargs["samesite"] == "lax"
        assert call_kwargs["path"] == "/"
