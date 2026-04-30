"""Multipart upload helper for FastAPI Phase 3 (issue #181).

Mirrors the storage contract of src/lib/uploads.ts (Next side) — the DB stores
opaque storage keys, never URLs. URL resolution happens at response time via
get_signed_upload_url / create_signed_url_resolver in src/uploads.py.

Differences from the existing src/uploads.py#save_photo_file:
- Mime allowlist narrowed to JPEG/PNG/WEBP (no GIF, per migration plan).
- EXIF stripped before storage (privacy + size).
- Images resized to a max 2048px on the longest edge (size + UX consistency).
- Configurable per-call size cap (`max_bytes`) — 10MB for posts, 5MB for avatars.
- Returns only the opaque storage key — callers resolve URLs at response time.
- Raises a typed UploadError so handlers can map to 400 VALIDATION_ERROR cleanly.

Once #187 lands and posts/profile multipart endpoints adopt this helper,
src/uploads.py#save_photo_file can be deleted.
"""

from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import uuid4

import httpx
from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from . import uploads as legacy_uploads
from .settings import settings

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES: frozenset[str] = frozenset({"image/jpeg", "image/png", "image/webp"})
MAX_LONGEST_EDGE_PX = 2048

# Per-kind file-size caps from the migration plan.
POSTS_MEDIA_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB

UploadKind = Literal["post-media", "avatar"]


class UploadError(Exception):
    """Validation failure on an uploaded file. Routes should map to 400."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ProcessedUpload:
    storage_key: str
    size_bytes: int
    content_type: str


_MIME_TO_PIL_FORMAT: dict[str, str] = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}

_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def process_upload(
    file: UploadFile,
    *,
    max_bytes: int,
    kind: UploadKind,
) -> ProcessedUpload:
    """Validate, strip EXIF, resize, and store an uploaded image.

    Returns the opaque storage key. URL resolution is the caller's job and
    happens at response time via src/uploads.py.

    Raises UploadError on mime / size / decode failure.
    """
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES:
        raise UploadError(
            "UNSUPPORTED_FILE_TYPE",
            f"Only {sorted(ALLOWED_MIME_TYPES)} are allowed; got {content_type or '(missing)'}",
        )

    contents = await file.read()
    if len(contents) > max_bytes:
        raise UploadError(
            "FILE_TOO_LARGE",
            f"File exceeds the {max_bytes // (1024 * 1024)}MB limit for {kind}",
        )

    processed_bytes = _strip_exif_and_resize(contents, content_type)

    filename = f"{int(time.time() * 1000)}-{uuid4()}{_MIME_TO_EXT[content_type]}"

    if settings.uploads_bucket:
        try:
            await _store_in_gcs(filename, processed_bytes, content_type)
            return ProcessedUpload(
                storage_key=filename,
                size_bytes=len(processed_bytes),
                content_type=content_type,
            )
        except (httpx.HTTPError, RuntimeError) as exc:
            # Fall through to local write — matches the legacy helper's
            # behaviour. A misconfigured bucket / metadata server in dev
            # shouldn't 500 the request, but production deployments should
            # see this in logs.
            logger.warning(
                "multipart_uploads.gcs.fallback_to_local: %s",
                exc,
                exc_info=True,
            )

    upload_dir = Path("public/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / filename).write_bytes(processed_bytes)

    return ProcessedUpload(
        storage_key=filename,
        size_bytes=len(processed_bytes),
        content_type=content_type,
    )


def _strip_exif_and_resize(raw: bytes, content_type: str) -> bytes:
    """Decode, apply EXIF rotation, drop metadata, clamp longest edge to 2048px."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            # ImageOps.exif_transpose applies the EXIF orientation tag and then
            # returns an image whose pixel data already reflects the intended
            # rotation — necessary because we strip EXIF below.
            img = ImageOps.exif_transpose(img)

            longest = max(img.size)
            if longest > MAX_LONGEST_EDGE_PX:
                img.thumbnail(
                    (MAX_LONGEST_EDGE_PX, MAX_LONGEST_EDGE_PX),
                    Image.Resampling.LANCZOS,
                )

            pil_format = _MIME_TO_PIL_FORMAT[content_type]

            # JPEG can't carry alpha; flatten if the source had transparency.
            if pil_format == "JPEG" and img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")

            out = io.BytesIO()
            # Re-encode without saving EXIF/ICC. Pillow does not pass through
            # the original metadata unless we explicitly hand it back, so this
            # is the strip step.
            save_kwargs: dict[str, object] = {"format": pil_format}
            if pil_format == "JPEG":
                save_kwargs["quality"] = 90
                save_kwargs["optimize"] = True
            img.save(out, **save_kwargs)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise UploadError("INVALID_IMAGE", "Could not decode image") from exc


async def _store_in_gcs(filename: str, body: bytes, content_type: str) -> None:
    access_token = await legacy_uploads._get_gcp_access_token()
    await legacy_uploads._upload_to_gcs(
        bucket=settings.uploads_bucket or "",
        object_key=filename,
        buffer=body,
        content_type=content_type,
        access_token=access_token,
    )
