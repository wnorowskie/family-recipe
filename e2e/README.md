# e2e/

Playwright smoke suite. Picked in [docs/research/automated-testing.md](../docs/research/automated-testing.md) ([#58](https://github.com/wnorowskie/family-recipe/issues/58)).

This directory currently contains:

- [auth.spec.ts](auth.spec.ts) — login + protected-route gating (PoC flow from #58).
- [signup.spec.ts](signup.spec.ts) — signup via family master key (#106). Tagged `@smoke @destructive`; CI-only (see [Tags](#tags)).
- [post-with-photo.spec.ts](post-with-photo.spec.ts) — create a post with a photo upload (#103). Tagged `@smoke`; fresh per-test login (see [Authentication](#authentication)).
- [cooked-event.spec.ts](cooked-event.spec.ts) — log a cooked event against the seeded recipe (#105). Tagged `@smoke`; fresh per-test login.
- [comment-reaction.spec.ts](comment-reaction.spec.ts) — comment + react on the seeded post and verify the author's notification (#104). Tagged `@smoke`; fresh per-test login, plus a fresh context signed in as the seeded `e2e-author` for the notification assertion.

Further smoke flows land in follow-up tickets (see the research doc for the list).

## Authentication

All login goes through the Next origin's same-origin `/api/auth/login` proxy — never FastAPI directly. [auth-helpers.ts](auth-helpers.ts) centralizes this: `loginViaOrigin` posts to `${E2E_ORIGIN}/api/auth/login` (where `E2E_ORIGIN` = `PLAYWRIGHT_BASE_URL`, defaulting to `http://localhost:3000`) and returns the `refresh_token`/`csrf_token` cookies already scoped to the Next origin.

This single path works everywhere, which matters post-[#241](https://github.com/wnorowskie/family-recipe/issues/241): FastAPI is now IAM-private and only reachable through the Next origin, so a direct `FASTAPI_BASE_URL` login (the old approach) is unreachable in the dev-deploy runner.

- **Fresh per-test login** — the `@smoke` specs use the `test` fixture from [fixtures.ts](fixtures.ts) (or call `loginAndInjectCookies` directly), which logs in and injects cookies into a fresh browser context per test. This avoids the storageState token-rotation race under `fullyParallel`.
- **Shared storageState** — [global-setup.ts](global-setup.ts) logs in the seeded `claude-test` user once per run and writes `e2e/.auth/claude-test.json` (gitignored) for any spec that opts in with `test.use({ storageState: 'e2e/.auth/claude-test.json' })`.

Specs that need a logged-out context (`auth.spec.ts`, `signup.spec.ts`) simply don't inject cookies.

## Tags

Specs use Playwright test tags to steer grep filters:

- `@smoke` — included in the smoke subset.
- `@destructive` — creates/mutates data that persists beyond the test (e.g. a new user row). Run in the CI job against the ephemeral Postgres, but **invert** in the post-deploy grep (#107) so we don't accumulate rows against the live dev DB.

## Run locally

**FastAPI must be running.** Every spec logs in through the Next origin's
`/api/auth/login` proxy, and since the Phase 4 cutover that proxy forwards to
FastAPI — a Next server on its own cannot issue a session. The
`NEXT_PUBLIC_API_BASE_URL` fallback in
[src/lib/apiUpstream.ts](../src/lib/apiUpstream.ts) only decides _which_ URL the
proxy forwards to; it does not remove the need for something to be listening
there.

```bash
# 1. Bring up the sandbox: Postgres on :5434, Prisma generate + push + seed,
#    and a .env.sandbox carrying DATABASE_URL + API_INTERNAL_URL. Idempotent.
scripts/local-stack-up.sh

# 2. One-time: install the Chromium browser (~150 MB).
npx playwright install chromium

# 3. Start FastAPI against the sandbox. AUTH_RATE_LIMIT_ENABLED=false is what
#    lets the suite log in more than 5 times in 15 minutes — see the note below.
#    ci.yml sets the same var for its e2e job.
AUTH_RATE_LIMIT_ENABLED=false scripts/with-local-stack.sh bash -c '
  source apps/api/.venv/bin/activate
  uvicorn apps.api.src.main:app --port 8000
' &
scripts/wait-for-http.sh http://localhost:8000/v1/health     # FastAPI

# 4. Run the suite. with-local-stack.sh is what puts DATABASE_URL and
#    API_INTERNAL_URL into the environment that playwright.config.ts's
#    webServer (`npm run build && npm run start`) inherits.
scripts/with-local-stack.sh npm run test:e2e
```

Teardown when you're done: `scripts/local-stack-down.sh` (add `--purge` to drop
the sandbox volume too).

Headed / debug:

```bash
scripts/with-local-stack.sh npm run test:e2e:ui   # Playwright UI mode
```

> **Heads up — auth rate limits.** FastAPI throttles the auth surface per-IP in
> [apps/api/src/rate_limit.py](../apps/api/src/rate_limit.py) (#175): **login at
> 5 per 15 minutes**, signup at 3 per hour. Every `@smoke` spec does a fresh
> per-test login, so a full local run blows the login budget partway through and
> the rest fail with `E2E login failed ... (429)`.
>
> Start uvicorn with `AUTH_RATE_LIMIT_ENABLED=false` (as step 3 does, and as
> [ci.yml](../.github/workflows/ci.yml) does for its e2e job) — that flag exists
> for exactly this (#268). Without it you'll get roughly five logins per quarter
> hour. The limiter is in-process with no persistence, so **restarting uvicorn
> also clears it** — restarting the Next dev server does nothing, since the
> counter lives in FastAPI.

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
