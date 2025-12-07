resource "google_service_account" "runtime" {
  account_id   = var.runtime_sa_id
  display_name = "Family Recipe Cloud Run runtime"
  project      = var.project_id
}

resource "google_service_account" "deployer" {
  account_id   = var.deployer_sa_id
  display_name = "Family Recipe deployer (GitHub Actions)"
  project      = var.project_id
}

locals {
  runtime_roles = [
    "roles/iam.serviceAccountTokenCreator",
    "roles/cloudsql.client",
    "roles/storage.objectAdmin",
    "roles/secretmanager.secretAccessor",
  ]

  deployer_roles = [
    "roles/artifactregistry.writer",
    "roles/run.admin",
    "roles/secretmanager.secretAccessor",
  ]
}

resource "google_project_iam_member" "runtime_role_bindings" {
  for_each = toset(local.runtime_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "deployer_role_bindings" {
  for_each = toset(local.deployer_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_impersonates_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = var.wif_pool_id
  project                   = var.project_id
  display_name              = "GitHub Actions Pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.wif_provider_id
  display_name                       = "GitHub Actions Provider"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"         = "assertion.sub"
    "attribute.repository"   = "assertion.repository"
    "attribute.ref"          = "assertion.ref"
    "attribute.aud"          = "assertion.aud"
  }

  attribute_condition = <<-EOT
    assertion.repository == "${var.github_repository}" &&
    assertion.ref == "${var.github_ref}"
  EOT
}

resource "google_service_account_iam_member" "wif_to_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo_id
  description   = "Family Recipe app images"
  format        = "DOCKER"
}

resource "google_storage_bucket" "uploads" {
  name                        = var.uploads_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  project                     = var.project_id
  force_destroy               = false
  public_access_prevention    = "enforced"
  versioning {
    enabled = false
  }
}

locals {
  managed_secret_ids = concat(
    [
      var.database_url_secret_id,
      var.jwt_secret_id,
    ],
    var.family_master_key_secret_id == "" ? [] : [var.family_master_key_secret_id],
  )
}

resource "google_secret_manager_secret" "secrets" {
  for_each = toset(local.managed_secret_ids)

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_secret_access" {
  for_each = google_secret_manager_secret.secrets

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "deployer_secret_access" {
  for_each = google_secret_manager_secret.secrets

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

# Baseline Cloud Run service (hello world image) to establish service and IAM; will be updated by CI/CD deploys.
resource "google_cloud_run_v2_service" "app" {
  name     = var.cloud_run_service_name
  location = var.region
  project  = var.project_id
  # Private ingress via internal load balancer only.
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.runtime.email

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 8080
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}
