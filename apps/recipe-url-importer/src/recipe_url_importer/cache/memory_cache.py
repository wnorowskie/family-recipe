from __future__ import annotations

import time
from typing import Generic, Optional, TypeVar

T = TypeVar("T")


class MemoryCache(Generic[T]):
    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self._store: dict[str, tuple[float, T]] = {}

    def get(self, key: str) -> Optional[T]:
        now = time.time()
        item = self._store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < now:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: T) -> None:
        expires_at = time.time() + self.ttl_seconds
        self._store[key] = (expires_at, value)
