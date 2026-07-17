import re
from datetime import datetime
from typing import Optional

CUID_REGEX = re.compile(r"^c[a-z0-9]{8,}$")


def is_cuid(value: str) -> bool:
    return bool(CUID_REGEX.match(value))


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.replace(tzinfo=dt.tzinfo or None).isoformat()


def client_ip_from_forwarded_for(
    forwarded_for: Optional[str],
    direct_host: Optional[str],
    trusted_proxy_hops: int,
) -> Optional[str]:
    """Resolve the real client IP from an X-Forwarded-For chain (issue #246).

    A proxy appends the IP of the peer it received the connection from, so the
    right-most entries are added by infrastructure we control and the left-most
    entry is whatever the original client sent — the least trustworthy value.
    We therefore count `trusted_proxy_hops` entries from the RIGHT: with N
    trusted proxies the real client is ``parts[-N]``. Because those N proxies
    always occupy the trailing N positions, a client that prepends a spoofed
    entry only pushes its own value further left, never onto ``parts[-N]``.

    Falls back to ``direct_host`` (the immediate TCP peer) when there is no XFF
    header, when no proxies are trusted (``hops <= 0``, i.e. local/dev), or when
    the chain is shorter than the trusted-hop count (a malformed/truncated
    header) — in every fallback case the returned value is one this service
    observed directly, so it can never be attacker-controlled.
    """
    if trusted_proxy_hops > 0 and forwarded_for:
        parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
        if len(parts) >= trusted_proxy_hops:
            return parts[-trusted_proxy_hops]
    return direct_host
