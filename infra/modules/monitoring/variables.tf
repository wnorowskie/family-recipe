variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name for filtering metrics"
  type        = string
}

variable "cloud_run_service_uri" {
  description = "Cloud Run service URI (e.g., https://family-recipe-dev-xxx.run.app)"
  type        = string
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL instance name for DB metrics"
  type        = string
}

variable "notification_email" {
  description = "Email address for alert notifications"
  type        = string
}

variable "environment" {
  description = "Environment label (dev or prod)"
  type        = string
}

# Alert thresholds (with sensible defaults)
variable "alert_5xx_threshold" {
  description = "Number of 5xx errors in 5 minutes to trigger alert"
  type        = number
  default     = 5
}

variable "alert_auth_failure_threshold" {
  description = "Number of auth failures in 10 minutes to trigger alert"
  type        = number
  default     = 10
}

variable "alert_latency_p95_threshold_ms" {
  description = "P95 latency threshold in milliseconds"
  type        = number
  default     = 5000
}

variable "alert_db_cpu_threshold" {
  description = "Database CPU utilization threshold (0-1)"
  type        = number
  default     = 0.8
}

variable "alert_cloud_run_cpu_threshold" {
  description = "Cloud Run container CPU utilization threshold (0-1)"
  type        = number
  default     = 0.8
}

variable "alert_cloud_run_memory_threshold" {
  description = "Cloud Run container memory utilization threshold (0-1)"
  type        = number
  default     = 0.8
}

variable "uptime_check_period" {
  description = "How often to run uptime checks (e.g., 60s, 300s, 900s)"
  type        = string
  default     = "900s" # 15 minutes
}
