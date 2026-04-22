---
name: test-pr
description: End-to-end pull-request verification against a repo's local playbooks. Use whenever the user says `/test-pr`, "test this PR", "verify PR #N", "check PR before merge", "is this branch ready to ship", or hands you a PR number/URL and wants pre-merge signal beyond CI. The skill fetches the PR and linked issues, triages the diff into impact areas (UI, Next API, FastAPI, Prisma schema, recipe importer, infra), brings up the repo's local sandbox stack, runs the right verification layer per area (L0 curl, L1 real browser, L2 Playwright MCP), checks repo-specific invariants (family-scoping, dual-Prisma-schema lockstep, auth wrappers), and produces a structured markdown review report ready to paste into a PR comment. Trigger this even when the user doesn't explicitly say "skill" — any ask that maps to "verify a PR before merge" qualifies.
---

# test-pr — end-to-end PR verification

Runs the repo's pre-merge verification playbooks against a specific PR and produces a structured, paste-ready markdown report. Built around the family-recipe repo's three-layer verification model (L0/L1/L2) but designed to degrade gracefully for repos without those playbooks.

## When to use this skill

**Use it for:** feature PRs headed for `develop` where the user wants more confidence than CI alone — a real run-through of the affected flows with cookies, data, and a browser where appropriate.

**Do NOT use it for:**

- Release PRs (`develop → main`) — those are the repo owner's call and go through a different review path.
- Drive-by "does this look right" code reviews — use a code-review skill for that; this one runs the app.
- PRs you can't check out locally — tell the user to `gh pr checkout <n>` first.

## Inputs

Accept any of:

- PR number: `/test-pr 102`
- PR URL: `/test-pr https://github.com/owner/repo/pull/102`
- Branch name: `/test-pr feature/42/foo` — diff against `develop`
- No argument — default to the current branch's open PR if one exists; otherwise ask.

## Workflow

Run these steps in order. Stop early and produce a partial report if a step reveals you cannot verify the PR (e.g., no local stack, no browser). Do **not** fabricate a pass — the "Could not verify" section is a first-class part of the report.

### 1. Fetch the PR and its linked issues

```bash
gh pr view <n> --json number,title,body,headRefName,baseRefName,state,isDraft,mergeable,url,files
gh pr diff <n>
gh pr checks <n>
```

Parse the PR body for issue references (`Closes #42`, `#42`, etc.) and fetch each one:

```bash
gh issue view 42 --json title,body,labels
```

The issue's **Acceptance Criteria** (or **Tasks** for chore tickets) tell you what "done" looks like for this PR — map each criterion to a verification step.

**Guardrail check.** If `baseRefName == main`, this is a release PR. Stop and tell the user this skill is for feature PRs targeting `develop`.

### 2. Triage the diff into impact areas

A PR can span multiple areas. Pick the union of playbooks.

| File glob                                          | Area     | Playbook (in repo)                         |
| -------------------------------------------------- | -------- | ------------------------------------------ |
| `src/app/api/**/route.ts`                          | Next API | `docs/verification/next-api.md`            |
| `src/app/**` (non-api), `src/components/**`        | UI       | `docs/verification/ui.md`                  |
| `apps/api/**` (routers, schemas, deps)             | FastAPI  | `docs/verification/fastapi.md`             |
| `apps/recipe-url-importer/**`                      | Importer | `docs/verification/recipe-url-importer.md` |
| `prisma/schema*.prisma`, `prisma/migrations/**`    | Prisma   | `docs/verification/prisma.md`              |
| `.github/workflows/**`, `terraform/**`, `infra/**` | Infra    | Inspect only — do not execute.             |
| `__tests__/**`, `apps/*/tests/**`                  | Tests    | Run the affected suite; no playbook.       |

**Read the matching playbook(s) from the repo before running commands.** Script names, ports, and flags drift over time; the playbooks in `docs/verification/` are the source of truth for commands. This SKILL.md is the source of truth for the _workflow_ and _invariants_.

### 3. Check CI before re-running anything locally

```bash
gh pr checks <n>
```

Green `typecheck`/`lint`/`test`/`build` means skip those locally. Investigate any red check first — a CI failure is cheaper to fix than a local repro.

### 4. Bring up the local sandbox

Only if the diff touches runtime code. Docs-only PRs skip to step 7 (invariant checks) and step 10 (report).

Always the sandbox — never the dev Postgres a real family is testing against:

```bash
scripts/local-stack-up.sh
```

This is idempotent. It creates a sandbox Postgres on `:5434`, runs Prisma generate + push + seed, generates the Python Prisma client for FastAPI, and writes `.env.sandbox`. It never mutates `.env` or `.env.local`.

Start only the services the diff needs:

```bash
# Next (always if src/ or prisma/ changed)
scripts/with-local-stack.sh npm run dev &
until curl -sf http://localhost:3000 >/dev/null; do sleep 0.5; done

# FastAPI (if apps/api/ changed OR doing a contract-parity check)
scripts/with-local-stack.sh bash -c '
  source apps/api/.venv/bin/activate
  uvicorn apps.api.src.main:app --port 8000
' &

# Recipe importer (if apps/recipe-url-importer/ changed)
cd apps/recipe-url-importer && source .venv/bin/activate && \
  PYTHONPATH=src uvicorn --app-dir src recipe_url_importer.app:app --port 8001 &
cd ../..
```

