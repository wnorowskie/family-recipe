resource "google_service_account" "terraform_admin" {
  account_id   = var.terraform_admin_sa_id
  display_name = "Terraform admin"
  project      = var.project_id
}

resource "google_service_account" "app_sql_client" {
  account_id   = var.app_sql_client_sa_id
  display_name = "App Cloud SQL client"
  project      = var.project_id
}

locals {
  terraform_admin_roles = [
    "roles/cloudsql.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/secretmanager.admin",
  ]
}

resource "google_project_iam_member" "terraform_admin_roles" {
  for_each = toset(local.terraform_admin_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform_admin.email}"
}

resource "google_project_iam_member" "app_sql_client_roles" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app_sql_client.email}"
}

resource "google_storage_bucket_iam_member" "terraform_state_admin" {
  count  = var.state_bucket_name != "" ? 1 : 0
  bucket = var.state_bucket_name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.terraform_admin.email}"
}

resource "google_secret_manager_secret_iam_member" "app_secret_accessor" {
  for_each = var.grant_secret_accessor_to_app ? toset(var.secret_ids_for_app) : []

  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_sql_client.email}"
}
