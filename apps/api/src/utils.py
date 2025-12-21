import re
from datetime import datetime
from typing import Optional

CUID_REGEX = re.compile(r"^[a-z0-9]{25,}$")


def is_cuid(value: str) -> bool:
    return bool(CUID_REGEX.match(value))


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.replace(tzinfo=dt.tzinfo or None).isoformat()
