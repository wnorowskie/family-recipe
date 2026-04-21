# Claude Local Verification Before Opening a PR

Research output for [#59](https://github.com/wnorowskie/family-recipe/issues/59).

## Decision

**Adopt a three-layer verification workflow that Claude runs before handing off a PR.** Keep the layers independent so Claude can stop at the first one that gives sufficient signal for the change at hand.

- **L0 — HTTP against `npm run dev` (default, free, already works).** Background `next dev`, `curl` routes, diff response bodies or status codes. Covers ~60% of changes — API routes, server components, route gating, static strings in HTML.
- **L1 — Claude Code's native Chrome integration (`claude --chrome`).** First-party, ships with Claude Code 2.0.73+. Used on demand when the change needs a real browser (hydrated client components, forms, photo uploads, navigation flows). Beta but officially supported, no MCP config to maintain.
- **L2 — Playwright MCP (optional, headless fallback).** `claude mcp add playwright npx @playwright/mcp@latest`. Use when Claude is running in a session that cannot open a visible browser window (remote/background agent, Claude Desktop without the extension). Accessibility snapshots, not screenshots — token-cheap.

**Reject** per-branch Cloud Run preview deploys for this repo (overkill for V1's one-family scope). **Reject** Chrome DevTools MCP as a default; keep it on hand for one-off performance or network debugging sessions only.

**Two operational patterns the playbooks need**, documented below:

1. A `scripts/claude-login.sh` helper — curl-login with a cookie jar. **Deferred to a follow-up ticket** (see "Implementation follow-ups" below); the playbooks currently use inline `curl` with `<user>`/`<pass>` placeholders.
2. An explicit `DATABASE_URL="file:./prisma/dev.db"` override pattern for starting dev when local Postgres is down (the default `.env` points at Postgres and today Claude stalls when it isn't running). **Documented in the playbooks that ship in this PR.**

## Why this option

- **First-party tooling over third-party glue.** Claude Code's Chrome integration is supported by Anthropic, ships with every Claude Code release, and shares the dev's already-authenticated Chrome profile — no fake cookie jars, no test fixtures drifting from prod auth. MCPs are an escape hatch, not the default. ([code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome))
- **Most V1 changes don't need a browser.** The app is ~70% server components ([src/lib/CLAUDE.md](../../src/lib/CLAUDE.md)), and every mutation goes through a JSON REST route under [src/app/api/](../../src/app/api/). For those, `curl` + a cookie jar is the fastest-to-spin-up check. Reserving the browser for genuine UI changes keeps the context window light and the feedback loop fast.
- **No new infra.** Nothing deploys, nothing new to host, no test-account provisioning on GCS. The persistent additions are documentation-only: the playbooks in `docs/verification/` and the env-override pattern they reference.
- **Layered design matches the automated-testing spike ([#58](https://github.com/wnorowskie/family-recipe/issues/58)).** Both spikes converge on Playwright. When #58 picks its CI framework, this doc's L2 tooling reuses the same runner — the fixtures Claude needs locally are the same ones the CI suite needs.

## Alternatives considered

| Option                                                                        | Why rejected                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome DevTools MCP as the default L1                                         | 34-tool surface area is heavier than needed for typical verification. Performance traces / Lighthouse / network panel are valuable for debugging but not for "does this change work." Keep it installable on demand. ([ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp))                                                                                                         |
| `shot-scraper` CLI only (no browser integration)                              | Gets screenshots cheaply but gives Claude no way to interact — can't click a form, can't follow a redirect, can't read console errors. Fine as a _supplement_ for visual diffs; insufficient as the primary tool. ([simonw/shot-scraper](https://github.com/simonw/shot-scraper))                                                                                                                                          |
| Per-branch Cloud Run preview deploys                                          | Well-documented pattern ([Cloud Run tutorial](https://cloud.google.com/run/docs/tutorials/configure-deployment-previews)), but every PR now costs a deploy + a revision, and Claude then has to wait minutes for rollout before verifying. V1 is a single private family — the value is sharing previews with human testers, not Claude verification. Revisit if we ever have multiple reviewers who need visual previews. |
| Dedicated docker-compose stack for verification                               | Would bundle Postgres + Next + the FastAPI service. Too much to spin up per verification; the existing SQLite path already works for everything except cross-service contract tests.                                                                                                                                                                                                                                       |
| `@playwright/cli` (Microsoft's token-efficient alternative to Playwright MCP) | Interesting — ~4× fewer tokens than MCP for the same task ([Playwright MCP 2026 notes](https://testcollab.com/blog/playwright-mcp)) — but it's newer and less battle-tested. Worth revisiting in 6 months; Playwright MCP is the safer default today.                                                                                                                                                                      |
| Require a dedicated test environment (e.g. a third Cloud Run service)         | Adds ops burden with no clear win over `npm run dev` + SQLite. If local verification becomes flaky, reconsider.                                                                                                                                                                                                                                                                                                            |

## Answers to the ticket questions

### Current state of Claude-accessible browser tooling

| Tool                                | What Claude gets                                                                                                                                                                                                  | Install cost                                                                                                                                                                          | When to pick                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bash + `curl` against `npm run dev` | HTTP status, response body, headers, cookies. Sees server-rendered HTML (verified below).                                                                                                                         | Already available.                                                                                                                                                                    | API routes, server components, route gating, HTML string checks, contract verification.                                      |
| `claude --chrome` / `/chrome`       | Full browser: click, type, navigate, read console, screenshot. Uses the user's real Chrome profile. Beta, Chrome/Edge only, local only (no WSL). Requires Claude Code 2.0.73+ and the Claude-in-Chrome extension. | One-time: install extension + `/chrome` → "Enabled by default" or pass `--chrome`. ([docs](https://code.claude.com/docs/en/chrome))                                                   | Any change that needs hydration, interaction, or visual confirmation.                                                        |
| Playwright MCP (`@playwright/mcp`)  | Headless Chromium, accessibility-tree snapshots (not screenshots — text-based, token-cheap), 20+ tools for nav/click/form.                                                                                        | `claude mcp add playwright npx @playwright/mcp@latest`. Installs Playwright browsers (~300MB) on first run. ([microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)) | Remote/background agents without a visible browser; repeatable regression checks; when the Chrome extension isn't available. |
| Chrome DevTools MCP                 | Performance traces, network panel, console reads, Lighthouse, CrUX, memory snapshots, 34 tools.                                                                                                                   | `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest`. ([ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp))                        | One-off perf or network debugging. Not a daily driver.                                                                       |
| `shot-scraper` CLI                  | Static screenshots of any URL. Built on Playwright.                                                                                                                                                               | `pip install shot-scraper && shot-scraper install`. ([simonw/shot-scraper](https://github.com/simonw/shot-scraper))                                                                   | Visual diffs as a cheap supplement to L0 — capture before/after PNGs when changing CSS.                                      |

### Screenshots before/after for UI changes

Two paths depending on how the session is running:

- **Interactive session with Chrome available**: use `claude --chrome`. Ask Claude to navigate, screenshot, then apply the change, refresh, screenshot again, compare. The screenshots land back in the conversation context. Highest signal.
- **Headless / background session**: use `shot-scraper http://localhost:3000/<path> -o before.png`, apply the change, repeat. Diff with `git diff --no-index before.png after.png` (shows binary differs) or open both in an image viewer.

For the typical private-app change, the Chrome integration's built-in screenshot is enough — no need to install `shot-scraper` up front.

### API-only changes — `curl` + cookie auth

Login is a plain JSON POST to [`/api/auth/login`](../../src/app/api/auth/login/route.ts) that sets an HTTP-only `session` cookie. Everything else follows the cookie jar.

```bash
# One-time: start dev (see DB caveat below)
DATABASE_URL="file:./prisma/dev.db" npm run dev &

# Login, save cookie
curl -s -c /tmp/fr-cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"claude-test","password":"TestPass123!"}' \
  http://localhost:3000/api/auth/login | jq .

# Hit a protected route
curl -s -b /tmp/fr-cookies.txt http://localhost:3000/api/posts | jq .
```

**The missing piece today is the seeded test user.** [prisma/seed.ts](../../prisma/seed.ts) creates the `FamilySpace` and tag catalog but not a verified user Claude can log in as. Follow-up: add a `scripts/claude-login.sh` wrapper and, optionally, a `seed:test-user` sub-task that creates a `claude-test` user idempotently when `NODE_ENV !== "production"`.

### Auth, photo uploads, and DB state — how to avoid pollution

| Concern                              | Strategy                                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Don't overwrite real family data** | Point `DATABASE_URL` at `file:./prisma/dev.db` (SQLite, gitignored per [.gitignore](../../.gitignore)) for Claude's verification sessions. Never run verification against the dev Postgres instance that a real family member is testing against. |
| **Auth without leaking secrets**     | The dedicated `claude-test` user's password lives in `.env.local` (gitignored), not committed. The family master key is either already in `.env` or printed by `db:seed` — Claude can read it from there, never from source.                      |
| **Photo uploads in GCS**             | Don't. Leave `UPLOADS_BUCKET` unset locally so [src/lib/uploads.ts](../../src/lib/uploads.ts) writes to `public/uploads/`. Claude can inspect the written files directly on disk. No GCS credentials ever needed locally.                         |
| **DB reset between sessions**        | `rm prisma/dev.db && DATABASE_URL="file:./prisma/dev.db" npx prisma db push --schema prisma/schema.prisma && npm run db:seed` is the hard reset. For most verifications, state carry-over is fine.                                                |
| **Don't pollute `public/uploads`**   | Periodically `git clean -fdx public/uploads/` after verification sessions (gitignored but fills the disk over time). Not urgent.                                                                                                                  |

### Local dev vs dedicated test env vs preview deploys

**Pick local dev with SQLite.** Rationale:

- `next dev` starts in under a second (empirically: 240ms on this machine, captured in the POC below).
- SQLite avoids the "is Postgres running?" flake. The default `.env` currently points at `127.0.0.1:5432`; if that daemon is down, `next dev` will boot but every DB-touching route returns 500. Claude hits this silently and assumes the change is broken.
- No CI credits spent, no cloud state to clean up.

A dedicated preview deploy becomes worth it only when: (a) multiple humans need to visually review, or (b) the change touches GCS or Cloud Run infra that local can't faithfully emulate. Neither applies to >95% of PRs on this repo.

### Cost

- **Zero extra infra.** Everything runs on the developer's machine.
- **Context budget**: curl responses are small (KB). The Chrome integration loads a tool schema per session — the docs ([code.claude.com/docs/en/chrome](https://code.claude.com/docs/en/chrome)) note "Enabling Chrome by default in the CLI increases context usage since browser tools are always loaded." Keep it opt-in per session (`claude --chrome`) rather than default-on unless the task genuinely needs it.
- **Time budget per change**: ~30s for L0 (curl HTML/API), ~1–2 min for L1 (navigate, click, screenshot, compare). Both are dwarfed by `npm test`, so they fit inside the existing verification loop without extending it.

### Recommended default workflow per change type

| Change type                              | Minimum verification before PR                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API route** (`src/app/api/...`)        | L0 only. Background `npm run dev`, `curl` the endpoint with + without auth, confirm status codes, response shape, and that the family-scoping filter is present in the query. Re-check the mirror router in [apps/api/src/routers/](../../apps/api/src/routers/) if the contract changed. |
| **Server component** (no `'use client'`) | L0 for string/markup checks (`curl /path \| grep`). L1 if the change is visual.                                                                                                                                                                                                           |
| **Client component** (`'use client'`)    | L1 always. Initial HTML from `curl` shows the pre-hydration state, not the real user experience. Load the page in the Chrome integration and exercise the interaction.                                                                                                                    |
| **Prisma schema**                        | Update all three schemas ([prisma/CLAUDE.md](../../prisma/CLAUDE.md)), run `npm run db:push` on SQLite, re-run `npm run type-check`, then L0 against the affected endpoint.                                                                                                               |
| **Photo upload path**                    | L1. Must actually submit a form with a file; `curl` can do multipart but misses the front-end validation. Verify file lands in `public/uploads/` and DB row has a non-null `storageKey`.                                                                                                  |
| **Auth / session**                       | L0 login flow (above) + L1 for the logged-in redirect. Re-verify [src/proxy.ts](../../src/proxy.ts) gating via L0 with and without cookie.                                                                                                                                                |
| **UI polish / CSS**                      | L1 with screenshots before/after. Also test mobile viewport (`/chrome` supports viewport resize).                                                                                                                                                                                         |

**Always, regardless of change type**: `npm run type-check && npm run lint && npm test` (pre-commit hook enforces the first two; the third is the one Claude must remember).

### Integration with the automated-testing spike (#58)

[#58](https://github.com/wnorowskie/family-recipe/issues/58) picks the durable test framework for CI; this doc picks the ad-hoc tooling for Claude's per-PR verification. **They should land on the same framework** — Playwright.

- The `claude-login.sh` helper and the `claude-test` seed user proposed here are the same fixtures #58's test suite will need.
- Playwright MCP (L2) runs the same engine as Playwright test (#58 likely pick), so a test Claude writes using MCP tools translates directly into a committable spec.
- The "API contract snapshot" idea raised in #58 can reuse L0's `curl` → `jq` recipes verbatim.

Keep this doc's L0 workflow even after #58 lands. Running the full Playwright suite per verification is too slow; `curl` stays the fastest check for the 80% case.

### CLAUDE.md updates

Add a new section to the root [CLAUDE.md](../../CLAUDE.md) between "Conventions worth knowing" and "Branches and releases":

```markdown
## Before opening a PR

In addition to the pre-commit gate (`type-check` + `lint`), run the verification layer appropriate to the change (see [docs/research/claude-local-verification.md](docs/research/claude-local-verification.md) for the full matrix):

- **Always**: `npm test` (the pre-commit hook does not run it).
- **API route / server-component change**: background `npm run dev`, `curl` the affected route, confirm status + response shape.
- **Client-component / UI change**: load the page in the Claude Code Chrome integration (`claude --chrome` or `/chrome`). For hydration-sensitive pages, initial `curl` HTML is not enough.
- **Any DB-touching change**: override `DATABASE_URL="file:./prisma/dev.db"` for the dev server when local Postgres isn't running. Don't verify against a real family's data.

If the current session can't run a browser, fall back to Playwright MCP headless (`claude mcp add playwright npx @playwright/mcp@latest`) or state the gap explicitly in the PR body — do not claim UI success without running the UI.
```

This block landed in this PR's second commit (alongside the per-service [docs/verification/](../verification/) playbooks). Root [CLAUDE.md](../../CLAUDE.md) and each service's CLAUDE.md now link to the matching playbook.

## Worked example (from this branch)

The POC loop took ~2 minutes end-to-end:

```text
# 1. Start dev server against SQLite (Postgres was down; confirmed the default
#    `.env` stalls without it):
$ DATABASE_URL="file:./prisma/dev.db" npm run dev &
   ✓ Ready in 240ms
   - Local: http://localhost:3000

# 2. Capture baseline HTML:
$ curl -s -o /tmp/before.html http://localhost:3000/login
   status=200 size=16995

# 3. Edit src/app/(auth)/login/page.tsx — change "Log In" → "Log In Here"

# 4. Re-capture after Fast Refresh (brief settle time):
$ curl -s -o /tmp/after.html http://localhost:3000/login
   status=200 size=17000

# 5. Diff the changed string:
$ diff <(grep -o 'Log In[^<]*' /tmp/before.html) \
       <(grep -o 'Log In[^<]*' /tmp/after.html)
< Log In
> Log In Here

# 6. Revert the edit; git diff is clean.
```

This is pure L0 — no browser, no MCP, no test fixtures. It confirms a UI string change landed in server-rendered HTML. For a change that actually needs the browser (say, the mobile nav menu toggle), L1 is the right tool; the same dev server is already warm.

## Implementation follow-ups

This PR ships the research doc, the [docs/verification/](../verification/) playbooks, and the CLAUDE.md wiring. Tracked follow-ups:

1. [#62](https://github.com/wnorowskie/family-recipe/issues/62) **research: validate verification playbooks on a real change** — pressure-test the playbooks end-to-end on a real ticket before investing more in the workflow. Do this first.
2. [#63](https://github.com/wnorowskie/family-recipe/issues/63) **chore: `claude-test` seed user + `scripts/claude-login.sh`** — add an idempotent dev-only seed step and a login wrapper. Replaces the `<user>`/`<pass>` placeholders in the playbooks.
3. [#64](https://github.com/wnorowskie/family-recipe/issues/64) **chore: document SQLite override in README** — one-liner so non-Claude contributors discover the pattern too.
4. [#65](https://github.com/wnorowskie/family-recipe/issues/65) **chore: install Playwright MCP in `.claude/settings.json`** — once #58 lands on Playwright, both spikes share the install.

## Sources

- [Use Claude Code with Chrome (beta) — Claude docs](https://code.claude.com/docs/en/chrome)
- [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) · [Playwright MCP 2026 update](https://testcollab.com/blog/playwright-mcp)
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [simonw/shot-scraper](https://github.com/simonw/shot-scraper)
- [Cloud Run deployment previews tutorial](https://cloud.google.com/run/docs/tutorials/configure-deployment-previews) · [Deploy Previews to Cloud Run (GitHub Action)](https://github.com/marketplace/actions/deploy-previews-to-cloud-run)
- [docs/research/README.md](README.md) — style guide for this doc
