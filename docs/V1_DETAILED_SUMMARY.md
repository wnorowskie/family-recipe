# V1 Detailed Summary

## Product & Feature Summary

- **Single-family private space:** V1 targets one household; every member creates their own login and joins the sole `FamilySpace` with a shared master key. The app’s job is equal parts preservation (recipes that last) and social fun (lightweight posts, reactions, and cooked logs).
- **Auth + Family Master Key:** Signup (`src/app/api/auth/signup/route.ts`) requires name, email/username, password, and the master key hashed in `FamilySpace.masterKeyHash`; the first successful signup becomes `owner`, everyone else is `member`. Login (`src/app/api/auth/login/route.ts`) issues a `session` JWT cookie and middleware (`src/middleware.ts`) redirects unauthenticated traffic to `/login`.
- **Timeline:** `/timeline` renders `TimelineFeed` (`src/components/timeline/TimelineFeed.tsx`), which fetches `/api/timeline`. The feed includes posts, comments, cooked events, reactions, and post edits with change notes, each rendered via `TimelineCard`.
- **Posts & Recipes:** Users can add quick posts or expand into recipes from `/add` using `AddPostForm` (`src/components/add/AddPostForm.tsx`). Photos (up to 10) are optional; recipe metadata (origin, ingredients, steps, time, servings, courses, difficulty, tags) is only persisted when both ingredients and steps are provided.
- **Recipe details & browsing:** Structured recipes show ingredient/step blocks, metadata chips, and edit history in `PostDetailView` (`src/components/post/PostDetailView.tsx`). `/recipes` loads `RecipesBrowseClient`, letting users search by title, filter by course/tags/difficulty/author, constrain cook time & servings, and add up to five ingredient keywords; results come from `/api/recipes` backed by `lib/recipes.ts` queries.
- **Comments & reactions:** Post detail includes flat comments with optional photo attachments and emoji reactions on both posts and comments. Handlers live in `/api/posts/[postId]/comments` and `/api/reactions`.
- **“Cooked this” events & ratings:** The cook modal inside `PostDetailView` hits `/api/posts/[postId]/cooked`, storing a `CookedEvent` with optional 1–5 rating and note. Aggregated stats (times cooked, avg rating) update immediately and recent cooks list is paginated.
- **Favorites:** Users can toggle favorites from post detail via `/api/posts/[postId]/favorite`; `/profile` tabs read `/api/me/favorites` to show the private list.
- **Profiles & family members:** `/profile` shows My Posts, Cooked, and Favorites tabs with lazy pagination. `/family-members` surfaces everyone in the family space, and owners/admins can remove members via `/api/family/members/:userId` while the master key remains the gate for new joiners.

## Technical Architecture

- **Next.js App Router + TypeScript:** Pages under `src/app/(auth)` handle entry, while the authenticated app lives under `src/app/(app)` with a shared layout that guards sessions (`getCurrentUser` in `src/lib/session.ts`). Server components fetch initial data; interactive flows are client components marked with `'use client'`.
- **API layer:** Route handlers under `src/app/api/**` act as a REST-ish JSON API. Each handler validates input with Zod schemas from `src/lib/validation.ts`, uses Prisma (`src/lib/prisma.ts`) for DB access, and returns structured error payloads. Key endpoints cover auth, posts CRUD, comments, reactions, cooked events, favorites, recipes search, profile data, and family membership. Eventually the goal is to move this to its own application.
- **Prisma + SQLite/Postgres-ready:** `prisma/schema.prisma` models the domain with future multi-family flexibility even though V1 seeds a single `FamilySpace`. Local development uses SQLite via `DATABASE_URL`; production can point to Postgres without schema changes. The seed script (`prisma/seed.ts`) hashes an initial master key and loads the curated tag catalog.
- **Auth & sessions:** Credentials are hashed with bcrypt (`src/lib/auth.ts`), JWTs signed via `jose` (`src/lib/jwt.ts`), and stored in an HTTP-only `session` cookie (`setSessionCookie` in `src/lib/session.ts`). Middleware enforces redirects, and server components mimic a `NextRequest` so they can reuse `getCurrentUser`.
- **File uploads:** Images are saved to `public/uploads` by `savePhotoFile` (`src/lib/uploads.ts`), which enforces MIME type (JPEG/PNG/WEBP/GIF) and an 8 MB cap. Files are referenced by relative URLs and deleted from disk when posts are removed. This will have to be altered for V2
- **Environment & secrets:** `.env` must provide `DATABASE_URL` and a strong `JWT_SECRET` (needs updating for V2); the master key hash lives in the DB and should be reseeded per family. No secrets are baked into the client.
- **UI foundation:** Styling leans on Tailwind classes defined in `src/app/globals.css`. Mobile-first layouts use cards, rounded containers, and a persistent bottom nav (`src/components/navigation/BottomNav.tsx`).

