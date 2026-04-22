# Automated API + UI Test Coverage

Research output for [#58](https://github.com/wnorowskie/family-recipe/issues/58).

## Decision

**Adopt Playwright (`@playwright/test`) as the durable end-to-end + UI test framework.** Run a ~5-flow smoke suite per-PR in [ci.yml](../../.github/workflows/ci.yml) against `next start`, plus the same suite post-deploy against the dev Cloud Run URL as the release gate for `develop → main`. Keep the Jest unit/integration suites as-is — Playwright adds a new layer, it doesn't replace anything.

- **Framework:** Playwright (Chromium-only to start; add WebKit/Firefox if a real-family-user regression warrants it).
- **Per-PR CI:** new `e2e` job in [ci.yml](../../.github/workflows/ci.yml), runs after `test`, boots `next start` against an ephemeral Postgres service container, seeded with [prisma/seed.ts](../../prisma/seed.ts). Target wall-clock: <3 min.
- **Post-deploy:** same spec file, `PLAYWRIGHT_BASE_URL=https://<dev-cloud-run>`, triggered at the tail of the dev deploy workflow. Failures auto-rollback via the pattern already in `#90`.
- **Auth:** reuse the `claude-test` seed user ([prisma/seed.ts:90](../../prisma/seed.ts#L90)). Playwright `globalSetup` logs in once via the real `/api/auth/login` route, saves `storageState.json`, every test reuses it.
- **Photos:** run CI with `UPLOADS_BUCKET` unset so [src/lib/uploads.ts](../../src/lib/uploads.ts) writes to `public/uploads/` on the runner. Commit small fixture images under `e2e/fixtures/`. No GCS emulator.
- **Contract coverage:** generate FastAPI's `apps/api/openapi.json` in CI, diff against a committed snapshot to catch breaking changes. Defer Next-API OpenAPI generation — the Zod schemas in [src/lib/validation.ts](../../src/lib/validation.ts) are already the de-facto contract and integration tests enforce it.
- **Seeding:** extend [prisma/seed.ts](../../prisma/seed.ts) with a `SEED_E2E=1` branch that creates one deterministic post, comment, recipe, and cooked-event in addition to the user/tags. Per-test factories only where a test needs a variant the baseline doesn't cover.
- **Effort:** **M** (2–3 days) for framework + CI wiring + first 5 flows. **S** (≤½ day) per additional flow. Total to "release-gate confidence": M–L depending on flow count (~10 flows covers V1).

## Why Playwright

- **Sibling spike already landed on it.** [docs/research/claude-local-verification.md](claude-local-verification.md) picked Playwright MCP for Claude's L2 verification. `@playwright/test` runs the same engine — one browser install serves both use cases, and a spec Claude writes interactively via MCP translates directly into a committable test.
- **Next.js App Router + React 19 parity.** Playwright has first-party Next.js guidance ([playwright.dev/docs/test-webserver](https://playwright.dev/docs/test-webserver)), handles hydration and streaming SSR without workarounds, and the Playwright team tracks each Next/React release. Cypress historically lags Next releases by a few months; Vitest browser mode isn't positioned for full E2E yet.
- **httpOnly cookie auth is a solved pattern.** `storageState` serializes the Set-Cookie from a real login once, reuses it in parallel workers. No fake JWT minting, no bypass of [src/proxy.ts](../../src/proxy.ts) — tests exercise the production auth path.
- **CI ergonomics.** Ships a GitHub Action (`microsoft/playwright-github-action`), caches browsers deterministically, produces a self-contained HTML report with traces/screenshots/videos on failure. Parallelizable out of the box.
- **Auto-waiting.** Actionability checks are baked in (`toBeVisible`, `toHaveURL`), which keeps flake rates low without bespoke wait helpers — a real pain point in Cypress on a streaming/hydrating App Router app.

## Alternatives considered

| Option                                               | Why rejected                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cypress**                                          | Good DX but single-browser at runtime, slower per-test, weaker parallelism, and its retry/hydration story on App Router is rougher than Playwright's. Choosing it would also diverge from the L2 tooling that [#59](https://github.com/wnorowskie/family-recipe/issues/59) already landed. |
| **Vitest browser mode**                              | Designed for component tests, not E2E. No real browser driver story for multi-page flows with httpOnly cookies. Revisit if we add a component-test layer.                                                                                                                                  |
| **Jest + Puppeteer (`jest-puppeteer`)**              | Would reuse the Jest runner, but Puppeteer trails Playwright on auto-waiting, multi-browser, and trace tooling. Not worth the savings from runner reuse.                                                                                                                                   |
| **Testing Library only (RTL)**                       | Already covered at unit level. Does not exercise real HTTP, real hydration, real cookies — the gap #58 is trying to close.                                                                                                                                                                 |
| **Contract testing with Pact / Dredd**               | Heavier than needed for a two-backend setup with one consumer (the Next.js client). The proposed OpenAPI snapshot diff covers the cross-implementation contract concern at ~5% of the implementation cost.                                                                                 |
| **Cross-environment tests only (post-deploy smoke)** | Catches deploy-time regressions but not PR-time bugs. Running per-PR is where 80% of the value lives — deploy smoke is a cheap add-on.                                                                                                                                                     |
| **Full CRUD coverage as the first goal**             | Out of scope for a smoke suite. Unit/integration Jest tests already own handler-logic coverage. E2E exists to catch wiring bugs across the stack — five solid flows beat fifty redundant ones.                                                                                             |

## Answers to the ticket questions

### 1. Framework pick

Playwright. See above. Chromium project only at the start; the app isn't Safari/Firefox-sensitive and every cross-browser run compounds CI time.

### 2. Highest-value 80/20 smoke suite

Prioritized, ordered by "what would break silently today if regressed":

| #   | Flow                                    | What it proves                                                                                                                        | Services hit |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Login + protected-route redirect**    | Auth cookie is set, [src/proxy.ts](../../src/proxy.ts) enforces gating. Blocks everything else if broken.                             | Next         |
| 2   | **Create post with photo upload**       | Multipart + [src/lib/uploads.ts](../../src/lib/uploads.ts) local path + timeline rendering. Highest-use feature, most moving parts.   | Next, FS     |
| 3   | **Comment + emoji reaction on a post**  | Social loop; exercises the nullable `postId`/`commentId` polymorphism in `Reaction` and notification batching.                        | Next         |
| 4   | **Log a cooked event against a recipe** | Key V1 differentiator; touches Recipe, CookedEvent, and timeline union in [src/lib/timeline-data.ts](../../src/lib/timeline-data.ts). | Next         |
| 5   | **Signup via master-key invite**        | Onboarding. Rare but critical when it runs; the family-master-key bcrypt path has no other coverage.                                  | Next         |

Stretch set (add as follow-ups, one ticket each):

6. Recipe URL import — calls [apps/recipe-url-importer/](../../apps/recipe-url-importer/), the only external service in the loop.
7. Notifications bell: unread count → read state transition.
8. Account delete + data purge (destructive, runs against isolated DB only).
9. Edit post / edit recipe.
10. Contract parity: identical payload from Next `/api/*` and FastAPI `/*` for a representative GET.

### 3. Where it runs

**Both.** Per-PR catches regressions before merge; post-deploy catches environment-specific failures (env vars, GCS perms, Cloud Run config).

- **Per-PR** (`develop`, `main` targets): new `e2e` job in [ci.yml](../../.github/workflows/ci.yml), `needs: [test]`. Postgres service container, `npx prisma db push`, `SEED_E2E=1 npm run db:seed`, `next build && next start`, `npx playwright test`.
- **Post-deploy dev** (develop merges): add a step to [.github/workflows/deploy-dev.yml](../../.github/workflows/deploy-dev.yml) (pattern exists for the smoke-check added in `#93`): `PLAYWRIGHT_BASE_URL=$DEV_URL npx playwright test --grep @smoke`. A new `@smoke` tag on the first 5 flows keeps the post-deploy pass under 2 min.
- **Release gate** (`develop → main`): no new workflow. The release PR's required status checks include the post-deploy result by convention (the maintainer doesn't cut the release PR until the dev deploy is green, per [docs/verification/README.md](../verification/README.md)).

### 4. Auth in tests

Log in once via `globalSetup.ts`, save `storageState.json`, every test's `page.context()` loads it. This matches [Playwright's documented auth pattern](https://playwright.dev/docs/auth#basic-shared-account-in-all-tests).

```ts
// e2e/global-setup.ts (sketch)
import { request } from '@playwright/test';

export default async function globalSetup() {
  const ctx = await request.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
  });
  const res = await ctx.post('/api/auth/login', {
    data: {
      emailOrUsername: process.env.E2E_USER ?? 'claude-test',
      password: process.env.E2E_PASSWORD ?? 'claude-test-password',
      rememberMe: false,
    },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  await ctx.storageState({ path: 'e2e/.auth/state.json' });
}
```

This hits the real [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts), real [src/lib/jwt.ts](../../src/lib/jwt.ts), real bcrypt verify — no mock path. Credentials come from env, defaulting to the seeded `claude-test` user. `.auth/` is gitignored.

### 5. Photos

Don't mock. Configure CI to use the local-FS upload mode by leaving `UPLOADS_BUCKET` unset. [src/lib/uploads.ts](../../src/lib/uploads.ts) then writes to `public/uploads/` on the runner, the DB stores the opaque `storageKey`, and Playwright can assert (a) DOM renders the photo, (b) `public/uploads/<key>` exists on disk. GCS-path verification stays human-driven for now — the signed-URL resolver is well-covered by the existing unit tests.

Fixture images live in `e2e/fixtures/`: one 50 KB JPEG, one PNG, one oversize fixture used only for the 8 MB-cap negative test. Committed; gitignore exception already exists for `public/uploads/.gitkeep` so nothing downstream is broken.

### 6. API contract coverage

**Add FastAPI OpenAPI snapshot diff now. Defer Next-API OpenAPI.**

- FastAPI auto-emits `/openapi.json` at runtime ([apps/api/src/main.py:18](../../apps/api/src/main.py#L18)). Add a CI step that boots the app, curls `/openapi.json`, and diffs against `apps/api/openapi.snapshot.json` (committed). Any unintended contract change breaks the build; intended changes require updating the snapshot in the same PR — a natural review checkpoint.
- For the Next API, the Zod schemas in [src/lib/validation.ts](../../src/lib/validation.ts) + the integration-test coverage already act as the contract. Adding `zod-to-openapi` is scope creep for this spike; revisit if/when the FastAPI migration in [docs/API_BACKEND_MIGRATION_PLAN.md](../../docs/API_BACKEND_MIGRATION_PLAN.md) enters the dual-backend phase and we need a single source of truth for both.

### 7. Seeding and test data

Baseline + per-test factories.

- **Baseline via [prisma/seed.ts](../../prisma/seed.ts)**, gated on a `SEED_E2E=1` flag. Adds: one post with a comment and a reaction, one recipe with one cooked event, one notification. Deterministic IDs/titles (not random) so specs can assert by content. Skip block mirrors the existing `NODE_ENV === 'production'` guard.
- **Per-test factories in `e2e/fixtures/db.ts`** (thin wrappers over Prisma, not a new DSL) for tests that need variants — e.g., "post with 0 comments," "recipe with 50 ingredients." Reuses [src/lib/prisma.ts](../../src/lib/prisma.ts) via a separate `PrismaClient` bound to `DATABASE_URL`. No test hits the real dev Postgres — CI spins up an ephemeral service container; locally, point `DATABASE_URL` at a dev-only DB.
- **No reset between tests.** Each CI run is a fresh container. Locally, `npx prisma db push --force-reset && npm run db:seed` between suite runs if needed. Reset-per-test halves throughput and hasn't paid off in other Playwright projects of this size.

### 8. Effort estimate

| Slice                                                           | Size  | Notes                                        |
| --------------------------------------------------------------- | ----- | -------------------------------------------- |
| Framework install + `playwright.config.ts` + `e2e/` scaffolding | S     | ~2 hours.                                    |
| First flow (login smoke, this PR's PoC)                         | S     | ~1 hour.                                     |
| `globalSetup` auth + seed `SEED_E2E=1` branch                   | S     | ~2 hours.                                    |
| Flows 2–5 (post+photo, comment+react, cooked event, signup)     | M     | ~1 day total, ~2 hours each, parallelizable. |
| Per-PR CI job + Postgres service + Playwright cache             | M     | ~½ day.                                      |
| Post-deploy smoke hook in dev deploy                            | S     | ~2 hours.                                    |
| OpenAPI snapshot diff for FastAPI                               | S     | ~2 hours.                                    |
| **Total to "release-gate confidence"**                          | **M** | **2–3 working days.**                        |
| Each additional flow after that                                 | S     | ~1–2 hours.                                  |

### 9. Concrete recommendation

Ship this spike's PoC (below), then open the follow-up tickets listed at the bottom. Framework = Playwright (`@playwright/test`). Runner = Playwright's own. CI = new `e2e` job in `ci.yml`, plus a post-deploy smoke step in `deploy-dev.yml`. First flows = the five in the 80/20 table above.

## Proof of concept

Committed in this PR:

- [playwright.config.ts](../../playwright.config.ts) — minimal config, Chromium only, uses `webServer` to boot `next start` against a user-provided `DATABASE_URL`.
- [e2e/auth.spec.ts](../../e2e/auth.spec.ts) — one test: unauthenticated `/timeline` → 302 to `/login`, then login via the real route, then `/timeline` → 200. Proves auth, gating, and cookie round-trip in one shot.
- [e2e/README.md](../../e2e/README.md) — how to run locally.
- `package.json` scripts: `test:e2e`, `test:e2e:install`, `test:e2e:ui` (headed/debug).

The PoC intentionally **does not** add the CI job, the seed `SEED_E2E=1` branch, or `globalSetup`. Those belong in the follow-up implementation ticket where they get their own PR-level review. Ship this PR as "framework picked, one flow proven"; ship #TBD as "full smoke suite + CI wiring."

To run:

```bash
DATABASE_URL=<local-postgres-url> npm run db:push
DATABASE_URL=<local-postgres-url> npm run db:seed
npx playwright install chromium   # one-time, ~150 MB
DATABASE_URL=<local-postgres-url> npm run test:e2e
```

## Follow-up tickets to open on merge

1. **chore: wire Playwright `e2e` job into `ci.yml`** — Postgres service container, prisma push, `SEED_E2E=1` seed, `next start`, Playwright run with HTML-report upload on failure. Blocks nothing else but is the most user-visible win.
2. **chore: `SEED_E2E=1` branch in `prisma/seed.ts`** — deterministic baseline fixture set. Prerequisite for flows 2–5.
3. **feat: smoke flows — post+photo, comment+react, cooked event, signup** — one ticket per flow, landable in any order after (1) and (2).
4. **chore: post-deploy smoke step in `deploy-dev.yml`** — reuses the specs behind a `@smoke` grep.
5. **chore: FastAPI OpenAPI snapshot diff in `api-ci.yml`** — independent of the above, can land in parallel.
6. **chore: install Playwright MCP in `.claude/settings.json`** — already filed as [#65](https://github.com/wnorowskie/family-recipe/issues/65); this spike unblocks it.
7. **(stretch) feat: recipe-URL-import smoke flow** — only flow that exercises [apps/recipe-url-importer/](../../apps/recipe-url-importer/). Useful signal for that service's deploy, but off the critical path.

## Sources

- [Playwright — Getting started](https://playwright.dev/docs/intro) · [Auth storageState](https://playwright.dev/docs/auth) · [webServer](https://playwright.dev/docs/test-webserver)
- [`microsoft/playwright-github-action`](https://github.com/marketplace/actions/playwright-github-action)
- [docs/research/claude-local-verification.md](claude-local-verification.md) — sibling spike ([#59](https://github.com/wnorowskie/family-recipe/issues/59))
- [docs/API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md) — FastAPI dual-backend context
- [docs/research/README.md](README.md) — style guide for this doc
