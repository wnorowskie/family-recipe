# Artifact Registry repository for FastAPI service images
resource "google_artifact_registry_repository" "api" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo_id
  description   = "FastAPI backend service images"
  format        = "DOCKER"

  cleanup_policy_dry_run = var.cleanup_policy_dry_run
  cleanup_policies {
    id     = "keep-3-most-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }
  cleanup_policies {
    id     = "delete-older-than-30d"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "2592000s"
    }
  }
}

# Cloud Run service for the FastAPI backend (apps/api).
#
# Deliberately IAM-private (no allUsers invoker) — the browser never calls this
# service directly. Next forwards /v1/* to it server-to-server with a Google ID
# token, so the only invoker is the shared runtime service account. Keeping the
# browser on the Next origin is what makes the deployment work without a custom
# domain: `run.app` is on the Public Suffix List, so two run.app hosts can never
# share a cookie. See docs/research/fastapi-cookie-domain-stack0.md and #241.
resource "google_cloud_run_v2_service" "api" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  # INGRESS_TRAFFIC_ALL + IAM auth, mirroring cloud_run_importer. Cloud Run to
  # Cloud Run egress leaves the VPC by default, so internal-only ingress would
  # require a connector for no security gain over the IAM check.
  ingress = "INGRESS_TRAFFIC_ALL"

  lifecycle {
    # `template[0].revision` is deliberately NOT ignored here (it was from
    # #285 to 2026-09, see git blame). `revision` is Optional but not
    # Computed in the provider schema, and Update PATCHes the whole
    # `template` object with no field mask — so ignoring it meant every
    # apply resent whatever revision name a refresh last saw live, and any
    # apply that also changed another template field 409'd trying to
    # redefine that (already-created, immutable) revision under a new spec.
    # Leaving it out of config lets Cloud Run auto-assign a fresh name
    # whenever the effective template actually differs, at the cost of a
    # perpetual harmless `revision -> null` line in every plan (nothing to
    # chase — same class as the dashboard/AR drift noted in
    # infra/README.md). See #345.
    ignore_changes = [
      # CI/CD updates the image; keep Terraform from rolling it back.
      template[0].containers[0].image,
      # `gcloud run deploy` stamps these on every deploy; TF doesn't model
      # them in config, so without this it would try to clear them on
      # every plan only for the next deploy to write them back. See #89.
      client,
      client_version,
      # A top-level `scaling` block (manual_instance_count/min/max) the
      # provider now surfaces as live drift alongside the `template.scaling`
      # block this module actually declares; not something TF ever set. See #285.
      scaling,
    ]
  }

  template {
    service_account = var.runtime_service_account_email

    scaling {
      min_instance_count = var.min_instance_count
      max_instance_count = var.max_instance_count
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 8000
      }

      # Gates `secure` on the refresh/csrf cookies (apps/api/src/cookies.py) and
      # turns on the fail-fast config validation in settings.validate_settings.
      # Dev serves over HTTPS too, so dev also runs with "production" here.
      env {
        name  = "ENVIRONMENT"
        value = var.api_environment
      }

      env {
        name  = "UPLOADS_BUCKET"
        value = var.uploads_bucket_name
      }

      # Empty by design. The browser reaches FastAPI only through the Next
      # origin, so no cross-origin XHR exists and the CORS middleware in
      # apps/api/src/main.py stays uninstalled.
      env {
        name  = "CORS_ALLOW_ORIGINS"
        value = var.cors_allow_origins
      }

      # Number of trusted proxies appending to X-Forwarded-For. _client_ip
      # (apps/api/src/routers/v1/auth.py) resolves the client as the Nth entry
      # from the right; everything to the left is client-supplied and untrusted
      # (issue #246).
      env {
        name  = "TRUSTED_PROXY_HOPS"
        value = tostring(var.trusted_proxy_hops)
      }

      env {
        name = "DATABASE_URL"

        value_source {
          secret_key_ref {
            secret  = var.database_url_secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"

        value_source {
          secret_key_ref {
            secret  = var.jwt_secret_id
            version = "latest"
          }
        }
      }

      # Required whenever ENVIRONMENT=production (settings.validate_settings).
      env {
        name = "REFRESH_PEPPER"

        value_source {
          secret_key_ref {
            secret  = var.refresh_pepper_secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = var.family_master_key_secret_id != "" ? [1] : []
        content {
          name = "FAMILY_MASTER_KEY"

          value_source {
            secret_key_ref {
              secret  = var.family_master_key_secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.recipe_importer_url != "" ? [1] : []
        content {
          name  = "RECIPE_IMPORTER_URL"
          value = var.recipe_importer_url
        }
      }

      dynamic "env" {
        for_each = var.recipe_importer_url != "" ? [1] : []
        content {
          name  = "RECIPE_IMPORTER_AUDIENCE"
          value = var.recipe_importer_audience != "" ? var.recipe_importer_audience : var.recipe_importer_url
        }
      }

      dynamic "env" {
        for_each = var.recipe_importer_service_account_email != "" ? [1] : []
        content {
          name  = "RECIPE_IMPORTER_SERVICE_ACCOUNT_EMAIL"
          value = var.recipe_importer_service_account_email
        }
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        # Request-based billing: FastAPI has no post-response work
        # (no BackgroundTasks, no scheduled jobs), so CPU need not stay
        # allocated between requests. See #333.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    dynamic "volumes" {
      for_each = length(var.cloud_sql_instances) > 0 ? [1] : []
      content {
        name = "cloudsql"

        cloud_sql_instance {
          instances = var.cloud_sql_instances
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# IAM: no allUsers binding. Only the listed members (the Next runtime SA, and
# the deployer SA for smoke checks) may invoke this service.
resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = each.value
}