## Domain Model & Data Structures

- **User / FamilySpace / FamilyMembership:** Users (`users` table) store profile basics and password hash. They belong to a `FamilySpace` via `FamilyMembership` (role `owner|admin|member`). V1 assumes one family but the schema supports multiple rows.
- **Post:** Represents every timeline entry. Key fields (`title`, `caption`, `mainPhotoUrl`, `hasRecipeDetails`, `lastEditedBy`, `lastEditNote`, `lastEditAt`) allow lightweight posts plus tracked recipe edits.
- **PostPhoto:** Ordered gallery images with `sortOrder`, enabling drag-ish ordering in `AddPostForm` and deterministic cover selection.
- **RecipeDetails:** Optional 1:1 with Post storing origin, serialized JSON arrays for `ingredients` and `steps`, numeric `totalTime` (minutes) and `servings`, primary course(s), and difficulty. Courses are stored both as a single `course` and a JSON `courses` array to support multi-select filters.
- **Tag / PostTag:** Seeded canonical tags (diet, allergen, heat, flavor, cuisine) linked via `PostTag`. Tags are required to come from the curated set.
- **Comment:** Flat comments with optional `photoUrl`; includes `deletedAt` for soft deletes, though current handlers hard-delete.
- **Reaction:** Stores per-user emoji reactions for posts or comments with a uniqueness constraint on `(targetType, targetId, userId, emoji)` and redundant post/comment FKs for fast joins.
- **CookedEvent:** Logs “Cooked this” actions with optional rating and note; stats are computed via aggregates rather than stored columns.
- **Favorite:** User-private bookmarks (unique `(userId, postId)`), powering the profile favorites tab.
- **Enums & helpers:** Course and difficulty enums live in `src/lib/validation.ts`. Ingredient units (tsp, tbsp, unitless, etc.) are enumerated and formatted via `src/lib/ingredients.ts`.

## Implementation Details of Core Flows

