"""In-process rate limiter for /v1 endpoints (first introduced for #183).

Per-instance state — production runs a single Cloud Run instance, so a
plain in-memory dict is sufficient. A shared-store variant is tracked in
issue #33 and is the responsibility of #175 to bring online for the wider
/v1/auth/* surface; this module lives in apps/api so the v1 cutover doesn't
depend on either.

## Why not a third-party library

`slowapi` and `fastapi-limiter` solve more general problems (Redis
backend, custom keyfuncs, decorator API) at the cost of a dependency
and an opaque control flow. A hand-rolled fixed-window counter in
under 100 lines covers everything this service actually needs.

## TTL semantics

Each `(name, key)` entry stores `(count, reset_at)`. On every request:

1. If no entry or `now >= reset_at` → reset counter to 1, return allowed
2. If `count < limit` → increment, return allowed
3. Otherwise → return denied with `retry_after = ceil(reset_at - now)`

The window is fixed, not sliding. A burst at the very end of a window
followed by a burst at the start of the next can yield up to `2 * limit`
requests in `window_seconds`; that's an accepted trade-off for the abuse
surface this guards (best-effort, not a security boundary).
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from threading import Lock
from typing import Dict, Optional, Tuple


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after_seconds: Optional[int] = None


class RateLimiter:
    """Single-window counter keyed by `(name, key)`.

    `name` namespaces the limiter so two limiters with the same key
    space (e.g. user id) don't collide. `key` is the per-caller token —
    typically `user_id` for authenticated endpoints, `ip` for unauthed.
    """

    def __init__(self, *, name: str, limit: int, window_seconds: int) -> None:
        self._name = name
        self._limit = limit
        self._window_seconds = window_seconds
        # A plain dict — bounded by the active key set, which for the
        # feedback endpoint is `min(family_member_count, traffic-in-an-hour)`.
        # If we add high-cardinality limiters (IP-keyed unauthed paths) we'll
        # want an LRU here; tracked in #33.
        self._entries: Dict[str, Tuple[int, float]] = {}
        self._lock = Lock()

    def check(self, key: str, *, now: Optional[float] = None) -> RateLimitResult:
        """Check and atomically record a hit against `key`.

        `now` is overridable for tests so they can advance the clock
        without sleeping for the full window.
        """
        ts = time.monotonic() if now is None else now
        full_key = f"{self._name}:{key}"
        with self._lock:
            entry = self._entries.get(full_key)
            if entry is None or ts >= entry[1]:
                self._entries[full_key] = (1, ts + self._window_seconds)
                return RateLimitResult(allowed=True)
            count, reset_at = entry
            if count < self._limit:
                self._entries[full_key] = (count + 1, reset_at)
                return RateLimitResult(allowed=True)
            return RateLimitResult(
                allowed=False,
                retry_after_seconds=max(1, math.ceil(reset_at - ts)),
            )

    def reset(self) -> None:
        """Test hook — clears all entries. Not for production code paths."""
        with self._lock:
            self._entries.clear()


# Pre-configured limiters. Add new ones here rather than constructing
# anonymous RateLimiter() instances at handler-import time so the limit
# values live in one place.
#
# `feedback_limiter` (issue #183): 20 submissions/hour/user, per the
# migration plan.
feedback_limiter = RateLimiter(
    name="feedback", limit=20, window_seconds=60 * 60
)

# Auth-surface limiters (issues #175, #265). These are IP-keyed — the caller
# token is `_client_ip(request)` from routers/v1/auth.py, not a user id — so
# unlike the feedback limiter they are the high-cardinality case the module
# docstring flags above: the plain dict grows with distinct client IPs and gets
# no eviction until the LRU/shared-store work in #33 lands. reset reuses the
# login window per the #175 ticket (parity with what the legacy
# /api/auth/reset route got from the Next side's old login limiter).
login_limiter = RateLimiter(name="login", limit=5, window_seconds=15 * 60)
signup_limiter = RateLimiter(name="signup", limit=3, window_seconds=60 * 60)
reset_limiter = RateLimiter(name="reset", limit=5, window_seconds=15 * 60)

# session/refresh were deliberately unlimited until #265: their legitimate
# traffic arrives server-to-server from Next SSR, and until the SSR path
# forwarded the browser's X-Forwarded-For a per-IP bucket would have collapsed
# the whole family onto the Next service's IP. #265 forwards the real client IP
# through fetchUpstream, so these can now be keyed per real client IP like the
# rest of the auth surface. Limits carry the #175 acceptance criteria migrated
# onto #265: /session ~60/IP/min (SSR hits it on every protected render),
# /refresh ~30/IP/min (page nav with a stale token). Both use a 60s window.
#
# Headroom watch (confirm at release via docs/verification/dev-deployments.md):
# the /session budget is per *real client IP*, so it is shared by everyone
# behind one public IP — several family members on a shared household NAT count
# against the same 60/min, and each full protected SSR render (plus any
# prefetch that renders a dynamic (app) segment) spends one. Default Next Link
# prefetch skips dynamic segments, so normal navigation should stay well under
# 60/min per household, but this is the number to revisit if real users see
# spurious /login?_se=1 bounces under heavy simultaneous use.
session_limiter = RateLimiter(name="session", limit=60, window_seconds=60)
refresh_limiter = RateLimiter(name="refresh", limit=30, window_seconds=60)
