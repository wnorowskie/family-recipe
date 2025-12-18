import base64
import hashlib
import os
import time
from pathlib import Path
from typing import List, Optional, TypedDict, Union
from uuid import uuid4

import httpx
from fastapi import UploadFile

from .settings import settings

MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PHOTO_COUNT = 10
GCS_API_BASE = "https://storage.googleapis.com"


class SavedUpload(TypedDict, total=False):
    url: str
    filePath: str


def _encode_rfc3986(value: str) -> str:
    return (
        httpx.QueryParams({value: ""})
        .render()
        .replace("=", "")
        .replace("+", "%20")
        .replace("%7E", "~")
    )


def _encode_path(object_key: str) -> str:
    return "/".join(_encode_rfc3986(segment) for segment in object_key.split("/"))


async def _fetch_metadata(pathname: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"http://metadata.google.internal/computeMetadata/v1/{pathname}",
            headers={"Metadata-Flavor": "Google"},
            timeout=3.0,
        )
    response.raise_for_status()
    return response.text


async def _get_gcp_access_token() -> str:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            headers={"Metadata-Flavor": "Google"},
            timeout=3.0,
        )
    response.raise_for_status()
    data = response.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError("METADATA_TOKEN_MISSING")
    return str(token)


async def _sign_string_with_iam(string_to_sign: str, access_token: str, service_account_email: str) -> str:
    body = {"payload": base64.b64encode(string_to_sign.encode("utf-8")).decode("utf-8")}
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{_encode_rfc3986(service_account_email)}:signBlob",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=5.0,
        )
    response.raise_for_status()
    signed_blob = response.json().get("signedBlob")
    if not signed_blob:
        raise RuntimeError("SIGN_BLOB_MISSING")
    return signed_blob


async def _generate_signed_url_v4(
    bucket: str,
    object_key: str,
    expires_in_seconds: int,
    access_token: str,
    service_account_email: str,
    private_key: Optional[str] = None,
) -> str:
    now = time.gmtime()
    datestamp = time.strftime("%Y%m%d", now)
    timestamp = time.strftime("%Y%m%dT%H%M%SZ", now)
    credential_scope = f"{datestamp}/auto/storage/goog4_request"
    credential = f"{service_account_email}/{credential_scope}"

    canonical_query = "&".join(
        [
            f"X-Goog-Algorithm=GOOG4-RSA-SHA256",
            f"X-Goog-Credential={_encode_rfc3986(credential)}",
            f"X-Goog-Date={timestamp}",
            f"X-Goog-Expires={expires_in_seconds}",
            f"X-Goog-SignedHeaders=host",
        ]
    )

    canonical_uri = f"/{bucket}/{_encode_path(object_key)}"
    canonical_request = "\n".join(
        [
            "GET",
            canonical_uri,
            canonical_query,
            "host:storage.googleapis.com",
            "",
            "host",
            "UNSIGNED-PAYLOAD",
        ]
    )

    hash_hex = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = "\n".join(
        [
            "GOOG4-RSA-SHA256",
            timestamp,
            credential_scope,
            hash_hex,
        ]
    )

    if private_key:
        import rsa  # type: ignore

        key = rsa.PrivateKey.load_pkcs1(private_key.encode("utf-8"))
        signature_bytes = rsa.sign(string_to_sign.encode("utf-8"), key, "SHA-256")
        signature = signature_bytes.hex()
    else:
        signed_blob = await _sign_string_with_iam(string_to_sign, access_token, service_account_email)
        signature = base64.b64decode(signed_blob).hex()

    return f"{GCS_API_BASE}{canonical_uri}?{canonical_query}&X-Goog-Signature={signature}"


async def _upload_to_gcs(
    bucket: str,
    object_key: str,
    buffer: bytes,
    content_type: str,
    access_token: str,
) -> None:
    upload_url = f"{GCS_API_BASE}/upload/storage/v1/b/{_encode_rfc3986(bucket)}/o"
    params = {"uploadType": "media", "name": object_key}
    async with httpx.AsyncClient() as client:
        response = await client.post(
            upload_url,
            params=params,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": content_type,
            },
            content=buffer,
            timeout=10.0,
        )
    response.raise_for_status()


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
            access_token = await _get_gcp_access_token()
            service_account_email = await _fetch_metadata("instance/service-accounts/default/email")
            private_key = os.environ.get("GCS_SIGNING_PRIVATE_KEY")

            await _upload_to_gcs(
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


async def delete_uploads(urls: List[Union[str, None, float, int]]) -> None:
    filtered = [u for u in urls if isinstance(u, str) and u]
    if not filtered:
        return
    if settings.uploads_bucket:
        try:
            access_token = await _get_gcp_access_token()
            async with httpx.AsyncClient() as client:
                for url in filtered:
                    try:
                        parsed = httpx.URL(url)
                        parts = [p for p in parsed.path.split("/") if p]
                        key = parts[1:] if parsed.host == "storage.googleapis.com" else parts
                        object_key = "/".join(key)
                        delete_url = f"{GCS_API_BASE}/storage/v1/b/{_encode_rfc3986(settings.uploads_bucket)}/o/{_encode_rfc3986(object_key)}"
                        await client.delete(delete_url, headers={"Authorization": f"Bearer {access_token}"}, timeout=5.0)
                    except Exception:
                        continue
            return
        except Exception:
            pass

    # local cleanup
    upload_dir = Path("public")
    for url in filtered:
        if url.startswith("/uploads/"):
            path = upload_dir / url.lstrip("/")
            try:
                path.unlink(missing_ok=True)  # type: ignore[arg-type]
            except Exception:
                continue
