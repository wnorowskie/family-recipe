# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Startup Checklist

Before doing any work, a new Claude session should:

1. **Check what's in flight** — look at the [Family Recipe Project board](https://github.com/users/wnorowskie/projects/4) for issues marked `In Progress`. Do not start work that overlaps with an open in-progress ticket.
2. **Check the current branch** — run `git branch` and `git status`. If already on a feature branch, read the associated issue before continuing.
3. **Check recent history** — run `git log --oneline -10` to understand what was last completed.
4. **Confirm the issue exists** — every piece of work must have a GitHub issue. Create one before starting if it doesn't exist.
5. **Follow the conventions** — branch naming, commit format, and PR workflow are in [.github/GITHUB_GUIDE.md](.github/GITHUB_GUIDE.md). Ticket format is in [.github/TICKET_FORMAT.md](.github/TICKET_FORMAT.md).

## Project

Private family-only web app for sharing recipes and cooking activity. Single `FamilySpace` model with members joining via a hashed master key. Currently in **testing with real family users**, so prefer minimal, non-breaking changes and protect existing data flows.

The product/domain truth lives in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/USER_STORIES.md](docs/USER_STORIES.md), and [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md). The most up-to-date narrative is [docs/V1_DETAILED_SUMMARY.md](docs/V1_DETAILED_SUMMARY.md).

## Commands

```bash
# Dev / build
npm run dev                  # Next.js dev server on :3000
npm run build                # Production build
npm run type-check           # tsc --noEmit (also runs in pre-commit)
npm run lint                 # next lint
npm run lint:fix             # auto-fix
npm run format               # prettier write

# Tests (Jest, see jest.config.js)
npm test                     # all tests
npm run test:unit            # __tests__/unit only
npm run test:integration     # __tests__/integration only
npm run test:watch
npm run test:coverage        # enforces 75% global threshold
npx jest path/to/file.test.ts                  # single file
npx jest -t "should reject unauthenticated"    # filter by name

# Database (defaults to SQLite via prisma/schema.prisma)
npm run db:generate          # prisma generate
npm run db:push              # prisma db push (SQLite workflow — no migrations)
npm run db:seed              # tsx prisma/seed.ts; PRINTS the family master key
npm run db:studio
```

When working against Postgres locally, set `PRISMA_SCHEMA=prisma/schema.postgres.prisma` and pass `--schema $PRISMA_SCHEMA` to prisma commands. See [prisma/CLAUDE.md](prisma/CLAUDE.md).

## Architecture (the things that span files)

**Three concurrent runtimes share one database.** Code lives in three places that must stay schema-consistent:

1. **Next.js monolith** ([src/](src/)) — App Router UI + REST-ish API under [src/app/api/](src/app/api/). Today this is the production backend.
2. **FastAPI service** ([apps/api/](apps/api/)) — Python re-implementation of the same auth/session/JSON contract. Mid-migration target per [docs/API_BACKEND_MIGRATION_PLAN.md](docs/API_BACKEND_MIGRATION_PLAN.md). When changing an endpoint in `src/app/api/`, check whether the equivalent router in `apps/api/src/routers/` needs the same change.
3. **Recipe URL Importer** ([apps/recipe-url-importer/](apps/recipe-url-importer/)) — standalone Python service called by the Next backend (see [apps/recipe-url-importer/SPEC.md](apps/recipe-url-importer/SPEC.md)). Does not touch the database.

**Three Prisma schemas** describe the same domain for different deploy targets — [prisma/CLAUDE.md](prisma/CLAUDE.md) explains when to edit which.

**Auth flow.** Credentials login → bcrypt verify → JWT signed with `jose` ([src/lib/jwt.ts](src/lib/jwt.ts)) → HTTP-only `session` cookie. [src/middleware.ts](src/middleware.ts) gates the `(app)` route group; API routes use `withAuth`/`withRole` wrappers from [src/lib/apiAuth.ts](src/lib/apiAuth.ts). See [src/app/api/CLAUDE.md](src/app/api/CLAUDE.md) for the handler pattern.

