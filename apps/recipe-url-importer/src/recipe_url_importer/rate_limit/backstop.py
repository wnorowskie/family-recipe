from __future__ import annotations

import time
from collections import deque
from typing import Deque, Dict


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self.events: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        bucket = self.events.setdefault(key, deque())
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


class BackstopRateLimiter:
    def __init__(self, per_ip_limit: int, per_domain_limit: int):
        self.per_ip = SlidingWindowLimiter(per_ip_limit, 60)
        self.per_domain = SlidingWindowLimiter(per_domain_limit, 60)

    def check(self, ip: str, domain: str) -> bool:
        ip_ok = self.per_ip.allow(ip)
        domain_ok = self.per_domain.allow(domain)
        return ip_ok and domain_ok
