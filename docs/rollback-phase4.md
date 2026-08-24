# Phase 4 Rollback Runbook — FastAPI Cutover

How to roll back the FastAPI cutover (issue #38) if the FastAPI backend proves
unhealthy in an environment. This is the procedure the
[migration plan](API_BACKEND_MIGRATION_PLAN.md) points to; read the
[status banner](API_BACKEND_MIGRATION_PLAN.md) there first for context.

> **Live in production since 2026-08-23** (release #263, merge commit
> `1912ceab`). This runbook is no longer hypothetical — real family users are on
> the FastAPI stack, so treat a Level 2 escalation as a user-visible outage
> window. Prod resources: services `family-recipe-prod` (Next) and
> `family-recipe-api-prod` (FastAPI), project `family-recipe-prod`, region
> `us-east1`.

> **The important thing to know:** the migration is done and **the feature flags
> are gone**. Before Phase 4.4 you could roll back by flipping
> `NEXT_PUBLIC_USE_FASTAPI_AUTH` off. That toggle — and the entire dual-mode
> codepath and legacy Next auth stack it guarded — was **deleted** (commit
> `8733671`, #232). So a full rollback is no longer a config change; it is a
> **code revert + rebuild + redeploy**. Plan for a full build/deploy cycle, not
> a flag propagation.

---

## Decide which level you need

Escalate only as far as the failure requires. Level 1 handles the common case (a
bad API deploy) in minutes; Level 2 is the last resort.

| Level | Situation                                                                                             | Action                                                       | Cost                        |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| **1** | A specific FastAPI revision is broken (bad deploy, regression) but the service is fundamentally sound | Roll Cloud Run traffic back to the last healthy API revision | Minutes, no code change     |
| **2** | FastAPI is fundamentally unfit for the environment and the Next monolith must serve data/auth again   | Revert the Phase 4 cutover commits, rebuild, redeploy        | A full build + deploy cycle |

### When to roll back (criteria)

> **⚠️ Nothing pages you on these.** The thresholds below are not wired to any
> alert: `Service Down (dev|prod)` is inverted and fires when the service is
> _healthy_ (#284), and the FastAPI service has no monitoring coverage at all
> (#32). You must evaluate these by hand:
>
> ```bash
> gcloud logging read 'resource.type=cloud_run_revision AND severity>=ERROR' \
>   --project family-recipe-prod --freshness=15m
> gcloud logging read 'resource.type=cloud_run_revision AND httpRequest.status>=500' \
>   --project family-recipe-prod --freshness=15m
> ```
>
> Note the prod API service runs at `minScale: 0`, so `Uncaught signal: 2` in
> its logs is idle scale-down, not a crash. The Next service is `minScale: 1`.

Trigger a rollback when any of these hold for the stated window (from the
migration plan's Rollback Criteria):

- Auth failure rate **> 2%** for 10 minutes
- Refresh-loop rate **> 0.5%** of sessions
- 401/403 spike **> 3×** baseline for 5 minutes
- Login failure rate **> 5%** for 10 minutes

---

## Level 1 — Roll back the FastAPI revision (fast path)

Use this when the FastAPI service itself is healthy but the **currently promoted
revision** is bad. No code change; you are re-pointing traffic at a known-good
image that is still in Cloud Run.

1. List recent revisions for the API service and find the last healthy one:

   ```bash
   gcloud run revisions list \
     --service family-recipe-api-dev \
     --project family-recipe-dev \
     --region us-east1 \
     --format='table(metadata.name, status.conditions[0].status, metadata.creationTimestamp)'
   ```

   > Swap `-dev` for the prod service/project when rolling back production.

2. Send 100% of traffic to the last healthy revision:

   ```bash
   gcloud run services update-traffic family-recipe-api-dev \
     --project family-recipe-dev \
     --region us-east1 \
     --to-revisions <HEALTHY_REVISION>=100
   ```

3. The Next service resolves the API by **service URL** (`API_INTERNAL_URL`),
   which is stable across revisions — so no Next redeploy is needed for a
   revision rollback.

4. Verify (see [Verify the rollback](#verify-the-rollback)). Then fix forward:
   land the fix on `develop`, let it soak in dev, and release normally.

If a revision rollback does not resolve the incident, escalate to Level 2.

---

## Level 2 — Revert the cutover in code (last resort)

Use this only when the Next monolith must serve data and auth again. It restores
the deleted Next `/api/*` data routes and the legacy JWT/`session`-cookie auth
stack.

### 2a. Identify the commits on your target branch

The table below lists the squash-merge commits **as they landed on `develop`**.
Release #263 was merged as a **true merge commit** (`1912ceab`), not squashed, so
`main` now shares history with `develop` and **these exact SHAs are reachable from
`main`** — no SHA translation needed. (Release #157 was squash-merged, which is
why earlier guidance said to go hunting; that no longer applies.) To confirm:

```bash
git merge-base --is-ancestor 8733671 origin/main && echo "reachable from main"
```

If you are reverting on a branch where a SHA is missing, locate the equivalent
with:

```bash
git log --oneline --grep="Phase 4" -i
git log --oneline --grep="#243" -i   # auth-leftover cleanup
git log --oneline --grep="#242" -i   # jose removal
```

| Order to revert | Phase                    | Commit (`develop`) | PR   | What reverting restores                                                                                                                             |
| --------------- | ------------------------ | ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1               | 4.6 smoke tooling        | `281fca1`          | #234 | _(optional — test-only; skip unless it conflicts)_                                                                                                  |
| 2               | 4.5 routers → `/v1`-only | `9420a20`          | #233 | _(FastAPI-internal path shape — **skip for a Next rollback**; only needed if keeping FastAPI on un-prefixed paths)_                                 |
| 3               | leftover cleanup         | `092d7e6`          | #243 | `src/lib/auth.ts`, `masterKey.ts`, `JWT_SECRET` on the Next service                                                                                 |
| 4               | dep cleanup              | `b0ce9b6`          | #242 | `jose` dependency (needed by restored JWT signing)                                                                                                  |
| 5               | 4.4 auth cutover         | `8733671`          | #232 | `NEXT_PUBLIC_USE_FASTAPI_AUTH` flag, `featureFlags.ts`, `jwt.ts`, `apiAuth.ts`, `getCurrentUser`, dual-mode branches, `session-core` cookie helpers |
| 6               | 4.3 route deletion       | `bf49d36`          | #231 | all Next `/api/*` data route handlers under `src/app/api/`                                                                                          |
| 7               | 4.2 middleware           | `676cd21`          | #230 | dual-mode cookie/session middleware checks in `src/proxy.ts`                                                                                        |
| 8               | 4.1 fetch client         | `de33d3a`          | #229 | frontend fetches pointed back at same-origin `/api/*` instead of `/v1/*`                                                                            |

> **Minimum set for restoring the Next backend:** revert 4.4 → 4.3 → 4.2 → 4.1
> (rows 5–8) plus the two cleanup commits (rows 3–4). Rows 1–2 are FastAPI-side
> or test-only and are not required to make Next the backend again.

### 2b. Perform the revert

Revert **newest-first** (reverse dependency order) so each revert applies
cleanly. Do it on a rollback branch, not directly on `main`/`develop`:

```bash
git switch -c rollback/phase-4 origin/main   # or origin/develop for the dev env
git revert --no-edit 092d7e6 b0ce9b6 8733671 bf49d36 676cd21 de33d3a
```

Expect conflicts — these commits deleted files that later commits also touched.
Resolve by taking the pre-cutover version of the deleted files, then
`git revert --continue`.

### 2c. Rebuild and redeploy (mandatory)

The auth flag is a `NEXT_PUBLIC_*` variable, **inlined into the client bundle at
build time**. A config change alone does nothing — you must rebuild and redeploy
the Next service:

1. Open the rollback branch as a PR into the environment branch and merge it
   (this fires the deploy workflow). For an emergency prod rollback, this is a
   `develop → main` release PR.
2. Confirm the Next deploy rebuilt from the reverted commit (not a cached image).
3. Flush CDN / edge cache if auth redirects were cached.

### 2d. Database

No schema rollback is required. All three runtimes share **one** Postgres
database and the cutover added no destructive migration — reverting application
code is sufficient. Do **not** roll back migrations as part of this procedure.

---

## Verify the rollback

After either level, confirm the environment is healthy:

1. **Health:** `curl -i https://<host>/api/health` returns `200`.
2. **Auth round-trip:** log in through the UI (or the smoke script), confirm a
   session is established and a protected page loads.
3. **Data read/write:** load the timeline and create a post/comment; confirm it
   persists.
4. **Metrics:** watch auth success, 401/403 rate, and refresh-loop rate for
   **30 minutes** — they should return to baseline.

For the dev environment, `npm run smoke:dev` exercises health, auth, and a
FastAPI round-trip end-to-end (extended for the cutover in #234).

---

## After a rollback

- File an issue capturing the failure that forced the rollback and the fix-forward plan.
- A **Level 2** rollback leaves the repo diverged from the migration's end state —
  treat re-landing the cutover as a fresh, reviewed change, not a plain
  `git revert` of the reverts.
- Update the [migration plan status banner](API_BACKEND_MIGRATION_PLAN.md) if the
  rollback is expected to persist.
