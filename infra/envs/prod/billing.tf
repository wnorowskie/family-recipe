# Monthly billing budget, account-scoped across dev + prod (#334). Applied from
# prod because prod is the "real" env, even though google_billing_budget isn't
# a per-project resource. Requires a separate provider alias because the
# Cloud Billing Budget API bills its quota to whichever project is passed as
# `billing_project` — the default provider has no such override and 403s.
provider "google" {
  alias                 = "billing"
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}

resource "google_billing_budget" "monthly" {
  provider        = google.billing
  billing_account = var.billing_account_id
  display_name    = "family-recipe monthly (all projects)"

  budget_filter {
    projects = [
      "projects/${var.dev_project_number}",
      "projects/${var.prod_project_number}",
    ]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "50"
    }
  }

  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = [module.monitoring.notification_channel_id]
    disable_default_iam_recipients   = false # billing admins still get the default email
  }
}
