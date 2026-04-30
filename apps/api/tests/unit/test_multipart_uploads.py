"""Unit tests for src/multipart_uploads.py — issue #181.

Covers each AC checkpoint plus the GCS branch:
- Oversized file → UploadError
- Allowed mime + size → ProcessedUpload returned, file written to public/uploads
- EXIF GPS tag absent in the stored image
- 4000x3000 image is resized to 2048x1536 (longest-edge clamp, aspect preserved)
- Disallowed mime → UploadError
- PNG alpha preserved on round-trip
- Undecodable payload → INVALID_IMAGE
- GCS branch: happy path calls upload_to_gcs with the right args
- GCS failure in dev → silent local-disk fallback
- GCS failure in prod → re-raised as STORAGE_UNAVAILABLE
"""

from __future__ import annotations

import io

import pytest
from fastapi import UploadFile
from PIL import Image, TiffImagePlugin

from src import multipart_uploads


def _png_bytes(width: int = 100, height: int = 100, color: tuple = (255, 0, 0)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def _jpeg_bytes(width: int = 100, height: int = 100, color: tuple = (0, 255, 0)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return out.getvalue()


def _jpeg_with_exif_gps() -> bytes:
    """Return a JPEG carrying a populated GPSInfo EXIF sub-IFD.

    Uses getexif().get_ifd(0x8825) — Pillow's lower-level GPS-IFD accessor.
    Direct dict assignment to exif[0x8825] trips the tobytes() encoder.
    """
    img = Image.new("RGB", (100, 100), (0, 0, 255))
    out = io.BytesIO()

    exif = img.getexif()
    gps = exif.get_ifd(0x8825)
    # 1 = GPSLatitudeRef ('N'/'S'), 2 = GPSLatitude (3 rationals: deg/min/sec)
    gps[1] = "N"
    gps[2] = (
        TiffImagePlugin.IFDRational(40, 1),
        TiffImagePlugin.IFDRational(45, 1),
        TiffImagePlugin.IFDRational(3, 1),
    )
    gps[3] = "W"
    gps[4] = (
        TiffImagePlugin.IFDRational(73, 1),
        TiffImagePlugin.IFDRational(59, 1),
        TiffImagePlugin.IFDRational(45, 1),
    )

    img.save(out, format="JPEG", exif=exif)
    return out.getvalue()


def _make_upload(content: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(content),
        headers={"content-type": content_type},
    )


@pytest.fixture(autouse=True)
def isolate_uploads_dir(monkeypatch, tmp_path):
    """Run each test inside a fresh tmp cwd so public/uploads stays clean."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(multipart_uploads.settings, "uploads_bucket", None)


@pytest.mark.asyncio
async def test_disallowed_mime_raises_upload_error():
    upload = _make_upload(b"GIF89a fake", "evil.gif", "image/gif")

    with pytest.raises(multipart_uploads.UploadError) as exc:
        await multipart_uploads.process_upload(
            upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
        )
    assert exc.value.code == "UNSUPPORTED_FILE_TYPE"


@pytest.mark.asyncio
async def test_oversized_file_raises_upload_error():
    # 1MB cap, 2MB payload — payload size matters before the resize step.
    payload = b"\x00" * (2 * 1024 * 1024)
    upload = _make_upload(payload, "huge.jpg", "image/jpeg")

    with pytest.raises(multipart_uploads.UploadError) as exc:
        await multipart_uploads.process_upload(upload, max_bytes=1 * 1024 * 1024, kind="avatar")
    assert exc.value.code == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_jpeg_within_limits_is_stored_and_returns_storage_key(tmp_path):
    upload = _make_upload(_jpeg_bytes(800, 600), "ok.jpg", "image/jpeg")

    result = await multipart_uploads.process_upload(
        upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
    )

    assert isinstance(result, multipart_uploads.ProcessedUpload)
    assert result.content_type == "image/jpeg"
    assert result.storage_key.endswith(".jpg")

    stored = tmp_path / "public" / "uploads" / result.storage_key
    assert stored.exists()
    # Confirm the file is a real decodable JPEG of the right dimensions
    with Image.open(stored) as img:
        assert img.format == "JPEG"
        assert img.size == (800, 600)  # under the 2048 cap → unchanged


@pytest.mark.asyncio
async def test_image_larger_than_2048_is_resized_preserving_aspect_ratio(tmp_path):
    upload = _make_upload(_jpeg_bytes(4000, 3000), "huge.jpg", "image/jpeg")

    result = await multipart_uploads.process_upload(
        upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
    )

    stored = tmp_path / "public" / "uploads" / result.storage_key
    with Image.open(stored) as img:
        # PIL.thumbnail clamps the longest edge to MAX and rescales the other
        # to preserve aspect ratio. 4000x3000 → 2048x1536.
        assert img.size == (2048, 1536)


@pytest.mark.asyncio
async def test_exif_gps_tag_is_absent_in_stored_image(tmp_path):
    upload = _make_upload(_jpeg_with_exif_gps(), "geo.jpg", "image/jpeg")

    result = await multipart_uploads.process_upload(
        upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
    )

    stored = tmp_path / "public" / "uploads" / result.storage_key
    with Image.open(stored) as img:
        exif = img.getexif()
        # The GPSInfo IFD tag (0x8825) MUST NOT survive re-encoding.
        assert 0x8825 not in exif, "GPS EXIF tag leaked through to the stored image"


@pytest.mark.asyncio
async def test_png_with_alpha_is_kept_as_png(tmp_path):
    """PNG inputs round-trip as PNG; alpha is preserved."""
    img = Image.new("RGBA", (200, 200), (255, 255, 255, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    upload = _make_upload(buf.getvalue(), "trans.png", "image/png")

    result = await multipart_uploads.process_upload(
        upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
    )

    stored = tmp_path / "public" / "uploads" / result.storage_key
    with Image.open(stored) as out:
        assert out.format == "PNG"
        assert out.mode in ("RGBA", "LA")  # alpha preserved


@pytest.mark.asyncio
async def test_undecodable_payload_raises_invalid_image():
    upload = _make_upload(b"this is not an image", "broken.jpg", "image/jpeg")

    with pytest.raises(multipart_uploads.UploadError) as exc:
        await multipart_uploads.process_upload(
            upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
        )
    assert exc.value.code == "INVALID_IMAGE"


# ---------------------------------------------------------------------------
# GCS branch — exercised when settings.uploads_bucket is set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gcs_happy_path_writes_via_legacy_helpers(monkeypatch, tmp_path):
    """When uploads_bucket is set, the helper writes to GCS and returns the key."""
    monkeypatch.setattr(multipart_uploads.settings, "uploads_bucket", "test-bucket")

    captured: dict[str, object] = {}

    async def fake_get_token() -> str:
        return "fake-token"

    async def fake_upload_to_gcs(**kwargs: object) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(
        multipart_uploads.legacy_uploads, "get_gcp_access_token", fake_get_token
    )
    monkeypatch.setattr(
        multipart_uploads.legacy_uploads, "upload_to_gcs", fake_upload_to_gcs
    )

    upload = _make_upload(_jpeg_bytes(800, 600), "ok.jpg", "image/jpeg")

    result = await multipart_uploads.process_upload(
        upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
    )

    assert isinstance(result, multipart_uploads.ProcessedUpload)
    assert result.storage_key.endswith(".jpg")
    assert result.content_type == "image/jpeg"

    # Confirm the GCS path was actually exercised — and with the right args
    assert captured.get("bucket") == "test-bucket"
    assert captured.get("object_key") == result.storage_key
    assert captured.get("content_type") == "image/jpeg"
    assert isinstance(captured.get("buffer"), bytes)
    assert captured.get("access_token") == "fake-token"

    # Local-fallback path should NOT have run when GCS succeeded
    assert not (tmp_path / "public" / "uploads").exists()


@pytest.mark.asyncio
async def test_gcs_failure_in_dev_falls_back_to_local_write(monkeypatch, tmp_path):
    monkeypatch.setattr(multipart_uploads.settings, "uploads_bucket", "test-bucket")
    monkeypatch.setattr(multipart_uploads.settings, "environment", "development")

    async def boom(**_kwargs: object) -> None:
        raise RuntimeError("simulated GCS outage")

    async def fake_get_token() -> str:
        return "fake-token"

    monkeypatch.setattr(
        multipart_uploads.legacy_uploads, "get_gcp_access_token", fake_get_token
    )
    monkeypatch.setattr(multipart_uploads.legacy_uploads, "upload_to_gcs", boom)

    upload = _make_upload(_jpeg_bytes(400, 400), "ok.jpg", "image/jpeg")

    result = await multipart_uploads.process_upload(
        upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
    )

    # In dev, the GCS failure is logged and we silently fall back to local disk.
    stored = tmp_path / "public" / "uploads" / result.storage_key
    assert stored.exists(), "dev fallback should have written the file locally"


@pytest.mark.asyncio
async def test_gcs_failure_in_production_raises_storage_unavailable(monkeypatch):
    monkeypatch.setattr(multipart_uploads.settings, "uploads_bucket", "test-bucket")
    monkeypatch.setattr(multipart_uploads.settings, "environment", "production")

    async def boom(**_kwargs: object) -> None:
        raise RuntimeError("simulated GCS outage")

    async def fake_get_token() -> str:
        return "fake-token"

    monkeypatch.setattr(
        multipart_uploads.legacy_uploads, "get_gcp_access_token", fake_get_token
    )
    monkeypatch.setattr(multipart_uploads.legacy_uploads, "upload_to_gcs", boom)

    upload = _make_upload(_jpeg_bytes(400, 400), "ok.jpg", "image/jpeg")

    # In prod the silent fallback would land on Cloud Run's ephemeral disk
    # and 404 on the next read — re-raise instead.
    with pytest.raises(multipart_uploads.UploadError) as exc:
        await multipart_uploads.process_upload(
            upload, max_bytes=multipart_uploads.POSTS_MEDIA_MAX_BYTES, kind="post-media"
        )
    assert exc.value.code == "STORAGE_UNAVAILABLE"
