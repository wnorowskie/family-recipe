variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name for the FastAPI backend"
  type        = string
  default     = "family-recipe-api-dev"
}

variable "artifact_registry_repo_id" {
  description = "Artifact Registry repository ID for FastAPI images"
  type        = string
  default     = "family-recipe-api-dev"
}

variable "runtime_service_account_email" {
  description = "Service account email for Cloud Run runtime (reuses the Next service's runner)"
  type        = string
}

variable "invoker_members" {
  description = "IAM members allowed to invoke the API (the Next runtime SA, plus the deployer SA for smoke checks). No allUsers — the browser reaches this service only via the Next origin."
  type        = list(string)
  default     = []
}

variable "cloud_sql_instances" {
  description = "Cloud SQL instance connection names to mount at /cloudsql"
  type        = list(string)
  default     = []
}

variable "min_instance_count" {
  description = "Minimum number of instances to keep warm"
  type        = number
  default     = 0
}

variable "max_instance_count" {
  description = "Maximum number of instances to allow"
  type        = number
  default     = 10
}

variable "cpu_limit" {
  description = "CPU limit for the container"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit for the container"
  type        = string
  default     = "512Mi"
}

variable "api_environment" {
  description = "ENVIRONMENT for apps/api. 'production' enables secure cookies and fail-fast config validation; dev is HTTPS so it uses 'production' too."
  type        = string
  default     = "production"
}

variable "cors_allow_origins" {
  description = "CORS_ALLOW_ORIGINS for apps/api. Empty by design — the browser only ever calls FastAPI through the same-origin Next proxy, so no CORS middleware is installed."
  type        = string
  default     = ""
}

variable "trusted_proxy_hops" {
  description = "TRUSTED_PROXY_HOPS for apps/api — number of trusted proxies appending to X-Forwarded-For. Deployed topology is browser → GFE(Next) → Next proxy → GFE(FastAPI), so the two front-ends occupy the trailing two XFF entries and the real client is parts[-2] (issue #246)."
  type        = number
  default     = 2
}

variable "uploads_bucket_name" {
  description = "GCS bucket for uploads (shared with the Next service)"
  type        = string
  default     = ""
}

# Secret IDs. The secret containers and their IAM grants are managed by the
# cloud_run_infra module against the shared runtime SA; this module only
# references them.
variable "database_url_secret_id" {
  description = "Secret Manager secret ID holding DATABASE_URL"
  type        = string
}

variable "jwt_secret_id" {
  description = "Secret Manager secret ID holding JWT_SECRET"
  type        = string
}

variable "refresh_pepper_secret_id" {
  description = "Secret Manager secret ID holding REFRESH_PEPPER (required when api_environment is 'production'; must be >= 32 chars)"
  type        = string
}

variable "family_master_key_secret_id" {
  description = "Secret Manager secret ID holding FAMILY_MASTER_KEY. Empty string disables the env var."
  type        = string
  default     = ""
}

variable "recipe_importer_url" {
  description = "Recipe URL importer service URL. Empty string disables the importer env vars."
  type        = string
  default     = ""
}

variable "recipe_importer_audience" {
  description = "Audience for the importer ID token. Defaults to recipe_importer_url when empty."
  type        = string
  default     = ""
}

variable "recipe_importer_service_account_email" {
  description = "Service account email used to mint the importer ID token"
  type        = string
  default     = ""
}
