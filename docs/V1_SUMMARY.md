# V1 Summary

## Product Overview

- Private, single-family app to share cooking, preserve recipes, and keep everything inside one Family Space protected by a Family Master Key.
- Goals: capture my family recipes long-term, keep a lively family feed, and maintain a safe, private space.
- V1 features: family timeline of posts/comments/reactions/cooked logs/edits; quick posts or full recipes with photos; comments with optional photos; emoji reactions; “Cooked this” with rating/note and aggregate stats; favorites; recipe browse/search; profile with posts/cooked/favorites; family member list (owner can manage).

## Architecture & Tech Stack

- Next.js App Router with React + TypeScript, mobile-first UI styled with Tailwind utility classes and shared bottom navigation; mix of server components for data loading and client components for interactivity.
- Backend is a REST-ish JSON API implemented with Next.js route handlers under `src/app/api`, consumed via `fetch` from client components. Eventually the goal is to move this to its own application.
- Prisma ORM with SQLite locally (Postgres-ready) models the domain; routes use typed Zod validation.
- Auth: credentials (email/username + password) plus Family Master Key on signup; passwords and master key stored as hashes; JWT issued to an HTTP-only `session` cookie; roles cover owner/admin/member; `(app)` layout redirects unauthenticated users.

## Core Domain Model

- People & space: `User` joins a single `FamilySpace` via `FamilyMembership` with a `role`.
- Content: unified `Post` for quick shares and recipes, optional `RecipeDetails`, gallery via `PostPhoto`, tagging via `Tag`/`PostTag`.
- Social: `Comment` (flat, optional photo) and `Reaction` targeting posts or comments.
- Engagement: `CookedEvent` logs “Cooked this” with rating/note and feeds stats; `Favorite` is per-user bookmark.
- Derived views: timeline aggregates activity across posts/comments/reactions/cooked/edits; recipe browse/search only surfaces posts with `RecipeDetails`.

## Implementation Highlights

- Signup/login routes validate the master key, hash credentials, assign owner to the first member, and set JWT cookies; app layout uses `getCurrentUser` from the cookie to guard pages.
- Post create/update (`/api/posts`, `/api/posts/[id]`) handle multipart payloads, photo uploads/order, optional recipe block (ingredients/steps/time/servings/course/difficulty/tags), and change notes to stamp editor + `lastEditAt`.
- Post detail endpoint enriches responses with reactions, tags, cooked aggregates + recent entries, favorites flag, comments (with reaction summary), and edit metadata; delete/edit limited to author or owner/admin.
- Timeline endpoint builds the feed on the fly from posts, comments, post reactions, cooked events, and edit events (with change notes) instead of a dedicated event table.
- Recipes browse endpoint filters by title, author, course(s), tags, difficulty, time, servings, and up to five ingredient keywords; favorites and cooked history endpoints power profile tabs; reactions toggle on/off; “Cooked this” writes `CookedEvent` and returns refreshed stats.

## Out-of-Scope / Future

- Multiple families/spaces, public or link-based sharing.
- OCR or URL imports
- advanced analytics.
- Unit conversion or broader internationalization beyond the current simple fields.
