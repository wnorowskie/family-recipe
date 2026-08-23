# CLAUDE.md — `__tests__/`

Jest tests for the Next.js monolith. See [README.md](README.md) for the directory tour and [jest.config.js](../jest.config.js) for the runner config. Python tests for FastAPI live in [apps/api/tests/](../apps/api/tests/) and the importer in [apps/recipe-url-importer/tests/](../apps/recipe-url-importer/tests/) — those use pytest, not jest.

## Layout

- `unit/lib/` — pure-function tests for [src/lib/](../src/lib/) modules
- `unit/api/` — handler logic with the prisma mock (only the `auth/*` routes remain after Phase 4.3: `bootstrap` plus the `login`/`signup`/`logout` origin-scoping proxies)
- `unit/app/` — narrow invariant guards over `(app)` server components. Not general page rendering: these call the async page function directly with `redirect` mocked to throw (as it does in real Next), which short-circuits the page before any data fetch, so no data-layer mocks are needed. Outside the coverage scope — the value is regression protection, not coverage.
- `integration/` — OpenAPI contract test + helpers (request builders + Prisma mock setup)
- `helpers/glob-default.js` — CommonJS shim required by jest's coverage reporter (the runtime uses ESM `glob` v11)

## Global mocks (in [jest.setup.js](../jest.setup.js))

Three things are mocked **for every test** before any test code runs — your test gets these by default and must override them when it needs real behavior:

1. **`@/lib/prisma`** — every model is replaced with `{}`. Tests must stub the specific methods they exercise (e.g., `prisma.user.findUnique = jest.fn().mockResolvedValue(...)`). Use `jest-mock-extended` or the helpers in [integration/helpers/mock-prisma.ts](integration/helpers/mock-prisma.ts) for bulk setup.
2. **`@/lib/rateLimit`** — every limiter's `check` returns `{ allowed: true }` and `applyRateLimit` returns `null`. To test rate-limit behavior, re-mock the specific limiter inside the test.
3. **`console.*`** — silenced. Set `ALLOW_TEST_LOGS=true` env var to see output while debugging.

`bcrypt` is aliased to `bcryptjs` via `moduleNameMapper` so tests don't need native binaries. Use `bcrypt` in your imports — never `bcryptjs` directly.

## Writing a new test

Route handler tests live under `unit/api/`. The only Next route handlers still in `src/app/api/` are the four `auth/*` routes — `bootstrap` plus the `login`/`signup`/`logout` origin-scoping proxies (Phase 4.3 deleted the data routes — see [docs/verification/next-api.md](../docs/verification/next-api.md)). New backend routes go in FastAPI — see [apps/api/CLAUDE.md](../apps/api/CLAUDE.md).

```ts
import { POST } from '@/app/api/auth/bootstrap/route';
import { buildRequest } from '../helpers';

describe('POST /api/auth/bootstrap', () => {
  it('returns 401 when refresh fails', async () => {
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(401);
  });
});
```

The integration helpers expose `buildAuthedRequest`, fixture users, and a Prisma mock builder — prefer them over rolling your own setup.

## Coverage

`npm run test:coverage` enforces a 75% global threshold (branches/functions/lines/statements) per [jest.config.js](../jest.config.js). Coverage scope is `src/lib/**` and `src/app/api/**` — UI components are excluded.

## Don't

- Don't hit a real database. Tests run in `node` env without prisma migrations applied.
- Don't import `next/server` types in unit tests for pure helpers — keep unit tests free of Next runtime.
- Don't `console.log` to debug; either temporarily set `ALLOW_TEST_LOGS=true` or use the jest debugger.