Port collision: FastAPI and the importer both default to `:8000`. Pick different ports (as shown) if both are needed.

### 5. Log in once; reuse the cookie

Never mint JWTs or fake cookies. The real login path exercises bcrypt verify + `jose` JWT signing + cookie issuance — that's part of what we're verifying.

```bash
COOKIES=$(scripts/claude-login.sh)                               # Next :3000
COOKIES_API=$(COOKIES=/tmp/fastapi-cookies.txt \
              scripts/claude-login.sh --host http://localhost:8000)  # FastAPI
```

The script reads `CLAUDE_TEST_USER` / `CLAUDE_TEST_PASSWORD` from `.env.local` or `.env.sandbox` (written by step 4). Same JWT cookie works against both services if `JWT_SECRET` matches.

### 6. Run the right verification layer

Pick the lowest layer that gives enough signal. Stack only when one isn't enough.

**L0 — `curl` against the running service.** Use for:

- API routes: unauthenticated (expect 401), authenticated happy path (expect shape matching the Zod output or consumer), validation error (expect 400 with `VALIDATION_ERROR` code), cross-family guard for by-id lookups (log in as a different-family user → expect 404, not 200).
- Server components: `curl -s http://localhost:3000/<path>` and grep for the expected strings.
- Auth gating: `curl -I` without cookie should 307 to `/login?redirect=...`.

**L1 — real browser.** Required (not optional) for:

- `'use client'` components with state, effects, or event handlers
- Forms (validation, submission, redirect)
- Photo upload round-trips (`<input type=file>` + preview + submit)
- Navigation via `router.replace`, `router.refresh`, `<Link>` prefetch
- Any acceptance criterion that includes "looks right" or "renders correctly"

