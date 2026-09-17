# Artifact Registry repository for recipe-importer images
resource "google_artifact_registry_repository" "importer" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo_id
  description   = "Recipe URL Importer service images"
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

# Cloud Run service for Recipe URL Importer
resource "google_cloud_run_v2_service" "importer" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

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

      env {
        name  = "IMPORTER_MAX_HTML_BYTES"
        value = tostring(var.max_html_bytes)
      }

      env {
        name  = "IMPORTER_ENABLE_HEADLESS"
        value = tostring(var.enable_headless)
      }

      env {
        name  = "IMPORTER_CACHE_TTL_SECONDS"
        value = tostring(var.cache_ttl_seconds)
      }

      env {
        name  = "IMPORTER_FETCH_TIMEOUT_SECONDS"
        value = tostring(var.fetch_timeout_seconds)
      }

      env {
        name  = "IMPORTER_CONNECT_TIMEOUT_SECONDS"
        value = tostring(var.connect_timeout_seconds)
      }

      env {
        name  = "IMPORTER_READ_TIMEOUT_SECONDS"
        value = tostring(var.read_timeout_seconds)
      }

      env {
        name  = "IMPORTER_RATE_LIMIT_IP_PER_MIN"
        value = tostring(var.rate_limit_ip_per_min)
      }

      env {
        name  = "IMPORTER_RATE_LIMIT_DOMAIN_PER_MIN"
        value = tostring(var.rate_limit_domain_per_min)
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
        # Request-based billing: no post-response work happens after the
        # importer responds. See #333.
        cpu_idle = true
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# IAM: Require authentication (no unauthenticated access)
# This is achieved by NOT granting roles/run.invoker to allUsers.
# Only principals with roles/run.invoker can invoke the service.

resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.importer.name
  role     = "roles/run.invoker"
  member   = each.value
}
