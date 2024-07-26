resource "google_cloud_tasks_queue" "import_queue" {
  project  = var.project_id
  location = var.region
  name     = "minipay-import-queue"

  rate_limits {
    max_concurrent_dispatches = 20
    max_dispatches_per_second = 10
  }

  retry_config {
    max_attempts       = 5
    max_retry_duration = "20s"
    max_backoff        = "3s"
    min_backoff        = "2s"
    max_doublings      = 1
  }
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
  }
}