Prefer `claude --chrome` if the session has it. Fall back to Playwright MCP (the repo's `.mcp.json` autoinstalls it — approve on first use). Use `browser_navigate` → `browser_snapshot` (accessibility tree — token-cheap) → `browser_take_screenshot` only when the snapshot misses the visual.

**Contract parity.** When the same endpoint changed on both Next and FastAPI:

```bash
NEXT=http://localhost:3000
API=http://localhost:8000
diff <(curl -s -b "$COOKIES" "$NEXT/api/<resource>" | jq -S .) \
     <(curl -s -b "$COOKIES" "$API/<resource>" | jq -S .)
```

**Watch the prefix mismatch:** FastAPI mounts routers with **no** `/api/` prefix; Next uses `/api/*`. A non-empty diff is a parity bug unless the PR is intentionally breaking parity (call this out in the report if so).

### 7. Check the repo-specific invariants

These fail silently at runtime — there's no type error, no red test, just wrong behavior in prod. Grep for each one on every PR that touches the relevant area.

- **Family-scoping.** Any new Prisma query on `Post`, `Comment`, `Reaction`, `Favorite`, `CookedEvent`, or `Notification` must filter by `familySpaceId`. Missing filter = cross-family data leak. Grep the diff: `grep -n familySpaceId <changed-handler-files>`. If a new query lacks it, **fail the review** — this is not a lint suggestion.
- **Auth wrapping.** New `src/app/api/**` handlers must be wrapped in `withAuth` / `withRole` from `src/lib/apiAuth.ts`. FastAPI equivalents must use `require_user` / `require_admin` from `apps/api/src/dependencies.py`. Never parse the cookie inline.
- **Validation source.** New Zod schemas live in `src/lib/validation.ts`, not inline in the route handler.
- **Error response source.** Errors use helpers from `src/lib/apiErrors.ts` (`validationError`, `notFoundError`, etc.) — not ad-hoc `NextResponse.json({ error: ... })`.
- **Dual Prisma schemas in lockstep.** Any field / model / relation added to `prisma/schema.postgres.node.prisma` must also appear in `prisma/schema.postgres.prisma` with the same shape and `@map(...)` column name. SQLite was dropped in #80 — **do not** suggest `file:./prisma/dev.db` as a fallback. A third schema should not reappear.
- **Photo storage.** DB stores opaque `storageKey` values, never rendered URLs. For any new upload path, confirm (a) the file landed in `public/uploads/<key>` on disk (runner has `UPLOADS_BUCKET` unset), and (b) the Prisma row has a non-null `*StorageKey`.
- **Rate limiter.** New auth-sensitive routes should apply the LRU rate limiter from `src/lib/rateLimit.ts`. Not every route needs it; login, signup, and write-heavy routes do.

### 8. Run the affected test suites

```bash
npm test                                                            # Next changes
cd apps/api && source .venv/bin/activate && pytest && cd ../..      # FastAPI
cd apps/recipe-url-importer && source .venv/bin/activate && \
  PYTHONPATH=src pytest && cd ../..                                 # Importer
```

If any suite fails against the PR branch, capture the first failing output and stop — that's the blocker, everything else is noise until it's green.

### 9. Tear down

```bash
lsof -ti :3000 | xargs -r kill -9 2>/dev/null
lsof -ti :8000 | xargs -r kill -9 2>/dev/null
lsof -ti :8001 | xargs -r kill -9 2>/dev/null
# Keep the sandbox volume unless the user asked for a full reset:
# scripts/local-stack-down.sh          # stop container, keep volume
# scripts/local-stack-down.sh --purge  # drop volume too
```

### 10. Produce the report

See the template below. This is the deliverable — it should be directly paste-able into a PR review comment.

## Hard guardrails

These are absolute. A skill that violates any of these becomes net-negative:

- **Never verify against real dev Postgres.** Always the sandbox via `scripts/local-stack-up.sh`. Real family members are testing on dev — corrupting their data is worse than skipping verification.
- **Never mint JWTs or cookies by hand.** Always the real login route via `scripts/claude-login.sh`. The login flow is part of what we're verifying.
- **Never run destructive git operations** as part of verification — no `push --force`, no `reset --hard`, no `branch -D`. This skill is read-only from git's perspective; it can `gh pr checkout` into a clean worktree but nothing that rewrites history.
- **Never claim UI success from `curl` alone on a hydrated page.** Pre-hydration HTML isn't the user experience. If no browser is available, the report says "could not verify interactively" — don't paper over it.
- **Never suggest SQLite.** `file:./prisma/dev.db` was removed in #80; this repo is Postgres-only. Offering it as a fallback sends future agents down a dead-end.
- **Family-scoping grep is mandatory** on any PR that adds a DB query on a scopeable model. Skipping it once lets the next cross-family bug through.
- **Never run this skill against a release PR** (`develop → main`) as if it were a feature PR. Release verification is a separate workflow.

If the session can't run a required tool (no Docker for the sandbox, no browser for L1), the "Could not verify" section of the report must call it out. A partial report with honest gaps is strictly better than a full report with fabricated passes.

## Report template

Produce the report in GitHub-flavored markdown. Use `<details>` for long command output so the summary stays scannable. This is the exact shape — deviate only if the user asks for a different format.

````markdown
## PR Verification — <title> (#<n>)

**Branch:** `<head>` → `<base>` · **Linked issue:** #<issue-n> · **CI:** <green/red summary from `gh pr checks`>

### Impact summary

- <one bullet per affected area — UI / Next API / FastAPI / Prisma / importer / infra>
- <what the PR is trying to do, in one line>

### Verification performed

- **Next API — `/api/<resource>`**: L0 curl — 401 unauth ✅, 200 authed ✅, 400 on bad payload ✅, 404 cross-family ✅
- **UI — `/<path>`**: L1 Playwright — form submits, redirect lands at `/<target>`, screenshot attached
- **Contract parity** (if both backends changed): diff clean ✅ / differs ❌ (include the diff)
- **Tests**: `npm test` → 46 suites, 0 failures; FastAPI `pytest` → 41 tests, 0 failures
- **Issue acceptance criteria**: <one line per criterion — met / not-met / not-verifiable-here>

<details><summary>Command log</summary>

```bash
# Exact commands run, with output snippets
```

</details>

### Invariants

- Family-scoping on new queries: ✅ / ❌ (list offending files if ❌)
- `withAuth` / `withRole` wrapping on new handlers: ✅ / ❌ / N/A
- Dual Prisma-schema lockstep: ✅ / ❌ / N/A
- Validation from `src/lib/validation.ts`: ✅ / ❌ / N/A
- Error helpers from `src/lib/apiErrors.ts`: ✅ / ❌ / N/A
- Photo storage uses `storageKey`, not URL: ✅ / ❌ / N/A

### Could not verify

- <explicit list — e.g., "photo upload round-trip: no browser available this session"; "GCS signed-URL path: no `UPLOADS_BUCKET` bucket in local env"; "post-deploy smoke: skill doesn't touch deploy pipeline">

### Regressions or open questions

- <anything surprising surfaced by the run — unrelated failures, flaky tests, docs out of date with code>

### Recommendation

**PASS** — verified end-to-end, invariants hold, tests green; ready to merge.
_(or)_ **NEEDS CHANGES** — <one-line reason, with link to offending file/line>.
_(or)_ **BLOCKED** — <what's missing: CI red, local stack down, acceptance criterion untestable here>.
````

## When this skill runs against a different repo

If `docs/verification/README.md` doesn't exist, this skill is being run outside the family-recipe repo it was shaped for. Degrade gracefully:

1. Read the repo's `CLAUDE.md`, `README.md`, and `CONTRIBUTING.md` for verification conventions.
2. Ask the user for the entry-point command to start the app and the login method; don't guess.
3. Drop the family-recipe-specific invariants (family-scoping, dual-Prisma, `withAuth`) from the invariant-check section — they're repo-specific.
4. Keep the workflow (fetch PR → triage diff → pick layer → check CI → run tests → produce report). That part is portable.
5. Flag prominently in the report that repo-specific invariants were skipped.
