resource "google_api_gateway_api" "api_gw" {
  provider = google-beta
  api_id   = "minipay-api"
}

resource "google_api_gateway_api_config" "api_gw" {
  provider      = google-beta
  api           = google_api_gateway_api.api_gw.api_id
  api_config_id = "minipay-api-config"

  openapi_documents {
    document {
      path = "spec.yaml"
      contents = base64encode(templatefile("./spec.yaml", {
        backend = google_cloudfunctions2_function.functions["get_allocation"].service_config[0].uri
      }))
    }
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "google_api_gateway_gateway" "api_gw" {
  provider   = google-beta
  region     = "us-central1"
  api_config = google_api_gateway_api_config.api_gw.id
  gateway_id = "minipay-gateway"
}
