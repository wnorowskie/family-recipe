# ==============================================================================
# NOTIFICATION CHANNEL
# ==============================================================================

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Family Recipe Alerts - ${var.environment}"
  type         = "email"

  labels = {
    email_address = var.notification_email
  }
}

# ==============================================================================
# LOG-BASED METRICS
# ==============================================================================

# HTTP 5xx Error Count
resource "google_logging_metric" "http_5xx_errors" {
  project     = var.project_id
  name        = "cloud-run-http-5xx-errors-${var.environment}"
  description = "Count of HTTP 5xx responses from Cloud Run"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${var.cloud_run_service_name}"
    httpRequest.status>=500 AND httpRequest.status<600
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Authentication Login Failures
resource "google_logging_metric" "auth_login_failures" {
  project     = var.project_id
  name        = "app-auth-login-failures-${var.environment}"
  description = "Count of failed login attempts"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${var.cloud_run_service_name}"
    jsonPayload.event="auth.login.invalid_credentials"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Signup Failures
resource "google_logging_metric" "auth_signup_failures" {
  project     = var.project_id
  name        = "app-auth-signup-failures-${var.environment}"
  description = "Count of failed signup attempts"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${var.cloud_run_service_name}"
    (jsonPayload.event="auth.signup.error" OR 
     jsonPayload.event="auth.signup.invalid_master_key" OR
     jsonPayload.event="auth.signup.existing_user")
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# General Application Errors
resource "google_logging_metric" "app_errors" {
  project     = var.project_id
  name        = "app-errors-${var.environment}"
  description = "Count of application-level errors"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${var.cloud_run_service_name}"
    jsonPayload.level="error"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Rate Limit Exceeded
resource "google_logging_metric" "rate_limit_exceeded" {
  project     = var.project_id
  name        = "app-rate-limit-exceeded-${var.environment}"
  description = "Count of rate limit exceeded responses"

  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${var.cloud_run_service_name}"
    httpRequest.status=429
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# ==============================================================================
# UPTIME CHECKS
# ==============================================================================

locals {
  # Extract just the hostname from the Cloud Run URI
  cloud_run_host = replace(var.cloud_run_service_uri, "https://", "")
}

resource "google_monitoring_uptime_check_config" "health_check" {
  project      = var.project_id
  display_name = "Family Recipe - Health Check (${var.environment})"
  timeout      = "10s"
  period       = var.uptime_check_period

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.cloud_run_host
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }
}

# ==============================================================================
# ALERT POLICIES
# ==============================================================================

# High 5xx Error Rate Alert
resource "google_monitoring_alert_policy" "high_5xx_rate" {
  project      = var.project_id
  display_name = "High 5xx Error Rate (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "5xx errors > ${var.alert_5xx_threshold} in 5 min"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.http_5xx_errors.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_5xx_threshold

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s" # 7 days
  }

  documentation {
    content   = "High rate of 5xx errors detected on the ${var.environment} environment. Check Cloud Run logs for details."
    mime_type = "text/markdown"
  }
}

# Authentication Failure Spike Alert
resource "google_monitoring_alert_policy" "auth_failure_spike" {
  project      = var.project_id
  display_name = "Authentication Failure Spike (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Auth failures > ${var.alert_auth_failure_threshold} in 10 min"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.auth_login_failures.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_auth_failure_threshold

      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }

  documentation {
    content   = "High rate of authentication failures detected. This may indicate a brute force attack attempt on the ${var.environment} environment."
    mime_type = "text/markdown"
  }
}

# Uptime Check Failure Alert
resource "google_monitoring_alert_policy" "uptime_failure" {
  project      = var.project_id
  display_name = "Service Down (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.health_check.uptime_check_id}\""
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = []
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }

  documentation {
    content   = "The health check endpoint is failing on the ${var.environment} environment. The service may be down or experiencing issues."
    mime_type = "text/markdown"
  }
}

# High Latency Alert
resource "google_monitoring_alert_policy" "high_latency" {
  project      = var.project_id
  display_name = "High Request Latency (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "P95 latency > ${var.alert_latency_p95_threshold_ms}ms"

    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_latency_p95_threshold_ms

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }

  documentation {
    content   = "Request latency is elevated on the ${var.environment} environment. P95 latency exceeds ${var.alert_latency_p95_threshold_ms}ms."
    mime_type = "text/markdown"
  }
}

# Cloud SQL High CPU Alert
resource "google_monitoring_alert_policy" "db_high_cpu" {
  project      = var.project_id
  display_name = "Database High CPU (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Cloud SQL CPU > ${var.alert_db_cpu_threshold * 100}%"

    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${var.cloud_sql_instance_name}\""
      duration        = "600s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_db_cpu_threshold

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }

  documentation {
    content   = "Database CPU utilization is high on the ${var.environment} environment. Consider scaling up the Cloud SQL instance or optimizing queries."
    mime_type = "text/markdown"
  }
}

