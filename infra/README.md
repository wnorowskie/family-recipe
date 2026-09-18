# Infrastructure – GCP Cloud SQL + Cloud Run

This folder contains Terraform config for **dev** and **prod** environments. Structure:

- `envs/dev/` – environment wiring and backend config
- `envs/prod/` – environment wiring and backend config
- `modules/iam/` – service accounts + IAM bindings
- `modules/sql_instance/` – Cloud SQL instance/db/user (+ optional Secret Manager secret)
- `modules/cloud_run_infra/` – Cloud Run baseline service, Artifact Registry, uploads bucket, Secret Manager, and GitHub Actions WIF

## Prereqs (one-time manual)

1. GCP project: `family-recipe-dev` (and/or `family-recipe-prod`)
2. APIs enabled: Cloud SQL Admin, Service Networking, IAM, Secret Manager, Cloud Logging/Monitoring (Cloud Run + VPC Access later if needed).
3. Remote state bucket: `family-recipe-tf-state-<env>` (with versioning).
4. Bootstrap credentials: used my user creds to run the initial apply. Terraform will create:

## How to run Terraform (dev)

```bash
cd infra/envs/dev
export GOOGLE_PROJECT=family-recipe-dev
export TF_VAR_project_id=family-recipe-dev
export TF_VAR_region=us-east1
# Set DB user/password via tfvars or env; do not commit secrets.
# Example: export TF_VAR_db_user=family_app; export TF_VAR_db_password='...'

terraform init \
  -backend-config="bucket=family-recipe-tf-state-dev" \
  -backend-config="prefix=envs/dev/state"

terraform plan
terraform apply
```

## Outputs of interest

- `instance_connection_name` – for Cloud SQL Proxy / Cloud Run connector.
- `public_ip_address` – reachable via proxy or IP allowlist (dev only).
- `database_name`, `database_user` – use with the secret-stored password to build `DATABASE_URL`.
- Service accounts: terraform admin + app SQL client emails.
- Secret Manager: `family-recipe-dev-db-password` (secret only; add a secret version manually to avoid storing the value in Terraform state).

## Connecting (Cloud SQL Auth Proxy)

```bash
cloud-sql-proxy $(terraform output -raw instance_connection_name) --port 5432
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/family_recipe_dev?sslmode=disable"
npx prisma migrate deploy --schema prisma/schema.postgres.prisma --url "$DATABASE_URL"
PRISMA_SCHEMA=prisma/schema.postgres.prisma \
FAMILY_NAME="Family Recipe" FAMILY_MASTER_KEY="actual-master-key" \
npm run db:seed
```

## Applying to prod

