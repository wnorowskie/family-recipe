from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from prisma.errors import PrismaError, UniqueViolationError
import logging

from ..db import prisma
from ..dependencies import get_current_user
from ..errors import (
    bad_request,
    conflict,
    file_too_large,
    internal_error,
    invalid_credentials,
    unsupported_file_type,
    validation_error,
)
from ..multipart_uploads import (
    AVATAR_MAX_BYTES,
    UploadError,
    process_upload,
)
from ..schemas.auth import UserResponse
from ..schemas.me import UpdateProfileRequest
from ..security import clear_session_cookie, hash_password, verify_password
from ..uploads import create_signed_url_resolver, get_signed_upload_url
from ..utils import iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/favorites")
async def my_favorites(limit: int = 20, offset: int = 0, user: UserResponse = Depends(get_current_user)):
    try:
        favorites = await prisma.favorite.find_many(
            where={"userId": user.id, "post": {"familySpaceId": user.familySpaceId}},
            order={"createdAt": "desc"},
            take=limit + 1,
            skip=offset,
            include={"post": {"include": {"author": True}}},
        )
        has_more = len(favorites) > limit
        favorites = favorites[:limit]
        # Resolve each post's mainPhotoUrl storage key into a signed URL.
        # Sharing one resolver across all rows means a favorite list with
        # duplicates (same post appearing twice across pages, unlikely but
        # cheap to guard) only hits GCS once.
        resolve_photo = create_signed_url_resolver()
        items = [
            {
                "id": fav.id,
                "createdAt": iso(fav.createdAt),
                "post": {
                    "id": fav.post.id,
                    "title": fav.post.title,
                    "mainPhotoUrl": await resolve_photo(fav.post.mainPhotoStorageKey),
                    "authorName": fav.post.author.name if fav.post.author else None,
                },
            }
            for fav in favorites
        ]
        return {"items": items, "hasMore": has_more, "nextOffset": offset + len(items)}
    except PrismaError as e:
        logger.exception("me.favorites.prisma_error: %s", e)
        return internal_error("Failed to load favorites")
    except (ValueError, TypeError, AttributeError, KeyError) as e:
        logger.exception("me.favorites.error: %s", e)
        return internal_error("Failed to load favorites")


@router.patch("/profile")
async def update_profile_multipart(
    response: Response,
    name: str = Form(...),
    email: str = Form(...),
    username: str = Form(...),
    currentPassword: Optional[str] = Form(default=None),
    removeAvatar: Optional[str] = Form(default=None),
    avatar: Optional[UploadFile] = File(default=None),
    user: UserResponse = Depends(get_current_user),
):
    """Update the current user's profile, including optional avatar upload.

    Multipart-only (`multipart/form-data`) per parity with
    `src/app/api/me/profile/route.ts`. Field names are flat (not a `payload`
    JSON envelope) to match Next; the migration plan's payload-envelope
    shape is tracked as a follow-up under #188.

    Behavior:
    - Validates `name`, `email`, `username` via Pydantic's `UpdateProfileRequest`
      (same constraints as Next's `updateProfileSchema`).
    - If `email` or `username` differ from the current values, requires a
      matching `currentPassword` (mirrors Next's `requiresPassword` branch).
    - `avatar` file (≤5MB, JPEG/PNG/WEBP) writes its storage key to the
      `avatarStorageKey` column (Postgres column `avatar_url`, mapped via
      `@map` in the Prisma schema). The DB stores an opaque storage key,
      not a URL — the legacy column name is kept for compatibility with
      Next-era rows that still hold pre-migration values, but the Prisma
      attribute is canonical.
    - `removeAvatar=true` clears the column.
    - On sensitive-field change (email or username), the session cookie is
      cleared so the next request re-authenticates — matches Next's
      `clearSessionCookie` call.
    - P2002 unique-constraint violations on email/username surface as
      `409 CONFLICT` per the Next contract.
    """
    raw = {"name": name, "email": email, "username": username}
    try:
        validated = UpdateProfileRequest.model_validate(raw)
    except ValueError as exc:
        return validation_error(_first_validation_message(exc, "Invalid input"))

    current = await prisma.user.find_unique(where={"id": user.id})
    if not current:
        return internal_error("Failed to update profile")

    email_changed = validated.email != current.email
    username_changed = validated.username != current.username
    requires_password = email_changed or username_changed

    if requires_password:
        if not currentPassword:
            return validation_error(
                "Current password is required to change email or username"
            )
        if not verify_password(currentPassword, current.passwordHash):
            return invalid_credentials("Incorrect current password")

    # `avatar_file` factors out the size>0 / filename!="" guard mirroring
    # Next's `isFileLike(avatarFile) && avatarFile.size > 0`. We re-bind to
    # a non-Optional local so mypy can narrow `process_upload`'s arg type
    # (a bool guard on a separate variable wouldn't narrow `avatar` itself).
    avatar_file = avatar if avatar is not None and (avatar.filename or "") and (avatar.size or 0) > 0 else None
    # `avatar_should_write` separates "intentionally write None to clear"
    # from "leave the column alone" without smuggling a sentinel value
    # through a typed Optional[str]. `avatar_new_value` is only read when
    # the flag is True.
    avatar_should_write = False
    avatar_new_value: Optional[str] = None
    if avatar_file is not None:
        try:
            processed = await process_upload(
                avatar_file,
                max_bytes=AVATAR_MAX_BYTES,
                kind="avatar",
            )
        except UploadError as exc:
            if exc.code == "UNSUPPORTED_FILE_TYPE":
                return unsupported_file_type(exc.message)
            if exc.code == "FILE_TOO_LARGE":
                return file_too_large(exc.message)
            return validation_error(exc.message)
        avatar_new_value = processed.storage_key
        avatar_should_write = True
    elif removeAvatar == "true":
        avatar_new_value = None
        avatar_should_write = True

    data: dict = {
        "name": validated.name,
        "email": validated.email.strip(),
        "username": validated.username.strip(),
    }
    if avatar_should_write:
        data["avatarStorageKey"] = avatar_new_value

    try:
        updated = await prisma.user.update(where={"id": user.id}, data=data)
    except UniqueViolationError:
        return conflict("That email or username is already in use")
    except PrismaError:
        return internal_error("Failed to update profile")

    if requires_password:
        # Sensitive change — force re-auth on the next request. Matches the
        # Next handler's `clearSessionCookie(response)` call.
        clear_session_cookie(response)

    avatar_url = await get_signed_upload_url(updated.avatarStorageKey)
    return {
        "user": {
            "id": updated.id,
            "name": updated.name,
            "email": updated.email,
            "username": updated.username,
            "emailOrUsername": updated.email,
            "avatarUrl": avatar_url,
        }
    }


