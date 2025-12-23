from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict
from urllib.parse import urljoin

import httpx

from ..config import Settings
from ..exceptions import ContentTooLargeError, FetchTimeoutError, UpstreamFetchFailed
from ..security.url_validation import validate_redirect, validate_url_target


@dataclass
class FetchResult:
    content: str
    status_code: int
    elapsed_ms: float
    final_url: str
    upstream_status: int


async def fetch_html(url: str, settings: Settings, request_id: str) -> FetchResult:
    """Fetch HTML with SSRF protections, redirect validation, and size limits."""
    headers: Dict[str, str] = {
        "User-Agent": settings.user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "X-Request-ID": request_id,
    }

    validated_url = validate_url_target(url, settings)
    timeout = httpx.Timeout(
        timeout=settings.fetch_timeout_seconds,
        connect=settings.connect_timeout_seconds,
        read=settings.read_timeout_seconds,
    )

    redirect_count = 0
    current_url = validated_url

    async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
        while True:
            start = time.perf_counter()
            try:
                response = await client.get(current_url, headers=headers)
            except (httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
                raise FetchTimeoutError() from exc
            except httpx.HTTPError as exc:
                raise UpstreamFetchFailed(str(exc)) from exc

            if response.is_redirect and response.headers.get("location"):
                redirect_target = urljoin(current_url, response.headers["location"])
                current_url = validate_redirect(redirect_target, settings, redirect_count)
                redirect_count += 1
                continue

            if response.status_code >= 400:
                raise UpstreamFetchFailed(f"Upstream responded with status {response.status_code}")

            total_read = 0
            chunks: list[bytes] = []
            async for chunk in response.aiter_bytes():
                total_read += len(chunk)
                if total_read > settings.max_html_bytes:
                    raise ContentTooLargeError()
                chunks.append(chunk)

            elapsed_ms = (time.perf_counter() - start) * 1000
            final_url = str(response.url)
            encoding = response.encoding or "utf-8"
            content = b"".join(chunks).decode(encoding, errors="replace")

            return FetchResult(
                content=content,
                status_code=response.status_code,
                elapsed_ms=elapsed_ms,
                final_url=final_url,
                upstream_status=response.status_code,
            )
