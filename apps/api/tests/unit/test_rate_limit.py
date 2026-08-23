"""Unit tests for the in-process RateLimiter (src/rate_limit.py).

Covers the fixed-window counter itself with an injected clock (`check(key,
now=...)`) so window-expiry is exercised without sleeping, plus the config of
the pre-declared auth limiters added in issue #175. The IP-keyed wiring onto the
handlers is covered by the integration tests in test_auth_v1.py.
"""
import math

from src.rate_limit import (
    RateLimiter,
    RateLimitResult,
    login_limiter,
    reset_limiter,
    signup_limiter,
)


class TestBucketFills:
    """First `limit` hits allowed, the next denied — within one window."""

    def test_allows_up_to_limit_then_denies(self):
        limiter = RateLimiter(name="t", limit=3, window_seconds=60)
        results = [limiter.check("ip-a", now=1000.0) for _ in range(3)]
        assert all(r.allowed for r in results)

        denied = limiter.check("ip-a", now=1000.0)
        assert denied.allowed is False
        assert denied.retry_after_seconds is not None

    def test_denied_result_carries_retry_after(self):
        # window closes at 1000 + 60 = 1060; at now=1010 that is 50s away.
        limiter = RateLimiter(name="t", limit=1, window_seconds=60)
        assert limiter.check("ip-a", now=1000.0).allowed is True
        denied = limiter.check("ip-a", now=1010.0)
        assert denied == RateLimitResult(allowed=False, retry_after_seconds=50)

    def test_retry_after_is_ceiled_and_at_least_one(self):
        limiter = RateLimiter(name="t", limit=1, window_seconds=60)
        limiter.check("ip-a", now=1000.0)
        # 0.4s left in the window → ceil to 1, never 0.
        denied = limiter.check("ip-a", now=1059.6)
        assert denied.retry_after_seconds == 1
        assert denied.retry_after_seconds == max(1, math.ceil(1060.0 - 1059.6))


class TestWindowReset:
    """Once `now` passes `reset_at`, the bucket refills."""

    def test_allows_again_after_window_expires(self):
        limiter = RateLimiter(name="t", limit=2, window_seconds=60)
        limiter.check("ip-a", now=1000.0)
        limiter.check("ip-a", now=1000.0)
        assert limiter.check("ip-a", now=1000.0).allowed is False

        # now == reset_at (1060) counts as expired (>=), so it resets.
        assert limiter.check("ip-a", now=1060.0).allowed is True
        assert limiter.check("ip-a", now=1060.0).allowed is True
        assert limiter.check("ip-a", now=1060.0).allowed is False


class TestDistinctBuckets:
    def test_distinct_keys_are_independent(self):
        limiter = RateLimiter(name="t", limit=1, window_seconds=60)
        assert limiter.check("ip-a", now=1000.0).allowed is True
        assert limiter.check("ip-a", now=1000.0).allowed is False
        # A different key gets its own fresh bucket.
        assert limiter.check("ip-b", now=1000.0).allowed is True

    def test_distinct_names_do_not_collide_on_same_key(self):
        one = RateLimiter(name="one", limit=1, window_seconds=60)
        two = RateLimiter(name="two", limit=1, window_seconds=60)
        assert one.check("shared", now=1000.0).allowed is True
        assert one.check("shared", now=1000.0).allowed is False
        # Same key, different limiter instance/name → separate keyspace.
        assert two.check("shared", now=1000.0).allowed is True


class TestReset:
    def test_reset_clears_all_entries(self):
        limiter = RateLimiter(name="t", limit=1, window_seconds=60)
        limiter.check("ip-a", now=1000.0)
        assert limiter.check("ip-a", now=1000.0).allowed is False
        limiter.reset()
        assert limiter.check("ip-a", now=1000.0).allowed is True


class TestAuthLimiterConfig:
    """Guards the issue-#175 limits against accidental drift (they mirror the
    Next src/lib/rateLimit.ts values)."""

    def test_login_limiter_is_5_per_15_min(self):
        assert (login_limiter._limit, login_limiter._window_seconds) == (5, 15 * 60)

    def test_signup_limiter_is_3_per_hour(self):
        assert (signup_limiter._limit, signup_limiter._window_seconds) == (3, 60 * 60)

    def test_reset_limiter_is_5_per_15_min(self):
        assert (reset_limiter._limit, reset_limiter._window_seconds) == (5, 15 * 60)
