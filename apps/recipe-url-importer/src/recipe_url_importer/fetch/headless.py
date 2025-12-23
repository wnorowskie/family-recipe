from __future__ import annotations

from ..config import Settings


async def render_page_html(url: str, settings: Settings, request_id: str) -> str | None:
    """Placeholder for headless rendering (Playwright) to be added later."""
    if not settings.enable_headless:
        return None
    # Headless rendering is intentionally not shipped in v1; return None to trigger warnings/fallbacks.
    return None
