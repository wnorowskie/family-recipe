terraform {
  required_version = ">= 1.5.0"
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "iam" {
  source = "../../modules/iam"

  project_id                 = var.project_id
  state_bucket_name          = var.state_bucket_name
  terraform_admin_sa_id      = var.terraform_admin_sa_id
  app_sql_client_sa_id       = var.app_sql_client_sa_id
  grant_secret_accessor_to_app = var.grant_secret_accessor_to_app
  secret_ids_for_app           = [var.db_password_secret_id]
}

module "sql_instance" {
  source = "../../modules/sql_instance"

  project_id                  = var.project_id
  region                      = var.region
  instance_name               = var.db_instance_name
  db_name                     = var.db_name
  db_user                     = var.db_user
  db_password                 = var.db_password
  tier                        = var.tier
  disk_size_gb                = var.disk_size_gb
  backup_retention_days       = var.backup_retention_days
  maintenance_window_day      = var.maintenance_window_day
  maintenance_window_hour     = var.maintenance_window_hour
  pitr_enabled                = var.pitr_enabled
  enable_public_ip            = var.enable_public_ip
  ssl_mode                    = var.ssl_mode
  authorized_networks         = var.authorized_networks
  create_db_password_secret   = var.create_db_password_secret
  db_password_secret_id       = var.db_password_secret_id

  depends_on = [module.iam]
}
