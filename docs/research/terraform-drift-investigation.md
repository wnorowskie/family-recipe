# Terraform Drift Investigation — Dev Environment

Explains the three pre-existing drift items that surfaced on `terraform plan` while scoping the [#71](https://github.com/wnorowskie/family-recipe/issues/71) infra change. Spike ticket: [#89](https://github.com/wnorowskie/family-recipe/issues/89).

## Decision (TL;DR)

All three drifts are benign but worth fixing so future plans are silent:

1. **`IMPORTER_SERVICE_NAME`** — declared in TF but has never actually reached the running importer service. Resolved in [#110](https://github.com/wnorowskie/family-recipe/issues/110) by deleting the env block from TF — the variable turned out to be functionally unused (Pydantic default is fine). Follow-up [#125](https://github.com/wnorowskie/family-recipe/issues/125) tracks removing the matching dead env-var coupling on the Python side.
2. **`client` / `client_version`** — written by `gcloud run deploy` on every deploy; TF doesn't model these attributes so it keeps trying to clear them. Add both to `lifecycle.ignore_changes` on every `google_cloud_run_v2_service` resource. This is expected, not a sign of out-of-band manual edits.
3. **Monitoring-dashboard diff** — caused by provider-version drift (dev has `google` 7.14.1, prod has 7.12.0; neither is pinned and `.terraform.lock.hcl` is gitignored). Pin the provider, commit the lock files, apply once to normalize state. No TF code change to the dashboard JSON is required.

## Context

Terraform has never been applied via CI — the `infra-apply.yml` workflow (manual `workflow_dispatch`) has **zero runs** in Actions history. Every previous `terraform apply` on dev was a local run by the owner. Ongoing mutations to the Cloud Run services come from `deploy-dev.yml`, `deploy-prod.yml`, and `deploy-recipe-url-importer.yml`, all of which use `gcloud run deploy` rather than Terraform.

That background matters for each of the findings below.

---

## Q1: Was `IMPORTER_SERVICE_NAME` ever applied to dev?

**No.** The env var is declared in [infra/modules/cloud_run_importer/main.tf:49-52](../../infra/modules/cloud_run_importer/main.tf#L49-L52) and has been since the importer module was introduced in [PR #22](https://github.com/wnorowskie/family-recipe/pull/22) (commit `502961c`, 2025-12-23). However:

- `infra-apply.yml` has never run, so TF has never propagated it via CI.
- The only thing that mutates the importer Cloud Run service in practice is [`.github/workflows/deploy-recipe-url-importer.yml`](../../.github/workflows/deploy-recipe-url-importer.yml), which uses `gcloud run deploy --set-env-vars=...` — a **full replacement** of the env-var list on every deploy. `IMPORTER_SERVICE_NAME` is not in that list, so any value TF might once have set would be overwritten on the next deploy to `develop`.

### Is the importer safe when it's unset?

Yes. Config is loaded via Pydantic `BaseSettings` with `env_prefix="IMPORTER_"` ([apps/recipe-url-importer/src/recipe_url_importer/config.py:14-16](../../apps/recipe-url-importer/src/recipe_url_importer/config.py#L14-L16)):

```python
model_config = SettingsConfigDict(env_prefix="IMPORTER_", case_sensitive=False)
service_name: str = Field(default="recipe-url-importer")
```

Impact of absence is cosmetic only: the `/health` endpoint and structured error payloads report `"service": "recipe-url-importer"` instead of the env-specific name (e.g. `recipe-importer-dev`).

### Resolution ([#110](https://github.com/wnorowskie/family-recipe/issues/110))

Delete the `IMPORTER_SERVICE_NAME` env block from [infra/modules/cloud_run_importer/main.tf](../../infra/modules/cloud_run_importer/main.tf). The variable turned out to be unused in any functional sense — it only appears as an observability label in two structured log fields and in the `/version` response body. Cloud Run already tags every log with the service name via its own metadata, and `/version` has no downstream consumers (no Next.js code, no scripts, no tests assert on it). The Pydantic default `"recipe-url-importer"` has been what the running service has emitted for its entire life, and nothing noticed.

Kept the default in [apps/recipe-url-importer/src/recipe_url_importer/config.py](../../apps/recipe-url-importer/src/recipe_url_importer/config.py) so [SPEC.md's `/version` contract](../../apps/recipe-url-importer/SPEC.md) stays accurate without further change. [#125](https://github.com/wnorowskie/family-recipe/issues/125) tracks removing the now-dead env-var coupling (Pydantic still auto-maps `IMPORTER_SERVICE_NAME` → `settings.service_name` via the class prefix, even though nothing sets it). Kept the `--set-env-vars` call in both importer deploy workflows — the remaining 8 TF env blocks now exactly match the 8 keys in the workflow, so `terraform plan` will be silent on env (no active divergence). Reconciling the broader TF-vs-gcloud split-brain across all Cloud Run env vars is left as a separate follow-up; per-env-var drift with matching lists is the same benign status quo as [deploy-dev.yml](../../.github/workflows/deploy-dev.yml) + [cloud_run_infra/main.tf](../../infra/modules/cloud_run_infra/main.tf).

---

## Q2: Why do `client = "gcloud"` and `client_version = "564.0.0"` appear in state?

**Because `gcloud run deploy` writes them on every deploy.** Each deploy workflow — [deploy-dev.yml:142-154](../../.github/workflows/deploy-dev.yml#L142-L154), [deploy-prod.yml](../../.github/workflows/deploy-prod.yml), and [deploy-recipe-url-importer.yml:70-80](../../.github/workflows/deploy-recipe-url-importer.yml#L70-L80) — uses `gcloud run deploy`, which stamps the service metadata with the client identifier ("gcloud") and the CLI version that ran the deploy.

`564.0.0` is the gcloud SDK version shipped by the Actions runner at the time the last deploy executed (via `google-github-actions/setup-gcloud@v2`). It will tick upward over time as that action's underlying version bumps.

These attributes are not modeled in the Terraform config for `google_cloud_run_v2_service`, so on every plan TF reads them out of state, sees they're not in the configuration, and proposes to clear them. The next deploy writes them back — an infinite drift loop. **No out-of-band manual `gcloud` usage is implied by this diff**; it's the expected interaction between Terraform-managed services and CI/CD-driven image updates on Cloud Run.

### Recommendation

Add both attributes to `lifecycle.ignore_changes` on every Terraform-managed Cloud Run service. Concretely:

```hcl
# infra/modules/cloud_run_infra/main.tf (app service, ~line 168)
# infra/modules/cloud_run_importer/main.tf (importer service, ~line 17)
lifecycle {
  ignore_changes = [
    # CI/CD updates the image; keep Terraform from rolling it back.
    template[0].containers[0].image,
    # gcloud run deploy stamps these on every deploy.
    client,
    client_version,
  ]
}
```

After applying once per env, these fields stop appearing in future plans.

---

## Q3: Is the monitoring dashboard diff a provider change or a UI edit?

**Provider-version serialization.** Check the lock files:

| Env  | `hashicorp/google` version | Lock file last written |
| ---- | -------------------------- | ---------------------- |
| dev  | `7.14.1`                   | 2025-12-23             |
| prod | `7.12.0`                   | 2025-12-17             |

Both `infra/envs/dev/main.tf` and `infra/envs/prod/main.tf` declare `version = ">= 5.0"` (unconstrained) in `required_providers`, and `.gitignore` excludes `**/.terraform.lock.hcl` — so every `terraform init` pulls whatever version matches `>= 5.0` at that moment. Dev was re-initialized later than prod and ended up on a newer minor.

The specific diff shape — adding `xPos = 0` / `yPos = 0` to tiles that happened to start in the origin, removing `targetAxis = "Y1"` defaults, and clearing computed `etag` / `name` — is the classic signature of the `google_monitoring_dashboard` resource renormalizing its JSON between minor provider versions. The TF source in [infra/modules/monitoring/main.tf:433-784](../../infra/modules/monitoring/main.tf#L433-L784) already sets `xPos = 0` / `yPos = 0` explicitly for the tiles where the diff appears, so this is not a missing field in config — it's state catching up to how the newer provider serializes the same JSON.

Prod almost certainly does **not** currently show this exact diff (it's on the older 7.12.0 provider where the previous serialization already matches state). But prod is one `terraform init` away from the same situation, because its lock file isn't committed either.

### Recommendation

Treat this as a toolchain-hygiene fix, not a dashboard fix:

1. **Remove `**/.terraform.lock.hcl`from [.gitignore](../../.gitignore)** and commit both lock files. This is Terraform's documented best practice — the lock file is meant to be tracked so`terraform init` is reproducible across machines and CI.
2. **Pin the provider** in both `infra/envs/dev/main.tf` and `infra/envs/prod/main.tf`:
   ```hcl
   required_providers {
     google = {
       source  = "hashicorp/google"
       version = "~> 7.14"  # or whichever major you want to standardize on
     }
   }
   ```
   Pinning to the same minor across envs means dashboard JSON normalizes identically.
3. **Apply once per env** to materialize the new state. Future plans on unchanged code will be noise-free.
4. **No change to the dashboard JSON itself.** The diff is a serialization artifact; absorbing it into the #71 apply is harmless.

Alternatives considered:

- _Manually rewrite the dashboard JSON to match the 7.14.1 output and ignore_changes on the content_ — rejected. Masks the provider upgrade rather than pinning it; the same drift will resurface on the next provider bump.
- _Move dashboards out of Terraform entirely_ — rejected. The ticket's goal is "future plans are noise-free," not "Terraform owns less." Dashboards as IaC are valuable for reproducibility across envs.

---

## Action items (in priority order)

- [x] Add `client` and `client_version` to `ignore_changes` on both Cloud Run service modules (Q2). _Bundled into this PR — zero-risk, eliminates the biggest recurring drift source on every plan._
- [x] Un-gitignore `**/.terraform.lock.hcl`, commit both lock files, and pin the `google` provider to `~> 7.12` in both envs (Q3). _Bundled into this PR. Apply once per env to materialize the new state._
- [x] Resolve `IMPORTER_SERVICE_NAME` drift (Q1). [#110](https://github.com/wnorowskie/family-recipe/issues/110) deleted the unused env block from the importer TF module rather than reconcile ownership of the full env list; the other 8 TF env blocks match the workflow's `--set-env-vars` so `terraform plan` is silent on importer env. Reconciling TF-vs-gcloud env ownership across all Cloud Run services remains a potential follow-up.
- [ ] After #71 and the follow-up above land, run `terraform plan` on dev and prod with no code changes; confirm either zero diffs or explainable diffs only. If anything else appears, file a follow-up.
