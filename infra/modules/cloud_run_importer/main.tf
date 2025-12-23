# Artifact Registry repository for recipe-importer images
resource "google_artifact_registry_repository" "importer" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo_id
  description   = "Recipe URL Importer service images"
  format        = "DOCKER"
}

# Cloud Run service for Recipe URL Importer
resource "google_cloud_run_v2_service" "importer" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  lifecycle {
    ignore_changes = [
      # CI/CD updates the image; keep Terraform from rolling it back.
      template[0].containers[0].image,
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
        name  = "IMPORTER_SERVICE_NAME"
        value = var.service_name
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
