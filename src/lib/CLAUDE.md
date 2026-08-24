# CLAUDE.md — `src/lib/`

Module map for the shared backend logic. Most of these are imported from API route handlers and server components. Prefer extending an existing module over creating a new one.

## Auth & sessions

- [prisma.ts](prisma.ts) — singleton `PrismaClient`. Always import `prisma` from here, never construct your own.
- [session-core.ts](session-core.ts) — `hasRefreshTokenFromRequest`: Edge-safe, presence-only `refresh_token` cookie check used by [src/proxy.ts](../proxy.ts). No JWT decode. (Phase 4.4 deleted the legacy `session` cookie set/clear/verify helpers.)
- [session.ts](session.ts) — `resolvePageUser()`: resolves the `(app)` page user via FastAPI's non-rotating `/v1/auth/session` (delegates to [auth/bootstrapFromCookies.ts](auth/bootstrapFromCookies.ts)). Returns `null` on failure so the caller redirects to `/login`.
- [auth/bootstrapFromCookies.ts](auth/bootstrapFromCookies.ts) — `fetchSessionUser` (non-rotating `/v1/auth/session`, used by SSR) and `bootstrapAccessToken` (rotating `/v1/auth/refresh` + `/v1/auth/me`, used only by the `/api/auth/bootstrap` route). See issue #173.

> Password hashing, the master-key signup gate, and ownership/admin authorization all live in FastAPI now (`apps/api/src/security.py`, `apps/api/src/permissions.py`). The old Next-side `auth.ts` / `masterKey.ts` / `permissions.ts` were removed in #243.

## Validation & errors

- [validation.ts](validation.ts) — every Zod schema for request payloads + the course/difficulty/ingredient-unit enums. Add new schemas here; don't inline.
- [apiErrors.ts](apiErrors.ts) — `validationError` / `notFoundError` / `forbiddenError` / etc. plus `parseRequestBody`/`parseQueryParams`/`parseRouteParams` helpers. The `{ error: { code, message } }` shape is the public API contract.

## Domain logic

- [posts.ts](posts.ts) — `getPostDetail`, recipe-detail serialization (ingredients/steps stored as JSON strings; deserialized here).
- [postPayload.ts](postPayload.ts) — `normalizePostPayload` + `MAX_PHOTO_COUNT`. Run incoming JSON through this before Zod when handling FormData.
- [recipes.ts](recipes.ts) — `/api/recipes` filter/search query (title, course, tags, difficulty, time, servings, up to 5 ingredient keywords).
- [recipeImporter.ts](recipeImporter.ts) — client for the [recipe-url-importer](../../apps/recipe-url-importer/) service. Post-cutover the **call** is made server-side by FastAPI ([apps/api/src/recipe_importer.py](../../apps/api/src/recipe_importer.py)); what still matters here is the exported `ImporterResponse` type, consumed by [components/add/importerMapping.ts](../components/add/importerMapping.ts).
- [timeline.ts](timeline.ts) — type definitions + formatting for timeline items.
- [timeline-data.ts](timeline-data.ts) — `getTimelineFeed`: unions posts/comments/reactions/cooked/edits per request (no event table).
- [notifications.ts](notifications.ts) — read/write of the `Notification` table; reactions are batched per `(post, recipient)`.
- [tags.ts](tags.ts) — curated tag catalog enforcement (only seeded tags allowed).
- [ingredients.ts](ingredients.ts) — unit enum + display formatting.
- [family.ts](family.ts) — family member list with role + join date + post counts.
- [profile.ts](profile.ts) — paginated queries for "My Posts", "Cooked", "Favorites" tabs.
- [feedback.ts](feedback.ts) — `FeedbackSubmission` writes from the in-app feedback form.

## Infrastructure

- [apiUpstream.ts](apiUpstream.ts) — **server-side** client for FastAPI. `fetchUpstream(path, init)` resolves the origin (`API_INTERNAL_URL`, falling back to `NEXT_PUBLIC_API_BASE_URL` locally) and attaches a Google ID token on `X-Serverless-Authorization`, leaving `Authorization` free for the user's access token. Every server→FastAPI call goes through it: the four `auth/*` proxies, [auth/bootstrapFromCookies.ts](auth/bootstrapFromCookies.ts), and the `/v1/*` passthrough at [src/app/v1/[...path]/route.ts](../app/v1/%5B...path%5D/route.ts). See issue #241.
- [apiClient.ts](apiClient.ts) — shared `fetch` wrapper used by frontend (client components). Honors `NEXT_PUBLIC_API_BASE_URL` (unset = same-origin), normalizes non-2xx responses to `ApiError` carrying the codes from [apiErrors.ts](apiErrors.ts), and exposes `setAccessTokenProvider` for the FastAPI token flow ([docs/API_BACKEND_MIGRATION_PLAN.md](../../docs/API_BACKEND_MIGRATION_PLAN.md)). The provider **is** wired now (post-cutover) — it supplies the in-memory access token and `joinInflightRefresh` dedupes concurrent refreshes so a write issued during rotation doesn't go out tokenless (#276).
- [uploads.ts](uploads.ts) — dual-mode photo storage. Local disk under `public/uploads` when `UPLOADS_BUCKET` is unset; GCS with signed URLs otherwise. **DB stores `storageKey`, never URLs** — resolve at read time via `getSignedUploadUrl` or `createSignedUrlResolver`. Enforces 8MB cap and JPEG/PNG/WEBP/GIF only.
- [rateLimit.ts](rateLimit.ts) — ⚠️ **dead code, no remaining consumers.** These in-process LRU limiters (`signupLimiter`, `loginLimiter`, `postCreationLimiter`, …) guarded the Next `/api/*` data routes, which were deleted in the Phase 4 cutover (#231). Rate limiting now lives in [apps/api/src/rate_limit.py](../../apps/api/src/rate_limit.py). Don't wire new code to this module; it's retained only until someone removes it.
- [logger.ts](logger.ts) — `logError`, `logWarn`. Use these instead of `console.*`; tests silence console by default (override with `ALLOW_TEST_LOGS=true`).

## Patterns

- **No raw SQL.** Use Prisma. If a query is unwieldy, build it with Prisma's relation includes rather than dropping to `$queryRaw`.
- **Always scope by `familySpaceId`** in any cross-entity query. There's no row-level security.
- **Storage keys vs URLs**: persist keys, render URLs lazily. Avoid leaking signed URLs into long-lived caches (they expire).
