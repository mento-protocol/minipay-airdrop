resource "google_redis_instance" "database" {
  project                 = var.project_id
  region                  = var.region
  name                    = "minipay-db"
  tier                    = "STANDARD_HA"
  memory_size_gb          = 5
  location_id             = var.redis_region.main
  alternative_location_id = var.redis_region.alternative


  persistence_config {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "TWELVE_HOURS"
  }

  lifecycle {
    prevent_destroy = true
  }
}

