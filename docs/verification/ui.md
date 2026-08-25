# UI verification

Run this when the change touches anything under [src/app/](../../src/app/) (pages, layouts, components, route groups) or [src/components/](../../src/components/).

Rule of thumb: **if the change adds, removes, or alters anything a user sees, do L1.** Pre-hydration HTML (what `curl` returns) is not the user experience for `'use client'` components.

## Start the dev server

```bash
scripts/local-stack-up.sh
scripts/with-local-stack.sh npm run dev &
scripts/with-local-stack.sh bash -c 'source apps/api/.venv/bin/activate && uvicorn apps.api.src.main:app --port 8000' &
scripts/wait-for-http.sh http://localhost:3000               # Next
scripts/wait-for-http.sh http://localhost:8000/v1/health     # FastAPI
```

Postgres must be up — [scripts/local-stack-up.sh](../../scripts/local-stack-up.sh) handles it. SQLite was dropped in #80; local dev is Postgres-only.

**Start FastAPI too, not just Next.** Every gated page under the `(app)` group resolves its user through the auth proxies, which forward to FastAPI — so without uvicorn you can't log in at all and L1 below is limited to `/login` and `/signup`. See the shared setup block in [README.md](README.md#shared-helpers).

## L0 — server-rendered HTML / static strings

Fastest check. Works for server components, page metadata, route gating, and client components' initial markup.

```bash
# Capture baseline
curl -s -o /tmp/before.html http://localhost:3000/<path>

# Make the edit

# Re-capture (wait a beat for Fast Refresh to recompile)
sleep 2
curl -s -o /tmp/after.html http://localhost:3000/<path>

diff /tmp/before.html /tmp/after.html
```

Also useful:

- `curl -I http://localhost:3000/<path>` — status + headers
- Gated route without cookie should 307 to `/login?redirect=...` (see [src/proxy.ts](../../src/proxy.ts))

## L1 — real browser (`claude --chrome`)

Required for:

- `'use client'` components with state or effects
- Forms (validation, submission, redirect)
- Photo uploads (the `<input type=file>` + preview + submit round-trip)
- Navigation — `router.replace`, `router.refresh`, `<Link>` prefetch
- Responsive / mobile viewport checks
- Any visual change where "looks right" is part of the acceptance criteria

Prompt shape:

```
Open http://localhost:3000/<path>. <Interaction step>. Tell me what you see
and screenshot before/after.
```

Specific-enough prompts beat generic ones. "Click submit with an empty password and report the error message" > "test the form."

## L1 fallback — Playwright MCP

If the session can't run `claude --chrome` (remote, WSL, no extension installed):

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

Use `browser_navigate` → `browser_snapshot` (accessibility tree — token-cheap) → `browser_take_screenshot` only when the snapshot misses something visual.

## Gotchas specific to this app

- **Photos**: local mode writes to `public/uploads/` (see [src/lib/uploads.ts](../../src/lib/uploads.ts)). After an upload test, check the file is on disk and the Prisma row has a non-null `*StorageKey`. Don't expect signed URLs locally.
- **Timeline is computed per request** ([src/lib/timeline-data.ts](../../src/lib/timeline-data.ts)) — a post shows up on the timeline the instant it's saved; no indexing delay.
- **Family scoping is implicit** — if a list or detail view renders, it was already scoped by `familySpaceId`. If something is visible that shouldn't be, the bug is server-side, not rendering.
- **Server vs client**: default is server component. `'use client'` only for interactive forms/state. When reviewing your own PR, grep the diff for `'use client'` — if it appeared on a component that doesn't need state, revert.

## Auth verification

There is one auth flow. The Phase 4 cutover (#231, #263) deleted the Next-signed `session` cookie and the dual-mode feature flag that used to gate it — if you find a doc or comment describing a "flag off" path or a `session` cookie, it is stale.

When you change anything in the auth surface (login/signup/logout, the protected `(app)` layout, [src/proxy.ts](../../src/proxy.ts), [src/lib/apiClient.ts](../../src/lib/apiClient.ts), [src/lib/authStore.ts](../../src/lib/authStore.ts), or [src/components/AuthBootstrap.tsx](../../src/components/AuthBootstrap.tsx)), verify the following with both servers running per the setup block above.

- Login with the seeded `claude-test` user: the form posts to `/api/auth/login`, which proxies to `/v1/auth/login`. DevTools → Application → Cookies shows `refresh_token` (HttpOnly) and `csrf_token`, and **no** `session` cookie.
- Console: `localStorage` and `sessionStorage` are empty. No JWT-shaped strings (`eyJ…`) anywhere in storage — the access token is held in memory only.
- Reload: stays on `/timeline`, no flash of `/login`. The Network tab shows
  - **one** server-side `GET /v1/auth/session` (issued by the SSR layout; non-rotating, no `Set-Cookie`), and
  - **one** client-side `POST /api/auth/bootstrap` (issued by `<AuthBootstrap>` after hydration, which internally calls `/v1/auth/refresh` + `/v1/auth/me` and propagates rotated cookies back through the route handler).
  - Net effect: the refresh-token chain advances exactly once per page load.
- Signup, logout, reset-password, deep-link redirect (`/login?redirect=…`), and remember-me all behave as on `develop`.
- Logout: cookies cleared, redirect to `/login`. Navigating back to `/timeline` redirects out again.
- Force token expiry (shorten `ACCESS_TOKEN_TTL_SECONDS` to 30 in the FastAPI env): make any API call → exactly one `/v1/auth/refresh` fires → the original request retries and succeeds.
- A 429 from a rate-limited endpoint does **not** trigger `/v1/auth/refresh` — only a 401 does.

### E2E specs

[e2e/auth.spec.ts](../../e2e/auth.spec.ts) covers gating and the login round-trip; [e2e/fastapi-auth.spec.ts](../../e2e/fastapi-auth.spec.ts) covers the token flow's happy path plus the no-refresh-loop guarantee, and is tagged so it stays out of the default run:

```bash
npx playwright test e2e/fastapi-auth.spec.ts --grep @fastapi-auth
```

## Before opening the PR

```bash
npm run type-check
npm run lint
npm test
```

Stop the dev server: `lsof -ti :3000 | xargs -r kill -9`.
