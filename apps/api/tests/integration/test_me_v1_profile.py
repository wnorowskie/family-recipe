"""Integration tests for PATCH /v1/me/profile — issue #187 multipart on profile.

The handler in `src/routers/me.py#update_profile_multipart` accepts a
flat-field multipart body (`name`, `email`, `username`, optional `avatar`,
optional `currentPassword`, optional `removeAvatar`) and writes to the
`avatar_url` column when an avatar is included. Session-cookie auth,
not bearer-token: the legacy `me.py` router is mounted at both `/me` and
`/v1/me`, so the same handler covers Phase 3 and the legacy path.

Tests verify:
  - Happy path (no avatar, no sensitive change)
  - Avatar file upload writes via `process_upload` and surfaces in response
  - Oversized avatar -> 400 FILE_TOO_LARGE
  - Disallowed mime -> 400 UNSUPPORTED_FILE_TYPE
  - Email/username change requires currentPassword (401 if wrong)
  - P2002 unique-violation -> 409 CONFLICT
  - removeAvatar=true clears the column

Cookie clearing on sensitive change is asserted via the Set-Cookie header
on the response — the handler injects `clear_session_cookie(response)` only
when email or username actually changed.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from prisma.errors import UniqueViolationError

from src.multipart_uploads import ProcessedUpload, UploadError
from tests.helpers.error_envelope import assert_error_envelope


pytestmark = pytest.mark.usefixtures("mock_prisma", "prisma_user_with_membership")


# The `prisma_user_with_membership` fixture wires `mock_prisma.user.find_unique`
# to return `mock_user` which has email="test@example.com", username="testuser",
# passwordHash="$2b$10$hashed", and memberships=[mock_membership]. The handler
# calls `find_unique` *twice*: once via `get_current_user` for auth, and once
# itself for the current email/username comparison — but both calls receive the
# same mock, so as long as the data shape is consistent that's fine.
#
# Tests below use the fixture's defaults for "current" values. To exercise a
# field change, post a different value than the fixture's defaults.


def _updated_user(**overrides) -> SimpleNamespace:
    """The row returned by `prisma.user.update`. Mirrors the columns the
    handler reads on the response side (id/name/email/username/avatarStorageKey).

    Defaults match the fixture's mock_user so a "no actual change" PATCH
    round-trips with the same values.
    """
    base = {
        "id": "user_test_123",
        "name": "Test User",
        "email": "test@example.com",
        "username": "testuser",
        "avatarStorageKey": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_patch_profile_no_changes_success(client, mock_prisma, member_auth):
    """No fields actually changing is still a valid PATCH — Next allows it
    and our handler should mirror that (returns the user, no password
    check required)."""
    mock_prisma.user.update = AsyncMock(return_value=_updated_user())

    response = client.patch(
        "/v1/me/profile",
        data={"name": "Original", "email": "test@example.com", "username": "testuser"},
        headers=member_auth,
    )

    assert response.status_code == 200, response.json()
    user = response.json()["user"]
    assert user["email"] == "test@example.com"
    assert user["avatarUrl"] is None
    # `data` written to prisma must not include avatarStorageKey when no avatar
    # part was sent and removeAvatar wasn't set.
    written = mock_prisma.user.update.await_args.kwargs["data"]
    assert "avatarStorageKey" not in written


def test_patch_profile_with_avatar_writes_storage_key(client, mock_prisma, member_auth, monkeypatch):
    """An `avatar` file goes through `process_upload` and the resulting
    storage_key is written to the column. The response surfaces the
    resolved URL (which in tests, with no UPLOADS_BUCKET, is the
    `/uploads/<key>` local-path passthrough)."""
    mock_prisma.user.update = AsyncMock(return_value=_updated_user(avatarStorageKey="abc-123.jpg"))

    monkeypatch.setattr(
        "src.routers.me.process_upload",
        AsyncMock(
            return_value=ProcessedUpload(
                storage_key="abc-123.jpg", size_bytes=1000, content_type="image/jpeg"
            )
        ),
    )

    response = client.patch(
        "/v1/me/profile",
        data={"name": "Original", "email": "test@example.com", "username": "testuser"},
        files={"avatar": ("a.jpg", b"data", "image/jpeg")},
        headers=member_auth,
    )

    assert response.status_code == 200, response.json()
    written = mock_prisma.user.update.await_args.kwargs["data"]
    assert written.get("avatarStorageKey") == "abc-123.jpg"
    # Local mode returns the `/uploads/<key>` form — see `get_signed_upload_url`
    assert response.json()["user"]["avatarUrl"] == "/uploads/abc-123.jpg"


def test_patch_profile_oversized_avatar_400(client, mock_prisma, member_auth, monkeypatch):
    monkeypatch.setattr(
        "src.routers.me.process_upload",
        AsyncMock(side_effect=UploadError("FILE_TOO_LARGE", "File exceeds the 5MB limit for avatar")),
    )

    response = client.patch(
        "/v1/me/profile",
        data={"name": "Original", "email": "test@example.com", "username": "testuser"},
        files={"avatar": ("big.jpg", b"data", "image/jpeg")},
        headers=member_auth,
    )

    assert_error_envelope(
        response,
        status_code=400,
        code="FILE_TOO_LARGE",
        message_contains="5MB",
    )


def test_patch_profile_bad_mime_400(client, mock_prisma, member_auth, monkeypatch):
    monkeypatch.setattr(
        "src.routers.me.process_upload",
        AsyncMock(
            side_effect=UploadError(
                "UNSUPPORTED_FILE_TYPE",
                "Only ['image/jpeg', 'image/png', 'image/webp'] are allowed; got application/pdf",
            )
        ),
    )

    response = client.patch(
        "/v1/me/profile",
        data={"name": "Original", "email": "test@example.com", "username": "testuser"},
        files={"avatar": ("bad.pdf", b"data", "application/pdf")},
        headers=member_auth,
    )

    assert_error_envelope(
        response,
        status_code=400,
        code="UNSUPPORTED_FILE_TYPE",
        message_contains="image/jpeg",
    )


def test_patch_profile_email_change_requires_password(client, mock_prisma, member_auth):
    """Changing `email` without providing `currentPassword` is a 400
    VALIDATION_ERROR with the same message Next returns."""

    response = client.patch(
        "/v1/me/profile",
        data={
            "name": "Original",
            "email": "new@example.com",  # changed
            "username": "testuser",
        },
        headers=member_auth,
    )

    assert_error_envelope(
        response,
        status_code=400,
        code="VALIDATION_ERROR",
        message_contains="current password is required",
    )


def test_patch_profile_wrong_password_401(client, mock_prisma, member_auth, monkeypatch):
    """Email change with a *wrong* password is 401 INVALID_CREDENTIALS
    per Next's `invalidCredentialsError` mapping."""
    monkeypatch.setattr("src.routers.me.verify_password", lambda *_args, **_kw: False)

    response = client.patch(
        "/v1/me/profile",
        data={
            "name": "Original",
            "email": "new@example.com",
            "username": "testuser",
            "currentPassword": "wrong",
        },
        headers=member_auth,
    )

    assert_error_envelope(
        response,
        status_code=401,
        code="INVALID_CREDENTIALS",
        message_contains="incorrect",
    )


