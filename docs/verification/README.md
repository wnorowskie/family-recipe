# Verification Playbooks

Short, copy-pastable playbooks Claude (and humans) run before opening a PR. Each service has its own page — open the one matching the thing you changed.

Decision rationale and tool alternatives: [docs/research/claude-local-verification.md](../research/claude-local-verification.md). This directory is the operational distillation.

## When to verify

**Before opening any PR.** The pre-commit hook runs `type-check` + `lint-staged`; nothing else is automatic. Verification catches what the type checker can't: wrong response shapes, broken gating, silent 500s, hydration bugs, cross-family data leaks.

## The three layers

Pick the lowest layer that gives enough signal for the change. Stack layers only when a single one is insufficient.

| Layer  | Tool                                                                                                                   | Best for                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **L0** | `curl` against `npm run dev` / `uvicorn`                                                                               | API routes, server components, HTML strings, auth gating, response shape |
| **L1** | [`claude --chrome`](https://code.claude.com/docs/en/chrome) (first-party Chrome integration)                           | Client components, forms, photo uploads, nav flows, hydration            |
| **L2** | [Playwright MCP](https://github.com/microsoft/playwright-mcp) (`claude mcp add playwright npx @playwright/mcp@latest`) | Headless fallback when L1 isn't available (remote/background agents)     |

Always finish with `npm run type-check && npm run lint && npm test` for Next changes, or the equivalent pytest for Python services.

## Playbooks

| Change touches…                      | Playbook                                         |
| ------------------------------------ | ------------------------------------------------ |
| Pages or components under `src/app/` | [ui.md](ui.md)                                   |
| `src/app/api/**/route.ts`            | [next-api.md](next-api.md)                       |
| `apps/api/src/routers/**`            | [fastapi.md](fastapi.md)                         |
| `apps/recipe-url-importer/**`        | [recipe-url-importer.md](recipe-url-importer.md) |
| Any `prisma/schema*.prisma`          | [prisma.md](prisma.md)                           |

A single change can touch multiple — run each relevant playbook. Prisma changes almost always pair with one or both API playbooks.

## Shared helpers

**SQLite override for the Next dev server** — the checked-in `.env` points at local Postgres; if it isn't running, DB routes 500 silently. When working on UI or Next-API changes without touching Postgres-only features:

```bash
DATABASE_URL="file:./prisma/dev.db" npm run dev
```

**Start dev server in the background + wait for ready:**

```bash
DATABASE_URL="file:./prisma/dev.db" npm run dev &
until curl -sf http://localhost:3000 >/dev/null; do sleep 0.5; done
echo "ready"
```

**Cookie-jar login** — use [scripts/claude-login.sh](../../scripts/claude-login.sh), which logs in as the `claude-test` seed user and writes a session cookie to `/tmp/fr-cookies.txt`:

```bash
COOKIES=$(scripts/claude-login.sh)                          # Next on :3000
COOKIES=$(scripts/claude-login.sh --host http://localhost:8000)  # FastAPI
```

The user is created (and its password refreshed) every time `npm run db:seed` runs outside `NODE_ENV=production`. Credentials come from `CLAUDE_TEST_USER` / `CLAUDE_TEST_PASSWORD` in env or `.env.local` (see [.env.example](../../.env.example)). This is the canonical auth path — playbook snippets assume it.

**Stop any leftover dev servers:**

```bash
lsof -ti :3000 | xargs -r kill -9 2>/dev/null
lsof -ti :8000 | xargs -r kill -9 2>/dev/null
```

## When verification isn't possible

If the session can't run the tool a change needs (e.g., no browser available for a hydration-sensitive UI change), **say so in the PR body**. Don't claim UI success from `curl` alone — pre-hydration HTML isn't the user experience.
