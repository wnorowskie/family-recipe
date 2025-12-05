output "instance_connection_name" {
  value = google_sql_database_instance.this.connection_name
}

output "public_ip_address" {
  value = google_sql_database_instance.this.public_ip_address
}

output "database_name" {
  value = google_sql_database.db.name
}

output "database_user" {
  value = google_sql_user.app.name
}
