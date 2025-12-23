from __future__ import annotations

import re
from typing import Iterable, List, Optional

WHITESPACE_RE = re.compile(r"\s+")


def normalize_whitespace(value: str | None) -> Optional[str]:
    if value is None:
        return None
    collapsed = WHITESPACE_RE.sub(" ", value).strip()
    return collapsed or None


def clean_lines(items: Iterable[str]) -> List[str]:
    cleaned = []
    for item in items:
        normalized = normalize_whitespace(item)
        if normalized:
            cleaned.append(normalized)
    return cleaned
