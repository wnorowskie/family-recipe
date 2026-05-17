# Next.js API verification

> **Phase 4.3 complete** — all `src/app/api/` route handlers have been deleted except `auth/bootstrap/route.ts`, which remains until the full Phase 4 cutover (#38). The data routes are now served exclusively by FastAPI. See [fastapi.md](fastapi.md) for the FastAPI verification playbook.

## What remains in src/app/api/

- `auth/bootstrap/route.ts` — called by `<AuthBootstrap>` on every page load to perform the rotating `/v1/auth/refresh` + `/v1/auth/me` round-trip and propagate rotated cookies back to the browser. This is the **only** Next API route still in production use.

## Verifying auth/bootstrap

Start the dev server:

```bash
scripts/local-stack-up.sh
scripts/with-local-stack.sh npm run dev &
until curl -sf http://localhost:3000 >/dev/null; do sleep 0.5; done
```

Confirm bootstrap responds (requires valid FastAPI refresh + csrf cookies in the browser):

```bash
# Expect 401 with no cookies
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/auth/bootstrap | tail -2
```

Run the unit test:

```bash
npx jest __tests__/unit/api/auth/bootstrap.route.test.ts
```

## Before opening a PR touching auth/bootstrap

```bash
npm run type-check
npm run lint
npm test
```

## Historical note

Prior to Phase 4.3 (#231), this document covered a full curl + cookie verification loop for every route handler under `src/app/api/`. Those routes have been deleted; their FastAPI equivalents are covered in [fastapi.md](fastapi.md).
