"""Assertion helpers for the standard `{error: {code, message}}` envelope.

Per docs/API_BACKEND_MIGRATION_PLAN.md (Common Conventions), every non-2xx
response from a `/v1` handler — and every error response from the legacy
cookie-auth surface kept alive during Phase 3 — must use this envelope.
Tests should call `assert_error_envelope` rather than poking at
`response.json()["error"]["code"]` ad-hoc; it keeps the contract assertion
in one place and produces clearer diffs on regressions.
"""
from __future__ import annotations

from typing import Any

VALID_ERROR_CODES = {
    "VALIDATION_ERROR",
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "INVALID_CREDENTIALS",
    "INVALID_TOKEN",
    "TOKEN_EXPIRED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "RATE_LIMITED",
    "INTERNAL_ERROR",
}


def assert_error_envelope(
    response: Any,
    *,
    status_code: int,
    code: str,
    message_contains: str | None = None,
) -> None:
    """Assert that `response` carries the standard error envelope.

    `response` is a `httpx.Response` (or anything with `.status_code` and
    `.json()`). `code` must be one of `VALID_ERROR_CODES`. `message_contains`
    is an optional case-insensitive substring match on the message — useful
    when the exact phrasing is not part of the contract.
    """
    assert response.status_code == status_code, (
        f"expected status {status_code}, got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert "error" in body, f"missing `error` key in body: {body}"
    err = body["error"]
    assert isinstance(err, dict), f"`error` must be an object, got {type(err).__name__}: {err}"
    assert err.get("code") == code, f"expected code {code!r}, got {err.get('code')!r}"
    assert code in VALID_ERROR_CODES, (
        f"unknown error code {code!r}; update VALID_ERROR_CODES if this was added intentionally"
    )
    assert isinstance(err.get("message"), str) and err["message"], (
        f"`error.message` must be a non-empty string, got {err.get('message')!r}"
    )
    # Public envelope is exactly {code, message} — extra keys would be
    # contract drift and easy to miss in a snapshot diff.
    assert set(err.keys()) == {"code", "message"}, (
        f"`error` must contain exactly {{code, message}}, got keys: {sorted(err.keys())}"
    )
    if message_contains is not None:
        assert message_contains.lower() in err["message"].lower(), (
            f"expected message to contain {message_contains!r}, got {err['message']!r}"
        )
