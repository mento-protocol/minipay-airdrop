module "lb-http" {
  source  = "terraform-google-modules/lb-http/google//modules/serverless_negs"
  version = "~> 10.0"

  name    = "minipay-lb"
  project = var.project_id

  ssl                             = true
  managed_ssl_certificate_domains = ["minipay.mentolabs.dev"]
  https_redirect                  = true

  backends = {
    default = {
      description = ""
      groups = [
        {
          group = google_compute_region_network_endpoint_group.serverless_neg.id
        }
      ]
      enable_cdn = false

      iap_config = {
        enable = false
      }
      log_config = {
        enable = false
      }
    }
  }
}

resource "google_compute_region_network_endpoint_group" "serverless_neg" {
  provider              = google-beta
  name                  = "serverless-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_function {
    function = google_cloudfunctions2_function.functions["get_allocation"].name
  }
}
