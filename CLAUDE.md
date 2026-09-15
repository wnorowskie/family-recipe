# CLAUDE.md

Guidance for Claude Code working in this repository.

## Before starting work

1. **Every unit of work needs a GitHub issue.** Check the [project board](https://github.com/users/wnorowskie/projects/4) for anything already `In Progress` that overlaps; create the issue first if it doesn't exist.
2. **Conventions are in [.github/GITHUB_GUIDE.md](.github/GITHUB_GUIDE.md)** (branch naming, commit format, PR workflow) and [.github/TICKET_FORMAT.md](.github/TICKET_FORMAT.md) (ticket bodies). Branch prefix matches the ticket's `type:` label — `chore/`, `feature/`, `fix/`, `research/`.

## Project

Private family-only web app for sharing recipes and cooking activity. Single `FamilySpace` model with members joining via a hashed master key. In **testing with real family users**, so prefer minimal, non-breaking changes and protect existing data flows.

**The Phase 4 FastAPI cutover is live in production** (released 2026-08-23, PR #263, epic #38). FastAPI is the sole backend everywhere including prod — no environment is still served by the old Next `/api/*` stack.

**Prod alerting works, but Terraform is applied by hand, never from `main`.** The `Service Down` uptime policy ran backwards from 2025-12-24 until #284 fixed it (PR #290, 2026-08-24) — both `family-recipe-dev` and `family-recipe-prod` have run `COMPARISON_GT`/`threshold_value = 2` live since that date, applied by a local `terraform apply` (not a workflow), and `origin/main` has carried the fix too since release #308 (2026-09-15). **Verify alerting state with `gcloud`, never by reading a branch** — the two can disagree, because `infra-apply.yml`'s `workflow_dispatch` only ever plans/applies `infra/envs/dev`; a prod apply is always run locally by the repo owner. The FastAPI service still has no monitoring coverage at all (#32, open) — the uptime check only probes the Next service's `/api/health`. Separately, a prod `terraform apply` used to strip workflow-managed `API_INTERNAL_*` env vars from the live Next service behind a benign-looking `0 add, 4 change, 0 destroy` plan; #285 fixed that, and as of 2026-08-24 `terraform plan` against live dev and prod is clean apart from cosmetic dashboard drift.

Product/domain truth: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/USER_STORIES.md](docs/USER_STORIES.md), [docs/TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md), and the fullest feature narrative in [docs/V1_DETAILED_SUMMARY.md](docs/V1_DETAILED_SUMMARY.md) (architecture sections refreshed for the cutover, #244). For backend architecture, trust this file and [docs/API_BACKEND_MIGRATION_PLAN.md](docs/API_BACKEND_MIGRATION_PLAN.md) over the specs.

## Commands

```bash
npm run dev                  # Next.js dev server on :3000
npm run type-check           # tsc --noEmit (also runs in pre-commit)
npm test                     # jest; also test:unit / test:integration / test:coverage (75% threshold)
npx jest -t "should reject"  # filter by test name

# Database (local dev = Postgres via prisma/schema.postgres.node.prisma)
npm run db:push              # prisma db push (no migration file)
npm run db:seed              # tsx prisma/seed.ts; PRINTS the family master key
npm run db:drift-check       # replays migrations, diffs both schemas
```

Everything else is in `package.json`. Local Postgres one-liner: [docs/verification/next-api.md](docs/verification/next-api.md#start-the-dev-server).

## Architecture (the things that span files)

**Three runtimes, one database — but only two touch it.**

1. **Next.js frontend** ([src/](src/)) — App Router UI. The only handlers left under [src/app/api/](src/app/api/) are four auth proxies (`login`/`logout`/`signup`/`bootstrap`) that forward to FastAPI, plus `health`; all data routes were removed in the cutover (#231). A separate `/v1/*` catch-all at [src/app/v1/[...path]/route.ts](src/app/v1/) forwards browser requests to FastAPI server-to-server with a Google ID token — that proxy is what lets FastAPI stay IAM-private with no custom domain (#241).
2. **FastAPI service** ([apps/api/](apps/api/)) — the sole backend for the auth/session/JSON contract. Handlers in [apps/api/src/routers/v1/](apps/api/src/routers/v1/); API behavior changes go there.
3. **Recipe URL Importer** ([apps/recipe-url-importer/](apps/recipe-url-importer/)) — standalone Python service, called by FastAPI ([apps/api/src/recipe_importer.py](apps/api/src/recipe_importer.py)). No database access.

**Two Prisma schemas** describe the same domain for different deploy targets and must stay field-identical — [prisma/CLAUDE.md](prisma/CLAUDE.md) has the lock-step rule.

**Auth flow (FastAPI-only since Phase 4.4).** Login/signup/logout POST to the same-origin Next proxies under [src/app/api/auth/](src/app/api/auth/), which forward to FastAPI `/v1/auth/*`; FastAPI sets HTTP-only `refresh_token` + `csrf_token` cookies. There is no Next-signed `session` JWT any more. [src/proxy.ts](src/proxy.ts) (the Next 16 middleware entry) gates the `(app)` route group on presence of `refresh_token` alone ([`hasRefreshTokenFromRequest`](src/lib/session-core.ts)) — no decode, Edge-safe. SSR pages resolve the user via [`resolvePageUser`](src/lib/session.ts) → FastAPI `/v1/auth/session`; the client mints an in-memory access token via `/api/auth/bootstrap`. The legacy `jwt.ts`/`apiAuth.ts`/`getCurrentUser` helpers were deleted (#232, #243).

**Family scoping is implicit.** Every authenticated handler receives the user's `familySpaceId`. All Post/Comment/Reaction/etc. queries must filter by it — Prisma has no row-level enforcement, so a missing filter leaks across families. V1 has one family, but the schema is multi-tenant-ready and tests assume the filter.

**Photo storage is environment-dependent.** [src/lib/uploads.ts](src/lib/uploads.ts) writes to `public/uploads` locally, GCS when `UPLOADS_BUCKET` is set. The DB stores opaque `storageKey` values, **never URLs** — resolve at response time via `getSignedUploadUrl` / `createSignedUrlResolver`, and don't put the signed results in long-lived caches.

**Timeline is computed, not stored.** [src/lib/timeline-data.ts](src/lib/timeline-data.ts) unions posts, comments, post-reactions, cooked events, and post edits per request. There is no `TimelineEvent` table — don't add one without discussing trade-offs.

**Rate limiting lives in FastAPI only** ([apps/api/src/rate_limit.py](apps/api/src/rate_limit.py); limits and their rationale are in [apps/api/CLAUDE.md](apps/api/CLAUDE.md)). Next has no rate-limiting module — the Next-side limiter went dead when the `/api/*` data routes were deleted (#231) and was removed (#312).

Directory-local guides live in [src/lib/](src/lib/CLAUDE.md), [prisma/](prisma/CLAUDE.md), [`__tests__/`](__tests__/CLAUDE.md), [apps/api/](apps/api/CLAUDE.md) and [apps/recipe-url-importer/](apps/recipe-url-importer/CLAUDE.md); they load on their own when you read files there.

## Conventions worth knowing

- **TypeScript strict mode.** The pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `type-check` then `lint-staged` — failing types block the commit. It does **not** run tests.
- **Path alias**: `@/*` → `src/*` (also in jest's `moduleNameMapper`).
- **Validation**: request payloads go through a Zod schema in [src/lib/validation.ts](src/lib/validation.ts) — add there, don't inline. FastAPI's equivalents are the Pydantic models in [apps/api/src/schemas/](apps/api/src/schemas/).
- **Error responses**: `{ error: { code, message } }` is the public contract on both backends. Use the helpers in [src/lib/apiErrors.ts](src/lib/apiErrors.ts) / raise `ApiError` in FastAPI — never hand-build the envelope.
- **Logger**: `logError`/`logWarn` from [src/lib/logger.ts](src/lib/logger.ts), not `console.*`.
- **`bcrypt` vs `bcryptjs`**: prod uses native `bcrypt`; jest aliases it to `bcryptjs` so tests skip native compilation. Import `bcrypt` — never `bcryptjs` directly.
- **Server vs client components**: default to server components for data fetching; `'use client'` only for interactive forms/state.
- **`AGENTS.md` hosts the Next.js `nextjs-agent-rules` block.** `next dev` under an AI agent writes/re-syncs a managed block into `AGENTS.md` and skips `CLAUDE.md` entirely as long as `AGENTS.md` exists ([generate-agent-files.js](node_modules/next/dist/server/lib/generate-agent-files.js), decided in #316). A diff limited to `AGENTS.md` after a `next dev` run is expected — commit it. A diff touching `CLAUDE.md` instead means `AGENTS.md` went missing; restore it rather than letting the block land here.

## Before opening a PR

Run the verification playbook matching what you changed — [docs/verification/README.md](docs/verification/README.md) routes by surface and explains the three layers. Always finish with `npm test`; the pre-commit hook doesn't. If the session can't run a tool a change needs (no browser for a hydration-sensitive UI change, say), say so in the PR body rather than claiming UI success from `curl` alone.

Skills that automate the heavier flows: [`/test-pr`](.claude/skills/test-pr/SKILL.md) (feature PR against the local sandbox), [`/release-testing`](.claude/skills/release-testing/SKILL.md) (release PR against the live dev deployment — do this before merging any `develop → main`), [`/pr-review`](.claude/skills/pr-review/SKILL.md).

## Branches and releases

`main` = **production**, `develop` = **dev environment**. Feature branches cut from `develop` and merge back into `develop`; releases are `develop → main` PRs that only the repo owner cuts. **When asked to "open a PR", the base is `develop`** unless the user says it's a release. Merging to `develop` does not auto-close issues that say `Closes #N` — close them by hand.

CI gates and branch protection are documented in [.github/GITHUB_GUIDE.md](.github/GITHUB_GUIDE.md#ci-gates-on-every-pr); [apps/api/](.github/workflows/api-ci.yml) and [the importer](.github/workflows/recipe-url-importer-ci.yml) have their own workflows.

## Out of scope (don't add unless asked)

Multi-family/multi-tenant features, public sharing, OCR, threaded comments, meal planning, grocery lists. V1 is intentionally a single private family space.
