# GCP Monitoring Terraform Plan

This document outlines the plan for adding monitoring infrastructure to the Family Recipe app via Terraform. The goal is to implement log-based metrics, dashboards, and alerting within Google Cloud Monitoring.

---

## Current Infrastructure Overview

The app currently runs on:

- **Cloud Run** (`family-recipe-prod` / `family-recipe-dev`)
- **Cloud SQL** (PostgreSQL 15)
- **GCS Storage** (uploads bucket)
- **Secret Manager** (DATABASE_URL, JWT_SECRET, FAMILY_MASTER_KEY)

Logs are written via structured JSON logging from the Next.js app using the `src/lib/logger.ts` module with event names and metadata.

---

## 1. New Terraform Module: `modules/monitoring`

Create a new module at `infra/modules/monitoring/` with the following files:

- `main.tf` – core monitoring resources
- `variables.tf` – input variables
- `outputs.tf` – any outputs (e.g., dashboard URL)

### Module Inputs (variables.tf)

| Variable                  | Type   | Description                            |
| ------------------------- | ------ | -------------------------------------- |
| `project_id`              | string | GCP project ID                         |
| `cloud_run_service_name`  | string | Cloud Run service name for filtering   |
| `cloud_sql_instance_name` | string | Cloud SQL instance name for DB metrics |
| `region`                  | string | GCP region                             |
| `notification_email`      | string | Email for alert notifications          |
| `environment`             | string | Environment label (dev/prod)           |

---

## 2. Log-Based Metrics

Create `google_logging_metric` resources to extract metrics from Cloud Run logs. These metrics will power dashboards and alerts.

### 2.1 HTTP 5xx Error Rate

**Purpose:** Track server errors (500-599 status codes)

```hcl
resource "google_logging_metric" "http_5xx_errors" {
  name        = "cloud-run/http-5xx-errors"
  description = "Count of HTTP 5xx responses from Cloud Run"
  filter      = <<-EOT
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
```

### 2.2 Authentication Failures

**Purpose:** Track failed login attempts (including brute force attempts)

Based on app logging (`auth.login.invalid_credentials` events):

```hcl
resource "google_logging_metric" "auth_login_failures" {
  name        = "app/auth-login-failures"
  description = "Count of failed login attempts"
  filter      = <<-EOT
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
```

### 2.3 Signup Failures

**Purpose:** Track signup errors (bad master key, existing user, etc.)

```hcl
resource "google_logging_metric" "auth_signup_failures" {
  name        = "app/auth-signup-failures"
  description = "Count of failed signup attempts"
  filter      = <<-EOT
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
```

### 2.4 Application Errors (All)

**Purpose:** General application error tracking via `level=error` logs

```hcl
resource "google_logging_metric" "app_errors" {
  name        = "app/errors"
  description = "Count of application-level errors"
  filter      = <<-EOT
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
```

### 2.5 Request Latency Distribution

**Purpose:** Track request latency for P50/P95/P99 analysis

```hcl
resource "google_logging_metric" "request_latency" {
  name        = "cloud-run/request-latency"
  description = "Request latency distribution"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${var.cloud_run_service_name}"
    httpRequest.latency:*
  EOT
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "s"
  }
  value_extractor = "EXTRACT(httpRequest.latency)"
  bucket_options {
    exponential_buckets {
      num_finite_buckets = 64
      growth_factor      = 1.4
      scale              = 0.01
    }
  }
}
```

### 2.6 Rate Limit Hits

**Purpose:** Track when rate limiting kicks in (potential abuse)

```hcl
resource "google_logging_metric" "rate_limit_exceeded" {
  name        = "app/rate-limit-exceeded"
  description = "Count of rate limit exceeded responses"
  filter      = <<-EOT
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
```

---

## 3. Uptime Checks

Create `google_monitoring_uptime_check_config` for service availability monitoring.

### 3.1 Health Endpoint Check

```hcl
resource "google_monitoring_uptime_check_config" "health_check" {
  display_name = "Family Recipe - Health Check (${var.environment})"
  timeout      = "10s"
  period       = "60s"  # Check every 1 minute

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
      host       = var.cloud_run_url  # e.g., "family-recipe-prod-xxx.run.app"
    }
  }

  content_matchers {
    content = "\"status\":\"ok\""
    matcher = "CONTAINS_STRING"
  }
}
```

### 3.2 Homepage Availability

```hcl
resource "google_monitoring_uptime_check_config" "homepage_check" {
  display_name = "Family Recipe - Homepage (${var.environment})"
  timeout      = "10s"
  period       = "300s"  # Check every 5 minutes

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.cloud_run_url
    }
  }
}
```

---

## 4. Alert Policies

Create `google_monitoring_alert_policy` resources for proactive notification.

### 4.1 Notification Channel (Email)

```hcl
resource "google_monitoring_notification_channel" "email" {
  display_name = "Family Recipe Alerts - ${var.environment}"
  type         = "email"

  labels = {
    email_address = var.notification_email
  }
}
```

### 4.2 High 5xx Error Rate Alert

**Trigger:** More than 5 5xx errors in 5 minutes

```hcl
resource "google_monitoring_alert_policy" "high_5xx_rate" {
  display_name = "High 5xx Error Rate (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "5xx errors > 5 in 5 min"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.http_5xx_errors.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"  # 7 days
  }
}
```

### 4.3 Authentication Failure Spike Alert

**Trigger:** More than 10 auth failures in 10 minutes (potential brute force)

