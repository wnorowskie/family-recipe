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

**The Phase 4 FastAPI cutover is live in production** (released 2026-08-23, PR #263, epic #38). FastAPI is the sole backend everywhere, including prod — there is no environment still served by the old Next `/api/*` stack. One caveat still worth carrying into any infra work: prod alerting is **not** functional (`Service Down` is inverted and fires when healthy — #284; the FastAPI service has no monitoring coverage — #32). The other known trap is fixed: a bare `terraform apply` against prod used to strip workflow-managed `API_INTERNAL_*` env vars from the live Next service despite a benign-looking `0 add, 4 change, 0 destroy` plan; `terraform plan` against both live dev and prod now comes back clean except for pre-existing cosmetic dashboard drift (#285).

The product/domain truth lives in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/USER_STORIES.md](docs/USER_STORIES.md), and [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md). The fullest **product/feature** narrative is [docs/V1_DETAILED_SUMMARY.md](docs/V1_DETAILED_SUMMARY.md); its architecture sections were refreshed for the Phase 4 FastAPI cutover (#244). For the authoritative backend architecture, trust this file and [docs/API_BACKEND_MIGRATION_PLAN.md](docs/API_BACKEND_MIGRATION_PLAN.md).

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

# Database (local dev = Postgres via prisma/schema.postgres.node.prisma)
npm run db:generate          # prisma generate
npm run db:push              # prisma db push (no migration file)
npm run db:seed              # tsx prisma/seed.ts; PRINTS the family master key
npm run db:studio
```

Spin up local Postgres with the one-liner in [docs/verification/next-api.md](docs/verification/next-api.md#start-the-dev-server). SQLite is no longer supported — see [prisma/CLAUDE.md](prisma/CLAUDE.md) for the remaining two Postgres schemas and when to edit which.

## Architecture (the things that span files)

**Three concurrent runtimes share one database.** Code lives in three places that must stay schema-consistent:

1. **Next.js frontend** ([src/](src/)) — App Router UI. The only routes left under [src/app/api/](src/app/api/) are the auth proxies (`login`/`logout`/`signup`/`bootstrap`) that forward to FastAPI and a `health` check; all data routes were removed in the Phase 4 cutover (#231).
2. **FastAPI service** ([apps/api/](apps/api/)) — the sole backend for the auth/session/JSON contract, per [docs/API_BACKEND_MIGRATION_PLAN.md](docs/API_BACKEND_MIGRATION_PLAN.md). Handlers live under [apps/api/src/routers/v1/](apps/api/src/routers/v1/) — this is where API behavior changes go.
3. **Recipe URL Importer** ([apps/recipe-url-importer/](apps/recipe-url-importer/)) — standalone Python service called by FastAPI ([apps/api/src/recipe_importer.py](apps/api/src/recipe_importer.py), from the recipes router; see [apps/recipe-url-importer/SPEC.md](apps/recipe-url-importer/SPEC.md)). Does not touch the database.

**Three Prisma schemas** describe the same domain for different deploy targets — [prisma/CLAUDE.md](prisma/CLAUDE.md) explains when to edit which.

**Auth flow (FastAPI-only since Phase 4.4).** Login/signup/logout POST to same-origin Next proxy routes under [src/app/api/auth/](src/app/api/auth/) that forward to FastAPI `/v1/auth/*`; FastAPI sets HTTP-only `refresh_token` + `csrf_token` cookies (no Next-signed `session` JWT anymore). [src/proxy.ts](src/proxy.ts) (the Next 16 middleware entry) gates the `(app)` route group with a presence-only `refresh_token` check ([`hasRefreshTokenFromRequest`](src/lib/session-core.ts)). SSR pages resolve the user via [`resolvePageUser`](src/lib/session.ts) → FastAPI `/v1/auth/session`; the client mints an in-memory access token via `/api/auth/bootstrap`. The legacy `jwt.ts`/`apiAuth.ts`/`getCurrentUser` cookie helpers were deleted.

**Family scoping is implicit.** Every authenticated handler receives `user.familySpaceId`. All Post/Comment/Reaction/etc. queries must filter by it — there is no row-level enforcement in Prisma, so a missing filter leaks data across families. (V1 only has one family, but the schema is multi-tenant-ready and tests assume the filter is present.)

**Photo storage is environment-dependent.** [src/lib/uploads.ts](src/lib/uploads.ts) writes to `public/uploads` locally and to GCS when `UPLOADS_BUCKET` is set. URLs returned to clients are signed and time-limited in the GCS path; the DB stores opaque `storageKey` values, never URLs. Resolve URLs only at response time via `getSignedUploadUrl` / `createSignedUrlResolver`.

**Timeline is computed, not stored.** [src/lib/timeline-data.ts](src/lib/timeline-data.ts) unions posts, comments, post-reactions, cooked events, and post edits per request. There is no `TimelineEvent` table — don't add one without discussing trade-offs.

**Rate limiting lives in FastAPI.** [apps/api/src/rate_limit.py](apps/api/src/rate_limit.py) holds in-process limiters keyed by real client IP on five auth endpoints: `/v1/auth/login` 5/15min, `/signup` 3/hour, `/reset` 5/15min (#175), `/session` 60/min and `/refresh` 30/min (#265). The last two carried no limiter under #175 — SSR reached them through the Next service, so a per-IP bucket would have collapsed all family traffic onto one IP — until #265 forwarded the browser's IP through `fetchUpstream`. Mind the `/session` budget: one household NAT shares a single 60/min bucket, and that's the number to revisit if users hit spurious `/login?_se=1` bounces. `/v1/auth/{logout,me}` are unlimited. The one non-auth limiter, `feedback_limiter`, is keyed by **user id** rather than IP (20/hour, #183). State is per-instance and not shared across replicas (#33). Note the Next-side [src/lib/rateLimit.ts](src/lib/rateLimit.ts) still exists but has **no remaining consumers** — it went dead when the `/api/*` data routes were deleted in #231. Don't wire new code to it.

**Subdirectory guides** — read before editing in these areas:

- [src/lib/CLAUDE.md](src/lib/CLAUDE.md) — what each lib/ module is for
- [prisma/CLAUDE.md](prisma/CLAUDE.md) — schema variants and migration rules
- [**tests**/CLAUDE.md](__tests__/CLAUDE.md) — global mocks and helper conventions
- [apps/api/CLAUDE.md](apps/api/CLAUDE.md) — FastAPI backend service
- [apps/recipe-url-importer/CLAUDE.md](apps/recipe-url-importer/CLAUDE.md) — importer service