def _first_validation_message(exc: ValueError, fallback: str) -> str:
    """Pull the first message from a Pydantic ValidationError, else fallback.

    The PATCH handler reports the *first* error to match the Next side, which
    returns `parsed.error.errors[0]?.message`. Any non-Pydantic ValueError
    falls back to the generic message.
    """
    errors = getattr(exc, "errors", None)
    if callable(errors):
        try:
            details = errors()
            if details:
                return str(details[0].get("msg") or fallback)
        except (TypeError, IndexError, KeyError):
            return fallback
    return fallback


@router.put("/profile")
async def update_profile(
    payload: dict, user: UserResponse = Depends(get_current_user)
):
    """Legacy JSON profile-update handler. Kept alive for Phase-2 clients.

    The canonical Phase-3 endpoint is `update_profile_multipart` above
    (`PATCH /v1/me/profile`), which mirrors Next's contract (flat form
    fields, multipart body, optional avatar, sensitive-field-change
    password check, 409 on duplicate). This PUT remains until Phase-4
    cutover removes the legacy non-`/v1/` routes (#38) — keep behaviour
    here drift-free of the PATCH unless a deliberate parity change is
    being made on both sides.
    """
    # simple dict validation to mirror existing behavior
    name = payload.get("name")
    email = payload.get("email")
    username = payload.get("username")
    if not isinstance(name, str) or not name.strip():
        return bad_request("Name is required")
    if not isinstance(email, str) or not email.strip():
        return bad_request("Email is required")
    if not isinstance(username, str) or not username.strip():
        return bad_request("Username is required")

    try:
        updated = await prisma.user.update(
            where={"id": user.id},
            data={
                "name": name.strip(),
                "email": email.strip(),
                "username": username.strip(),
            },
        )
        return {
            "user": {
                "id": updated.id,
                "name": updated.name,
                "email": updated.email,
                "username": updated.username,
                "emailOrUsername": updated.email,
                "avatarUrl": await get_signed_upload_url(updated.avatarStorageKey),
            }
        }
    except PrismaError:
        return internal_error("Failed to update profile")
    except (ValueError, TypeError, AttributeError, KeyError):
        return internal_error("Failed to update profile")


@router.post("/password")
async def change_password(
    payload: dict,
    response: Response,
    user: UserResponse = Depends(get_current_user),
):
    """Change the current user's password.

    `POST` (not `PUT`) and the `{ status: 'updated' }` response body mirror
    Next's `src/app/api/me/password/route.ts` so the Phase-2 frontend can swap
    to the FastAPI base URL in Phase 4 (#38) without an adapter shim — see
    #188. On success the legacy `session` cookie is cleared, matching Next's
    `clearSessionCookie` call, so the next request re-authenticates.

    Body keys are `currentPassword` / `newPassword` — the live Next contract
    and what `AccountSettingsForm` sends. (The migration plan's `nextPassword`
    is stale and was never shipped on either side.)
    """
    current_password = payload.get("currentPassword")
    new_password = payload.get("newPassword")
    if not isinstance(current_password, str) or not current_password:
        return bad_request("Current password is required")
    if not isinstance(new_password, str) or len(new_password) < 8:
        return bad_request("New password must be at least 8 characters")

    try:
        record = await prisma.user.find_unique(where={"id": user.id})
        if not record or not verify_password(current_password, record.passwordHash):
            return bad_request("Current password is incorrect")

        await prisma.user.update(
            where={"id": user.id},
            data={"passwordHash": hash_password(new_password)},
        )
        clear_session_cookie(response)
        return {"status": "updated"}
    except PrismaError:
        return internal_error("Failed to update password")
    except (ValueError, TypeError, AttributeError, KeyError):
        return internal_error("Failed to update password")