```hcl
resource "google_monitoring_alert_policy" "auth_failure_spike" {
  display_name = "Authentication Failure Spike (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Auth failures > 10 in 10 min"

    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.auth_login_failures.name}\" AND resource.type=\"cloud_run_revision\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10

      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}
```

### 4.4 Uptime Check Failure Alert

**Trigger:** Health check fails from 2+ regions

```hcl
resource "google_monitoring_alert_policy" "uptime_failure" {
  display_name = "Service Down (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.health_check.uptime_check_id}\""
      duration        = "60s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  alert_strategy {
    auto_close = "604800s"
  }
}
```

### 4.5 High Latency Alert

**Trigger:** P95 latency exceeds 5 seconds

```hcl
resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "High Request Latency (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "P95 latency > 5s"

    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_latencies\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.cloud_run_service_name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5000  # milliseconds

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}
```

### 4.6 Cloud SQL CPU Alert

**Trigger:** Database CPU > 80% for 10 minutes

```hcl
resource "google_monitoring_alert_policy" "db_high_cpu" {
  display_name = "Database High CPU (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL CPU > 80%"

    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${var.project_id}:${var.cloud_sql_instance_name}\""
      duration        = "600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
}
```

---

## 5. Dashboard

Create a `google_monitoring_dashboard` with key metrics visualization.

### Dashboard Layout

The dashboard will include the following widgets arranged in rows:

#### Row 1: Overview

1. **Request Count** – Total requests over time
2. **Error Rate** – 4xx/5xx errors as percentage
3. **Uptime Status** – Current uptime check status

#### Row 2: Performance

4. **Request Latency** – P50, P95, P99 latency
5. **Instance Count** – Cloud Run active instances
6. **Container CPU** – Cloud Run container CPU utilization

#### Row 3: Application Health

7. **Auth Events** – Login success vs failures
8. **Signup Events** – Signup success vs failures
9. **Application Errors** – Error-level log events by event type

#### Row 4: Database

10. **DB Connections** – Active connections to Cloud SQL
11. **DB CPU** – Cloud SQL CPU utilization
12. **DB Memory** – Cloud SQL memory utilization
13. **DB Disk** – Cloud SQL disk usage

#### Row 5: Storage

14. **GCS Operations** – Read/write operations to uploads bucket
15. **GCS Size** – Total bytes stored

### Dashboard Resource

```hcl
resource "google_monitoring_dashboard" "main" {
  dashboard_json = jsonencode({
    displayName = "Family Recipe - ${var.environment}"
    gridLayout = {
      columns = 3
      widgets = [
        # ... widget definitions (see implementation)
      ]
    }
  })
}
```

---

## 6. Integration with Existing Terraform

### 6.1 Add to Environment Configs

In `infra/envs/dev/main.tf` and `infra/envs/prod/main.tf`:

```hcl
module "monitoring" {
  source = "../../modules/monitoring"

  project_id              = var.project_id
  region                  = var.region
  cloud_run_service_name  = var.cloud_run_service_name
  cloud_run_url           = module.cloud_run_infra.service_url
  cloud_sql_instance_name = var.db_instance_name
  uploads_bucket_name     = var.uploads_bucket_name
  notification_email      = var.alert_notification_email
  environment             = var.environment
}
```

### 6.2 New Variables to Add

In `variables.tf` for both dev and prod:

```hcl
variable "alert_notification_email" {
  description = "Email address for monitoring alerts"
  type        = string
}

variable "environment" {
  description = "Environment name (dev or prod)"
  type        = string
}
```

### 6.3 Update cloud_run_infra Outputs

Add output for Cloud Run service URL in `modules/cloud_run_infra/outputs.tf`:

```hcl
output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.app.uri
}
```

---

## 7. Required IAM Permissions

The Terraform service account needs these additional roles:

- `roles/monitoring.admin` – Create dashboards, alert policies
- `roles/logging.admin` – Create log-based metrics

Add to `modules/iam/main.tf` or grant manually.

---

## 8. Implementation Phases

### Phase 1: Foundation

1. Create `modules/monitoring/` directory structure
2. Add notification channel (email)
3. Create basic log-based metrics (5xx errors, app errors)
4. Add uptime check for health endpoint

### Phase 2: Alerting

5. Add alert for 5xx errors
6. Add alert for uptime failures
7. Add alert for high latency
8. Add alert for DB CPU

### Phase 3: Auth Monitoring

9. Add login failure metric
10. Add signup failure metric
11. Add auth failure spike alert

### Phase 4: Dashboard

12. Create dashboard with all widgets
13. Test dashboard in dev environment

### Phase 5: Production Rollout

14. Apply to prod environment
15. Tune alert thresholds based on baseline traffic
16. Document runbook for alert responses

---

## 9. Estimated Terraform Resources

| Resource Type                            | Count |
| ---------------------------------------- | ----- |
| `google_logging_metric`                  | 6     |
| `google_monitoring_uptime_check_config`  | 2     |
| `google_monitoring_notification_channel` | 1     |
| `google_monitoring_alert_policy`         | 6     |
| `google_monitoring_dashboard`            | 1     |

---

## 10. Cost Considerations

- **Log-based metrics:** First 150 MiB free, then $0.50/MiB
- **Uptime checks:** First 1M execution-seconds free
- **Alert policies:** Free for first 100 policies
- **Dashboards:** Free

Expected monthly cost: **Minimal** (< $5/month) for low-traffic family app

---

## 11. Future Enhancements

- Add Slack notification channel alongside email
- Create custom SLO definitions (99.5% availability target)
- Add trace-based metrics when distributed tracing is added
- Create separate dashboards for API performance vs user experience
- Add anomaly detection alerts for unusual traffic patterns
