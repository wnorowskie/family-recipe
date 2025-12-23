variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name for the importer"
  type        = string
  default     = "recipe-importer-dev"
}

variable "artifact_registry_repo_id" {
  description = "Artifact Registry repository ID for importer images"
  type        = string
  default     = "recipe-importer-dev"
}

variable "runtime_service_account_email" {
  description = "Service account email for Cloud Run runtime (reuse existing)"
  type        = string
}

variable "min_instance_count" {
  description = "Minimum number of instances to keep warm"
  type        = number
  default     = 0
}

variable "max_instance_count" {
  description = "Maximum number of instances to allow"
  type        = number
  default     = 20
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

# Application configuration
variable "max_html_bytes" {
  description = "Maximum HTML size to process (bytes)"
  type        = number
  default     = 3000000
}

variable "enable_headless" {
  description = "Enable headless browser for JavaScript-rendered pages"
  type        = bool
  default     = false
}