**Family scoping is implicit.** Every authenticated handler receives `user.familySpaceId`. All Post/Comment/Reaction/etc. queries must filter by it — there is no row-level enforcement in Prisma, so a missing filter leaks data across families. (V1 only has one family, but the schema is multi-tenant-ready and tests assume the filter is present.)

**Photo storage is environment-dependent.** [src/lib/uploads.ts](src/lib/uploads.ts) writes to `public/uploads` locally and to GCS when `UPLOADS_BUCKET` is set. URLs returned to clients are signed and time-limited in the GCS path; the DB stores opaque `storageKey` values, never URLs. Resolve URLs only at response time via `getSignedUploadUrl` / `createSignedUrlResolver`.

**Timeline is computed, not stored.** [src/lib/timeline-data.ts](src/lib/timeline-data.ts) unions posts, comments, post-reactions, cooked events, and post edits per request. There is no `TimelineEvent` table — don't add one without discussing trade-offs.

**Rate limiting is in-process.** [src/lib/rateLimit.ts](src/lib/rateLimit.ts) uses LRU caches keyed by user or IP. Globally mocked in [jest.setup.js](jest.setup.js); production deployments behind multiple instances would not share state (acceptable for current single-instance Cloud Run setup).

**Subdirectory guides** — read before editing in these areas:

- [src/app/api/CLAUDE.md](src/app/api/CLAUDE.md) — route handler conventions
- [src/lib/CLAUDE.md](src/lib/CLAUDE.md) — what each lib/ module is for
- [prisma/CLAUDE.md](prisma/CLAUDE.md) — schema variants and migration rules
- [**tests**/CLAUDE.md](__tests__/CLAUDE.md) — global mocks and helper conventions
- [apps/api/CLAUDE.md](apps/api/CLAUDE.md) — FastAPI mirror service
- [apps/recipe-url-importer/CLAUDE.md](apps/recipe-url-importer/CLAUDE.md) — importer service

## Conventions worth knowing

- **TypeScript strict mode** is on. The pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `type-check` then `lint-staged` — failing types block the commit.
- **Path alias**: `@/*` → `src/*` (also configured in jest's `moduleNameMapper`).
- **Validation**: every API input goes through a Zod schema in [src/lib/validation.ts](src/lib/validation.ts). Add new schemas there, don't inline them in route handlers.
- **Error responses**: use the helpers in [src/lib/apiErrors.ts](src/lib/apiErrors.ts) (`validationError`, `notFoundError`, etc.) — never construct `NextResponse.json({ error: ... })` ad-hoc.
- **Logger**: use `logError`/`logWarn` from [src/lib/logger.ts](src/lib/logger.ts). Tests silence `console.*` by default; set `ALLOW_TEST_LOGS=true` to see output.
- **`bcrypt` vs `bcryptjs`**: prod uses native `bcrypt`; jest aliases it to `bcryptjs` (see [jest.config.js](jest.config.js)) so tests don't need native compilation. Don't import `bcryptjs` directly in app code.
- **Server vs client components**: default to server components for data fetching; mark `'use client'` only for interactive forms/state. Server components reuse `getCurrentUser` by passing a `NextRequest`-shaped object.

## Branches and releases

- `main` = **production**. `develop` = **dev environment**.
- Feature branches **branch from `develop`** and merge back into `develop` via PR — never target `main` directly.
- Releases happen by opening a PR from `develop` → `main`. Only the repo owner cuts these.
- When asked to "open a PR", the base branch is `develop` unless the user explicitly says it's a release.

## CI gates

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs typecheck → lint → test → docker build → trivy scan, plus prisma validate (postgres schema), `npm audit`, dependency-review, semgrep, IaC scan, and gitleaks. Separate workflows cover [api-ci.yml](.github/workflows/api-ci.yml) and [recipe-url-importer-ci.yml](.github/workflows/recipe-url-importer-ci.yml). Deploy workflows target GCP Cloud Run.

## What's out of scope (don't add unless asked)

Multi-family/multi-tenant features, public sharing, OCR, threaded comments, meal planning, grocery lists. Per the product spec, V1 is intentionally a single private family space.
