# CLAUDE.md — `src/lib/`

Module map for the shared backend logic. Most of these are imported from API route handlers and server components. Prefer extending an existing module over creating a new one.

## Auth & sessions

- [prisma.ts](prisma.ts) — singleton `PrismaClient`. Always import `prisma` from here, never construct your own.
- [auth.ts](auth.ts) — bcrypt password hashing/verify. Tests substitute `bcryptjs` via [jest.config.js](../../jest.config.js).
- [jwt.ts](jwt.ts) — sign/verify the session JWT with `jose`. Tokens carry `userId`, `familySpaceId`, `role`.
- [session-core.ts](session-core.ts) — cookie set/clear and `getSessionFromRequest`. Edge-runtime safe (used by [src/proxy.ts](../proxy.ts)).
- [session.ts](session.ts) — Node-runtime `getCurrentUser(request)` that does the DB fetch + signed avatar URL. Re-exports the cookie helpers.
- [apiAuth.ts](apiAuth.ts) — `withAuth` / `withRole` HOCs for route handlers. **Always use these** in API routes; don't read the session inline.
- [permissions.ts](permissions.ts) — `canEditPost`, `canDeletePost`, `canDeleteComment`, `canRemoveMember`. Centralizes ownership/admin rules.
- [masterKey.ts](masterKey.ts) — bcrypt hash/verify for the family master key (signup gate).

## Validation & errors

- [validation.ts](validation.ts) — every Zod schema for request payloads + the course/difficulty/ingredient-unit enums. Add new schemas here; don't inline.
- [apiErrors.ts](apiErrors.ts) — `validationError` / `notFoundError` / `forbiddenError` / etc. plus `parseRequestBody`/`parseQueryParams`/`parseRouteParams` helpers. The `{ error: { code, message } }` shape is the public API contract.

## Domain logic

- [posts.ts](posts.ts) — `getPostDetail`, recipe-detail serialization (ingredients/steps stored as JSON strings; deserialized here).
- [postPayload.ts](postPayload.ts) — `normalizePostPayload` + `MAX_PHOTO_COUNT`. Run incoming JSON through this before Zod when handling FormData.
- [recipes.ts](recipes.ts) — `/api/recipes` filter/search query (title, course, tags, difficulty, time, servings, up to 5 ingredient keywords).
- [recipeImporter.ts](recipeImporter.ts) — client for the [recipe-url-importer](../../../apps/recipe-url-importer/) service.
- [timeline.ts](timeline.ts) — type definitions + formatting for timeline items.
- [timeline-data.ts](timeline-data.ts) — `getTimelineFeed`: unions posts/comments/reactions/cooked/edits per request (no event table).
- [notifications.ts](notifications.ts) — read/write of the `Notification` table; reactions are batched per `(post, recipient)`.
- [tags.ts](tags.ts) — curated tag catalog enforcement (only seeded tags allowed).
- [ingredients.ts](ingredients.ts) — unit enum + display formatting.
- [family.ts](family.ts) — family member list with role + join date + post counts.
- [profile.ts](profile.ts) — paginated queries for "My Posts", "Cooked", "Favorites" tabs.
- [feedback.ts](feedback.ts) — `FeedbackSubmission` writes from the in-app feedback form.

## Infrastructure

- [uploads.ts](uploads.ts) — dual-mode photo storage. Local disk under `public/uploads` when `UPLOADS_BUCKET` is unset; GCS with signed URLs otherwise. **DB stores `storageKey`, never URLs** — resolve at read time via `getSignedUploadUrl` or `createSignedUrlResolver`. Enforces 8MB cap and JPEG/PNG/WEBP/GIF only.
- [rateLimit.ts](rateLimit.ts) — in-process LRU limiters: `signupLimiter`, `loginLimiter`, `postCreationLimiter`, `commentLimiter`, `reactionLimiter`, `cookedEventLimiter`. Globally mocked in [jest.setup.js](../../jest.setup.js). Per-instance — does not share across replicas.
- [logger.ts](logger.ts) — `logError`, `logWarn`. Use these instead of `console.*`; tests silence console by default (override with `ALLOW_TEST_LOGS=true`).

## Patterns

- **No raw SQL.** Use Prisma. If a query is unwieldy, build it with Prisma's relation includes rather than dropping to `$queryRaw`.
- **Always scope by `familySpaceId`** in any cross-entity query. There's no row-level security.
- **Storage keys vs URLs**: persist keys, render URLs lazily. Avoid leaking signed URLs into long-lived caches (they expire).
