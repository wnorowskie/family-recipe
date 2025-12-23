output "instance_connection_name" {
  value = module.sql_instance.instance_connection_name
}

output "public_ip_address" {
  value = module.sql_instance.public_ip_address
}

output "database_name" {
  value = module.sql_instance.database_name
}

output "database_user" {
  value = module.sql_instance.database_user
}

output "terraform_admin_sa_email" {
  value = module.iam.terraform_admin_sa_email
}

output "app_sql_client_sa_email" {
  value = module.iam.app_sql_client_sa_email
}

output "runtime_service_account_email" {
  value = module.cloud_run_infra.runtime_service_account_email
}

output "deployer_service_account_email" {
  value = module.cloud_run_infra.deployer_service_account_email
}

output "artifact_registry_repository" {
  value = module.cloud_run_infra.artifact_registry_repository
}

output "uploads_bucket_name" {
  value = module.cloud_run_infra.uploads_bucket_name
}

output "cloud_run_service_name" {
  value = module.cloud_run_infra.cloud_run_service_name
}

output "cloud_run_service_uri" {
  value = module.cloud_run_infra.cloud_run_service_uri
}

output "wif_pool_name" {
  value = module.cloud_run_infra.wif_pool_name
}

output "wif_provider_name" {
  value = module.cloud_run_infra.wif_provider_name
}

# Monitoring outputs
output "monitoring_dashboard_id" {
  value = module.monitoring.dashboard_id
}

output "monitoring_notification_channel_id" {
  value = module.monitoring.notification_channel_id
}

output "monitoring_uptime_check_id" {
  value = module.monitoring.uptime_check_id
}

# Recipe URL Importer outputs
output "importer_service_name" {
  value = module.cloud_run_importer.service_name
}

output "importer_service_uri" {
  value = module.cloud_run_importer.service_uri
}

output "importer_artifact_registry_repository" {
  value = module.cloud_run_importer.artifact_registry_repository_id
}
