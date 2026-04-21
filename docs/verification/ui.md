# UI verification

Run this when the change touches anything under [src/app/](../../src/app/) (pages, layouts, components, route groups) or [src/components/](../../src/components/).

Rule of thumb: **if the change adds, removes, or alters anything a user sees, do L1.** Pre-hydration HTML (what `curl` returns) is not the user experience for `'use client'` components.

## Start the dev server

```bash
DATABASE_URL="file:./prisma/dev.db" npm run dev &
until curl -sf http://localhost:3000 >/dev/null; do sleep 0.5; done
```

If the change only reads data, SQLite is fine. If it exercises a Postgres-specific feature (full-text search, `JSONB` operators, Postgres-only types or functions), start the real Postgres instead.

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

## Before opening the PR

```bash
npm run type-check
npm run lint
npm test
```

Stop the dev server: `lsof -ti :3000 | xargs -r kill -9`.
