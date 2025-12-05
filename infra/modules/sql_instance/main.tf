resource "google_sql_database_instance" "this" {
  name                 = var.instance_name
  project              = var.project_id
  database_version     = "POSTGRES_15"
  region               = var.region
  deletion_protection  = true

  settings {
    tier              = var.tier
    disk_size         = var.disk_size_gb
    disk_autoresize   = true
    availability_type = "ZONAL"

    ip_configuration {
      ipv4_enabled = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "05:00"
      transaction_log_retention_days = var.backup_retention_days
      point_in_time_recovery_enabled = var.pitr_enabled
    }

    maintenance_window {
      day          = var.maintenance_window_day
      hour         = var.maintenance_window_hour
      update_track = "stable"
    }
  }
}

resource "google_sql_database" "db" {
  name     = var.db_name
  instance = google_sql_database_instance.this.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.this.name
  password = var.db_password

  lifecycle {
    ignore_changes = [password]
  }
}

resource "google_secret_manager_secret" "db_password" {
  count    = var.create_db_password_secret ? 1 : 0
  project  = var.project_id
  secret_id = var.db_password_secret_id

  replication {
    auto {}
  }
}
