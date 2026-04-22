# e2e/

Playwright smoke suite. Picked in [docs/research/automated-testing.md](../docs/research/automated-testing.md) ([#58](https://github.com/wnorowskie/family-recipe/issues/58)).

This directory currently contains **one** PoC flow — login + protected-route gating. The full suite lands in follow-up tickets (see the research doc for the list).

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

## Run against a deployed URL

Set `PLAYWRIGHT_BASE_URL`; the `webServer` block is skipped:

```bash
PLAYWRIGHT_BASE_URL=https://dev.example.run.app \
E2E_USER=<user> E2E_PASSWORD=<pass> \
npm run test:e2e
```

## Credentials

Defaults to the seeded `claude-test` user (see [prisma/seed.ts](../prisma/seed.ts)). Override via `E2E_USER` / `E2E_PASSWORD` env vars.
