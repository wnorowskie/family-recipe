variable "project_id" {
  description = "GCP project ID for dev"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-east1"
}

variable "state_bucket_name" {
  description = "GCS bucket for Terraform state"
  type        = string
  default     = "family-recipe-tf-state-dev"
}

variable "terraform_admin_sa_id" {
  description = "Service account ID for Terraform admin"
  type        = string
  default     = "terraform-admin"
}

variable "app_sql_client_sa_id" {
  description = "Service account ID for app Cloud SQL client"
  type        = string
  default     = "app-sql-client"
}

variable "db_instance_name" {
  description = "Cloud SQL instance name"
  type        = string
  default     = "family-recipe-dev"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "family_recipe_dev"
}

variable "db_user" {
  description = "Application database user"
  type        = string
  default     = "family_app"
}

variable "db_password" {
  description = "Application database password (sensitive)"
  type        = string
  sensitive   = true
}

variable "db_password_secret_id" {
  description = "Secret Manager secret ID for DB password (secret resource only; add versions manually)"
  type        = string
  default     = "family-recipe-dev-db-password"
}

variable "tier" {
  description = "Machine tier for Cloud SQL"
  type        = string
  default     = "db-custom-1-3840"
}

variable "disk_size_gb" {
  description = "Disk size in GB"
  type        = number
  default     = 20
}

variable "backup_retention_days" {
  description = "Automated backup retention (days)"
  type        = number
  default     = 7
}

variable "maintenance_window_day" {
  description = "Maintenance window day (0 = Sunday, 1 = Monday, ...)"
  type        = number
  default     = 7
}

variable "maintenance_window_hour" {
  description = "Maintenance window hour (0-23, UTC)"
  type        = number
  default     = 5
}

variable "pitr_enabled" {
  description = "Enable point-in-time recovery (PITR)"
  type        = bool
  default     = false
}

variable "create_db_password_secret" {
  description = "Create Secret Manager secret for DB password (no version)"
  type        = bool
  default     = true
}

variable "grant_secret_accessor_to_app" {
  description = "Grant Secret Manager Secret Accessor to app SQL client SA for specified secrets"
  type        = bool
  default     = false
}
