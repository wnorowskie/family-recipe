# FastAPI verification

Run this when the change touches [apps/api/](../../apps/api/) — routers, schemas, dependencies, security helpers. Service context: [apps/api/CLAUDE.md](../../apps/api/CLAUDE.md). Setup/run: [apps/api/README.md](../../apps/api/README.md).

FastAPI mirrors the Next API contract. A change here almost always pairs with a change to [src/app/api/](../../src/app/api/) — see [next-api.md](next-api.md).

## Start the service

Bring up the sandbox stack first — [scripts/local-stack-up.sh](../../scripts/local-stack-up.sh) also generates the Python Prisma client so FastAPI can start. Then run uvicorn through the wrapper so it picks up the sandbox `DATABASE_URL`:

```bash
scripts/local-stack-up.sh
scripts/with-local-stack.sh bash -c '
  source apps/api/.venv/bin/activate
  uvicorn apps.api.src.main:app --reload --port 8000
' &
until curl -sf http://localhost:8000/health >/dev/null; do sleep 0.5; done
```

If `apps/api/.venv` doesn't exist:

```bash
cd apps/api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cd ../..
scripts/local-stack-up.sh   # (re)generates the Python Prisma client
```

FastAPI listens on `:8000`. The recipe-url-importer also defaults to `:8000` — don't run both at once. Pick a different port (`--port 8001`) if you need both.

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
