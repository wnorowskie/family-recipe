# Test Directory

Jest tests for the Next.js app. The working notes — global mocks, layout rationale, and the traps — are in [CLAUDE.md](CLAUDE.md); this file is just the map.

```
__tests__/
├── unit/
│   ├── lib/            # pure-function tests for src/lib/
│   ├── api/            # the four auth/* proxies + the /v1/* catch-all
│   ├── app/            # (app) server-component redirect guards
│   └── components/     # React tests (need a jsdom docblock)
├── integration/
│   ├── openapi-contract.test.ts   # frontend /v1/* calls vs apps/api/openapi.snapshot.json
│   └── helpers/                   # request builders, Prisma mock, fixture users
├── helpers/            # glob CJS shim for the coverage reporter
└── smoke.test.ts       # asserts the jest setup itself works
```

Python tests live with their services: [apps/api/tests/](../apps/api/tests/) and [apps/recipe-url-importer/tests/](../apps/recipe-url-importer/tests/), both pytest. Playwright specs are in [e2e/](../e2e/).

Commands are in [package.json](../package.json) (`test`, `test:unit`, `test:integration`, `test:coverage`, `test:watch`). Coverage enforces a 75% global threshold over `src/lib/**` and `src/app/api/**`.
