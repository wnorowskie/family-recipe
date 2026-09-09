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

`/v1/auth/*` has seven endpoints and exactly **one** of them rotates the refresh chain. Keep that split intact when changing anything in [src/routers/v1/auth.py](src/routers/v1/auth.py):

- **`POST /v1/auth/refresh`** is the **only** endpoint that rotates the refresh-token chain. Reuse-detection (chain-burn on a stale `REVOKED_ROTATED` cookie) is exclusive to this path. The double-submit CSRF check applies.
- **`GET /v1/auth/session`** is a **non-rotating** verify-and-return-user path. Used by Next SSR ([src/lib/auth/bootstrapFromCookies.ts](../../src/lib/auth/bootstrapFromCookies.ts)) so server components can prefetch the user on every page render without burning the chain. Replay-safe by design — calling it repeatedly with the same cookie does not mutate the DB. CSRF check applies; reuse-detection does NOT (replaying a `REVOKED_ROTATED` cookie never escalates the chain). **Rotation grace (#274):** a cookie that `/refresh` rotated away within `refresh_rotation_grace_seconds` (default 30s) is still accepted here as a read — this closes the spurious `/login?_se=1` bounce when a top-level navigation races the client's in-flight rotation, without mutating the chain. Only `REVOKED_ROTATED` qualifies (logout / reset / reuse-detected never do); past the window it returns 401. The grace lives in `_within_rotation_grace` / `_lookup_active_refresh_row`.
- **`GET /v1/auth/me`** returns the user via `Authorization: Bearer <accessToken>`. Used after a successful login/signup/refresh, when the client already holds an access token.
- **`POST /v1/auth/login` / `POST /v1/auth/signup`** mint a fresh chain.
- **`POST /v1/auth/logout`** revokes the current chain link (no rotation, no reuse-detection).
- **`POST /v1/auth/reset`** resets a password against the family master key and revokes the user's chains.

Validation logic for the cookie + CSRF gate is shared via `_validate_refresh_cookie` in [src/routers/v1/auth.py](src/routers/v1/auth.py). The `/refresh` handler keeps its own copy because the reuse-detection branch is intertwined with the rejection logic — splitting it would obscure the security-critical control flow.

## Rate limits

[src/rate_limit.py](src/rate_limit.py) holds every limiter in the system — the Next side has none (its `src/lib/rateLimit.ts` went dead with the `/api/*` routes in #231, tracked for deletion in #312). State is in-process and per-instance, so it does not survive a restart and is not shared across replicas (#33). `settings.auth_rate_limit_enabled` disables the auth-surface limiters wholesale, which is how the tests get deterministic runs.

| Endpoint               | Limit      | Key         | Issue |
| ---------------------- | ---------- | ----------- | ----- |
| `/v1/auth/login`       | 5 / 15 min | client IP   | #175  |
| `/v1/auth/signup`      | 3 / hour   | client IP   | #175  |
| `/v1/auth/reset`       | 5 / 15 min | client IP   | #175  |
| `/v1/auth/session`     | 60 / min   | client IP   | #265  |
| `/v1/auth/refresh`     | 30 / min   | client IP   | #265  |
| `POST /v1/feedback`    | 20 / hour  | **user id** | #183  |
| `/v1/auth/{logout,me}` | unlimited  | —           | —     |

Two things to carry into any change here:

- **`/session` and `/refresh` were unlimited on purpose until #265.** SSR reached them through the Next service, so a per-IP bucket would have collapsed every family member onto the Next service's single IP and locked everyone out at once. #265 forwards the browser's real IP through `fetchUpstream`, which is the _precondition_ for these two limiters — if that forwarding is ever removed, these limiters must come out with it.
- **The `/session` budget is shared by a household.** It is keyed by real client IP, so several family members behind one NAT count against the same 60/min, and every protected SSR render spends one. Default Next `Link` prefetch skips dynamic segments, so normal navigation stays well clear — but 60 is the number to revisit if real users report spurious `/login?_se=1` bounces under simultaneous use.

Local aside: a 429 on local login clears by restarting uvicorn, since the limiter is in-process.

## Module layout

- [src/main.py](src/main.py) — FastAPI app, includes routers, manages prisma connect/disconnect lifespan
- [src/routers/v1/](src/routers/v1/) — one file per resource; the only router tree since #233 collapsed everything to `/v1`-only
- [src/dependencies_v1.py](src/dependencies_v1.py) — `get_current_user_v1`, **Bearer-only**. This is the injector new handlers should use.
- [src/dependencies.py](src/dependencies.py) — `get_current_user`, used by most resource routers. It tries Bearer **and then falls back to the legacy `session` cookie** ([:57-65](src/dependencies.py)). That fallback outlived the Phase 4.4 dual-mode deletion (#232) and its inline comment still describes the un-prefixed routers #233 removed — so this module contradicts the "the `session` cookie is gone" claim above. Removal is tracked in #311; don't build on the cookie branch.
- [src/permissions.py](src/permissions.py) — `is_owner_or_admin` / `can_edit_post` / `can_delete_comment` / `can_remove_member`. Post deletion has no dedicated helper — it goes through `is_owner_or_admin`. Sole owner of these rules since the Next-side `permissions.ts` mirror was removed in #243.
- [src/security.py](src/security.py) — JWT verify, password hashing
- [src/tokens.py](src/tokens.py) / [src/cookies.py](src/cookies.py) — access/refresh token minting and the `refresh_token` + `csrf_token` cookie contract
- [src/rate_limit.py](src/rate_limit.py) — in-process limiters, all IP-keyed except `feedback_limiter` (see below)
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

## Base image CVE posture (#248)

[Dockerfile](Dockerfile) is Debian-based (`python:3.12-slim`), not Alpine — `prisma-client-py` only ships an `openssl-1.1.x` musl query engine, which can't run against Alpine's OpenSSL 3. Debian carries a backlog of unfixed HIGH/CRITICAL base-OS CVEs (26 as of 2026-08-24, all `fix_deferred`/`affected` with no upstream fix — `perl-base`, `curl`, `libssh2`, etc.). [api-ci.yml](../../.github/workflows/api-ci.yml)'s `container-scan` job runs Trivy with `ignore-unfixed: true` so it gates only on **fixed** (actionable) CVEs. When Debian ships a fix for a backlog item, the gate goes red until the next image rebuild picks it up via the `apt-get upgrade -y` layers in both Dockerfile stages — see #281 for the last cycle (2026-08-23). Treat a red `container-scan` on `develop` as "time to rebuild," not "add a `.trivyignore` entry."

**Distroless was evaluated and rejected (2026-08-24).** `gcr.io/distroless/python3-debian12`/`-debian13` bundle their own Python (3.11 / 3.13 respectively), not our pinned 3.12, and this service's venv isn't self-contained — `venv/bin/python` is a symlink into the base image's own install, so a naive `FROM` swap breaks on import. Copying the full `/usr/local` Python 3.12 tree into `gcr.io/distroless/cc-debian13` (the closest self-contained equivalent, and the only distroless variant with `libgcc_s`/`libstdc++` for the Rust-based pydantic-core/prisma engine extensions) gets past interpreter and library loading. It still hits a hard blocker: `prisma-client-py`'s engine-selection (`prisma/binaries/platform.py::linux_distro`) unconditionally shells out to `subprocess.run(['cat', '/etc/os-release'])` to pick the engine binary, before it ever checks the `PRISMA_QUERY_ENGINE_BINARY` override — distroless ships no `cat`, so connecting to the DB crashes on startup regardless of the override. Working around it means smuggling `cat` and `openssl` CLI binaries back into the image, which reintroduces roughly the same CVE surface (coreutils/ncurses) that going distroless was meant to remove.

`prisma-client-py` was also archived by its maintainer in April 2025 (zero releases since v0.15.0, the version this service is pinned to; no community fork has taken over) — there's no future release to periodically re-check for an Alpine-compatible (openssl-3.0.x musl) engine.

**Decision: stay on `python:3.12-slim` with `ignore-unfixed: true`**, reviewed reactively whenever `container-scan` goes red on develop (the #281-style cycle). Don't attempt Alpine or distroless again unless `prisma-client-py` itself changes (e.g. a maintained fork, or a schema-engine swap away from it).

## Deployment

[deploy-api.yml](../../.github/workflows/deploy-api.yml) (dev, on `develop`) and [deploy-api-prod.yml](../../.github/workflows/deploy-api-prod.yml) (prod, on `main`) build this service and deploy it with the canary pattern: push at `--no-traffic` behind a `candidate` tag, smoke `/v1/health` with an ID token against the tagged URL, then `--to-latest`; a failed smoke pins traffic back to the previous revision. Both prod workflows are path-filtered on `apps/api/**` and `prisma/**`.

Two things to know:

- **Schema migrations are not run here.** `deploy-prod.yml` owns `prisma migrate deploy` for the shared database, so two workflows never race to apply the same migration on one push.
- The service is **IAM-private** — only the runtime and deployer service accounts hold `run.invoker`. An unauthenticated request gets a 403 from Cloud Run before it ever reaches this app, so debugging a "403" in prod usually means a missing ID token, not an auth bug in here.

## Verification

Before opening a PR that touches this service, run the [FastAPI playbook](../../docs/verification/fastapi.md) — the curl+cookie loop, the OpenAPI snapshot regeneration, and the local quality gates. There is no cross-service parity check any more: #231 deleted the Next mirror this service used to be diffed against, so the snapshot below is the only contract guard.
