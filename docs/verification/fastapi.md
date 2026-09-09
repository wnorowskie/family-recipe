# FastAPI verification

Run this when the change touches [apps/api/](../../apps/api/) — routers, schemas, dependencies, security helpers. Service context: [apps/api/CLAUDE.md](../../apps/api/CLAUDE.md). Setup/run: [apps/api/README.md](../../apps/api/README.md).

FastAPI is the sole backend — there is no Next mirror to keep in step. A change here pairs with a Next change only when the frontend calls a new or reshaped endpoint, in which case regenerate the OpenAPI snapshot and update `FRONTEND_CALLS` (below).

## Start the service

Bring up the sandbox stack first — [scripts/local-stack-up.sh](../../scripts/local-stack-up.sh) also generates the Python Prisma client so FastAPI can start. Then run uvicorn through the wrapper so it picks up the sandbox `DATABASE_URL`:

```bash
scripts/local-stack-up.sh
scripts/with-local-stack.sh bash -c '
  source apps/api/.venv/bin/activate
  uvicorn apps.api.src.main:app --reload --port 8000
' &
scripts/wait-for-http.sh http://localhost:8000/v1/health     # FastAPI
```

If `apps/api/.venv` doesn't exist:

```bash
cd apps/api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cd ../..
scripts/local-stack-up.sh   # (re)generates the Python Prisma client
```

FastAPI listens on `:8000`. The recipe-url-importer also defaults to `:8000` — don't run both at once. Pick a different port (`--port 8001`) if you need both. If you move FastAPI off `:8000`, re-run `API_PORT=8001 scripts/local-stack-up.sh` so the `API_INTERNAL_URL` in `.env.sandbox` still points at it — otherwise the Next auth proxies keep forwarding to the old port (#299).

FastAPI requires **Postgres** — it uses the Python Prisma client generated against `schema.postgres.prisma`. There is no SQLite path. If the sandbox stack isn't up, run `scripts/local-stack-up.sh`.

## Auth and cookie flow

FastAPI owns auth outright — there is no shared `session` cookie with Next any more, and `JWT_SECRET` is no longer set on the Next service (#232, #243). A successful login sets two HTTP-only cookies from FastAPI, `refresh_token` and `csrf_token`; the short-lived access token is held **in memory** by the client and minted via `/api/auth/bootstrap`.

Consequences when testing by hand:

- The `refresh_token` cookie is what a cookie jar carries. Endpoints taking `Authorization: Bearer <accessToken>` (such as `/v1/auth/me`) need a token from a login/refresh response, not the jar.
- `POST /v1/auth/refresh` is the **only** rotating endpoint and enforces double-submit CSRF — send the `csrf_token` value back as a header. `GET /v1/auth/session` is the non-rotating read used by SSR, so prefer it when you just want to verify a cookie.
- Replaying an old `refresh_token` against `/refresh` will burn the chain (reuse detection). If a test loop starts 401ing, log in again rather than debugging the token.

Login through FastAPI directly via [scripts/claude-login.sh](../../scripts/claude-login.sh):

```bash
COOKIES=$(COOKIES=/tmp/fastapi-cookies.txt scripts/claude-login.sh --host http://localhost:8000)
```

The script routes to `/v1/auth/login` when the host targets `:8000` and to `/api/auth/login` otherwise. Credentials come from `CLAUDE_TEST_USER` / `CLAUDE_TEST_PASSWORD` (seeded by `npm run db:seed`).

> **Path note.** Every FastAPI route lives under `/v1/*` (`/v1/posts`, `/v1/recipes`, `/v1/auth/login`) — #233 collapsed the routers to `/v1`-only and deleted the un-prefixed rollout aliases, so a bare `/posts` or `/auth/login` now 404s. Next no longer mirrors these paths at all: its only remaining handlers are the four `/api/auth/*` proxies and `/api/health`. Against a **deployed** environment, hit `/v1/*` on the Next origin — the catch-all proxy forwards it to the IAM-private FastAPI service; calling the API host directly returns 403 from Cloud Run.

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

## Contract check

There is no cross-service diff any more — #231 deleted the `/api/*` handlers this used to be compared against, and #232/#243 removed the shared `session` cookie that made a side-by-side login possible. The contract guard is now the committed OpenAPI snapshot:

```bash
cd apps/api
python scripts/dump_openapi.py > openapi.snapshot.json
git diff --stat openapi.snapshot.json
```

Regenerate it in the same PR as any router, schema, docstring, decorator, or signature change — the `openapi-diff` job in [api-ci.yml](../../.github/workflows/api-ci.yml) fails on drift. Treat the snapshot diff as the contract changelog. A locally-generated snapshot can show spurious `format: binary` / ValidationError `ctx,input` noise from a Pydantic version mismatch; don't commit that — CI regenerates against pinned deps.

## Invariants to preserve

- [ ] Auth goes through an injected dependency — `get_current_user_v1` ([dependencies_v1.py](../../apps/api/src/dependencies_v1.py), Bearer-only, preferred for new handlers) or `get_current_user` ([dependencies.py](../../apps/api/src/dependencies.py)) — never parse the token or cookie inline
- [ ] Every DB query scopes by `family_space_id` — missing = cross-family leak
- [ ] Request/response models come from [apps/api/src/schemas/](../../apps/api/src/schemas/) (Pydantic)
- [ ] Permission checks use [apps/api/src/permissions.py](../../apps/api/src/permissions.py)
- [ ] Error shape is `{ "error": { "code", "message" } }` — raise via `ApiError`, never a bare `HTTPException(detail=dict)`; the global handler won't unwrap a dict into the envelope

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
