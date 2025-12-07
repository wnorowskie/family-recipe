output "runtime_service_account_email" {
  value = google_service_account.runtime.email
}

output "deployer_service_account_email" {
  value = google_service_account.deployer.email
}

output "artifact_registry_repository" {
  value = google_artifact_registry_repository.app.name
}

output "artifact_registry_repository_id" {
  value = google_artifact_registry_repository.app.repository_id
}

output "uploads_bucket_name" {
  value = google_storage_bucket.uploads.name
}

output "cloud_run_service_name" {
  value = google_cloud_run_v2_service.app.name
}

output "cloud_run_service_uri" {
  value = google_cloud_run_v2_service.app.uri
}

output "wif_pool_name" {
  value = google_iam_workload_identity_pool.github.name
}

output "wif_provider_name" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "managed_secret_ids" {
  value = local.managed_secret_ids
}
