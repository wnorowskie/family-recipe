#tfsec:ignore:google-sql-enable-public-ip # Public IP allowed for dev; will tighten in prod/private rollout
#tfsec:ignore:google-sql-encrypt-data-in-transit # Postgres requires client-side SSL; tracked via runtime configuration
resource "google_sql_database_instance" "this" {
  name                = var.instance_name
  project             = var.project_id
  database_version    = "POSTGRES_15"
  region              = var.region
  deletion_protection = true

  settings {
    tier              = var.tier
    disk_size         = var.disk_size_gb
    disk_autoresize   = true
    availability_type = "ZONAL"
    activation_policy = var.activation_policy

    ip_configuration {
      ipv4_enabled = var.enable_public_ip
      ssl_mode     = var.ssl_mode

      dynamic "authorized_networks" {
        for_each = toset(var.authorized_networks)
        content {
          name  = "allowed-${replace(authorized_networks.value, "/", "-")}"
          value = authorized_networks.value
        }
      }
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
  count     = var.create_db_password_secret ? 1 : 0
  project   = var.project_id
  secret_id = var.db_password_secret_id

  replication {
    auto {}
  }
}
