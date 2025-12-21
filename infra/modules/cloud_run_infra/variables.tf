variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region (also used for Artifact Registry)"
  type        = string
}

variable "runtime_sa_id" {
  description = "Service account ID for Cloud Run runtime"
  type        = string
  default     = "family-recipe-runner"
}

variable "deployer_sa_id" {
  description = "Service account ID used by CI/CD (WIF) to deploy"
  type        = string
  default     = "family-recipe-deployer"
}

variable "artifact_registry_repo_id" {
  description = "Artifact Registry repository ID for app images"
  type        = string
}

variable "cloud_sql_instances" {
  description = "List of Cloud SQL instance connection names for Cloud SQL connector"
  type        = list(string)
  default     = []
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "family-recipe-dev"
}

variable "min_instance_count" {
  description = "Minimum number of instances to keep warm in Cloud Run"
  type        = number
  default     = 0
}

variable "max_instance_count" {
  description = "Maximum number of instances to allow in Cloud Run autoscaling"
  type        = number
  default     = 20
}

variable "uploads_bucket_name" {
  description = "GCS bucket name for uploads (private, uniform access)"
  type        = string
}

variable "uploads_base_url" {
  description = "Base URL for serving uploads (e.g., https://storage.googleapis.com/<bucket>)"
  type        = string
  default     = ""
}

variable "prisma_schema" {
  description = "Prisma schema path to set in Cloud Run env"
  type        = string
  default     = "prisma/schema.postgres.prisma"
}

variable "database_url_secret_id" {
  description = "Secret Manager secret ID for DATABASE_URL"
  type        = string
}

variable "jwt_secret_id" {
  description = "Secret Manager secret ID for JWT secret"
  type        = string
}

variable "family_master_key_secret_id" {
  description = "Optional Secret Manager secret ID for FAMILY_MASTER_KEY (empty to skip)"
  type        = string
  default     = ""
}

variable "wif_pool_id" {
  description = "Workload Identity Pool ID for GitHub Actions"
  type        = string
  default     = "github-pool"
}

variable "wif_provider_id" {
  description = "Workload Identity Pool Provider ID for GitHub Actions"
  type        = string
  default     = "github-provider"
}

variable "github_repository" {
  description = "GitHub repository in owner/repo form"
  type        = string
}

variable "github_ref" {
  description = "Git ref allowed to assume WIF (e.g., refs/heads/develop)"
  type        = string
}