- **Signup & master key enforcement:** `POST /api/auth/signup` validates payloads with `signupSchema`, ensures the master key matches the hashed value in `FamilySpace`, promotes the very first member to `owner`, and writes both `User` and `FamilyMembership` inside a transaction. The response sets a session cookie via `setSessionCookie`, honoring a 30-day window when “Remember me” is checked.
- **Login & session management:** `POST /api/auth/login` finds the user, verifies the bcrypt hash, ensures at least one membership, signs a JWT with `familySpaceId` and role, and sends it in the `session` cookie. `middleware.ts` vets auth for `/timeline`, `/recipes`, `/add`, `/profile`, `/family-members`, and `/posts`, redirecting anonymous users to `/login?redirect=…`.
- **Creating posts & recipes:** `AddPostForm` builds a `FormData` payload consisting of a JSON `payload` plus photo files. `normalizePostPayload` (`src/lib/postPayload.ts`) sanitizes the JSON, only persisting recipe details when both ingredients and steps survive validation. `/api/posts` saves photos, enforces `MAX_PHOTO_COUNT`, creates `PostPhoto` rows with sort order, connects approved tags, and writes `RecipeDetails` with serialized ingredient/step arrays. Quick posts skip the recipe block entirely.
- **Editing posts, change notes, and tags:** `PUT /api/posts/[postId]` revalidates permissions (author or owner/admin), parses a `photoOrder` array so users can mix existing and new uploads, enforces distinct ordering, and deletes removed photos from both DB and disk. Recipe details are upserted or removed depending on payload, tags are rewritten, and `lastEditedBy`, `lastEditNote`, `lastEditAt` capture revision metadata. `PostDetailView` surfaces the edit info and an optional change note ribbon.
- **Uploading & associating photos:** `savePhotoFile` writes to disk and returns a `/uploads/...` URL. Creation and edit routes store those URLs in `PostPhoto` and set `mainPhotoUrl` to the first ordered photo. Comment attachments reuse the same helper. Delete route cleans up all linked files.
- **Timeline aggregation:** `/api/timeline` calls `getTimelineFeed` (`src/lib/timeline-data.ts`), which fetches recent posts, comments, reactions (post targets), cooked events, and edits, normalizes them into `TimelineItem` objects, sorts by timestamp, and slices by `limit/offset`. There is no precomputed `TimelineEvent` table; the union query runs per request and is acceptable for the small single-family scale.
- **“Cooked this” logging & stats:** `POST /api/posts/[postId]/cooked` validates rating (1–5) and optional note, guards access to the family space, inserts a `CookedEvent`, and returns updated aggregates via `prisma.cookedEvent.aggregate` plus a paginated recent history (`getPostCookedEventsPage`). Front-end state reuses those payloads for optimistic refreshes.
- **Favorites & profile surfaces:** Favorite toggles hit `/api/posts/[postId]/favorite` (upsert/delete). Profile tabs call `/api/profile/posts`, `/api/profile/cooked`, and `/api/me/favorites` for paginated data. Server-side `profile/page.tsx` prefetches the first page so the UI renders immediately, then client-side “Load more” buttons fetch subsequent pages.
- **Family management:** `/family-members` server component fetches members via `getFamilyMembers` (role, join date, post count). The client component lets owners/admins invoke `DELETE /api/family/members/:userId`, which in turn blocks removing yourself or the owner.
- **Comments & reactions:** Comments use multipart FormData (`POST /api/posts/[postId]/comments`) to support optional photo uploads, then `PostDetailView` offers reaction buttons per comment; reactions toggle through `/api/reactions`, which either inserts or deletes the record and rebuilds the summary list shown in the UI.

## Current State, Gaps & Limitations

- **End-to-end coverage:** Auth, timeline, post CRUD (including recipes, tags, photos), comments, reactions, cooked events, favorites, recipe search, profile tabs, and family-member management are implemented and wired through real API routes. The UI matches the mobile-first wireframes and uses client components only where interactivity is needed.
- **Known gaps / TODOs:**
  - No true soft-delete for comments despite a `deletedAt` column; deletes are permanent.
  - Timeline aggregation performs several separate queries per request with no caching; fine for V1 but could be slow with larger histories.
  - Local file storage (`public/uploads`) lacks CDN delivery, signed URLs, or cleanup when avatars are replaced; production should move to GCS or similar.
  - Validation is minimal beyond schema checks—no rate limiting, brute-force protection, or spam throttling on comments/cooked logs.
  - Multi-family tenancy, invitations, public sharing, meal planning, etc., remain out of scope per the product spec.
  - Testing automation is absent; there are no unit/integration tests for API handlers or client components.
- **Configuration assumptions:** The seed script still prints a hard-coded master key; Must be changed before real usage. `.env` needs strong secrets, and deployment should ensure HTTPS so cookie settings (`sameSite=lax`, `secure` in production) deliver the intended protection.