Prod is never applied by CI. `infra-apply.yml`'s `workflow_dispatch` only plans/applies `infra/envs/dev` — a prod apply is always a `terraform apply` run locally by the repo owner, from `infra/envs/prod`, after the release's deploy workflows (`deploy-prod.yml` and, if touched, the importer's) have already gone green.

```bash
cd infra/envs/prod
export GOOGLE_PROJECT=family-recipe-prod
export TF_VAR_project_id=family-recipe-prod
export TF_VAR_region=us-east1
# TF_VAR_db_password etc. from local tfvars, not committed.

terraform init \
  -backend-config="bucket=family-recipe-tf-state-prod" \
  -backend-config="prefix=envs/prod/state"

terraform plan
terraform apply
```

Read the plan body before applying, not just the add/change/destroy summary — a prod `terraform apply` has twice shipped a benign-looking `0 add, 4 change, 0 destroy` plan that actually stripped workflow-managed `API_INTERNAL_*` env vars from the live Next service (fixed by #285, guarded by the `ignore_changes` block below).

### If the apply 409s on a Cloud Run service

Any apply that changes a Cloud Run service's `template` (scaling, CPU, resources, ports…) while state already carries a live revision name for that service — from a recent `gcloud run deploy`, or from a prior `terraform apply` — can fail partway through with:

```
Error 409: Revision named '<service>-000NN-xxx' with different configuration already exists.
```

Cause: `cloud_run_infra`, `cloud_run_api`, and `cloud_run_importer` all carry `template[0].revision` in `lifecycle.ignore_changes` (#285) so Terraform doesn't fight the revision name `gcloud run deploy` stamps on every deploy. `ignore_changes` pins the _state_ value at whatever a refresh last saw live — so the next plan that touches the same service's template resends that exact (already-used) revision name alongside the new template, and Cloud Run refuses to redefine an immutable revision under that name.

**#345 investigated dropping the ignore permanently and ruled it out.** `revision` is Optional but not Computed in the provider schema, so an unset config value diffs against it on every plan, and the provider's Update PATCHes the whole `template` object with no field mask. Confirmed live on dev (2026-09-17): applying with the ignore removed and nothing else changed still spun a brand-new revision (`family-recipe-dev-00300-dak` → `family-recipe-dev-00185-n8q`, identical image digest) — not the no-op the field's docs implied. That trades one problem for a worse one (a revision on every single apply, forever), so the ignore stays, and the manual per-apply workaround below is the sanctioned process until upstream fixes [hashicorp/terraform-provider-google#14569](https://github.com/hashicorp/terraform-provider-google/issues/14569).

This halts a full-env apply partway through and leaves everything after the failed resource in the graph unapplied — for prod, that includes the budget, dashboard, and (via `depends_on = [module.cloud_run_infra]`) the API and importer modules. Retry with the workaround below rather than assuming a partial apply is safe to leave as-is.

Workaround, one apply at a time:

1. In all three files — `infra/modules/cloud_run_infra/main.tf`, `infra/modules/cloud_run_api/main.tf`, `infra/modules/cloud_run_importer/main.tf` — comment out the `template[0].revision,` line inside `lifecycle.ignore_changes` (leave the rest of the block alone).
2. Re-plan. The affected service(s) should now show `- revision = "<live-revision-name>" -> null` in the `template` block, on top of whatever real change you were applying — nothing else should move. If `env`, `image`, or `scaling` also show up as diffs here, stop and investigate before applying; that's not this issue.
3. Apply. Expect it to create one extra revision beyond the change you intended (see the #345 finding above) — that's the accepted cost of doing this per-apply rather than permanently.
4. Restore the three files: `git checkout -- infra/modules` (uncommitted local edit only — never commit the comment-out).
5. Re-run `terraform plan`; it should come back clean (aside from the known cosmetic drift noted below).

Terraform-created revisions use a separate generation counter from `gcloud run deploy`'s — e.g. prod Next went from `family-recipe-prod-00020-xec` (last `gcloud run deploy`) to `family-recipe-prod-00016-bzp` (next `terraform apply`) even though the latter came second. Don't read Cloud Run revision numbers as a chronological timeline once both tools have touched a service; use `gcloud run revisions list --service=<service> --sort-by=~createTime` instead.

## Billing budget

`infra/envs/prod/billing.tf` defines a single `google_billing_budget` covering both dev and prod project spend ($50/mo, alerts at 50/90/100% actual + 100% forecast, notifying the same channel as the monitoring alerts). It's declared in the prod env because prod is the "real" environment, even though `google_billing_budget` is account-scoped, not project-scoped — dev's Terraform doesn't touch it.

The Cloud Billing Budget API bills its quota to whichever project you pass as the request's quota project, and the default `google` provider has no such override — applying with it 403s. `billing.tf` declares a second, aliased `google` provider with `billing_project = var.project_id` and `user_project_override = true` for this one resource. Run `gcloud services enable billingbudgets.googleapis.com --project family-recipe-prod` once before the first apply (or in an ADC-less CI context, if that's ever wired up).

`google_billing_budget.monthly` references `module.monitoring.notification_channel_id` for its alert channel, and the `monitoring` module block has `depends_on = [module.cloud_run_infra]` — so a plan scoped with `terraform plan -target=google_billing_budget.monthly` will also surface any undeployed drift on `module.cloud_run_infra`'s resources (Cloud Run service, Artifact Registry repo), not just the budget. That's expected, not a bug in this config: apply the budget as part of a full-env apply (which reconciles that drift too) rather than trying to isolate it with `-target`, or you'll either apply more than you intended or have to fight the dependency graph.

## Notes

- Backups: enabled, 7-day retention; maintenance window: Sunday 05:00 UTC.
- Public IP only for now (simpler for local/Vercel). Private IP + VPC connector can be added later if moving to Cloud Run.
- Secrets (DB password, optional family master key) should live in Secret Manager or local tfvars (not committed). I initially had to create a place holder in local tfvars, and then I updated the secret value manually in Secret Manager to avoid storing it in Terraform state. Now it is set to be ignored so that any future changes won't be stored in state.
- Cosmetic drift: `terraform plan` on either env routinely shows `module.monitoring.google_monitoring_dashboard.main` as changed (an `etag` and per-tile `targetAxis`/`xPos` reshuffle the API adds on read, not anything this config declares) plus, until each env's cleanup-policy apply has actually run, the two Artifact Registry repos' `cleanup_policy_dry_run`. Neither reflects real drift; don't chase either to a "clean" plan.
