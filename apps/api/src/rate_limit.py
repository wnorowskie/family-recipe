"""In-process rate limiter for /v1 endpoints (first introduced for #183).

Mirrors src/lib/rateLimit.ts. Per-instance state — production runs a
single Cloud Run instance so this is sufficient for the same reason
the Next side accepts it (see [src/lib/rateLimit.ts] module comment).
A shared-store variant is tracked in issue #33 and is the responsibility
of #175 to bring online for the wider /v1/auth/* surface; this module
lives in apps/api so the v1 cutover doesn't depend on either.

## Why not a third-party library

`slowapi` and `fastapi-limiter` solve more general problems (Redis
backend, custom keyfuncs, decorator API) at the cost of a dependency
and an opaque control flow. The Next.js side hand-rolls the same loop
in <100 lines; matching that surface here keeps the two implementations
straightforwardly comparable for the migration audit and means a single
PR can replace both with a Redis-backed limiter when #33 lands.

## TTL semantics

Each `(name, key)` entry stores `(count, reset_at)`. On every request:

1. If no entry or `now >= reset_at` → reset counter to 1, return allowed
2. If `count < limit` → increment, return allowed
3. Otherwise → return denied with `retry_after = ceil(reset_at - now)`

The window is fixed (not sliding) — same as Next. A burst at the very
end of a window followed by a burst at the start of the next can yield
up to `2 * limit` requests in `windowSeconds`; that's the documented
trade-off in the Next side and acceptable for the abuse surface this
guards (best-effort, not a security boundary).
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
# values live in one place and can be cross-referenced with the Next
# src/lib/rateLimit.ts file during the migration audit.
#
# `feedback_limiter` (issue #183): 20 submissions/hour/user.
# The migration plan specifies 20/hour/user; the Next side ships 10/hour
# (legacy, predates the plan). We honour the plan for the v1 contract —
# the Next limit can be bumped to match when the legacy route is retired.
feedback_limiter = RateLimiter(
    name="feedback", limit=20, window_seconds=60 * 60
)
