# Frontend ↔ FastAPI Migration Plan

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

- Frontend fetches same‑origin `/api/*` routes in Next.
- Next route handlers implement auth, sessions, and data logic.
- FastAPI has core routes for auth, posts, profile, tags, timeline, etc., but is missing some endpoints used by the frontend.
- Next middleware and server components read session cookies directly.

## Target Architecture

- Frontend calls FastAPI via a shared API client using `NEXT_PUBLIC_API_BASE_URL`.
- Auth uses:
  - **Access token** (JWT, 5–15 min TTL) returned on login
  - **Refresh token** stored in httpOnly cookie (30–90 days, rotation on refresh)
- Next middleware and server components use token presence (or a lightweight backend call) instead of reading Next session cookies.
- Next API routes are removed or replaced by thin proxies only where needed.

---

## API Contract & Endpoint Mapping

### API Versioning

- **Target prefix**: all FastAPI endpoints are **/v1/**.
- **Transition aliasing**: keep unprefixed routes as aliases during rollout.
  - Example: `/v1/auth/login` and `/auth/login` both resolve to the same handler.
- **Mapping table below** assumes **/v1/** for all target endpoints.
- **Deprecation**: unprefixed routes sunset after rollout (announce + remove).

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

- **POST /api/recipes/import` (TBD)`** → **POST /v1/recipes/import` (TBD)`**
  - Request: `{ url, mapping? }`
  - Success: `201 { recipe }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

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

- **POST /v1/recipes/import** (TBD)
  - Standard JSON payload `{ url, mapping? }` (no file upload)
  - Success: `201 { recipe }`
  - Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`

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

- `USE_FASTAPI_AUTH`
- `USE_FASTAPI_DATA`
- `USE_REFRESH_TOKEN_FLOW`

### Feature Flag Enforcement Source

- **Backend source**: environment‑backed config (`FASTAPI_FEATURE_FLAGS`) loaded on startup and reloaded on interval (e.g., 60s).
- **Frontend source**: same config service/flag system used by backend.
- **Sync**: flags published from the config system; backend polls or receives push updates.

### Per‑Environment Cutover

- **Dev**: enable all flags, iterate daily
- **Staging**: enable auth first, then data endpoints
- **Prod**: canary rollout (5% → 25% → 50% → 100%)

### Dual‑Stack Without Data Drift

- Both stacks use the **same database**.
- Only one write path enabled at a time for a given feature flag.
  - **Frontend gating**: feature flags prevent writes to the disabled backend.
  - **Backend gating**: FastAPI rejects writes with `409 CONFLICT` when a feature is disabled (authoritative).
- Reads can be mirrored for validation logs without side effects.

### Rollback Criteria

- Auth failure rate > 2% for 10 minutes
- Refresh loop rate > 0.5% of sessions
- 401/403 spike > 3× baseline

### Rollback Mechanics

- **Config owner**: product/infra team owns production feature flag system.
- **Roll back steps**:
  1. Disable `USE_FASTAPI_DATA` (immediate read/write rollback)
  2. Disable `USE_FASTAPI_AUTH` (restore Next auth)
  3. Flush CDN and edge cache if auth redirects cached
  4. Monitor auth and error metrics for 30 minutes
- **Time to flip**: < 5 minutes (flag propagation)

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

**Exit Criteria**

- No production traffic depends on Next API routes.
- Frontend uses FastAPI for all data and auth.

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
