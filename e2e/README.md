# e2e/

Playwright smoke suite. Picked in [docs/research/automated-testing.md](../docs/research/automated-testing.md) ([#58](https://github.com/wnorowskie/family-recipe/issues/58)).

This directory currently contains:

- [auth.spec.ts](auth.spec.ts) — login + protected-route gating (PoC flow from #58).
- [signup.spec.ts](signup.spec.ts) — signup via family master key (#106). Tagged `@smoke @destructive`; CI-only (see [Tags](#tags)).
- [post-with-photo.spec.ts](post-with-photo.spec.ts) — create a post with a photo upload (#103). Tagged `@smoke`; uses shared storageState (see [Authentication](#authentication)).

Further smoke flows land in follow-up tickets (see the research doc for the list).

## Authentication

[global-setup.ts](global-setup.ts) logs in the seeded `claude-test` user once per run and saves the session cookie to `e2e/.auth/claude-test.json` (gitignored). Authenticated specs opt in with:

```ts
test.use({ storageState: 'e2e/.auth/claude-test.json' });
```

Specs that need a logged-out context (`auth.spec.ts`, `signup.spec.ts`) simply don't opt in.

## Tags

Specs use Playwright test tags to steer grep filters:

- `@smoke` — included in the smoke subset.
- `@destructive` — creates/mutates data that persists beyond the test (e.g. a new user row). Run in the CI job against the ephemeral Postgres, but **invert** in the post-deploy grep (#107) so we don't accumulate rows against the live dev DB.

## Run locally

```bash
# 1. Start local Postgres (see scripts/local-stack-up.sh for the one-liner).
# 2. Apply schema + seed the claude-test user:
npm run db:push
npm run db:seed

# 3. One-time: install the Chromium browser (~150 MB):
npx playwright install chromium

# 4. Run the suite (boots `next start` via playwright.config.ts webServer):
npm run test:e2e
```

Headed / debug:

```bash
npm run test:e2e:ui   # Playwright UI mode
```

> **Heads up — signup rate limit.** `signup.spec.ts` hits `/api/auth/signup`, capped at 3/IP/hour by [src/lib/rateLimit.ts](../src/lib/rateLimit.ts). CI gets a fresh in-process limiter cache per run, but local re-runs inside the same hour will start returning 429. If you're iterating, `npx playwright test e2e/auth.spec.ts` only, or restart the dev server to clear the LRU.

## Run against a deployed URL

Set `PLAYWRIGHT_BASE_URL`; the `webServer` block is skipped:

```bash
PLAYWRIGHT_BASE_URL=https://dev.example.run.app \
E2E_USER=<user> E2E_PASSWORD=<pass> \
npm run test:e2e
```

### Against the `--no-allow-unauthenticated` dev deployment

Browsers can't attach Bearer tokens to subresource loads, so Playwright must tunnel through the auth-injecting proxy ([scripts/dev-auth-proxy.ts](../scripts/dev-auth-proxy.ts)). The wrapper handles boot + teardown:

```bash
# Requires .env.dev.local populated — see docs/verification/dev-deployments.md
npm run test:e2e:dev
npm run test:e2e:dev -- --ui           # headed
npm run test:e2e:dev -- e2e/auth.spec.ts
```

## Credentials

Defaults to the seeded `claude-test` user (see [prisma/seed.ts](../prisma/seed.ts)). Override via `E2E_USER` / `E2E_PASSWORD` env vars.
