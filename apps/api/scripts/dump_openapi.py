#!/usr/bin/env python3
"""Dump the FastAPI app's OpenAPI spec to stdout as deterministic JSON.

Used by both local devs and CI to (re)generate apps/api/openapi.snapshot.json.
The CI job in .github/workflows/api-ci.yml diffs this script's output against
the committed snapshot; any drift fails the build.

Stubs the `prisma` package so the spec can be dumped without a generated
client or live database — same pattern as tests/conftest.py.
"""
from __future__ import annotations

import json
import os
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock


def _stub_prisma() -> None:
    if "prisma" in sys.modules:
        return

    mock = MagicMock()
    mock.is_connected.return_value = False

    prisma_stub = types.ModuleType("prisma")
    prisma_stub.Prisma = lambda: mock  # type: ignore[attr-defined]

    errors_stub = types.ModuleType("prisma.errors")
    errors_stub.PrismaError = Exception  # type: ignore[attr-defined]

    models_stub = types.ModuleType("prisma.models")

    # `recipes.py` does `cast(List[CookedEvent], ...)` at module load,
    # so this symbol must resolve to a real class — a MagicMock breaks
    # the typing machinery during import.
    class _CookedEvent:
        postId: str
        rating: int | None

        def __init__(self, postId: str = "", rating: int | None = None) -> None:
            self.postId = postId
            self.rating = rating

    models_stub.CookedEvent = _CookedEvent  # type: ignore[attr-defined]

    sys.modules["prisma"] = prisma_stub
    sys.modules["prisma.errors"] = errors_stub
    sys.modules["prisma.models"] = models_stub


def main() -> int:
    api_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(api_root))

    os.environ.setdefault("DATABASE_URL", "postgresql://snapshot:snapshot@localhost:5432/snapshot")
    os.environ.setdefault("JWT_SECRET", "snapshot-secret-not-used")
    os.environ.setdefault("ENVIRONMENT", "test")

    _stub_prisma()

    from src.main import app  # noqa: E402

    spec = app.openapi()
    json.dump(spec, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
