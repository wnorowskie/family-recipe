# Next.js API verification

> **Phase 4.3 complete** — all `src/app/api/` **data** route handlers have been deleted. The data routes are now served exclusively by FastAPI; only the four auth routes below remain, until the full Phase 4 cutover (#38). See [fastapi.md](fastapi.md) for the FastAPI verification playbook.

## What remains in src/app/api/

- `auth/bootstrap/route.ts` — called by `<AuthBootstrap>` on every page load to perform the rotating `/v1/auth/refresh` + `/v1/auth/me` round-trip and propagate rotated cookies back to the browser.
- `auth/login/route.ts`, `auth/signup/route.ts`, `auth/logout/route.ts` — thin same-origin proxies to the FastAPI `/v1/auth/*` equivalents. They exist for **origin scoping**: FastAPI's `Set-Cookie` headers (refresh/csrf) must land on the Next.js origin so the middleware and SSR layout can see them; a direct browser→FastAPI call would scope the cookies to the FastAPI origin instead. They hold no business logic — validation, bcrypt, and token minting all live in FastAPI.

Unit tests: `__tests__/unit/api/auth/{bootstrap,login,signup,logout}.route.test.ts`.

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

Run the unit tests (bootstrap + the three auth proxies):

```bash
npx jest __tests__/unit/api/auth
```

## Before opening a PR touching auth/bootstrap

```bash
npm run type-check
npm run lint
npm test
```

## Historical note

Prior to Phase 4.3 (#231), this document covered a full curl + cookie verification loop for every route handler under `src/app/api/`. Those routes have been deleted; their FastAPI equivalents are covered in [fastapi.md](fastapi.md).
