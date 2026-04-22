# Verification Playbooks

Short, copy-pastable playbooks Claude (and humans) run before opening a PR. Each service has its own page — open the one matching the thing you changed.

Decision rationale and tool alternatives: [docs/research/claude-local-verification.md](../research/claude-local-verification.md). This directory is the operational distillation.

## When to verify

**Before opening any PR.** The pre-commit hook runs `type-check` + `lint-staged`; nothing else is automatic. Verification catches what the type checker can't: wrong response shapes, broken gating, silent 500s, hydration bugs, cross-family data leaks.

**What CI covers for you.** The `e2e` job in [ci.yml](../../.github/workflows/ci.yml) runs the Playwright smoke suite in [e2e/](../../e2e/) against an ephemeral Postgres + `next start` on every PR (fails uploads the `playwright-report/` artifact). That catches login + protected-route regressions automatically; the local playbooks below still cover everything the smoke suite doesn't yet.

## Local vs dev deployment

| Stage                           | Target                                          | Playbook                                 |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| Feature branch → `develop` PR   | **Local** (the service(s) touched in the diff)  | The per-service playbooks below          |
| **`develop → main` release PR** | **Dev deployment** (`develop` branch Cloud Run) | [dev-deployments.md](dev-deployments.md) |

Local catches "did my code work?"; dev catches "did the build+migrate+deploy pipeline work?". Run local for every branch; add dev before merging a release. The `/release-testing` skill automates the dev step.

## The three layers

Pick the lowest layer that gives enough signal for the change. Stack layers only when a single one is insufficient.

| Layer  | Tool                                                                                                                                                            | Best for                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **L0** | `curl` against `npm run dev` / `uvicorn`                                                                                                                        | API routes, server components, HTML strings, auth gating, response shape |
| **L1** | [`claude --chrome`](https://code.claude.com/docs/en/chrome) (first-party Chrome integration)                                                                    | Client components, forms, photo uploads, nav flows, hydration            |
| **L2** | [Playwright MCP](https://github.com/microsoft/playwright-mcp) — auto-installed via [`.mcp.json`](../../.mcp.json) at repo root; approve the server on first use | Headless fallback when L1 isn't available (remote/background agents)     |

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

**Bring up the local stack (one command).** [scripts/local-stack-up.sh](../../scripts/local-stack-up.sh) spins up a sandbox Postgres container on port **5434** (won't clash with anything on the default `:5432`), runs Prisma generate + push + seed against it, generates the Python Prisma client for FastAPI, and writes `.env.sandbox` — without ever touching your `.env` or `.env.local`. Safe to re-run; already-warm stacks are a no-op.

```bash
scripts/local-stack-up.sh
```

The script prints the seeded family master key and `CLAUDE_TEST_USER` / `CLAUDE_TEST_PASSWORD` when it finishes — these are the values referenced in the curl snippets below.

**Run dev servers against the sandbox.** Use [scripts/with-local-stack.sh](../../scripts/with-local-stack.sh) as a prefix so `npm run dev` / `uvicorn` pick up the sandbox `DATABASE_URL` without mutating shell state:

```bash
scripts/with-local-stack.sh npm run dev &                                     # Next on :3000
scripts/with-local-stack.sh uvicorn apps.api.src.main:app --port 8000 &       # FastAPI on :8000
until curl -sf http://localhost:3000 >/dev/null; do sleep 0.5; done
echo "ready"
```

**Cookie-jar login** — use [scripts/claude-login.sh](../../scripts/claude-login.sh), which logs in as the `claude-test` seed user and writes a session cookie to `/tmp/fr-cookies.txt`:

```bash
COOKIES=$(scripts/claude-login.sh)                               # Next on :3000
COOKIES=$(scripts/claude-login.sh --host http://localhost:8000)  # FastAPI
```

Credentials come from `CLAUDE_TEST_USER` / `CLAUDE_TEST_PASSWORD`, which the login script reads from env, `.env.local`, or `.env.sandbox` (in that order). If `local-stack-up.sh` wrote the sandbox file, you're covered with zero extra setup.

**Stop any leftover dev servers:**

```bash
lsof -ti :3000 | xargs -r kill -9 2>/dev/null
lsof -ti :8000 | xargs -r kill -9 2>/dev/null
```

**Tear down the sandbox stack when done:**

```bash
scripts/local-stack-down.sh            # stop the container, keep the data volume
scripts/local-stack-down.sh --purge    # also drop the data volume
```

## When verification isn't possible

If the session can't run the tool a change needs (e.g., no browser available for a hydration-sensitive UI change), **say so in the PR body**. Don't claim UI success from `curl` alone — pre-hydration HTML isn't the user experience.
