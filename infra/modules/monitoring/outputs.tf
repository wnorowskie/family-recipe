output "notification_channel_id" {
  description = "ID of the email notification channel"
  value       = google_monitoring_notification_channel.email.id
}

output "dashboard_id" {
  description = "ID of the monitoring dashboard"
  value       = google_monitoring_dashboard.main.id
}

output "uptime_check_id" {
  description = "ID of the health check uptime check"
  value       = google_monitoring_uptime_check_config.health_check.uptime_check_id
}

output "log_based_metrics" {
  description = "Names of created log-based metrics"
  value = {
    http_5xx_errors     = google_logging_metric.http_5xx_errors.name
    auth_login_failures = google_logging_metric.auth_login_failures.name
    auth_signup_failures = google_logging_metric.auth_signup_failures.name
    app_errors          = google_logging_metric.app_errors.name
    rate_limit_exceeded = google_logging_metric.rate_limit_exceeded.name
  }
}

output "alert_policies" {
  description = "Names of created alert policies"
  value = {
    high_5xx_rate        = google_monitoring_alert_policy.high_5xx_rate.display_name
    auth_failure_spike   = google_monitoring_alert_policy.auth_failure_spike.display_name
    uptime_failure       = google_monitoring_alert_policy.uptime_failure.display_name
    high_latency         = google_monitoring_alert_policy.high_latency.display_name
    db_high_cpu          = google_monitoring_alert_policy.db_high_cpu.display_name
    cloud_run_high_cpu   = google_monitoring_alert_policy.cloud_run_high_cpu.display_name
    cloud_run_high_memory = google_monitoring_alert_policy.cloud_run_high_memory.display_name
  }
}
