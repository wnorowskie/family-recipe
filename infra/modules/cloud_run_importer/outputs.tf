output "service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.importer.name
}

output "service_uri" {
  description = "Cloud Run service URI"
  value       = google_cloud_run_v2_service.importer.uri
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository name"
  value       = google_artifact_registry_repository.importer.name
}

output "artifact_registry_repository_id" {
  description = "Artifact Registry repository ID"
  value       = google_artifact_registry_repository.importer.repository_id
}
