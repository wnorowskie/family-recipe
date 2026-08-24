# CLAUDE.md — `apps/api/`

FastAPI re-implementation of the Next.js JSON API. Setup, run, and test commands live in [README.md](README.md).

## Why this exists

**This service is the production backend.** The Phase 4 cutover shipped to prod on 2026-08-23 (release #263, epic #38): FastAPI is the sole backend for auth, sessions, and the JSON API under `/v1/*`. The Next `/api/*` data route handlers were deleted (#231) and the legacy Next JWT/`session`-cookie auth stack was removed (#232, #243).

API behavior changes go **here**, in [src/routers/v1/](src/routers/v1/). There is no longer a Next-side mirror to keep in step. See [docs/API_BACKEND_MIGRATION_PLAN.md](../../docs/API_BACKEND_MIGRATION_PLAN.md) for the architecture and [docs/rollback-phase4.md](../../docs/rollback-phase4.md) for the rollback path (a code revert now — the feature flags are gone).

## What Next still owns

Next keeps only the UI, four same-origin auth proxies under [src/app/api/auth/](../../src/app/api/auth/) (`login`/`signup`/`logout`/`bootstrap`) that forward to `/v1/auth/*`, a `/api/health` check, and the `/v1/*` catch-all proxy at [src/app/v1/[...path]/route.ts](../../src/app/v1/) that forwards browser requests here server-to-server with a Google ID token. That proxy is what lets this service stay IAM-private with no custom domain (#241).

Shared with Next:

- The same Prisma schema ([prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma)) and the same database — schema changes must stay consistent across all three runtimes
- The response shapes the frontend expects, guarded by the OpenAPI snapshot contract test (below)

**Not** shared any more: the `session` cookie, `JWT_SECRET` on the Next service, and the Next-side permissions/auth helpers. Auth state is the `refresh_token` + `csrf_token` cookies this service sets, plus a short-lived in-memory access token the client mints via `/api/auth/bootstrap`.

The Python Prisma client is generated from the postgres schema into the active Python environment's `site-packages` (no committed `prisma-client/` directory — it's gitignored). Use the **Python** CLI so the engine version matches what `prisma-client-py` (v0.15.0) expects; `npx prisma generate` will fail with a version-mismatch error against current Node Prisma releases:

```bash
# from apps/api/, with the project venv active
python -m prisma generate --schema ../../prisma/schema.postgres.prisma --generator clientPy
```

After regenerating, handler code can import models directly (`from prisma.models import User` etc.) and reach all canonical fields — including the StorageKey columns renamed from the legacy `*Url` names. See [scripts/local-stack-up.sh](../../scripts/local-stack-up.sh) for the equivalent step in the local dev flow.

## Auth endpoint roles

`/v1/auth/*` exposes four read paths and one rotating mutation. Keep this split intact when changing anything in [src/routers/v1/auth.py](src/routers/v1/auth.py):

- **`POST /v1/auth/refresh`** is the **only** endpoint that rotates the refresh-token chain. Reuse-detection (chain-burn on a stale `REVOKED_ROTATED` cookie) is exclusive to this path. The double-submit CSRF check applies.
- **`GET /v1/auth/session`** is a **non-rotating** verify-and-return-user path. Used by Next SSR ([src/lib/auth/bootstrapFromCookies.ts](../../src/lib/auth/bootstrapFromCookies.ts)) so server components can prefetch the user on every page render without burning the chain. Replay-safe by design — calling it repeatedly with the same cookie does not mutate the DB. CSRF check applies; reuse-detection does NOT (replaying a `REVOKED_ROTATED` cookie never escalates the chain). **Rotation grace (#274):** a cookie that `/refresh` rotated away within `refresh_rotation_grace_seconds` (default 30s) is still accepted here as a read — this closes the spurious `/login?_se=1` bounce when a top-level navigation races the client's in-flight rotation, without mutating the chain. Only `REVOKED_ROTATED` qualifies (logout / reset / reuse-detected never do); past the window it returns 401. The grace lives in `_within_rotation_grace` / `_lookup_active_refresh_row`.
- **`GET /v1/auth/me`** returns the user via `Authorization: Bearer <accessToken>`. Used after a successful login/signup/refresh, when the client already holds an access token.
- **`POST /v1/auth/login` / `POST /v1/auth/signup`** mint a fresh chain.
- **`POST /v1/auth/logout`** revokes the current chain link (no rotation, no reuse-detection).

Validation logic for the cookie + CSRF gate is shared via `_validate_refresh_cookie` in [src/routers/v1/auth.py](src/routers/v1/auth.py). The `/refresh` handler keeps its own copy because the reuse-detection branch is intertwined with the rejection logic — splitting it would obscure the security-critical control flow.

## Module layout

- [src/main.py](src/main.py) — FastAPI app, includes routers, manages prisma connect/disconnect lifespan
- [src/routers/v1/](src/routers/v1/) — one file per resource; the only router tree since #233 collapsed everything to `/v1`-only
- [src/dependencies.py](src/dependencies.py) / [src/dependencies_v1.py](src/dependencies_v1.py) — auth dependency injectors (the FastAPI equivalent of `withAuth`)
- [src/permissions.py](src/permissions.py) — ownership/admin authorization rules (`canEditPost`/`canDeletePost`/`canDeleteComment`/`canRemoveMember`). Sole owner since the Next-side `permissions.ts` mirror was removed in #243.
- [src/security.py](src/security.py) — JWT verify, password hashing
- [src/tokens.py](src/tokens.py) / [src/cookies.py](src/cookies.py) — access/refresh token minting and the `refresh_token` + `csrf_token` cookie contract
- [src/rate_limit.py](src/rate_limit.py) — in-process IP-keyed limiters on `/v1/auth/{login,signup,reset}` (#175). `/v1/auth/{session,refresh}` are deliberately excluded — SSR calls them through the Next service, so a per-IP bucket would collapse all family traffic onto one IP.
- [src/idempotency.py](src/idempotency.py) — `X-Request-Id` replay store, `INSERT … ON CONFLICT` for at-most-once handler execution (#180, #223)
- [src/schemas/](src/schemas/) — Pydantic request/response models (mirrors `validation.ts` + `apiErrors.ts`)
- [src/uploads.py](src/uploads.py) — signed URL resolution for GCS; the GCS SDK surface is isolated in [src/gcs_client.py](src/gcs_client.py) (#195)
- [src/recipe_importer.py](src/recipe_importer.py) — client for the standalone importer service, called from the recipes router
- [src/settings.py](src/settings.py) — config with `validate_settings` fail-fast; `ENVIRONMENT=production` enables secure cookies

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

The Next side validates its `/v1/*` requests against this snapshot via [\_\_tests\_\_/integration/openapi-contract.test.ts](../../__tests__/integration/openapi-contract.test.ts). When the frontend adds a new `/v1/*` call, append an entry to the `FRONTEND_CALLS` manifest in that file so the contract test guards it.

## Deployment

[deploy-api.yml](../../.github/workflows/deploy-api.yml) (dev, on `develop`) and [deploy-api-prod.yml](../../.github/workflows/deploy-api-prod.yml) (prod, on `main`) build this service and deploy it with the canary pattern: push at `--no-traffic` behind a `candidate` tag, smoke `/v1/health` with an ID token against the tagged URL, then `--to-latest`; a failed smoke pins traffic back to the previous revision. Both prod workflows are path-filtered on `apps/api/**` and `prisma/**`.

Two things to know:

- **Schema migrations are not run here.** `deploy-prod.yml` owns `prisma migrate deploy` for the shared database, so two workflows never race to apply the same migration on one push.
- The service is **IAM-private** — only the runtime and deployer service accounts hold `run.invoker`. An unauthenticated request gets a 403 from Cloud Run before it ever reaches this app, so debugging a "403" in prod usually means a missing ID token, not an auth bug in here.

## Verification

Before opening a PR that touches this service, run the [FastAPI playbook](../../docs/verification/fastapi.md) — includes the curl+cookie loop, contract parity check against the Next mirror, and the local quality gates.
