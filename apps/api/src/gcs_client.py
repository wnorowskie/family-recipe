import base64
import hashlib
import time
from typing import Optional

import httpx

GCS_API_BASE = "https://storage.googleapis.com"


def _encode_rfc3986(value: str) -> str:
    encoded = str(httpx.QueryParams({value: ""}))
    return encoded.replace("=", "").replace("+", "%20").replace("%7E", "~")


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


async def get_gcp_access_token() -> str:
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
            "X-Goog-Algorithm=GOOG4-RSA-SHA256",
            f"X-Goog-Credential={_encode_rfc3986(credential)}",
            f"X-Goog-Date={timestamp}",
            f"X-Goog-Expires={expires_in_seconds}",
            "X-Goog-SignedHeaders=host",
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


async def upload_to_gcs(
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
