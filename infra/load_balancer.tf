resource "google_compute_region_network_endpoint_group" "external_endpoint_group" {
  provider              = google-beta
  name                  = "minipay-external-api"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_function {
    function = module.external_cf.function_name
  }
}

// trunk-ignore(checkov/CKV_TF_1)
module "lb-http" {
  source          = "terraform-google-modules/lb-http/google//modules/serverless_negs"
  version         = "~> 10.0"
  security_policy = module.security_policy.policy.self_link


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
          group = google_compute_region_network_endpoint_group.external_endpoint_group.id
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

