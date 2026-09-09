# CLAUDE.md — `__tests__/`

Jest tests for the Next.js monolith. [jest.config.js](../jest.config.js) has the runner config. Python tests for FastAPI live in [apps/api/tests/](../apps/api/tests/) and the importer in [apps/recipe-url-importer/tests/](../apps/recipe-url-importer/tests/) — those use pytest, not jest.

## Layout

- `unit/lib/` — pure-function tests for [src/lib/](../src/lib/) modules
- `unit/api/` — handler logic with the prisma mock: the four `auth/*` routes (`bootstrap` plus the `login`/`signup`/`logout` origin-scoping proxies) and `v1Proxy.route.test.ts` for the `/v1/*` catch-all
- `unit/app/` — narrow invariant guards over `(app)` server components. Not general page rendering: these call the async page function directly with `redirect` mocked to throw (as it does in real Next), which short-circuits the page before any data fetch, so no data-layer mocks are needed. Outside the coverage scope — the value is regression protection, not coverage.
- `unit/components/` — the lone React test. `jest.config.js` sets `testEnvironment: 'node'` globally, so a component test needs a `/** @jest-environment jsdom */` docblock at the top of the file or it fails on `document`.
- `integration/` — OpenAPI contract test + helpers (request builders + Prisma mock setup)
- `smoke.test.ts` — asserts the jest setup itself works; leave it alone
- `helpers/glob-default.js` — CommonJS shim required by jest's coverage reporter (the runtime uses ESM `glob` v11)

## Global mocks (in [jest.setup.js](../jest.setup.js))

Three things are mocked **for every test** before any test code runs — your test gets these by default and must override them when it needs real behavior:

1. **`@/lib/prisma`** — replaced with a **hand-listed set of 12 models**, each `{}`. Stub the specific methods you exercise (`prisma.user.findUnique = jest.fn().mockResolvedValue(...)`), or use [integration/helpers/mock-prisma.ts](integration/helpers/mock-prisma.ts) for bulk setup. **The list is not the whole schema** — `notification`, `feedbackSubmission`, `refreshToken` and `idempotencyKey` are absent, so touching them gives `Cannot read properties of undefined` rather than a clean "method not stubbed" failure. Add the model to [jest.setup.js](../jest.setup.js) when you first need it.
2. **`@/lib/rateLimit`** — inert. The module has had no `src/` consumers since #231, and its own test `jest.unmock`s it on line 2, so this mock currently guards nothing. Deletion of all three is tracked in #312. Rate limiting lives in FastAPI — see [apps/api/CLAUDE.md](../apps/api/CLAUDE.md).
3. **`console.*`** — silenced. Set `ALLOW_TEST_LOGS=true` env var to see output while debugging.

`bcrypt` is aliased to `bcryptjs` via `moduleNameMapper` so tests don't need native binaries. Use `bcrypt` in your imports — never `bcryptjs` directly.

## Writing a new test

Route handler tests live under `unit/api/`. Next's remaining handlers are the four `auth/*` proxies plus `api/health`, and the `/v1/*` catch-all at `src/app/v1/[...path]/` (Phase 4.3 deleted the data routes — see [docs/verification/next-api.md](../docs/verification/next-api.md)). New backend routes go in FastAPI — see [apps/api/CLAUDE.md](../apps/api/CLAUDE.md).

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
