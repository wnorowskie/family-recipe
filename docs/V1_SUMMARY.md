# V1 Summary

> Product overview plus the current architecture after the Phase 4 FastAPI
> cutover (#38, #244). See [V1_DETAILED_SUMMARY.md](V1_DETAILED_SUMMARY.md) for
> the full narrative and the root [CLAUDE.md](../CLAUDE.md) for authoritative
> architecture.

## Product Overview

- Private, single-family app to share cooking, preserve recipes, and keep everything inside one Family Space protected by a Family Master Key.
- Goals: capture my family recipes long-term, keep a lively family feed, and maintain a safe, private space.
- V1 features: family timeline of posts/comments/reactions/cooked logs/edits; quick posts or full recipes with photos; comments with optional photos; emoji reactions; “Cooked this” with rating/note and aggregate stats; favorites; recipe browse/search; profile with posts/cooked/favorites; family member list (owner can manage).

## Architecture & Tech Stack

- Next.js App Router with React + TypeScript, mobile-first UI styled with Tailwind utility classes and shared bottom navigation; a mix of server components for data loading and client components for interactivity.
- The JSON API backend is the **FastAPI** service under `apps/api/` (routers under `apps/api/src/routers/v1/`, served at `/v1`), called from client components via `src/lib/apiClient.ts` with an in-memory Bearer token. Next.js server components additionally read initial page data straight from Postgres via Prisma. The former Next `src/app/api/**` data routes were removed in the Phase 4 cutover — only the `auth/*` proxies, `auth/bootstrap`, and `health` remain.
- Prisma ORM with Postgres models the domain via two field-identical schemas — a JS client for the Next runtime, a Python client for FastAPI; inputs are validated with Zod (Next) / Pydantic (FastAPI).
- Auth: credentials (email/username + password) plus Family Master Key on signup; passwords and master key stored as hashes. FastAPI owns auth — it signs the tokens and sets an HTTP-only rotating `refresh_token` cookie plus a `csrf_token` cookie, while the client holds a short-lived in-memory access token minted per page load via `/api/auth/bootstrap`. Roles cover owner/admin/member; the `(app)` layout redirects unauthenticated users.

## Core Domain Model

- People & space: `User` joins a single `FamilySpace` via `FamilyMembership` with a `role`.
- Content: unified `Post` for quick shares and recipes, optional `RecipeDetails`, gallery via `PostPhoto`, tagging via `Tag`/`PostTag`.
- Social: `Comment` (flat, optional photo) and `Reaction` targeting posts or comments.
- Engagement: `CookedEvent` logs “Cooked this” with rating/note and feeds stats; `Favorite` is per-user bookmark.
- Derived views: timeline aggregates activity across posts/comments/reactions/cooked/edits; recipe browse/search only surfaces posts with `RecipeDetails`.

## Implementation Highlights

- Signup/login are thin Next proxies (`src/app/api/auth/{signup,login}/route.ts`) to FastAPI `/v1/auth/*`, which validate the master key, hash credentials, assign owner to the first member, and set the `refresh_token`/`csrf_token` cookies; SSR pages guard access via `resolvePageUser` → FastAPI `/v1/auth/session`.
- Post create/update (`POST`/`PUT /v1/posts`, `apps/api/src/routers/v1/posts.py`) handle multipart payloads, photo uploads/order, an optional recipe block (ingredients/steps/time/servings/course/difficulty/tags), and change notes that stamp editor + `lastEditAt`.
- The post detail endpoint enriches responses with reactions, tags, cooked aggregates + recent entries, favorites flag, comments (with reaction summary), and edit metadata; delete/edit are limited to author or owner/admin. The detail page server-renders via `getPostDetail` (`src/lib/posts.ts`).
- The timeline builds the feed on the fly from posts, comments, post reactions, cooked events, and edit events (with change notes) — SSR via `getTimelineFeed` (`src/lib/timeline-data.ts`), pagination via `/v1/timeline` — instead of a dedicated event table.
- The recipes endpoint filters by title, author, course(s), tags, difficulty, time, servings, and up to five ingredient keywords; favorites and cooked-history endpoints power the profile tabs; reactions toggle on/off; “Cooked this” writes `CookedEvent` and returns refreshed stats.

## Out-of-Scope / Future

- Multiple families/spaces, public or link-based sharing.
- OCR or URL imports
- advanced analytics.
- Unit conversion or broader internationalization beyond the current simple fields.
