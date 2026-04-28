# CLAUDE.md — `apps/api/`

FastAPI re-implementation of the Next.js JSON API. Setup, run, and test commands live in [README.md](README.md).

## Why this exists

The Next.js route handlers in [src/app/api/](../../src/app/api/) are the **current** production backend. This service is the **migration target** — when complete, the Next frontend will call FastAPI via `NEXT_PUBLIC_API_BASE_URL` and the Next API routes will be removed. See [docs/API_BACKEND_MIGRATION_PLAN.md](../../docs/API_BACKEND_MIGRATION_PLAN.md).

## Stay in sync with Next

When you change an endpoint here, check whether the equivalent in `src/app/api/` needs the same change (and vice-versa). The two services share:

- The same Prisma schema ([prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma))
- The same database
- The same JWT format and `session` cookie semantics
- The same request/response shapes (the migration plan is explicit that the contract should not change during the cutover, except for the planned `/v1/` prefix and access/refresh-token split)

The Python Prisma client is generated from the postgres schema:

```bash
npx prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy
```

## Auth endpoint roles

`/v1/auth/*` exposes four read paths and one rotating mutation. Keep this split intact when changing anything in [src/routers/v1/auth.py](src/routers/v1/auth.py):

- **`POST /v1/auth/refresh`** is the **only** endpoint that rotates the refresh-token chain. Reuse-detection (chain-burn on a stale `REVOKED_ROTATED` cookie) is exclusive to this path. The double-submit CSRF check applies.
- **`GET /v1/auth/session`** is a **non-rotating** verify-and-return-user path. Used by Next SSR ([src/lib/auth/bootstrapFromCookies.ts](../../src/lib/auth/bootstrapFromCookies.ts)) so server components can prefetch the user on every page render without burning the chain. Replay-safe by design — calling it repeatedly with the same cookie does not mutate the DB. CSRF check applies; reuse-detection does NOT (replaying a `REVOKED_ROTATED` cookie returns 401 but does not escalate).
- **`GET /v1/auth/me`** returns the user via `Authorization: Bearer <accessToken>`. Used after a successful login/signup/refresh, when the client already holds an access token.
- **`POST /v1/auth/login` / `POST /v1/auth/signup`** mint a fresh chain.
- **`POST /v1/auth/logout`** revokes the current chain link (no rotation, no reuse-detection).

Validation logic for the cookie + CSRF gate is shared via `_validate_refresh_cookie` in [src/routers/v1/auth.py](src/routers/v1/auth.py). The `/refresh` handler keeps its own copy because the reuse-detection branch is intertwined with the rejection logic — splitting it would obscure the security-critical control flow.

## Module layout

- [src/main.py](src/main.py) — FastAPI app, includes routers, manages prisma connect/disconnect lifespan
- [src/routers/](src/routers/) — one file per resource, mirrors [src/app/api/](../../src/app/api/) structure
- [src/dependencies.py](src/dependencies.py) — auth dependency injectors (the FastAPI equivalent of `withAuth`)
- [src/permissions.py](src/permissions.py) — mirrors [src/lib/permissions.ts](../../src/lib/permissions.ts)
- [src/security.py](src/security.py) — JWT verify, password hashing
- [src/schemas/](src/schemas/) — Pydantic request/response models (mirrors `validation.ts` + `apiErrors.ts`)
- [src/uploads.py](src/uploads.py) — signed URL resolution for GCS

## Testing

`pytest tests/unit/` for unit tests, `pytest tests/integration/` for integration. CI runs both plus ruff, mypy, trivy, pip-audit, semgrep, gitleaks ([.github/workflows/api-ci.yml](../../.github/workflows/api-ci.yml)).

## OpenAPI contract snapshot

[openapi.snapshot.json](openapi.snapshot.json) is a committed copy of the FastAPI app's `/openapi.json`. The `openapi-diff` job in [api-ci.yml](../../.github/workflows/api-ci.yml) regenerates the spec on every PR and fails if it drifts from the snapshot. This catches accidental contract changes (renamed field, removed endpoint, altered status code) that unit tests would miss — and forces intentional changes to surface in PR review.

When you change a router, schema, or anything else that affects the public contract, regenerate the snapshot in the same PR:

```bash
cd apps/api
python scripts/dump_openapi.py > openapi.snapshot.json
```

The script stubs `prisma` in-process (no client generation or DB needed) and writes deterministic, sort-key JSON. Reviewers should treat snapshot diffs as the contract changelog.

## Verification

Before opening a PR that touches this service, run the [FastAPI playbook](../../docs/verification/fastapi.md) — includes the curl+cookie loop, contract parity check against the Next mirror, and the local quality gates.
