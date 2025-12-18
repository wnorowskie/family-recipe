# Family Recipe API (FastAPI)

FastAPI extraction of the Next.js API. Mirrors auth/session behavior and shares the same Prisma schema/database.

## Prerequisites

- Python 3.11+
- Node.js (for Prisma CLI) available on PATH
- `.env` at repo root with `DATABASE_URL`, `JWT_SECRET`, and other existing vars

## Setup

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Generate the Python Prisma client (uses `prisma/schema.postgres.prisma`):

```bash
npx prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy
```

## Run (dev)

```bash
uvicorn apps.api.src.main:app --reload
```

The service will read env vars from the repo `.env` (via `pydantic-settings`).

## Testing

Install dev dependencies:

```bash
pip install -r requirements-dev.txt
```

Run tests:

```bash
# Run all unit tests
pytest tests/unit/

# Run with verbose output
pytest tests/unit/ -v

# Run a specific test file
pytest tests/unit/test_permissions.py
```

## Coverage

```bash
# Terminal report with missing lines
pytest tests/unit/ --cov=src --cov-report=term-missing

# Generate HTML report (opens in browser on macOS)
./scripts/coverage.sh --html

# Other coverage options
./scripts/coverage.sh              # Quick terminal report
./scripts/coverage.sh --xml        # XML report (for CI)
./scripts/coverage.sh --fail=50    # Fail if coverage < 50%
```

## Notes

- Session cookies, JWT payload/TTL, and auth flows match the monolith.
- Signed URL support (GCS) is scaffolded; ensure `UPLOADS_BUCKET` and `UPLOADS_SIGNED_URL_TTL_SECONDS` are set when wiring uploads.
- Rate limiting is intentionally omitted for the first cut; can be added later if needed.
