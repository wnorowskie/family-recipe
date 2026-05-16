import asyncio
import os
import time
from pathlib import Path
from typing import Awaitable, Callable, Dict, List, Optional, TypedDict, Union
from uuid import uuid4

import httpx
from fastapi import UploadFile

from .gcs_client import (
    GCS_API_BASE,
    _encode_rfc3986,
    _fetch_metadata,
    _generate_signed_url_v4,
    get_gcp_access_token,
    upload_to_gcs,
)
from .settings import settings

MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PHOTO_COUNT = 10


class SavedUpload(TypedDict, total=False):
    url: str
    filePath: str


async def save_photo_file(file: UploadFile) -> SavedUpload:
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("UNSUPPORTED_FILE_TYPE")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise ValueError("FILE_TOO_LARGE")

    ext = Path(file.filename or "").suffix or {
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(content_type, ".jpg")

    filename = f"{int(time.time()*1000)}-{uuid4()}{ext}"

    if settings.uploads_bucket:
        try:
            access_token = await get_gcp_access_token()
            service_account_email = await _fetch_metadata("instance/service-accounts/default/email")
            private_key = os.environ.get("GCS_SIGNING_PRIVATE_KEY")

            await upload_to_gcs(
                bucket=settings.uploads_bucket,
                object_key=filename,
                buffer=contents,
                content_type=content_type,
                access_token=access_token,
            )

            signed_url = await _generate_signed_url_v4(
                bucket=settings.uploads_bucket,
                object_key=filename,
                expires_in_seconds=settings.uploads_signed_url_ttl_seconds,
                access_token=access_token,
                service_account_email=service_account_email,
                private_key=private_key,
            )

            return {"url": signed_url, "filePath": f"gs://{settings.uploads_bucket}/{filename}"}
        except Exception:
            # fall through to local write
            pass

    upload_dir = Path("public/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / filename
    destination.write_bytes(contents)
    return {"url": f"/uploads/{filename}", "filePath": str(destination)}


async def delete_uploads(values: List[Union[str, None, float, int]]) -> None:
    """Delete uploaded objects from storage.

    Accepts a mixed list of storage keys (post-#187 shape: bare filenames
    like `<ts>-<uuid>.jpg`) and legacy values (resolved signed URLs from
    pre-#187 rows, or `/uploads/<name>` local paths). Errors per item are
    swallowed — deleting an object that doesn't exist or that we can't parse
    is not worth failing the parent request over.
    """
    filtered = [v for v in values if isinstance(v, str) and v]
    if not filtered:
        return
    if settings.uploads_bucket:
        try:
            access_token = await get_gcp_access_token()
            async with httpx.AsyncClient() as client:
                for value in filtered:
                    try:
                        object_key = _to_object_key(value)
                        if not object_key:
                            continue
                        delete_url = f"{GCS_API_BASE}/storage/v1/b/{_encode_rfc3986(settings.uploads_bucket)}/o/{_encode_rfc3986(object_key)}"
                        await client.delete(delete_url, headers={"Authorization": f"Bearer {access_token}"}, timeout=5.0)
                    except Exception:
                        continue
            return
        except Exception:
            pass

    # Local cleanup: deletable values are either
    #   - the post-#187 storage-key shape (bare `<ts>-<uuid>.<ext>` — no
    #     leading slash, no URL scheme); these map to `public/uploads/<key>`
    #   - the legacy `/uploads/<name>` local-path form
    # Everything else (full URLs, paths under other directories) is treated
    # as "not my problem" and skipped — matches the pre-#187 behavior the
    # `test_ignores_non_upload_paths` unit test pins down.
    upload_dir = Path("public/uploads")
    for value in filtered:
        if value.startswith("/uploads/"):
            relative = value[len("/uploads/"):]
        elif value.startswith("/") or "://" in value:
            continue
        else:
            # Bare storage key (post-#187 shape).
            relative = value
        path = upload_dir / relative
        try:
            path.unlink(missing_ok=True)  # type: ignore[arg-type]
        except Exception:
            continue


def _to_object_key(value: str) -> str:
    """Reduce a stored value (storage key or legacy URL) to a GCS object key.

    Storage keys are returned unchanged. Pre-#187 signed GCS URLs are parsed
    so the bucket-name prefix is stripped (`/v1/posts` etc. rows from the
    pre-#187 FastAPI handler stored these). Returns empty string when the
    value is not deletable from GCS (e.g. local `/uploads/...` path).
    """
    if not (value.startswith("http://") or value.startswith("https://")):
        return value
    parsed = httpx.URL(value)
    parts = [p for p in parsed.path.split("/") if p]
    key_parts = parts[1:] if parsed.host == "storage.googleapis.com" else parts
    return "/".join(key_parts)


def _looks_like_resolved_url(value: str) -> bool:
    """Heuristic for legacy values written before #187 adopted storage keys.

    Prior to #187, the FastAPI `save_photo_file` path wrote *resolved* signed
    GCS URLs (or `/uploads/...` local paths) into the same columns that the
    Next side wrote opaque storage keys into (`Post.mainPhotoStorageKey`,
    `PostPhoto.storageKey`, `User.avatarStorageKey` — Postgres columns
    `main_photo_url`, `url`, `avatar_url` per the `@map` directives).
    Passing those legacy values back through V4 signing would produce a
    doubly-signed URL that 404s.

    A storage key generated by `multipart_uploads.process_upload` looks like
    `<ms-timestamp>-<uuid>.<ext>` — no scheme, no leading slash. So anything
    that has a URL scheme or starts with `/` is a legacy resolved value and
    should be returned as-is.
    """
    return (
        value.startswith("http://")
        or value.startswith("https://")
        or value.startswith("/")
    )


async def get_signed_upload_url(storage_key: Optional[str]) -> Optional[str]:
    """Resolve a Prisma avatarStorageKey / postPhoto storageKey to a URL.

    Mirrors src/lib/uploads.ts#getSignedUploadUrl: local-path passthrough
    when no bucket is configured, else a time-limited V4 signed GCS URL.

    Legacy-value passthrough is a FastAPI-only concern: see
    `_looks_like_resolved_url` for the why. The Next side has always written
    storage keys to these columns, so its equivalent helper does not need
    this shim.
    """
    if not storage_key:
        return None

    if _looks_like_resolved_url(storage_key):
        return storage_key

    if not settings.uploads_bucket:
        return f"/uploads/{storage_key}"

    access_token = await get_gcp_access_token()
    service_account_email = await _fetch_metadata("instance/service-accounts/default/email")
    private_key = os.environ.get("GCS_SIGNING_PRIVATE_KEY")

    return await _generate_signed_url_v4(
        bucket=settings.uploads_bucket,
        object_key=storage_key,
        expires_in_seconds=settings.uploads_signed_url_ttl_seconds,
        access_token=access_token,
        service_account_email=service_account_email,
        private_key=private_key,
    )


def create_signed_url_resolver() -> Callable[[Optional[str]], Awaitable[Optional[str]]]:
    """Return a resolver that memoizes get_signed_upload_url by storage key.

    Use when a single request touches the same user / photo multiple times
    (e.g. reactions + comments + cooked events in a post detail) so GCS is
    only signed once per key. Caches the in-flight Task so concurrent
    awaits for the same key dedupe to one IAM call — matches the Promise
    caching in src/lib/uploads.ts#createSignedUrlResolver.
    """
    cache: Dict[str, "asyncio.Task[Optional[str]]"] = {}

    async def resolve(storage_key: Optional[str]) -> Optional[str]:
        if not storage_key:
            return None
        task = cache.get(storage_key)
        if task is None:
            task = asyncio.ensure_future(get_signed_upload_url(storage_key))
            cache[storage_key] = task
        return await task

    return resolve
