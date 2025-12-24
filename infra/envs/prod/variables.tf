variable "project_id" {
  description = "GCP project ID for prod"
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
  default     = "family-recipe-tf-state-prod"
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
  default     = "family-recipe-prod"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "family_recipe_prod"
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
  default     = "family-recipe-prod-db-password"
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
  default     = 14
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
  default     = true
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

variable "enable_public_ip" {
  description = "Whether to allocate a public IPv4 address for the instance (prod should generally set false)"
  type        = bool
  default     = false
}

variable "authorized_networks" {
  description = "Optional list of authorized CIDR blocks for public access"
  type        = list(string)
  default     = []
}

variable "ssl_mode" {
  description = "SSL mode for Cloud SQL (e.g., ENCRYPTED_ONLY, ALLOW_UNENCRYPTED_AND_ENCRYPTED)"
  type        = string
  default     = "ENCRYPTED_ONLY"
}

variable "runtime_sa_id" {
  description = "Service account ID for Cloud Run runtime"
  type        = string
  default     = "family-recipe-runner"
}

variable "deployer_sa_id" {
  description = "Service account ID for GitHub Actions deployer"
  type        = string
  default     = "family-recipe-deployer"
}

variable "artifact_registry_repo_id" {
  description = "Artifact Registry repository ID for app images"
  type        = string
  default     = "family-recipe-prod"
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "family-recipe-prod"
}

variable "min_instance_count" {
  description = "Minimum number of Cloud Run instances to keep warm"
  type        = number
  default     = 0
}

variable "max_instance_count" {
  description = "Maximum number of Cloud Run instances to allow"
  type        = number
  default     = 20
}

variable "uploads_bucket_name" {
  description = "GCS bucket for uploads"
  type        = string
  default     = "family-recipe-prod-uploads"
}

variable "uploads_base_url" {
  description = "Base URL for uploads (e.g., https://storage.googleapis.com/<bucket>)"
  type        = string
  default     = "https://storage.googleapis.com/family-recipe-prod-uploads"
}

variable "prisma_schema" {
  description = "Prisma schema path"
  type        = string
  default     = "prisma/schema.postgres.prisma"
}

variable "database_url_secret_id" {
  description = "Secret Manager secret ID for DATABASE_URL"
  type        = string
  default     = "family-recipe-prod-database-url"
}

variable "jwt_secret_id" {
  description = "Secret Manager secret ID for JWT secret"
  type        = string
  default     = "family-recipe-prod-jwt-secret"
}

variable "family_master_key_secret_id" {
  description = "Secret Manager secret ID for FAMILY_MASTER_KEY"
  type        = string
  default     = "family-recipe-prod-family-master-key"
}

variable "wif_pool_id" {
  description = "Workload Identity Pool ID"
  type        = string
  default     = "github-pool"
}

variable "wif_provider_id" {
  description = "Workload Identity Pool Provider ID"
  type        = string
  default     = "github-provider"
}

variable "github_repository" {
  description = "GitHub repository in owner/repo form"
  type        = string
}

variable "github_ref" {
  description = "Git ref allowed to assume WIF (e.g., refs/heads/main)"
  type        = string
  default     = "refs/heads/main"
}

# Monitoring
variable "alert_notification_email" {
  description = "Email address for monitoring alert notifications"
  type        = string
}

# Recipe Importer integration (for main app to call importer)
variable "recipe_importer_url" {
  description = "URL of the Recipe Importer Cloud Run service"
  type        = string
  default     = ""
}

variable "recipe_importer_service_account_email" {
  description = "Service account email for authenticating to Recipe Importer"
  type        = string
  default     = ""
}

# Recipe URL Importer
variable "importer_service_name" {
  description = "Cloud Run service name for the recipe importer"
  type        = string
  default     = "recipe-importer-prod"
}

variable "importer_artifact_registry_repo_id" {
  description = "Artifact Registry repository ID for importer images"
  type        = string
  default     = "recipe-importer-prod"
}

variable "importer_min_instance_count" {
  description = "Minimum number of importer instances to keep warm"
  type        = number
  default     = 0
}

variable "importer_max_instance_count" {
  description = "Maximum number of importer instances to allow"
  type        = number
  default     = 5
}

variable "importer_max_html_bytes" {
  description = "Maximum HTML size the importer will process (bytes)"
  type        = number
  default     = 3000000
}

variable "importer_enable_headless" {
  description = "Enable headless browser for JavaScript-rendered pages"
  type        = bool
  default     = false
}
