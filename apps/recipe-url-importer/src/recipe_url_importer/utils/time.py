from __future__ import annotations

import re
from typing import Optional

# Minimal ISO 8601 duration parser for PT#H#M#S patterns.
DURATION_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$",
    re.IGNORECASE,
)


def duration_to_minutes(duration: str | None) -> Optional[int]:
    if not duration:
        return None
    match = DURATION_RE.match(duration.strip())
    if not match:
        return None
    days = int(match.group("days") or 0)
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    total_minutes = days * 24 * 60 + hours * 60 + minutes + (seconds // 60)
    return total_minutes if total_minutes > 0 else None
