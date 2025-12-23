# Recipe URL Importer (FastAPI)

Minimal service that fetches a public recipe URL and returns a normalized draft for the frontend. Config is driven by `IMPORTER_*` env vars (see `SPEC.md` for details).

## Prerequisites

- Python 3.12
- Docker (optional, for container builds)

## Local setup

```bash
cd apps/recipe-url-importer
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run (dev)

```bash
PYTHONPATH=src uvicorn --app-dir src recipe_url_importer.app:app --reload
```

Service listens on `http://localhost:8000`. Configure via env vars, e.g.:

```bash
export IMPORTER_MAX_HTML_BYTES=3000000
export IMPORTER_ENABLE_HEADLESS=false
```

## Tests

```bash
pip install -r requirements-dev.txt
PYTHONPATH=src pytest
```

## Docker

From repo root:

```bash
docker build -f apps/recipe-url-importer/Dockerfile -t recipe-url-importer:dev .
docker run -p 8000:8000 recipe-url-importer:dev
```

If you run the build from inside `apps/recipe-url-importer`, set the context to the repo root:

```bash
docker build -f Dockerfile -t recipe-url-importer:dev ..
```

## CI

GitHub Actions workflow `/.github/workflows/recipe-url-importer-ci.yml` runs lint, type-check, tests, image build, and scans.
