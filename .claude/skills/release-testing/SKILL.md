---
name: release-testing
description: Pre-merge verification for `develop → main` release PRs against the live dev Cloud Run deployment. Use whenever the user says `/release-testing`, "test the release PR", "verify develop→main", "smoke the dev deploy before shipping", or hands you a PR number/URL whose base branch is `main`. The skill fetches the release PR's commit range and linked issues, triages the cumulative diff into impact areas (UI, Next API, importer, Prisma schema, infra), confirms the dev Postgres is running, populates `.env.dev.local` from GSM, runs `npm run smoke:dev` end-to-end against the live dev deployment, adds targeted probes for any area the smoke script doesn't cover, and posts a structured markdown report as a PR comment. Paired with and complementary to the `test-pr` skill — that one verifies feature PRs against the local sandbox; this one verifies release PRs against the deployed artifact.
---

# release-testing — pre-merge smoke of a release PR against dev

Runs the dev-deployment verification playbook ([docs/verification/dev-deployments.md](../../../docs/verification/dev-deployments.md)) against a specific `develop → main` PR, then reports back on the PR. The signal this produces is **"the deploy pipeline works for these changes"** — not "the code is correct" (that's what `/test-pr` + CI already established).

## Scope boundary

Local verification (the per-service playbooks) proves the code works as written. CI proves the type checker, tests, and docker build are happy. This skill proves the _next_ link: the `develop`-branch build, the Prisma migration against the real dev database, and the Cloud Run env-var wiring. Catching a bug here averts a broken `main` merge and a hasty rollback.

## When to use this skill

**Use it for:** PRs whose base branch is `main` (release PRs). The user typically opens these after a sprint of feature work has landed on `develop` and wants one more signal before cutting.

**Do NOT use it for:**

- Feature PRs targeting `develop` — use the `test-pr` skill instead.
- Hotfix-to-`main` PRs — the feature-PR flow applies; don't run against the live dev service mid-incident.
- Any PR where the dev Postgres has been paused for so long it's diverged from the `main` schema — run migrations first via the deploy workflow, then smoke.

**Guardrail check.** If `baseRefName != main`, stop and tell the user this skill is for release PRs; hand off to `/test-pr`.

## Inputs

Accept any of:

- PR number: `/release-testing 123`
- PR URL: `/release-testing https://github.com/wnorowskie/family-recipe/pull/123`
- No argument — default to the open PR whose head is `develop` and base is `main`; otherwise ask.

## Prerequisites

Before the first invocation, the user needs to have run through the one-time setup in [docs/verification/dev-deployments.md](../../../docs/verification/dev-deployments.md):

1. `roles/iam.serviceAccountTokenCreator` on `family-recipe-deployer@`.
2. `.env.dev.local` populated (URLs, SA, `CLAUDE_TEST_USER`).
3. `CLAUDE_TEST_PASSWORD` either in `.env.dev.local` or fetched from GSM at session start.

If any of these is missing, **stop and surface the exact `gcloud` one-liner to fix it** — don't try to skip around.

## Workflow

Run these steps in order. Produce a partial report with an honest "could not verify" section if a step blocks you; never fabricate a pass.

### 1. Fetch the PR + commit range + linked issues

```bash
gh pr view <n> --json number,title,body,headRefName,baseRefName,state,isDraft,mergeable,url,files,commits
gh pr diff <n>
gh pr checks <n>
```

The body of a release PR usually lists the feature PRs it bundles (`#102, #104, #107…`). Fetch each one to understand the cumulative scope:

```bash
gh pr view 102 --json title,body,files
```

For each referenced issue (`Closes #N`, or issue numbers in the commit messages), read the acceptance criteria and map them to verification steps — same as `test-pr`, but across **all** commits in the range, not a single PR.

### 2. Triage the cumulative diff into impact areas

```bash
gh pr diff <n> --name-only   # or: git diff --name-only origin/main...origin/develop
```

Map the file list to areas:

| File glob                                                                  | Area     | Dev coverage                                                                                     |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `src/app/api/**/route.ts`                                                  | Next API | **Covered by `smoke:dev`** (login + post + comment + reaction + cleanup)                         |
| `src/app/**` (non-api), `src/components/**`                                | UI       | Partial — see "UI limitations" below                                                             |
| `apps/recipe-url-importer/**`                                              | Importer | Manual `/health` probe (see step 5)                                                              |
| `apps/api/**`                                                              | FastAPI  | Not deployed to dev yet — skip with a note                                                       |
| `prisma/schema*.prisma`, `prisma/migrations/**`                            | Prisma   | Migration already ran during `deploy-dev.yml`; smoke writes exercise it                          |
| `.github/workflows/deploy-*.yml`, `infra/**`                               | Infra    | **Inspect the workflow diff carefully** — a change here changes the pipeline you're about to use |
| `scripts/smoke-dev.sh`, `docs/verification/dev-deployments.md`, this skill | Tooling  | Self-test: run the skill against itself                                                          |

### 3. Confirm the dev deployment is actually for the release SHA

```bash
# The latest revision should have been built from the head of `develop`.
REV=$(gcloud run services describe family-recipe-dev \
  --project family-recipe-dev --region us-east1 \
  --format='value(status.traffic[0].revisionName)')
# Cloud Run revisions are named like family-recipe-dev-00051-cv6 — the SHA
# is visible in the Cloud Console or via:
gcloud run revisions describe "$REV" \
  --project family-recipe-dev --region us-east1 \
  --format='value(spec.containers[0].image)'
```

The image tag is the commit SHA. Compare to `git rev-parse origin/develop`. If they don't match, the deploy workflow is still running or failed — check `gh run list --workflow=deploy-dev.yml` before continuing; running the smoke against a stale revision tests the wrong artifact.

### 4. Confirm infrastructure state

```bash
# Is the dev Postgres running?
gcloud sql instances describe family-recipe-dev \
  --project family-recipe-dev \
  --format='value(state,settings.activationPolicy)'
# Want: RUNNABLE ALWAYS
```

If the instance is stopped (`STOPPED NEVER`), start it:

```bash
gcloud sql instances patch family-recipe-dev \
  --project family-recipe-dev --activation-policy=ALWAYS --quiet
# Patch returns in ~15s, but the instance takes an additional ~2–3 min
# to come up. Poll `gcloud sql instances describe ...` until state is
# `RUNNABLE ALWAYS` before running the smoke — /api/health fails fast
# against a still-starting DB and wastes a review iteration.
```

### 5. Run the smoke script

```bash
# From repo root, with .env.dev.local populated
npm run smoke:dev
```

The script is in [scripts/smoke-dev.sh](../../../scripts/smoke-dev.sh). All-green exit 0 = Next.js dev service auth + DB round-trip + Post/Comment/Reaction writes + cascade delete all work on the **live revision**.

For areas the smoke script doesn't cover, add these probes (mint tokens per audience — don't reuse across services):