# Cloud Run High CPU Alert
resource "google_monitoring_alert_policy" "cloud_run_high_cpu" {
  project      = var.project_id
  display_name = "Cloud Run High CPU (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Cloud Run CPU > ${var.alert_cloud_run_cpu_threshold * 100}%"

    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/container/cpu/utilizations\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_cloud_run_cpu_threshold

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }

  documentation {
    content   = "Cloud Run container CPU utilization is high on the ${var.environment} environment. The service may need more resources or optimization."
    mime_type = "text/markdown"
  }
}

# Cloud Run High Memory Alert
resource "google_monitoring_alert_policy" "cloud_run_high_memory" {
  project      = var.project_id
  display_name = "Cloud Run High Memory (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Cloud Run Memory > ${var.alert_cloud_run_memory_threshold * 100}%"

    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/container/memory/utilizations\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.alert_cloud_run_memory_threshold

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }

  documentation {
    content   = "Cloud Run container memory utilization is high on the ${var.environment} environment. Consider increasing memory allocation or investigating memory leaks."
    mime_type = "text/markdown"
  }
}

# ==============================================================================
# DASHBOARD
# ==============================================================================

resource "google_monitoring_dashboard" "main" {
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "Family Recipe - ${var.environment}"
    mosaicLayout = {
      columns = 12
      tiles = [
        # Row 1: Overview
        {
          xPos   = 0
          yPos   = 0
          width  = 4
          height = 4
          widget = {
            title = "Request Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_RATE"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 4
          yPos   = 0
          width  = 4
          height = 4
          widget = {
            title = "5xx Error Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.http_5xx_errors.name}\" AND resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_SUM"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 8
          yPos   = 0
          width  = 4
          height = 4
          widget = {
            title = "Application Errors"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.app_errors.name}\" AND resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_SUM"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },

        # Row 2: Performance
        {
          xPos   = 0
          yPos   = 4
          width  = 6
          height = 4
          widget = {
            title = "Request Latency (P50, P95, P99)"
            xyChart = {
              dataSets = [
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_PERCENTILE_50"
                      }
                    }
                  }
                  plotType   = "LINE"
                  legendTemplate = "P50"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_PERCENTILE_95"
                      }
                    }
                  }
                  plotType   = "LINE"
                  legendTemplate = "P95"
                },
                {
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                      aggregation = {
                        alignmentPeriod  = "60s"
                        perSeriesAligner = "ALIGN_PERCENTILE_99"
                      }
                    }
                  }
                  plotType   = "LINE"
                  legendTemplate = "P99"
                }
              ]
            }
          }
        },
        {
          xPos   = 6
          yPos   = 4
          width  = 3
          height = 4
          widget = {
            title = "Instance Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_MEAN"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 9
          yPos   = 4
          width  = 3
          height = 4
          widget = {
            title = "Uptime Check Status"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.health_check.uptime_check_id}\""
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_FRACTION_TRUE"
                    crossSeriesReducer = "REDUCE_MEAN"
                  }
                }
              }
              thresholds = [
                {
                  value     = 0.99
                  color     = "YELLOW"
                  direction = "BELOW"
                }
              ]
            }
          }
        },

        # Row 3: Cloud Run Resources
        {
          xPos   = 0
          yPos   = 8
          width  = 6
          height = 4
          widget = {
            title = "Cloud Run CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/container/cpu/utilizations\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_PERCENTILE_99"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 6
          yPos   = 8
          width  = 6
          height = 4
          widget = {
            title = "Cloud Run Memory Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/container/memory/utilizations\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_PERCENTILE_99"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },

        # Row 4: Authentication
        {
          xPos   = 0
          yPos   = 12
          width  = 6
          height = 4
          widget = {
            title = "Login Failures"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.auth_login_failures.name}\" AND resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_SUM"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 6
          yPos   = 12
          width  = 6
          height = 4
          widget = {
            title = "Signup Failures"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.auth_signup_failures.name}\" AND resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_SUM"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },

        # Row 5: Database
        {
          xPos   = 0
          yPos   = 16
          width  = 4
          height = 4
          widget = {
            title = "Database CPU"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${var.cloud_sql_instance_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_MEAN"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 4
          yPos   = 16
          width  = 4
          height = 4
          widget = {
            title = "Database Memory"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudsql.googleapis.com/database/memory/utilization\" AND resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${var.cloud_sql_instance_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_MEAN"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        },
        {
          xPos   = 8
          yPos   = 16
          width  = 4
          height = 4
          widget = {
            title = "Database Connections"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\" AND resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${var.cloud_sql_instance_name}\""
                    aggregation = {
                      alignmentPeriod  = "60s"
                      perSeriesAligner = "ALIGN_MEAN"
                    }
                  }
                }
                plotType = "LINE"
              }]
            }
          }
        }
      ]
    }
  })
}
