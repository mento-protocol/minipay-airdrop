resource "google_kms_key_ring" "minipay" {
  project  = var.project_id
  location = var.region
  name     = "minipay-key-ring"
}

resource "google_kms_crypto_key" "dune-api-key" {
  name     = "dune-api-key"
  key_ring = google_kms_key_ring.minipay.id
}