```bash
source .env.dev.local

# Importer — different audience
IMP_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEV_DEPLOYER_SA" \
  --audiences="$DEV_IMPORTER_URL")
curl -sS -H "Authorization: Bearer $IMP_TOKEN" "$DEV_IMPORTER_URL/health"
# → {"status":"ok"}

# Read-only Next probes (reuse the smoke script's login flow if you need
# a session; otherwise just check unauthenticated gating)
NEXT_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="$DEV_DEPLOYER_SA" \
  --audiences="$DEV_NEXT_URL")
curl -sS -H "Authorization: Bearer $NEXT_TOKEN" -w 'HTTP %{http_code}\n' \
  "$DEV_NEXT_URL/api/timeline"   # expect 401 without session cookie
```

### 6. UI verification via the auth-injecting proxy

Dev Cloud Run runs `--no-allow-unauthenticated`, so a browser can't load the UI directly: every request (including CSS/JS subresources) needs a Bearer ID token, and browsers don't attach auth headers to subresource loads. The fix is the local auth-injecting proxy ([scripts/dev-auth-proxy.ts](../../../scripts/dev-auth-proxy.ts)) — it mints an impersonated ID token on every forwarded request and strips `Secure` from Set-Cookie so the session cookie survives the localhost hop.

Run the Playwright suite against the live dev deployment through the proxy:

```bash
npm run test:e2e:dev
# → starts proxy on :3100, runs `playwright test`, tears down the proxy on exit
```

If the release bundles hydration-sensitive UI changes, also load a key page manually via `npm run proxy:dev` + your browser at `http://localhost:3100/login` and exercise one interactive flow (e.g., post a comment). Include the outcome in the report.

