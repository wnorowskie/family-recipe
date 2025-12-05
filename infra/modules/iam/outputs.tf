output "terraform_admin_sa_email" {
  value = google_service_account.terraform_admin.email
}

output "app_sql_client_sa_email" {
  value = google_service_account.app_sql_client.email
}
