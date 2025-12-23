from __future__ import annotations

import json
import logging
from typing import Any, Dict


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
    )


def log_json(logger: logging.Logger, message: str, extra: Dict[str, Any]) -> None:
    payload = {"message": message, **extra}
    logger.info(json.dumps(payload))