def test_patch_profile_email_change_clears_session_cookie(
    client, mock_prisma, member_auth, monkeypatch
):
    """When email actually changes (with the correct password) the handler
    clears the session cookie so the SPA's next request re-authenticates.
    Matches Next's `clearSessionCookie(response)` on the same branch."""
    mock_prisma.user.update = AsyncMock(
        return_value=_updated_user(email="new@example.com")
    )
    monkeypatch.setattr("src.routers.me.verify_password", lambda *_args, **_kw: True)

    response = client.patch(
        "/v1/me/profile",
        data={
            "name": "Original",
            "email": "new@example.com",
            "username": "testuser",
            "currentPassword": "correct",
        },
        headers=member_auth,
    )

    assert response.status_code == 200, response.json()
    # `Set-Cookie` for the session cookie must include a max-age=0/expires
    # marker that `delete_cookie` applies. We just assert *some* Set-Cookie
    # header mentions the session cookie name — the exact attribute set is
    # the cookies helper's concern.
    set_cookies = response.headers.get_list("set-cookie") if hasattr(
        response.headers, "get_list"
    ) else [response.headers.get("set-cookie", "")]
    assert any("session" in c.lower() for c in set_cookies), set_cookies


def test_patch_profile_duplicate_email_409(client, mock_prisma, member_auth, monkeypatch):
    """A P2002 unique-constraint hit from prisma -> 409 CONFLICT
    "That email or username is already in use" (mirrors Next)."""
    monkeypatch.setattr("src.routers.me.verify_password", lambda *_args, **_kw: True)
    mock_prisma.user.update = AsyncMock(
        side_effect=UniqueViolationError("unique violation")
    )

    response = client.patch(
        "/v1/me/profile",
        data={
            "name": "Original",
            "email": "taken@example.com",
            "username": "testuser",
            "currentPassword": "correct",
        },
        headers=member_auth,
    )

    assert_error_envelope(
        response,
        status_code=409,
        code="CONFLICT",
        message_contains="already in use",
    )


def test_patch_profile_remove_avatar_clears_column(client, mock_prisma, member_auth):
    """`removeAvatar=true` (without an `avatar` file part) writes None to
    the column so the user's avatar is cleared."""
    mock_prisma.user.update = AsyncMock(return_value=_updated_user())

    response = client.patch(
        "/v1/me/profile",
        data={
            "name": "Original",
            "email": "test@example.com",
            "username": "testuser",
            "removeAvatar": "true",
        },
        headers=member_auth,
    )

    assert response.status_code == 200, response.json()
    written = mock_prisma.user.update.await_args.kwargs["data"]
    assert "avatarStorageKey" in written
    assert written["avatarStorageKey"] is None


def test_patch_profile_invalid_email_400(client, member_auth):
    """A malformed email is rejected by Pydantic's EmailStr at the
    validation boundary, matching Next's `z.string().email()`."""
    response = client.patch(
        "/v1/me/profile",
        data={"name": "Original", "email": "not-an-email", "username": "testuser"},
        headers=member_auth,
    )

    assert_error_envelope(response, status_code=400, code="VALIDATION_ERROR")


def test_patch_profile_requires_auth(client):
    response = client.patch(
        "/v1/me/profile",
        data={"name": "Test", "email": "t@example.com", "username": "test"},
    )

    assert response.status_code == 401