## Conventions worth knowing

- **TypeScript strict mode** is on. The pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `type-check` then `lint-staged` — failing types block the commit.
- **Path alias**: `@/*` → `src/*` (also configured in jest's `moduleNameMapper`).
- **Validation**: every API input goes through a Zod schema in [src/lib/validation.ts](src/lib/validation.ts). Add new schemas there, don't inline them in route handlers.
- **Error responses**: use the helpers in [src/lib/apiErrors.ts](src/lib/apiErrors.ts) (`validationError`, `notFoundError`, etc.) — never construct `NextResponse.json({ error: ... })` ad-hoc.
- **Logger**: use `logError`/`logWarn` from [src/lib/logger.ts](src/lib/logger.ts). Tests silence `console.*` by default; set `ALLOW_TEST_LOGS=true` to see output.
- **`bcrypt` vs `bcryptjs`**: prod uses native `bcrypt`; jest aliases it to `bcryptjs` (see [jest.config.js](jest.config.js)) so tests don't need native compilation. Don't import `bcryptjs` directly in app code.
- **Server vs client components**: default to server components for data fetching; mark `'use client'` only for interactive forms/state. Server components in the `(app)` group resolve the user via `resolvePageUser()` from [src/lib/session.ts](src/lib/session.ts).

## Before opening a PR

The pre-commit hook runs `type-check` + `lint-staged`; nothing else is automatic. Run the verification playbook matching what you changed — see [docs/verification/README.md](docs/verification/README.md) for the index. In short:

- **UI** (anything under [src/app/](src/app/) or [src/components/](src/components/)) → [docs/verification/ui.md](docs/verification/ui.md)
- **Next API** ([src/app/api/](src/app/api/)) → [docs/verification/next-api.md](docs/verification/next-api.md)
- **FastAPI** ([apps/api/](apps/api/)) → [docs/verification/fastapi.md](docs/verification/fastapi.md)
- **Recipe URL importer** ([apps/recipe-url-importer/](apps/recipe-url-importer/)) → [docs/verification/recipe-url-importer.md](docs/verification/recipe-url-importer.md)
- **Prisma schema** ([prisma/](prisma/)) → [docs/verification/prisma.md](docs/verification/prisma.md)

Always finish with `npm test` (the pre-commit hook doesn't run it). If the session can't run a tool a change needs (e.g., no browser for a hydration-sensitive UI change), say so in the PR body — don't claim UI success from `curl` alone.

**Before merging a `develop → main` release PR**, also run the dev-deployment playbook at [docs/verification/dev-deployments.md](docs/verification/dev-deployments.md) — it exercises the live Cloud Run build, migration, and env wiring that local verification can't catch. Check whether the dev Postgres is running first (it can be manually stopped between sessions); the playbook has the `gcloud sql instances` commands. The [`/release-testing`](.claude/skills/release-testing/SKILL.md) skill drives this end-to-end and posts results back on the PR.

## Branches and releases

- `main` = **production**. `develop` = **dev environment**.
- Feature branches **branch from `develop`** and merge back into `develop` via PR — never target `main` directly.
- Releases happen by opening a PR from `develop` → `main`. Only the repo owner cuts these.
- When asked to "open a PR", the base branch is `develop` unless the user explicitly says it's a release.

## CI gates

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs typecheck → lint → test → docker build → trivy scan, plus prisma validate (postgres schema), `npm audit`, dependency-review, semgrep, IaC scan, and gitleaks. Jobs are gated per-surface by a top `changes` job (dorny/paths-filter) — each job always runs so required-check contexts report, but expensive steps short-circuit when their surface (`next` / `prisma` / `infra`) didn't change. Separate workflows cover [api-ci.yml](.github/workflows/api-ci.yml) and [recipe-url-importer-ci.yml](.github/workflows/recipe-url-importer-ci.yml). Deploy workflows target GCP Cloud Run.

## What's out of scope (don't add unless asked)

Multi-family/multi-tenant features, public sharing, OCR, threaded comments, meal planning, grocery lists. Per the product spec, V1 is intentionally a single private family space.
