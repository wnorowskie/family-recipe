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

## Notes

- Backups: enabled, 7-day retention; maintenance window: Sunday 05:00 UTC.
- Public IP only for now (simpler for local/Vercel). Private IP + VPC connector can be added later if moving to Cloud Run.
- Secrets (DB password, optional family master key) should live in Secret Manager or local tfvars (not committed). I initially had to create a place holder in local tfvars, and then I updated the secret value manually in Secret Manager to avoid storing it in Terraform state. Now it is set to be ignored so that any future changes won't be stored in state.
