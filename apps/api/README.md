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

## Run (Docker)

The API has a dedicated image definition at `apps/api/Dockerfile` and is wired into the root `docker-compose.yml`.

```bash
# Build the FastAPI image (only needed after dependency changes)
docker compose build fastapi

# Run the API + postgres dependencies
docker compose up fastapi
```

The compose service reuses the same Postgres container as the Next.js app and exposes the API at http://localhost:8000. Override `DATABASE_URL`, `JWT_SECRET`, or any other settings via `docker compose run -e VAR=value fastapi` or by editing the service definition if you need different values locally.

## Continuous Integration

GitHub Actions workflow `/.github/workflows/api-ci.yml` keeps the FastAPI service green in CI. It runs Ruff linting, mypy type-checking, pytest (unit + integration), builds the Docker image, scans the image with Trivy, audits Python dependencies via `pip-audit`, and executes Semgrep plus Gitleaks for security coverage.

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
