variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "instance_name" {
  description = "Cloud SQL instance name"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_user" {
  description = "Database user"
  type        = string
}

variable "db_password" {
  description = "Database password (sensitive)"
  type        = string
  sensitive   = true
}

variable "db_password_secret_id" {
  description = "Secret Manager secret ID for DB password (secret only; add versions manually)"
  type        = string
  default     = "family-recipe-dev-db-password"
}

variable "create_db_password_secret" {
  description = "Create Secret Manager secret for DB password (no version)"
  type        = bool
  default     = true
}

variable "tier" {
  description = "Machine tier for Cloud SQL"
  type        = string
}

variable "disk_size_gb" {
  description = "Disk size in GB"
  type        = number
}

variable "backup_retention_days" {
  description = "Automated backup retention (days)"
  type        = number
}

variable "maintenance_window_day" {
  description = "Maintenance window day (0 = Sunday, 1 = Monday, ...)"
  type        = number
}

variable "maintenance_window_hour" {
  description = "Maintenance window hour (0-23, UTC)"
  type        = number
}

variable "pitr_enabled" {
  description = "Enable point-in-time recovery (PITR)"
  type        = bool
  default     = false
}
