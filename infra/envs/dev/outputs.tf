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
