variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "state_bucket_name" {
  description = "GCS bucket for Terraform state (for granting storage admin to terraform SA)"
  type        = string
  default     = ""
}

variable "terraform_admin_sa_id" {
  description = "Service account ID for Terraform admin"
  type        = string
}

variable "app_sql_client_sa_id" {
  description = "Service account ID for app Cloud SQL client"
  type        = string
}

variable "grant_secret_accessor_to_app" {
  description = "Whether to grant Secret Manager Secret Accessor to app SA for provided secrets"
  type        = bool
  default     = false
}

variable "secret_ids_for_app" {
  description = "List of Secret Manager secret IDs to grant accessor to app SA"
  type        = list(string)
  default     = []
}
