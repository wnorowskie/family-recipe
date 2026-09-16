# GCP Cost Reduction — ~$71/mo → ≤ $50/mo

Spike ticket: [#329](https://github.com/wnorowskie/family-recipe/issues/329). Billing source: Console → Billing → Reports, charge period **Aug 1 – Sep 15 2026** (46 days, $107.41, forecast $146.92 for Aug 1 – Sep 30), re-pulled 2026-09-15. Prices are current **us-east1 list** from the Cloud Billing Catalog API (SKU ids in the appendix); monthly figures use 730 h. Usage figures are 30-day Cloud Monitoring reads (Aug 16 – Sep 15).

## Decision (TL;DR)

**Downsize dev Cloud SQL to `db-f1-micro` and leave it always-on.** That single `gcloud sql instances patch` removes ~$41.6/mo — 73 % of the bill is a dedicated-core Postgres running 24/7 for an environment only Eric and Claude sessions use, while prod serves the real family on `db-f1-micro`. Three small Terraform changes then take the remainder to near zero: Artifact Registry cleanup policies (−~$3), prod Next `min_instance_count` 1 → 0 plus request-based CPU on the API/importer (−~$4.6 net), and a $50 billing budget so the next regression is visible. **Projected bill after the accepted set: ≈ $23/mo** (dev SQL $11.1, prod SQL $11.1, AR $0.5, Secret Manager $0.3, Cloud Run ≈ $0). The dev tier change alone lands at ≈ $30/mo, under the target.

Rejected on the numbers: stop-by-default automation for the dev DB (a stopped instance with a public IP still costs $10.70/mo — within $0.37 of `db-f1-micro` running 24/7), turning off prod PITR ($0 — the prod SQL bill is fully explained by compute + disk), shrinking backups (every backup reports 0 chargeable bytes), moving prod to 10 GB HDD ($2.50/mo does not justify a migration with real users), halving Cloud Run CPU limits (all request-time CPU across six services is ~$0.17/mo at list), and removing dev Cloud SQL for a hosted free tier (deferred — the target is met without taking on an external dependency).

Follow-ups opened: [#331](https://github.com/wnorowskie/family-recipe/issues/331) dev tier · [#332](https://github.com/wnorowskie/family-recipe/issues/332) AR cleanup · [#333](https://github.com/wnorowskie/family-recipe/issues/333) Cloud Run · [#334](https://github.com/wnorowskie/family-recipe/issues/334) budget · [#335](https://github.com/wnorowskie/family-recipe/issues/335) dev 10 GB HDD (optional, last).

## Where the money goes

| Line                                                  | 46 days     | ≈ $/mo   | List-price reconstruction                                                                                                                                          | Matches?                                |
| ----------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Cloud SQL dev (`db-custom-1-3840`, 20 GB SSD, ALWAYS) | $78.38      | $51.1    | 1 vCPU × $0.0413/h + 3.75 GiB × $0.007/h = $0.0676/h → $49.31 + 20 × $0.17 = $3.40 → **$52.71**                                                                    | ✓                                       |
| Cloud SQL prod (`db-f1-micro`, 20 GB SSD, PITR on)    | $16.42      | $10.7    | $0.0105/h → $7.67 + $3.40 = **$11.07**                                                                                                                             | ✓ — leaves ≈ $0 for PITR logs + backups |
| Cloud Run (net of $9.68 free tier)                    | $7.22       | $4.7     | prod Next min instance: 2.59 M idle-s × $0.0000025 = $6.48 CPU + 1.30 M GiB-s × $0.0000025 = $3.24 → $9.71 gross; request-based free tier ≈ $5.22 → **≈ $4.6 net** | ✓                                       |
| Artifact Registry (~40 GB)                            | $4.93       | $3.2     | (39.9 − 0.5 GB) × $0.10 = $3.94 (AR bills GiB, and the repo grew through the window)                                                                               | ≈                                       |
| Secret Manager (14 enabled versions)                  | $0.47       | $0.3     | (14 − 6 free) × $0.06 = $0.48                                                                                                                                      | ≈                                       |
| **Total**                                             | **$107.41** | **~$71** |                                                                                                                                                                    |                                         |

Live state confirmed 2026-09-15 with the `gcloud … describe` commands from the ticket: both instances ZONAL / Enterprise / PG15 / public IP / 20 GB `PD_SSD` / 7 retained backups; dev `activationPolicy: ALWAYS`; prod `pointInTimeRecoveryEnabled: true` with logs in Cloud Storage. All six Cloud Run services run 1000m / 512Mi, concurrency 80, max 5; only prod Next has `minScale = 1`.

## Ranked levers

| #   | Lever                                                       | Env    | Saves $/mo                          | Risk (one line)                                                                            | Effort | Mechanism                         | Ticket                        |
| --- | ----------------------------------------------------------- | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------ | ------ | --------------------------------- | ----------------------------- |
| 1   | Dev Cloud SQL `db-custom-1-3840` → `db-f1-micro`, always-on | dev    | **41.6**                            | `max_connections` 100 → 25; shared-core, no SLA (irrelevant on dev)                        | S      | `gcloud` patch + TF default       | #331                          |
| 2   | Prod Next `min_instance_count` 1 → 0                        | prod   | **4.6 net** (9.7 gross)             | first request after a genuinely idle period +2–3 s; uptime check keeps it warm in practice | S      | TF (tfvars + example)             | #333                          |
| 3   | AR cleanup policies: keep 10 most recent, delete > 30 d     | both   | **~3**                              | rollback depth bounded at 10 images per repo                                               | S      | TF `cleanup_policies`             | #332                          |
| 4   | `cpu_idle = true` (request-based CPU) on API + importer     | both   | 0 now (1.9 gross, inside free tier) | none found — FastAPI has no post-response work                                             | S      | TF `resources` block              | #333                          |
| 5   | $50/mo billing budget, 50/90/100 % + forecast               | shared | guardrail                           | none                                                                                       | S      | TF `google_billing_budget`        | #334                          |
| 6   | Recreate dev SQL on 10 GB `PD_HDD`                          | dev    | 2.5                                 | half-day recreate + re-seed; module needs `disk_type`/`deletion_protection` vars           | M      | TF destroy + apply                | #335                          |
| —   | Stop-by-default dev DB + start/stop automation              | dev    | ≤ 0.4 vs #1                         | idle IP $7.30/mo makes it pointless                                                        | M      | —                                 | rejected                      |
| —   | `db-g1-small` always-on                                     | dev    | 23.8                                | costs $18/mo more than #1 for headroom dev doesn't use                                     | S      | —                                 | rejected                      |
| —   | No dev Cloud SQL (Neon/Supabase free tier)                  | dev    | 11.1 more than #1                   | external dependency, CI migration path rewrite, loses prod parity                          | M/L    | —                                 | deferred                      |
| —   | Prod PITR off                                               | prod   | ~0                                  | loses point-in-time restore for nothing                                                    | S      | —                                 | rejected                      |
| —   | Fewer retained backups                                      | prod   | 0                                   | —                                                                                          | S      | —                                 | rejected                      |
| —   | Prod 10 GB `PD_HDD` recreate                                | prod   | 2.5                                 | downtime + migration + secret rotation with real users                                     | L      | —                                 | rejected (not now)            |
| —   | Cloud Run CPU/memory limits 1000m → 500m                    | both   | ≤ 0.2                               | lengthens the 7 s FastAPI cold start                                                       | S      | —                                 | rejected                      |
| —   | Prune old Secret Manager versions                           | both   | ≤ 0.2                               | —                                                                                          | S      | `gcloud secrets versions destroy` | no ticket; optional one-liner |

**Sequence (cheapest and safest first):** #331 → #332 → #333 → #334 → #335. #331 and #332 are dev-first and reversible; #333 is the only prod-touching change and ships through a normal `develop → main` release with `/release-testing`; #334 is account-level and independent; #335 is optional.

**Projected bill:** all accepted levers ≈ **$23/mo**; #331 alone ≈ $30/mo; #331 + #335 (dev on HDD) ≈ $20.4/mo. Floor if everything on the table were taken, including the rejected prod HDD recreate and no dev SQL at all: ≈ $9.5/mo.

---

## Dev Cloud SQL (the ~$52 line)

### Scenarios, at us-east1 list

Storage stays 20 GB `PD_SSD` ($3.40/mo) in every row except (a′); backups are $0 (see below). "Stopped" includes the idle-IPv4 fee ($0.01/h = $7.30/mo) because both instances have a public IP and the docs are explicit that "charges for storage and IP addresses continue to apply" while stopped.

| Scenario                                          | Compute                | Idle cost              | $/mo                                                        | What dev loses                                                                     |
| ------------------------------------------------- | ---------------------- | ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| current: `db-custom-1-3840` always-on             | $0.0676/h → $49.31     | —                      | **$52.71**                                                  | —                                                                                  |
| (a) `db-f1-micro` always-on                       | $0.0105/h → $7.67      | —                      | **$11.07**                                                  | `max_connections` 25; shared core (no SLA)                                         |
| (a′) (a) on a recreated 10 GB `PD_HDD`            | $7.67                  | —                      | **$8.57**                                                   | a half-day recreate (#335)                                                         |
| (b) `db-g1-small` always-on                       | $0.035/h → $25.55      | —                      | **$28.95**                                                  | nothing vs (a); `max_connections` 50                                               |
| (c) current tier, stopped by default + automation | $0.0676/h × hours used | $3.40 + $7.30 = $10.70 | **$10.70 + $0.07/h** → $12.05 at 20 h/mo, $13.40 at 40 h/mo | every session starts with a 2–3 min DB start; automation to build and keep working |
| (d) `db-f1-micro` stopped by default              | $0.0105/h × hours used | $10.70                 | **$10.70 + $0.01/h** → $10.91 at 20 h/mo                    | same as (c), to save ≤ $0.37/mo vs (a)                                             |
| (e) no dev Cloud SQL                              | —                      | —                      | **$0** (+ hosted free tier)                                 | see "If dev Cloud SQL goes away"                                                   |

**Decision: (a).** It is within $0.37/mo of the cheapest stop-on-demand option with none of the workflow cost, and it is the configuration prod already runs with real users. (c) and (d) are dead on arrival: because the public IP is billed while idle, a stopped instance costs almost exactly what a running `db-f1-micro` does. The only way to make stop-on-demand pay is to drop the public IP, and private-IP Cloud SQL would break the `cloud-sql-proxy` migration step in `deploy-dev.yml` (GitHub runners cannot reach a private IP without a VPC path) for a saving of $7.30/mo — not worth it.

### What a stopped instance still costs

Storage $0.17/GiB-mo (SSD) or $0.09 (HDD), automated backups at $0.08/GiB-mo (currently 0 chargeable bytes on both instances — the backups are incremental and the database is tiny), and **$0.01/h for the reserved public IPv4 while idle** (Cloud SQL pricing: "IPv4 addresses while idle $0.01 / 1 hour"; SKU `Zonal - IP address reservation in Americas`). For dev today: $3.40 + $0 + $7.30 = **$10.70/mo doing nothing**.

### Automated start/stop — where it would live

Not recommended (see above), but for the record the options in order of fit: (1) wrap the existing entry points — `/release-testing`'s pre-flight already patches `activation-policy=ALWAYS` and polls; the symmetric stop would go at the end of `scripts/smoke-dev.sh` / `test-e2e-dev.sh` — but nothing stops the DB after an interactive Console or browser session, which is exactly the failure mode the billing bars show; (2) a scheduled GitHub Actions workflow (fits the WIF / deployer-SA setup; the deployer SA would need `roles/cloudsql.editor`) stopping nightly — still leaves it running all day; (3) Cloud Scheduler → Cloud SQL Admin API `instances.patch` — same as (2) plus an OAuth-scoped scheduler job. Cold start of a stopped instance is documented in `docs/verification/dev-deployments.md` as 30 s – 2 min and in the `/release-testing` skill as 2–3 min; `scripts/test-e2e-dev.sh` waits ≤ 30 s for `/api/health` and `smoke-dev.sh` has no DB wait at all, so start-on-entry would need a new ~3-min poll in both.

### Does `db-f1-micro` handle what dev does?

Yes — prod runs the same workload on it. The one hard limit is **`max_connections` = 25** for the "tiny (~0.5 GB)" memory class (50 for `db-g1-small`, 100 for 3.75 GB — [flags reference](https://docs.cloud.google.com/sql/docs/postgres/flags)). Neither `DATABASE_URL` secret sets `connection_limit`, so Next and FastAPI each use Prisma's default pool of `num_cpus × 2 + 1` = **3 per 1-vCPU instance** (prisma-client-py drives the same query engine). Theoretical ceiling with `max_instance_count = 5` on both services: 30 > 25 — but dev has run one instance of each (23 Next starts in 30 days), CI migrations add one proxy connection, and prod has carried this identical ceiling on `db-f1-micro` since launch without hitting it. `prisma migrate deploy`, `npm run smoke:dev` and `scripts/test-e2e-dev.sh` are all single-connection-ish and unaffected. If the ceiling ever bites, `connection_limit=2` in the dev `DATABASE_URL` or `max_instance_count = 2` fixes it; neither is needed now.

### If dev Cloud SQL goes away entirely

Dev Cloud Run still needs a Postgres. A hosted free tier (Neon: 0.5 GiB, autosuspend; Supabase: 500 MB, pauses after a week idle) works with Prisma over TCP + TLS and would save the remaining $11/mo. It costs: a new external account and credential to manage; rewriting the `deploy-dev.yml` migration step (drops `cloud-sql-proxy` / `--add-cloudsql-instances`) so dev's connection path stops matching prod's unix-socket path; making `module.monitoring`'s `cloud_sql_instance_name` dashboard optional; deleting the DB start/stop docs and skill pre-flight; and accepting free-tier terms that can change under us. "Dev is local-only, Cloud Run kept as a deploy smoke test" is the same thing with a broken login (the Next `/v1` proxy needs FastAPI, which needs a DB). **Deferred:** the target is met by (a); revisit only if the goal moves below ~$20/mo.

### Disk

Confirmed from the [instance settings doc](https://docs.cloud.google.com/sql/docs/postgres/instance-settings): storage capacity "cannot decrease" after creation, and storage type is not modifiable — "shrink" means recreate. For dev that is cheap (no real data, and the [delete-instance doc](https://docs.cloud.google.com/sql/docs/postgres/delete-instance) now says "the deleted instance name can be reused immediately", so the connection name and both secrets stay put). 10 GB `PD_HDD` = $0.90/mo vs $3.40 → **−$2.50/mo**, tracked as optional #335, which also adds the `disk_type` / `deletion_protection` variables the `sql_instance` module is missing (it hardcodes `deletion_protection = true` and `disk_autoresize = true` and leaves `disk_type` at the provider default).

## Prod Cloud SQL (~$11 line)

**PITR.** Reconciliation says it costs ≈ nothing: `db-f1-micro` + 20 GB SSD at list for the 46-day window is $11.59 + $5.14 = $16.74, and the bill was $16.42 — there is no room for a measurable transaction-log charge on a near-idle database (WAL volume is tiny; logs live in Cloud Storage at backup-storage rates, and the Backups SKU shows 0 chargeable bytes). Turning it off would forfeit restore-to-any-second within the 7-day window for a saving that rounds to $0. **Keep it.** For completeness, the restore runbook that daily backups alone would leave us with: `gcloud sql backups list --instance family-recipe-prod --project family-recipe-prod` → pick an id → `gcloud sql backups restore <ID> --restore-instance=family-recipe-prod --project family-recipe-prod` (overwrites the instance in place; expect several minutes of unavailability; take a manual on-demand backup first). With PITR the equivalent is `gcloud sql instances clone family-recipe-prod family-recipe-prod-pitr --point-in-time '<RFC3339>'` into a _new_ instance, then repoint `family-recipe-prod-database-url` — no in-place overwrite.

**10 GB `PD_HDD`.** Saves $2.50/mo and requires: a new instance (name reuse means delete-first, i.e. downtime; a parallel `-2` instance means new connection name → `PROD_INSTANCE_CONNECTION_NAME` GitHub secret, `family-recipe-prod-database-url` secret host, `cloud_sql_instances` in three modules, `module.monitoring.cloud_sql_instance_name`), `deletion_protection` flip, `pg_dump`/`pg_restore` of real data, and a prod `terraform apply` of the #285 class. **No, not now.** Revisit only if prod's DB is being migrated for another reason (e.g. a private-IP move).

**Backup retention.** 7 retained backups at 0 chargeable bytes each; the count is not a cost lever at all. Leave at 7 (also the maximum transaction-log retention, which the tfvars comment already notes).

## Cloud Run (~$5 net)

**Prod Next `min_instance_count = 1`.** Measured 2,590,274 billable seconds in 30 days — the instance is warm around the clock. Gross $9.71/mo at the min-instance idle rate; the request-based free tier (180 k vCPU-s + 360 k GiB-s, applied as a Tier-1-priced spending discount ≈ $5.22/mo) absorbs about half, leaving the **$4.6–4.7/mo net** that is the whole Cloud Run line. At `min 0` everything left (Next request time 5,826 vCPU-s ≈ $0.14, requests 61 k ≪ 2 M) sits inside the free tier → **net ≈ $0**.

Cold start, measured on dev (same image, `min 0`): first request to `/api/health` after ≥ 2 h idle **2.96 s**, then 0.09–0.11 s warm; first SSR page 0.38 s, then 0.19 s. Cloud Monitoring `startup_latencies` over 30 days: Next containers **mean 1.5–1.8 s, p95 ≤ 2.5 s** (dev 23 starts, prod 6). Two things make the user-visible cost smaller than that: the prod uptime check hits `/api/health` **72 times an hour** (6 regions × 5 min), well inside Cloud Run's ~15-min idle scale-down, so the instance stays warm and — because "idle instances that are not minimum instances are not charged" — free; and FastAPI, already at `min 0`, cold-starts in **~7 s (p95 ≤ 9.6 s; 44 prod cold starts last month)**, which dominates any first-request latency the family already experiences. Optional companion: `startup_cpu_boost = true` on the API — bills only the boosted CPU during startup and attacks that 7 s directly.

**CPU allocation (`cpu_idle`).** Not what the ticket assumed: the API and importer services in **both** envs run with `run.googleapis.com/cpu-throttling: false` — CPU always allocated, instance-based billing — because the `resources { limits }` block in `cloud_run_api` / `cloud_run_importer` (copied from the importer module in #241) omits `cpu_idle`. Only the two Next services (no `resources` block) are request-based. Effect: `family-recipe-api-prod` billed 67,406 s for 823 requests — ~80 s of instance time per request as each instance idles out. Across the four services that is 100,275 vCPU-s + 50,061 GiB-s ≈ **$1.90/mo gross, currently $0 net** because it fits inside the separate instance-based free tier (240 k vCPU-s / 450 k GiB-s). Fix it anyway (`cpu_idle = true`, #333): it is the correct setting, FastAPI has no post-response work (no `BackgroundTasks`, no scheduled jobs — verified), and it stops the free-tier headroom from eroding as traffic grows.

**CPU / memory limits.** All six run 1000m / 512Mi. Total request-time CPU across the account is ~7 k vCPU-s/month ≈ **$0.17/mo at list**, inside the free tier — halving limits saves nothing measurable and slows the CPU-bound 7 s FastAPI start. Leave them.

**Remaining SKUs are noise.** Uptime checks (prod 8,640 + dev 2,880 executions/mo, ×6 regions) are inside Cloud Monitoring's free allotment and do not appear on the bill; Cloud Logging is inside its 50 GiB free tier. Aside found on the way: the **dev** uptime check (OIDC-authenticated) does not appear in the dev container's request logs at all — only manual `curl`s do — so it is probably failing at the IAM layer; unrelated to cost, worth a separate look alongside #32.

## Artifact Registry (~$3)

39.9 GB total: `family-recipe-dev` **35.3 GB / 171 images** (~19 pushes/mo since 2025-12), `family-recipe-api-dev` 1.4 GB / 17, `recipe-importer-dev` 0.4 GB / 11, `family-recipe-prod` 2.4 GB / 11, `family-recipe-api-prod` 0.25 GB / 2, `recipe-importer-prod` 0.14 GB / 3. Every deploy tags `:${GITHUB_SHA}`; only 4 dev images are untagged, so a delete-untagged policy alone reclaims nothing.

**Policy (#332), on all six repositories via the three modules:** `KEEP most_recent_versions { keep_count = 10 }` + `DELETE condition { tag_state = "ANY", older_than = "2592000s" }`. KEEP wins over DELETE, so the newest 10 survive regardless of age — that matters on prod where a deploy can be months apart. N = 10 is chosen for rollback: Cloud Run revisions pin images by digest, and deleting the image behind a still-eligible revision means it cannot scale from zero (fatal once #333 sets `min 0`). Prod has accumulated 11 Next images in nine months, and no rollback here has ever gone deeper than the previous revision; 10 keeps the whole prod history and about two weeks of dev. Projected: dev Next ~2 GB, total ~6 GB → **≈ $0.5/mo**.

**One-time purge:** no script needed — apply with `cleanup_policy_dry_run = true` first (a variable, default `true`, so a plan mistake cannot delete), review, flip to `false`; the cleanup pipeline is asynchronous and can take up to a day. If it must happen now, `gcloud artifacts docker images delete us-east1-docker.pkg.dev/family-recipe-dev/family-recipe-dev@<digest>` per image from `gcloud artifacts docker images list --sort-by=~createTime` beyond the first 10 — but the policy will do the same thing without the foot-gun.

## Guardrails

**Budget (#334):** `google_billing_budget` on `family-recipe-billing` (`0157B9-5A2A78-C9DEB7`), $50 USD, thresholds 0.5 / 0.9 / 1.0 actual + 1.0 forecast, filtered to both projects, notifying the prod monitoring email channel with default IAM recipients left on. Prerequisites verified: Eric already holds `roles/billing.admin` on the account; `billingbudgets.googleapis.com` is **not** enabled on either project; the provider needs `user_project_override = true` + `billing_project` under user ADC (a provider alias keeps that off the rest of the prod root). No BigQuery billing export exists — a budget doesn't need one, but a future spike wanting SKU-level history would (cheap: a few MB/month of BigQuery storage).

**Terraform that would fight these changes:**

- **The tfvars are gitignored** on both envs. The tier / disk / scaling values the ticket quotes exist only on Eric's machine, and the tracked defaults disagree with live prod: `infra/envs/prod/variables.tf` defaults to `tier = "db-custom-1-3840"`, `backup_retention_days = 14`, `enable_public_ip = false`, `min_instance_count = 0`; `terraform.tfvars.example` says `tier = "db-custom-1-3840"`. A `terraform plan` without the local tfvars would propose upsizing prod. Every follow-up lands its value in `variables.tf` / `.example` so the change is reviewable, and #333 corrects the stale prod defaults.
- `activation_policy` is only wired through `infra/envs/dev/main.tf`; prod cannot be stopped from Terraform (correct, and no lever here needs it).
- `lifecycle.ignore_changes` on the three Cloud Run services ignores the _top-level_ `scaling` block, image, `client*`, `template[0].revision` and (Next only) `env` — `template[0].scaling.min_instance_count` and `resources` are still managed, so #333 applies cleanly. TF-created revisions take 100 % traffic immediately (`TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST`) with no candidate canary, hence the runbook in #333. The API service does **not** ignore `env`; its TF env set currently matches `deploy-api*.yml`, but read the plan body for any `env` diff before a prod apply (#285).
- `deletion_protection = true` and no `disk_type` in `sql_instance` — #335 adds both as variables (defaults preserve prod).
- The `cloud-sql-proxy` migration step in `deploy-dev.yml` / `deploy-prod.yml` keys off `*_INSTANCE_CONNECTION_NAME` GitHub secrets — unchanged by every accepted lever (same instance names).

## Appendix — price book used (us-east1, USD, Cloud Billing Catalog, 2026-09-15)

| SKU                                                                | Price                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Cloud SQL for PostgreSQL: Zonal — Micro instance in Americas       | $0.0105 / h                                                                                        |
| … Small instance in Americas                                       | $0.035 / h                                                                                         |
| … vCPU in Americas                                                 | $0.0413 / h                                                                                        |
| … RAM in Americas                                                  | $0.007 / GiB·h                                                                                     |
| … Standard storage (SSD) in Americas                               | $0.17 / GiB·mo                                                                                     |
| … Low cost storage (HDD) in Americas                               | $0.09 / GiB·mo                                                                                     |
| Cloud SQL: Backups in Americas                                     | $0.08 / GiB·mo                                                                                     |
| … IP address reservation in Americas (idle IPv4)                   | $0.01 / h                                                                                          |
| Cloud Run Services CPU / Memory (request-based)                    | $0.000024 / vCPU·s · $0.0000025 / GiB·s                                                            |
| Cloud Run Services Min Instance CPU / Memory (request-based, idle) | $0.0000025 / vCPU·s · $0.0000025 / GiB·s                                                           |
| Cloud Run Services CPU / Memory (instance-based), us-east1         | $0.000018 / vCPU·s · $0.000002 / GiB·s                                                             |
| Cloud Run free tiers (per billing account, monthly)                | request-based 180 k vCPU·s + 360 k GiB·s + 2 M requests; instance-based 240 k vCPU·s + 450 k GiB·s |
| Artifact Registry Storage                                          | $0.10 / GiB·mo after 0.5 GB                                                                        |
| Secret Manager version replica storage                             | $0.06 / version·mo after 6                                                                         |

Measured 30-day Cloud Run usage (Aug 16 – Sep 15 2026, `run.googleapis.com/container/*`):

| Service                          | billable s | vCPU·s | GiB·s     | requests |
| -------------------------------- | ---------- | ------ | --------- | -------- |
| family-recipe-prod (Next, min 1) | 2,590,274  | 5,826  | 1,295,137 | 54,311   |
| family-recipe-api-prod           | 67,406     | 67,440 | 33,703    | 823      |
| recipe-importer-prod             | 2,586      | 2,586  | 1,288     | 3        |
| family-recipe-dev (Next)         | 379        | 379    | 182       | 4,211    |
| family-recipe-api-dev            | 26,812     | 26,824 | 13,362    | 1,458    |
| recipe-importer-dev              | 3,425      | 3,425  | 1,708     | 25       |
