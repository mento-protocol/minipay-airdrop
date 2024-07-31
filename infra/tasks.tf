resource "google_cloud_tasks_queue" "import_queue" {
  project  = var.project_id
  location = var.region
  name     = "minipay-import-queue"

  rate_limits {
    max_concurrent_dispatches = 40
    max_dispatches_per_second = 20
  }

  retry_config {
    max_attempts       = 5
    max_retry_duration = "120s"
    max_backoff        = "50s"
    min_backoff        = "5s"
    max_doublings      = 3
  }
}

resource "google_service_account" "internal_invoker" {
  project      = var.project_id
  account_id   = "minipay-internal-job-invoker"
  display_name = "Minipay Internal Job Invoker"
  description  = "Used by the Cloud Scheduler and Cloud Task queue"
}

resource "google_cloud_run_service_iam_member" "internal_refresh_cf_private_access" {
  location = var.region
  project  = var.project_id
  service  = module.internal_refresh_cf.service
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.internal_invoker.email}"

  depends_on = [module.internal_refresh_cf]
}

resource "google_cloud_run_service_iam_member" "internal_import_cf_private_access" {
  location = var.region
  service  = module.internal_import_cf.service
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.internal_invoker.email}"

  depends_on = [module.internal_import_cf]
}

resource "google_cloud_scheduler_job" "default" {
  project     = var.project_id
  name        = "minipay-refresh-job"
  description = "Initiate the import process after the materialized view in Dune has refreshed"
  schedule    = "10 2 * * *"
  time_zone   = "UTC"
  region      = var.region

  retry_config {
    retry_count          = 5
    max_retry_duration   = "1500s" # 25 minutes
    min_backoff_duration = "180s"  # 3 minutes
    max_doublings        = 3
  }

  http_target {
    http_method = "GET"
    uri         = "${module.internal_refresh_cf.function_uri}/refresh"
    oidc_token {
      service_account_email = google_service_account.internal_invoker.email
      audience              = module.internal_refresh_cf.function_uri
    }
  }
}
