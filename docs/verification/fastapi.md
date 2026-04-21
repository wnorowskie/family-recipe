# FastAPI verification

Run this when the change touches [apps/api/](../../apps/api/) — routers, schemas, dependencies, security helpers. Service context: [apps/api/CLAUDE.md](../../apps/api/CLAUDE.md). Setup/run: [apps/api/README.md](../../apps/api/README.md).

FastAPI mirrors the Next API contract. A change here almost always pairs with a change to [src/app/api/](../../src/app/api/) — see [next-api.md](next-api.md).

## Start the service

```bash
cd apps/api
source .venv/bin/activate
uvicorn apps.api.src.main:app --reload --port 8000 &
until curl -sf http://localhost:8000/health >/dev/null; do sleep 0.5; done
```

If `.venv` doesn't exist:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
npx prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy
```

FastAPI listens on `:8000`. The recipe-url-importer also defaults to `:8000` — don't run both at once. Pick a different port (`--port 8001`) if you need both.

FastAPI requires **Postgres** — it uses the Python Prisma client generated against `schema.postgres.prisma`. There is no SQLite path. If local Postgres isn't running, start it (docker-compose or native) before running the API.

## Auth and cookie flow

The session cookie format is identical to Next — same JWT, same `JWT_SECRET`, same cookie name. A cookie obtained by logging in via Next `/api/auth/login` (see [next-api.md](next-api.md)) also works against FastAPI. Useful for contract parity checks.

Login through FastAPI directly:

```bash
COOKIES=/tmp/fastapi-cookies.txt

curl -s -c "$COOKIES" \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"<user>","password":"<pass>"}' \
  http://localhost:8000/auth/login | jq .
```

> **Path note.** FastAPI routers mount **without** an `/api/` prefix (e.g. `/posts`, `/recipes`, `/auth/login`). Next mounts the same resources under `/api/*`. When diffing contracts, expect the path to differ even though the response body should match.

## L0 — curl the route

Same patterns as [next-api.md](next-api.md) — just swap the host to `:8000` **and drop the `/api/` prefix**.

```bash
# Unauthenticated → 401
curl -s -w "\n%{http_code}\n" http://localhost:8000/posts

# Authenticated
curl -s -b "$COOKIES" http://localhost:8000/posts | jq .

# Validation error
curl -s -b "$COOKIES" -H "Content-Type: application/json" \
  -d '{"garbage":true}' http://localhost:8000/posts | jq .
```

## Contract parity check

When changing a shape or status code, diff both services against the same input. Mind the prefix mismatch:

```bash
NEXT=http://localhost:3000
API=http://localhost:8000

# Log in against both (they can share the JWT cookie if JWT_SECRET matches)
diff <(curl -s -b "$COOKIES" "$NEXT/api/posts" | jq -S .) \
     <(curl -s -b "$COOKIES" "$API/posts"     | jq -S .)
```

Any non-empty diff is a parity bug unless intentional (rare — the migration plan is explicit that the contract should not change during cutover).

## Invariants to preserve

Mirror the Next API rules:

- [ ] Auth goes through the dependencies in [apps/api/src/dependencies.py](../../apps/api/src/dependencies.py) (`require_user` / `require_admin`) — never parse the cookie inline
- [ ] Every DB query scopes by `family_space_id` — missing = cross-family leak
- [ ] Request/response models come from [apps/api/src/schemas/](../../apps/api/src/schemas/) (Pydantic)
- [ ] Permission checks use [apps/api/src/permissions.py](../../apps/api/src/permissions.py)
- [ ] Error shape is `{ "error": { "code", "message" } }` — the public contract, unchanged from Next

## Tests

```bash
cd apps/api
source .venv/bin/activate

pytest tests/unit/ -v
pytest tests/integration/ -v
```

Tests run in CI via [.github/workflows/api-ci.yml](../../.github/workflows/api-ci.yml) — also ruff, mypy, pip-audit, semgrep, gitleaks, trivy on the image.

## Before opening the PR

```bash
# Python quality gates (CI will run these; run locally to fail fast)
cd apps/api
ruff check .
mypy src
pytest
```

Stop the service: `lsof -ti :8000 | xargs -r kill -9`.