If the proxy itself fails to mint a token (check `lsof -nP -iTCP:3100` + proxy logs), the same root cause — missing `roles/iam.serviceAccountTokenCreator` — would have already blocked the smoke in step 5; don't invent a fallback. If Playwright isn't installed in this session (`npx playwright install chromium` hasn't run), say so in "Could not verify" rather than guessing the UI's state.

### 7. Clean up

The smoke script cleans up its own test post via an EXIT trap. The only leftover is `/tmp/fr-dev-cookies.txt` — harmless; leave it or `rm -f` it. Do **not** stop the dev DB at the end unless the user asks; other sessions may need it.

### 8. Post the report

The deliverable is a markdown comment on the release PR. Use the template below. Post it with:

```bash
gh pr comment <n> --body-file /tmp/release-report.md
```

## Hard guardrails

Absolute. Violating any of these turns the skill into a liability:

- **Never run against prod.** `main`-branch Cloud Run is for the real family. The skill's URLs are the dev ones, hard-coded; don't swap them to prod because "there's no dev yet for X".
- **Never skip the `baseRefName == main` check.** Running release-testing against a feature PR pollutes dev with writes meant for the sandbox; hand off to `/test-pr` instead.
- **Never mint a fake ID token or re-use a stale one across audiences.** The `--audiences` flag must match the target Cloud Run URL exactly; a token for `$DEV_NEXT_URL` will 401 against `$DEV_IMPORTER_URL`.
- **Never suppress a non-zero smoke exit.** If `npm run smoke:dev` exits non-zero, that's the headline of the report — capture the failing step and stop. Cleanup already ran via the trap.
- **Never stop the dev DB as a "tidy up" step.** Leaving it running is the default; stopping disrupts the next session and costs a 60s restart.
- **Never invent endpoints.** If a probe returns 404, first verify the endpoint exists in the source (`grep -rn "app.get\|@app.post\|export const POST" apps/recipe-url-importer/src/ src/app/api/`). One non-obvious trap: Google Frontend on `*.run.app` blackholes the exact path `/healthz` at the edge — a 404 there with no `server: Google Frontend` header means the request never reached the container. The importer's health endpoint is `/health`.
- **Never paper over a missing prerequisite.** If `roles/iam.serviceAccountTokenCreator` isn't granted or `.env.dev.local` isn't populated, stop and surface the exact command from [dev-deployments.md](../../../docs/verification/dev-deployments.md). Silent fallbacks lead to later confusion.

## Report template

Paste-ready GitHub comment. Adjust the bullets to what was actually run.

````markdown
## Release Verification — <PR title> (#<n>)

**Base:** `main` ← **head:** `develop` (sha `<short-sha>`)
**Dev revision tested:** `<family-recipe-dev-000NN-xxx>` (image sha `<short>`)
**CI on `develop`:** <green/red summary>

### Cumulative scope

- <one-liner per feature PR bundled in this release — `#102 feat: …`>
- Areas touched: <Next API / UI / Importer / Prisma / Infra>

### Dev smoke (`npm run smoke:dev`)

```
PASS  mint Bearer ID token
PASS  GET /api/health → 200
PASS  POST /api/auth/login → 200
PASS  POST /api/posts → 201
PASS  POST /api/posts/:id/comments → 201
PASS  POST /api/reactions → 200
PASS  GET /api/posts/:id → 200 (comments=1, reactions=1)
PASS  DELETE /api/posts/:id → 200
PASS  GET /api/posts/:id after delete → 404
```

_(or paste the failure line + stderr if any step failed)_

### Additional probes

- **Importer `/health`**: `{"status":"ok"}` ✅
- **Timeline unauth gating**: `401` ✅ / `200` ❌ (leak!)
- **HTML-grep /timeline**: found `<title>` ✅ / markup changed ❌

### Infrastructure

- Dev Postgres state: `RUNNABLE ALWAYS` ✅
- Deployed revision matches `develop` HEAD: ✅ / ❌ (`<revision-sha>` vs `<develop-sha>`)
- Deploy workflow (`deploy-dev.yml`) modified in this range: yes → inspected diff / no

### Could not verify

- <explicit list — e.g., "hydration-sensitive UI changes in `src/components/CommentThread.tsx`: dev ingress prevents browser loads; local Playwright was green on the release branch">

### Recommendation

**SHIP** — smoke green, invariants hold, deploy pipeline healthy.
_(or)_ **HOLD** — <one-line reason with link to failing step or bad diff>.
_(or)_ **BLOCKED** — <what's missing: DB stopped and won't start, deploy workflow red, secret missing>.

---

Posted by `/release-testing` · [skill source](.claude/skills/release-testing/SKILL.md) · [playbook](docs/verification/dev-deployments.md)
````

## When this skill runs against a different repo

This one is intentionally not portable. The fixed URLs, SA names, GSM secret IDs, and smoke-script contract all live in `family-recipe-dev` and the `develop → main` branch convention. If you find yourself wanting to reuse this elsewhere, **copy it and adapt** — don't try to parameterize it into a one-size-fits-all dev-smoke skill. The test-pr skill's "when this runs against a different repo" section is a better model for that.
