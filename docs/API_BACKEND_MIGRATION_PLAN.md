# Frontend ↔ FastAPI Migration Plan

> ## ✅ Status: Live in production since 2026-08-23
>
> **FastAPI is the sole application and auth backend, in prod.** Released via PR #263 (merge commit `1912ceab`); epic #38 closed. Prod runs `family-recipe-prod` (Next UI + auth proxies) and `family-recipe-api-prod` (this backend, IAM-private) in `family-recipe-prod`/`us-east1`. Both Phase 4 migrations — `add_refresh_tokens` and `add_idempotency_keys`, both additive — are applied to the prod database.
>
> The Next `/api/*` data routes were deleted (Phase 4.3, #231) and the legacy Next JWT/`session`-cookie auth stack was removed (Phase 4.4, #232). The Next service now serves only the UI plus same-origin auth proxies (`login`/`signup`/`logout`/`bootstrap`) and a health check; all data and auth flow through FastAPI under `/v1/*`.
>
> **Two known gaps carried forward from the release.** The rollout used the repo's candidate-tag canary (deploy at 0% → smoke the tagged revision → promote) rather than the graduated 5/25/50/100 split described below, and the rollback triggers in [Rollback Criteria](#rollback-criteria) are **not wired to alerts** — `Service Down` is inverted (#284) and the API service has no monitoring coverage (#32). Release monitoring was done by hand against Cloud Run logs.
>
> This document is now **two things**: a historical record of how the migration ran, and the reference for the current backend architecture (Phase-status call-outs are inline below). Because the feature flags are gone, **rollback is a code revert, not a config flip** — see the standalone [Phase 4 rollback runbook](rollback-phase4.md).
>
> **Phase 4 sub-phases, all shipped:** 4.1 shared API client on `/v1/*` (#229) · 4.2 refresh-token-only middleware (#230) · 4.3 delete Next `/api/*` data routes (#231) · 4.4 force-on flags + delete dual-mode/legacy auth (#232) · 4.5 collapse FastAPI routers to `/v1`-only (#233) · 4.6 extend dev smoke tooling for FastAPI (#234) · 4.7 docs + rollback runbook (#235) · Deploy FastAPI to Cloud Run (#241).

## Objective

Migrate the Next.js frontend to use the FastAPI service as the primary backend while maintaining stability during the transition. The end state is a token‑based auth system (access + refresh tokens), standardized API contracts, and no reliance on Next.js API route handlers for application data.

## Scope

- Frontend (Next.js) in src
- Backend (FastAPI) in apps/api
- Auth and session model
- API contract alignment (endpoints, payloads, responses)
- Observability and rollout safety

## Principles

- **Best practice auth**: short‑lived access tokens + refresh token rotation
- **Secure storage**: access token in memory; refresh token in httpOnly cookie (same‑site or cross‑site as required)
- **Compatibility**: keep current cookie‑based guards until token flow is fully deployed
- **Incremental migration**: prioritize high‑traffic flows first, deprecate Next API routes last

## Current State Summary

> **Historical — this describes the pre-migration world (April 2026).** For the architecture as it stands today, see the status banner above and the root [CLAUDE.md](../CLAUDE.md).

- Frontend fetches same‑origin `/api/*` routes in Next.
- Next route handlers implement auth, sessions, and data logic.
- FastAPI has core routes for auth, posts, profile, tags, timeline, etc., but is missing some endpoints used by the frontend.
- Next middleware and server components read session cookies directly.

## Target Architecture

> **Reached.** Everything in this section shipped, with one deviation: `NEXT_PUBLIC_API_BASE_URL` is deliberately built **empty** in the deployed images, so the browser issues same-origin `/v1/*` requests that the Next catch-all proxy forwards to the IAM-private FastAPI service. Passing the FastAPI URL here would send browsers cross-origin to a service they cannot invoke (#241).

- Frontend calls FastAPI via a shared API client using `NEXT_PUBLIC_API_BASE_URL`.
- Auth uses:
  - **Access token** (JWT, 5–15 min TTL) returned on login
  - **Refresh token** stored in httpOnly cookie (30–90 days, rotation on refresh)
- Next middleware and server components use token presence (or a lightweight backend call) instead of reading Next session cookies.
- Next API routes are removed or replaced by thin proxies only where needed.

---

## API Contract & Endpoint Mapping

### API Versioning

- **Target prefix**: all FastAPI endpoints are **/v1/**. ✅ Reached.
- **Transition aliasing**: ~~keep unprefixed routes as aliases during rollout~~ — **done and removed.** #233 collapsed the routers to `/v1`-only and deleted every un-prefixed alias, so `/auth/login` and `/posts` now 404. Anything still calling a bare path is a bug.
- **Mapping table below** assumes **/v1/** for all target endpoints.
- **Deprecation**: complete — the sunset happened in #233.

### Common Conventions

- **Base URL**: `${NEXT_PUBLIC_API_BASE_URL}/v1` (defaults to same-origin in local dev)
- **Auth header**: `Authorization: Bearer <access_token>`
- **Refresh cookie**: `refresh_token` (httpOnly)
- **Error shape** (all non-2xx):
  ```json
  { "error": { "code": "STRING", "message": "STRING" } }
  ```

### Error Code Registry & Retry Semantics

- **VALIDATION_ERROR (400)**: do not retry; fix payload
- **BAD_REQUEST (400)**: do not retry; fix request
- **UNAUTHORIZED (401)**: refresh once; if still 401, force logout
- **FORBIDDEN (403)**: do not retry; show access denied
- **NOT_FOUND (404)**: do not retry
- **CONFLICT (409)**: do not retry; surface message
- **RATE_LIMITED (429)**: retry after `Retry-After` (exponential backoff)
- **INTERNAL_ERROR (500)**: retry once; if still failing, surface error

### Pagination, Sorting, Filters (List Endpoints)

- **Default**: `limit=20`, `offset=0`
- **Max limit**: `100`
- **Sort order** (default): newest first (`createdAt desc`)
- **List endpoints**:
  - `/v1/posts`: `limit`, `offset`, `authorId?`, `tag?`, `search?`, `hasRecipe?`
  - `/v1/timeline`: `limit`, `offset`
  - `/v1/notifications` (TBD): `limit`, `offset`, `unreadOnly?`
  - `/v1/recipes`: `limit`, `offset`, `tag?`, `course?`, `search?`
  - `/v1/feedback` (admin, TBD): `limit`, `offset`, `status?`, `rating?`

### Request/Response Schema References (FastAPI)

- **LoginRequest**: `{ emailOrUsername, password, rememberMe }`
- **SignupRequest**: `{ name, emailOrUsername, password, familyMasterKey, rememberMe }`
- **AuthResponse**: `{ user }`
- **CreatePostRequest**: `{ title, caption?, recipe? }`
- **UpdatePostRequest**: `{ title?, caption?, recipe?, changeNote? }`
- **CreateCommentRequest**: `{ text }`
- **ReactionRequest**: `{ targetType, targetId, emoji }`
- **CookedRequest**: `{ rating?, note? }`

### Canonical Schema Source

- **Source of truth**: FastAPI OpenAPI schema.
- **Runtime endpoint**: `/v1/openapi.json` (served by FastAPI).
- **CI snapshot**: add a generated file `apps/api/openapi.json` on each CI build.
- **Frontend contract tests**: validate requests against the OpenAPI snapshot.

### Endpoint Mapping Table (All `/api/*` calls)

> **Legend:**
>
> - **Next Route**: current Next.js API route
> - **FastAPI**: target endpoint
> - **Success**: status + response body
> - **Errors**: status + error codes (shape above)

#### Auth (all targets under `/v1`)

- **POST /api/auth/login** → **POST /v1/auth/login**
  - Request: `LoginRequest`
  - Success: `200 { accessToken, user }` (AuthResponse + accessToken)
  - Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`

- **POST /api/auth/signup** → **POST /v1/auth/signup**
  - Request: `SignupRequest`
  - Success: `200 { accessToken, user }`
  - Errors: `400 VALIDATION_ERROR`, `409 CONFLICT`

- **POST /api/auth/reset** → **POST /v1/auth/reset` (TBD)`**
  - Request: `{ emailOrUsername }`
  - Success: `204 No Content`
  - Errors: `400 VALIDATION_ERROR`, `404 NOT_FOUND`

- **POST /api/auth/reset/confirm` (new)`** → **POST /v1/auth/reset/confirm` (TBD)`**
  - Request: `{ token, newPassword }`
  - Success: `204 No Content`
  - Errors: `400 VALIDATION_ERROR`, `401 INVALID_TOKEN`, `410 TOKEN_EXPIRED`, `404 NOT_FOUND`

- **POST /api/auth/logout** → **POST /v1/auth/logout**
  - Request: none
  - Success: `204 No Content`
  - Errors: `401 UNAUTHORIZED`

- **GET /api/auth/me** → **GET /v1/auth/me**
  - Request: auth header required
  - Success: `200 { user }`
  - Errors: `401 UNAUTHORIZED`

#### Health

- **GET /api/health** → **GET /v1/health**
  - Success: `200 { status: "ok" }`

#### Posts

- **GET /api/posts** → **GET /v1/posts**
  - Query: `limit`, `offset`, filters
  - Success: `200 { items: Post[], total }`
  - Errors: `401 UNAUTHORIZED`

- **POST /api/posts** → **POST /v1/posts**
  - Request: `CreatePostRequest` + optional media upload
  - Success: `201 { post }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

- **GET /api/posts/{postId}** → **GET /v1/posts/{postId}**
  - Success: `200 { post }`
  - Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **PATCH /api/posts/{postId}** → **PATCH /v1/posts/{postId}**
  - Request: `UpdatePostRequest`
  - Success: `200 { post }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **DELETE /api/posts/{postId}** → **DELETE /v1/posts/{postId}**
  - Success: `204 No Content`
  - Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **POST /api/posts/{postId}/comments** → **POST /v1/posts/{postId}/comments**
  - Request: `CreateCommentRequest`
  - Success: `201 { comment }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **POST /api/posts/{postId}/favorite** → **POST /v1/posts/{postId}/favorite**
  - Request: none
  - Success: `200 { favorited: true }`
  - Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **DELETE /api/posts/{postId}/favorite** → **DELETE /v1/posts/{postId}/favorite**
  - Success: `200 { favorited: false }`
  - Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **POST /api/posts/{postId}/cooked** → **POST /v1/posts/{postId}/cooked**
  - Request: `CookedRequest`
  - Success: `200 { cooked: true }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND`

- **DELETE /api/posts/{postId}/cooked** → **DELETE /v1/posts/{postId}/cooked**
  - Success: `200 { cooked: false }`
  - Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`

#### Comments

- **DELETE /api/comments/{commentId}** → **DELETE /v1/comments/{commentId}**
  - Success: `204 No Content`
  - Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`

#### Reactions

- **POST /api/reactions** → **POST /v1/reactions**
  - Request: `ReactionRequest`
  - Success: `200 { reacted: true }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

#### Timeline

- **GET /api/timeline** → **GET /v1/timeline**
  - Query: `limit`, `offset`
  - Success: `200 { items: TimelineItem[], total }`
  - Errors: `401 UNAUTHORIZED`

#### Recipes

- **GET /api/recipes** → **GET /v1/recipes**
  - Query: `limit`, `offset`, filters
  - Success: `200 { items: Recipe[], total }`
  - Errors: `401 UNAUTHORIZED`

- **POST /api/recipes/import** → **POST /v1/recipes/import**
  - Request: `{ url }`
  - Success: `200 { request_id, recipe, confidence, warnings, missing_fields }` — the importer's full RecipeDraft response, returned verbatim. **No DB write happens here**; the SPA uses the result to prefill the create-post form and persistence is downstream via `POST /v1/posts`.
  - Errors: `400 VALIDATION_ERROR` (bad url / importer's INVALID_URL / BLOCKED_HOST), `401 UNAUTHORIZED`, `408 IMPORT_FAILED` (upstream fetch timeout against target site), `502 IMPORT_FAILED` (upstream fetch failure), `503 SERVICE_UNAVAILABLE` (importer not configured), `504 GATEWAY_TIMEOUT` (per-request budget exceeded).

#### Tags

- **GET /api/tags** → **GET /v1/tags**
  - Success: `200 { items: Tag[] }`
  - Errors: `401 UNAUTHORIZED`

#### Profile / Me

- **GET /api/profile/posts** → **GET /v1/profile/posts**
  - Success: `200 { items: Post[], total }`
  - Errors: `401 UNAUTHORIZED`

- **GET /api/profile/cooked** → **GET /v1/profile/cooked**
  - Success: `200 { items: Post[], total }`
  - Errors: `401 UNAUTHORIZED`

- **GET /api/me/profile** → **GET /v1/me/profile**
  - Success: `200 { user }`
  - Errors: `401 UNAUTHORIZED`

- **PATCH /api/me/profile** → **PATCH /v1/me/profile**
  - Request: `{ name?, avatarUrl? }`
  - Success: `200 { user }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

- **POST /api/me/password** → **POST /v1/me/password**
  - Request: `{ currentPassword, nextPassword }`
  - Success: `204 No Content`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

- **GET /api/me/favorites** → **GET /v1/me/favorites**
  - Success: `200 { items: Post[], total }`
  - Errors: `401 UNAUTHORIZED`

- **DELETE /api/me/delete` (TBD)`** → **DELETE /v1/me/delete` (TBD)`**
  - Success: `204 No Content`
  - Errors: `401 UNAUTHORIZED`

#### Family

- **GET /api/family/members** → **GET /v1/family/members**
  - Success: `200 { items: User[] }`
  - Errors: `401 UNAUTHORIZED`

- **DELETE /api/family/members/{userId}** → **DELETE /v1/family/members/{userId}**
  - Success: `204 No Content`
  - Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`

#### Notifications

- **GET /api/notifications` (TBD)`** → **GET /v1/notifications` (TBD)`**
  - Success: `200 { items: Notification[], unreadCount }`
  - Errors: `401 UNAUTHORIZED`

- **POST /api/notifications/mark-read` (TBD)`** → **POST /v1/notifications/mark-read` (TBD)`**
  - Request: `{ notificationIds }`
  - Success: `204 No Content`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

- **GET /api/notifications/unread-count` (TBD)`** → **GET /v1/notifications/unread-count` (TBD)`**
  - Success: `200 { unreadCount }`
  - Errors: `401 UNAUTHORIZED`

#### Feedback

- **POST /api/feedback` (TBD)`** → **POST /v1/feedback` (TBD)`**
  - Request: `{ message, rating?, metadata? }`
  - Success: `201 { feedback }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

- **GET /api/feedback` (TBD, admin)`** → **GET /v1/feedback` (TBD, admin)`**
  - Success: `200 { items: Feedback[], total }`
  - Errors: `401 UNAUTHORIZED`, `403 FORBIDDEN`

---

## Upload Handling

### Multipart Endpoints

- **POST /v1/posts**
  - **Content-Type**: `multipart/form-data`
  - **Fields**:
    - `payload` (stringified JSON) → `CreatePostRequest`
    - `media` (file[], optional)
  - **Limits**:
    - max files: 10
    - max file size: 10MB each
    - total request size: 50MB

- **PATCH /v1/posts/{postId}**
  - **Content-Type**: `multipart/form-data`
  - **Fields**:
    - `payload` (stringified JSON) → `UpdatePostRequest`
    - `media` (file[], optional)

- **PATCH /v1/me/profile**
  - **Content-Type**: `multipart/form-data`
  - **Fields**:
    - `payload` (stringified JSON) → `{ name? }`
    - `avatar` (file, optional)
  - **Limits**:
    - max file size: 5MB

### Upload Validation & Processing

- **Allowed mime types**: `image/jpeg`, `image/png`, `image/webp`
- **Image processing**: resize max 2048px on longest edge; strip EXIF
- **Storage**: object storage bucket (S3/GCS) with signed URL access
- **Malware scanning**: optional ClamAV or managed scanning on upload (async)

### Non‑Multipart Uploads

- **POST /v1/recipes/import**
  - Standard JSON payload `{ url }` (no file upload)
  - Success: `200` with the importer's full RecipeDraft passthrough (see Recipes section above for the exact shape)
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `408 / 502 IMPORT_FAILED`, `503 SERVICE_UNAVAILABLE`, `504 GATEWAY_TIMEOUT`

### Idempotency & Retries

- **Write requests** accept `X-Request-Id` for idempotency.
- Backend stores request ID for 24 hours; duplicate IDs return the original response.
- Applies to: create post, comment, reaction, favorite/cooked, feedback.

---

## Auth & Security Specifics

### CORS Policy

- **Allowed origins**: explicit allow‑list per environment (no `*` with credentials)
- **Allowed methods**: `GET, POST, PATCH, PUT, DELETE, OPTIONS`
- **Allowed headers**: `Authorization, Content-Type, X-CSRF-Token, X-Request-Id`
- **Credentials**: enabled for refresh cookie flow

### Rate Limits & Abuse Protections

- **Auth login**: 10 requests / 5 minutes / IP → `429 TOO_MANY_REQUESTS`
- **Auth signup**: 5 requests / 10 minutes / IP → `429 TOO_MANY_REQUESTS`
- **Auth reset request**: 3 requests / 30 minutes / IP + per account → `429 TOO_MANY_REQUESTS`
- **Auth reset confirm**: 5 requests / 30 minutes / IP → `429 TOO_MANY_REQUESTS`
- **Refresh**: 30 requests / 10 minutes / session → `429 TOO_MANY_REQUESTS`
- **Feedback**: 20 requests / hour / user → `429 TOO_MANY_REQUESTS`
- **Response**: `429 { error: { code: "RATE_LIMITED", message } }` + `Retry-After` header

### CSRF Strategy for Refresh

- **Double-submit token**: refresh cookie is httpOnly; a second non‑httpOnly `csrf_token` cookie is set.
- `/v1/auth/refresh` requires `X-CSRF-Token` header matching the `csrf_token` cookie.
- Reject if `Origin`/`Referer` does not match allowed origins.

### CSRF Cookie Lifecycle

- **Set**: on successful login/signup and on each refresh (rotate `csrf_token`).
- **Rotate**: every refresh to prevent fixation.
- **Clear**: on logout and when refresh token is revoked/expired.

### Cookie Domain/Flags by Environment

- **Local dev**: `Domain=localhost`, `Secure=false`, `SameSite=Lax` (or `None` with HTTPS dev cert if cross‑origin)
- **Staging**: `Domain=.staging.example.com`, `Secure=true`, `SameSite=None`
- **Production**: `Domain=.example.com`, `Secure=true`, `SameSite=None`

### Token Claims (Access Token)

- Required: `sub` (userId), `familySpaceId`, `role`, `iss`, `iat`, `exp`, `aud`, `jti`
- Optional: `name`, `avatarUrl` for UI‑friendly claims

### Rotation & Reuse Detection

- Store refresh token hash + `jti` in DB.
- On refresh, rotate token and invalidate previous `jti`.
- If a previously used `jti` appears, revoke all active refresh tokens for that user (session compromise signal).

### rememberMe Behavior

- **rememberMe=false** → refresh token TTL 7 days
- **rememberMe=true** → refresh token TTL 30 days
- **Rotation**: always rotate on refresh, regardless of rememberMe

### Token Signing & Key Rotation

- **Key storage**: managed secret store (e.g., AWS Secrets Manager / GCP Secret Manager)
- **Signing**: current `kid` used to sign access tokens
- **Rotation cadence**: every 90 days (or on incident)
- **Validation**: keep previous keys active for 2× access token TTL to allow overlap

### Password Reset Flow

1. **Request reset**: `POST /v1/auth/reset` with `{ emailOrUsername }` → 204
2. **Email sent**: contains single‑use token and link to frontend reset page
3. **Confirm reset**: `POST /v1/auth/reset/confirm` with `{ token, newPassword }`
4. **Token TTL**: 30 minutes; tokens are one‑time use
5. **Rate limits**: per IP + per account

### Logout Invalidation Semantics

- Clear refresh cookie on client.
- Revoke refresh token in DB immediately.
- Access tokens expire naturally; optional deny‑list for high‑risk admin actions.

---

## Migration Mechanics

### Middleware & Server Components

- **During dual‑mode**: keep existing cookie checks in Next middleware.
- **Target**: middleware checks for refresh cookie presence and/or calls a lightweight `/v1/auth/me` with a server‑side access token.

### Frontend Token Storage

- **Access token**: in‑memory only, stored in a dedicated auth store (e.g., `src/lib/auth/tokenStore`).
- **Refresh token**: httpOnly cookie managed by the backend.
- **On reload**: client bootstraps by calling `/v1/auth/refresh` to mint a new access token.
- **Hydration**: server components can prefetch `/v1/auth/me` and pass user data as props to avoid flash.

### SSR Requests with Access Tokens

- **Server components**: call `/v1/auth/refresh` using refresh cookie (server‑side only) to mint a short‑lived access token, then call `/v1/auth/me` or data endpoints.
- **Client components**: use in‑memory access token with automatic refresh on 401.
- **Edge runtime**: avoid decoding tokens in edge if crypto/JWT limitations exist; prefer `/v1/auth/me`.

### Edge/Runtime Constraints

- **Next middleware** runs on **Edge** by default.
- **Edge limitation**: avoid JWT decode and crypto libs in middleware; only check refresh cookie presence and redirect.
- **Node runtime** (server components / API routes) may call `/v1/auth/refresh` to obtain access tokens.

---

## Rollout Plan

### Feature Flags

> **Status (post Phase 4.4):** the migration is complete and these flags **no longer exist**. FastAPI is the sole backend; the frontend has no runtime toggle for auth or data. The `NEXT_PUBLIC_USE_FASTAPI_AUTH` env var and the `isFastApiAuthEnabled()` accessor were deleted in Phase 4.4. The list below is retained as a historical record of how the canary rollout was gated. Rollback is now a **code revert** — see [Rollback Mechanics](#rollback-mechanics).

- `USE_FASTAPI_AUTH` (implemented as the build-time `NEXT_PUBLIC_USE_FASTAPI_AUTH` — now removed)
- `USE_FASTAPI_DATA` (planning-only; never implemented as a code flag)
- `USE_REFRESH_TOKEN_FLOW` (planning-only; never implemented as a code flag)

### Feature Flag Enforcement Source

- **Backend source**: environment‑backed config (`FASTAPI_FEATURE_FLAGS`) loaded on startup and reloaded on interval (e.g., 60s).
- **Frontend source**: same config service/flag system used by backend.
- **Sync**: flags published from the config system; backend polls or receives push updates.

### Per‑Environment Cutover

> **Status (post Phase 4.4 / #241):** superseded. The percentage canary below assumed a runtime feature flag that no longer exists — Phase 4.4 deleted it, so there is nothing left to ramp a percentage of sessions against. The historical plan is kept for context; the deployed reality is described in [Deploy Topology](#deploy-topology-post-241) below.

- ~~**Dev**: enable all flags, iterate daily~~
- ~~**Staging**: enable auth first, then data endpoints~~ (no staging environment exists; `develop` → dev, `main` → prod)
- ~~**Prod**: canary rollout (5% → 25% → 50% → 100%)~~

**What replaces it.** Safety now comes from a _revision-level_ canary rather than a session-level one. Both `deploy-dev.yml` and `deploy-prod.yml` (and the API workflows) deploy with `--no-traffic --tag candidate`, probe the tagged revision directly, and only then `--to-latest`. A failed probe pins traffic back to the previous revision, which never stopped serving. The unit of rollback is a revision, not a flag.

### Deploy Topology (post #241)

Two Cloud Run services per environment, sharing one database, one runtime service account, and one set of secrets:

| Service               | Port | Ingress                     | Reached by               |
| --------------------- | ---- | --------------------------- | ------------------------ |
| Next (`src/`)         | 3000 | dev: IAM; prod: public      | the browser              |
| FastAPI (`apps/api/`) | 8000 | IAM-private (no `allUsers`) | the Next runtime SA only |

The browser never contacts FastAPI directly. It issues same-origin `/v1/*` requests that [`src/app/v1/[...path]/route.ts`](../src/app/v1/%5B...path%5D/route.ts) forwards server-to-server via [`src/lib/apiUpstream.ts`](../src/lib/apiUpstream.ts), attaching a Google ID token on `X-Serverless-Authorization` (Cloud Run checks that header instead of `Authorization` when both are present, leaving the user's FastAPI access token intact).

This shape is what makes the deployment work **without a custom domain**. `run.app` is on the Public Suffix List, so two `*.run.app` hosts can never share a cookie `Domain` — a cross-origin split would leave the `refresh_token` cookie unreadable by the Next host. Keeping one origin also means `CORS_ALLOW_ORIGINS` stays empty and no CORS middleware is installed. See [docs/research/fastapi-cookie-domain-stack0.md](research/fastapi-cookie-domain-stack0.md).

Two env vars, deliberately distinct:

- `NEXT_PUBLIC_API_BASE_URL` — inlined into the **client bundle at build time** (`--build-arg` in the deploy workflows). **Empty** in deployed builds, which is what makes the client issue same-origin requests. Set to `http://localhost:8000` for local dev.
- `API_INTERNAL_URL` — read at **runtime, server-side only**. The absolute FastAPI URL, resolved from `gcloud run services describe` at deploy time so the hostname cannot drift.

Because the deployed build-arg is empty, the Next build has **no dependency** on FastAPI's URL — only the runtime env does. The Next deploy workflows still fail fast if the FastAPI service is missing, since a Next revision without a backend redirects every page to `/login`.

#### One-time prerequisites per environment

Terraform creates Secret Manager **containers**, never versions — values are added out-of-band (same as `jwt-secret` and `family-master-key`). `#241` adds one new secret, `family-recipe-{env}-refresh-pepper`, which FastAPI requires whenever `ENVIRONMENT=production` (see `validate_settings` in [apps/api/src/settings.py](../apps/api/src/settings.py)); dev runs with `production` semantics too, because it serves over HTTPS and needs `secure` cookies.

Rotating the pepper invalidates every live refresh token — every user is logged out and must sign in again. It is not a routine rotation.

**The versionless-secret trap.** Terraform creates the API Cloud Run service with a `REFRESH_PEPPER=<secret>:latest` env ref. If the secret container exists but has **no version**, Cloud Run rejects the revision and `terraform apply` fails while creating the service. The existing secrets (`database-url`, `jwt-secret`) don't hit this because they already have versions; a brand-new `refresh-pepper` does. So the secret has to be seeded **between** creating its container and creating the API service — a single `apply` can't do that, and neither can the `Infra Apply` workflow (it does one full apply with no `-target`). Use a two-phase local apply for the first bring-up of each environment (this is the exact sequence used for dev on 2026-07-17):

```bash
cd infra/envs/<env>          # dev or prod
terraform init              # your usual GCS-backend init args

# Phase 1 — create ONLY the refresh-pepper secret container
terraform apply -target='module.cloud_run_infra.google_secret_manager_secret.secrets["family-recipe-<env>-refresh-pepper"]'

# Seed it (>= 32 chars enforced in production; 48 random bytes is comfortably over)
openssl rand -base64 48 | tr -d '\n' | \
  gcloud secrets versions add family-recipe-<env>-refresh-pepper \
    --project family-recipe-<env> --data-file=-

# Phase 2 — full apply; the API service can now resolve :latest
terraform apply
```

The phase-2 plan also surfaces any pre-existing traffic-pin drift on the **Next** service (`TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION` → `LATEST`) — that is unrelated to this work and safe to apply, since the next `deploy-*` run promotes a fresh revision to `LATEST` anyway. Confirm the pinned revision isn't a deliberate rollback before approving.

##### ⚠️ Three phases, not two, when the environment is already live

**The two-phase sequence above is only safe on a greenfield environment.** It was written for dev, where nothing was serving users yet. Running it against an environment with a live Next service — as prod was during the #283 bring-up — is destructive: the bare `terraform apply` in phase 2 **strips `JWT_SECRET` from the running Next service**, because at that point terraform's config did not yet know about a secret ref the deploy workflow had set. That would have broken auth for real users before the cutover ever shipped.

Prod was brought up with a targeted third phase instead, and this is the sequence to use for any live environment:

```bash
cd infra/envs/<env>
terraform init

# Phase 1 — create ONLY the refresh-pepper secret container
terraform apply -target='module.cloud_run_infra.google_secret_manager_secret.secrets["family-recipe-<env>-refresh-pepper"]'

# Phase 2 — seed a version (>= 32 chars enforced in production)
openssl rand -base64 48 | tr -d '\n' | \
  gcloud secrets versions add family-recipe-<env>-refresh-pepper \
    --project family-recipe-<env> --data-file=-

# Phase 3 — create ONLY the new API-side resources. Never a bare apply.
terraform apply \
  -target='module.cloud_run_api' \
  -target='module.artifact_registry_api'
```

**The general rule this reflects:** the deploy workflows and terraform both own parts of the Cloud Run service spec, and terraform treats anything a workflow set as drift to be removed. A bare `terraform apply` against a live environment will silently revert workflow-managed env vars and secret refs. Always `-target` the resources you actually intend to change, and read the plan **body** — the summary line is not enough.

**Resolved by #285.** From the Phase 4 release until #285, the prod plan reported a benign-looking `0 add, 4 change, 0 destroy` while proposing to delete all three `API_INTERNAL_*` env vars from the live Next service — a bare `apply` would have broken every `/v1` request. The three `google_cloud_run_v2_service` resources (`cloud_run_infra.app`, `cloud_run_api.api`, `cloud_run_importer.importer`) never modeled three categories of field that Cloud Run itself or the deploy workflows populate live: the full container `env` list on the Next service (deploy workflows `--set-env-vars`/`--set-secrets` a superset of what terraform declares, including `API_INTERNAL_*`), the `template.revision` name (`gcloud run deploy` stamps this every deploy, same as the pre-existing `client`/`client_version` entries), and a top-level `scaling` block (`manual_instance_count`/`min`/`max`) the provider now surfaces as live drift alongside the `template.scaling` block terraform actually declares. All three are now in each service's `lifecycle.ignore_changes` — verified via `terraform plan` against both live dev and prod: only the pre-existing cosmetic monitoring-dashboard widget drift (`targetAxis`/`xPos`) remains in either environment. `-target`ing is still the right discipline for anything terraform doesn't already own (new resources, secret bring-up, etc.) — this fix only covers fields Cloud Run/CI already owned in practice.

**Order of operations for a first deploy into an environment:**

1. Two-phase `terraform apply` + seed (above) — creates the API service (hello-world baseline), its Artifact Registry repo, and the seeded secret.
2. Merge to the environment's branch (`develop` for dev, `main` for prod), which fires **Deploy API** (swaps in the real FastAPI image) and **Deploy Dev/Prod** (resolves `API_INTERNAL_URL` and deploys Next). These two run in parallel: the Next deploy resolves the API _service_ URL (stable regardless of which image is live), but its post-deploy Playwright login exercises the real API — so if the Next deploy races ahead of the API deploy's promotion, re-run the Next deploy once the API deploy is green.

After the first bring-up each service deploys independently on subsequent pushes.

### Dual‑Stack Without Data Drift

> **Status (post Phase 4.4):** no longer applicable. There is no dual stack — the Next data routes were deleted in Phase 4.3 and FastAPI is the only write path. Retained as a record of how drift was avoided while both stacks were live.

- Both stacks use the **same database**.
- Only one write path enabled at a time for a given feature flag.
  - **Frontend gating**: feature flags prevent writes to the disabled backend.
  - **Backend gating**: FastAPI rejects writes with `409 CONFLICT` when a feature is disabled (authoritative).
- Reads can be mirrored for validation logs without side effects.

### Rollback Criteria

> **⚠️ These are not wired to alerts.** Nothing fires automatically on any threshold below. `Service Down (dev|prod)` is inverted — it alerts when the service is _healthy_ and stays silent when it is down (#284) — and the FastAPI service has no monitoring coverage at all (#32). Until both land, judging these criteria means querying Cloud Run logs by hand:
>
> ```bash
> gcloud logging read 'resource.type=cloud_run_revision AND httpRequest.status>=500' \
>   --project family-recipe-prod --freshness=15m
> ```

- Auth failure rate > 2% for 10 minutes
- Refresh loop rate > 0.5% of sessions
- 401/403 spike > 3× baseline

### Rollback Mechanics

> **Post Phase 4.4:** there is no runtime flag to flip. The dual-mode codepaths and the legacy Next JWT/cookie session helpers were deleted, so rollback now requires a **code revert and redeploy**, not a config change.

- **Roll back steps**:
  1. `git revert` the Phase 4.4 cutover commit(s) — this restores the `NEXT_PUBLIC_USE_FASTAPI_AUTH` flag, the dual-mode branches, and the legacy session/cookie helpers (`featureFlags.ts`, `jwt.ts`, `apiAuth.ts`, `getCurrentUser`, the `session-core` cookie helpers). Reverting earlier phases (4.3 route deletion, 4.2 middleware) may also be required if data routes are needed.
  2. Redeploy the reverted build (the flag is `NEXT_PUBLIC_*`, inlined at build time — a rebuild is mandatory).
  3. Flush CDN and edge cache if auth redirects cached.
  4. Monitor auth and error metrics for 30 minutes.
- **Time to roll back**: bounded by a full build + deploy cycle, not flag propagation. Plan accordingly — this is the point of no _easy_ return called out in the Phase 4.4 ticket.

---

## Test Plan

### Required Integration Tests

- Auth: login, signup, refresh, logout, invalid credentials
- Token rotation + reuse detection
- Posts: create/edit/delete/comment/favorite/cooked
- Profile: update, password change
- Notifications + feedback

### Contract Tests

- Snapshot OpenAPI schemas for FastAPI.
- Validate frontend requests against OpenAPI in CI.

### Pre‑Prod Validation (CI‑linked Checklist)

- Run full e2e on staging with feature flags enabled
- Validate refresh loop protection
- Verify CORS + credentials
- Verify SSR access token flow

---

## Observability

### Structured Logging Fields

- `requestId`, `userId`, `route`, `method`, `status`, `latencyMs`, `errorCode`,
  `authMode`, `refreshAttempt`, `refreshResult`, `tokenJti`

### Metrics

- `auth.login.success`, `auth.login.failure`
- `auth.refresh.success`, `auth.refresh.failure`, `auth.refresh.loop`
- `http.401.rate`, `http.403.rate`

### Alert Thresholds

- 401/403 rate > 3× baseline for 5 minutes
- refresh loop detected > 0.5% of sessions
- login failure rate > 5% for 10 minutes

---

## Open Questions & Proposed Decisions

1. **Source of truth for user/session state**

- **Decision**: FastAPI tokens + refresh token store are the source of truth. Next session cookies remain only for legacy routes during migration.

2. **API versioning/backward compatibility**

- **Decision**: Introduce `/v1` prefix in FastAPI and preserve old paths behind a compatibility layer during rollout. Deprecate with a fixed sunset date.

3. **Data migrations/cleanup**

- **Decision**: Add refresh token table for rotation/revocation. Remove Next session cookie usage after cutover and delete any legacy session artifacts.

---

## Phase 0 — Preparation (No behavior change)

**Goals:** establish migration infrastructure.

1. **Add API base URL configuration**

- Define `NEXT_PUBLIC_API_BASE_URL` for frontend use.
- Keep current same‑origin behavior if not set.

2. **Introduce a shared API client**

- Centralize `fetch` with:
  - base URL
  - standard headers
  - error normalization
  - token injection hook (access token)

3. **Document API contract**

- Create a mapping table: frontend usage ↔ FastAPI endpoint ↔ payload/response.

**Exit Criteria**

- Shared API client available.
- No production behavior changes.

---

## Phase 1 — Token Auth Design

**Goals:** define token lifecycle and endpoint contract.

1. **Auth endpoints (FastAPI)**

- `POST /v1/auth/login` → `{ accessToken, user }` + set refresh cookie
- `POST /v1/auth/signup` → same as login
- `POST /v1/auth/refresh` → `{ accessToken }` + rotate refresh cookie
- `POST /v1/auth/logout` → clear refresh cookie

2. **Token policies**

- Access token TTL: 5–15 minutes
- Refresh token TTL: 30–90 days
- Rotation on refresh with reuse detection (optional)

3. **Cookie settings**

- `HttpOnly`, `Secure`, `SameSite=None` if cross‑origin
- Domain set to frontend root domain

**Exit Criteria**

- FastAPI supports login/signup/refresh/logout with token issuance and refresh rotation.

---

## Phase 2 — Frontend Auth Migration

**Goals:** switch auth flows to token usage, keep cookie middleware temporarily.

1. **Login/Signup/Reset UI**

- Update to use the API client with base URL.
- Store access token in memory (state/store); refresh token handled via cookie.

2. **Token refresh workflow**

- On 401, call `/v1/auth/refresh` and retry once.
- Centralize in API client.

3. **Logout**

- Call `/v1/auth/logout`, clear local access token state.

4. **Route guards (temporary dual mode)**

- Keep Next middleware session checks until all pages rely on token flow.
- Introduce a lightweight client guard for token presence if needed.

**Exit Criteria**

- Login/logout work end‑to‑end against FastAPI.
- Token refresh works and user session persists.

---

## Phase 3 — Endpoint Parity

**Goals:** fill gaps so all UI features use FastAPI.

### Missing/Unmatched Endpoints (from current analysis)

- Notifications: list, mark‑read, unread‑count
- Feedback: create + admin list
- Auth reset
- Recipe import
- Account delete

### Payload/Schema Alignment

- **Signup**: align frontend name fields with backend schema
- **Profile update**: handle avatar upload or update UI to send supported fields
- **Password change**: align payload keys

**Exit Criteria**

- All existing UI flows map to FastAPI endpoints without Next API routes.

---

## Phase 4 — Cutover and Cleanup

> ✅ **Complete.** Executed across sub-phases 4.1–4.7 (see the status banner at the top of this document). FastAPI is the sole backend; the Next `/api/*` data routes and legacy auth stack are gone; FastAPI is deployed to Cloud Run in every environment and reached via `API_INTERNAL_URL`.

**Goals:** make FastAPI the sole backend for the frontend.

1. **Switch all fetches**

- Replace remaining `/api/*` calls with API client base URL.

2. **Remove Next API routes**

- Delete or deprecate route handlers in src/app/api.

3. **Update middleware**

- Replace cookie checks with token-based logic or external auth check.

4. **Docs and monitoring**

- Update README and API docs.
- Add API latency and error metrics.

5. **Deploy FastAPI** (#241)

- The four steps above remove the Next backend **in code**. Until FastAPI is
  actually deployed and the Next service knows how to reach it, any environment
  running that code has no backend at all. This step is a hard prerequisite for
  Phase 4 reaching dev, and a blocker on any `develop → main` release.
- Terraform module `infra/modules/cloud_run_api` + the `deploy-api*.yml`
  workflows; `API_INTERNAL_URL` wired into the Next deploys. See
  [Deploy Topology](#deploy-topology-post-241).

**Exit Criteria**

- [x] No production traffic depends on Next API routes.
- [x] Frontend uses FastAPI for all data and auth.
- [x] FastAPI is deployed in every environment the frontend runs in, and the Next
      service resolves it via `API_INTERNAL_URL`.

---

## Risk Mitigation

- **Dual‑mode auth** during transition
- **Feature flags** or env toggles for endpoints
- **Staged rollout** (dev → staging → prod)
- **Automated tests** covering auth, posts, timeline, notifications

## Validation Checklist

- Login/signup/logout/refresh
- Protected pages accessible with token
- Create/edit posts and comments
- Profile and settings updates
- Notifications and feedback
- Recipe import flow

## Ownership & Sequencing

1. Auth endpoints + refresh flow (backend)
2. API client + login UI migration (frontend)
3. Endpoint parity (backend)
4. Remaining UI migration + cleanup (frontend)

---

## Notes

- Access tokens should be **short‑lived** to limit exposure.
- Refresh token rotation is recommended for long‑term security.
- If cross‑origin, ensure CORS allows credentials and correct origin.
