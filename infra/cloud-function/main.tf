terraform {
  required_version = "1.9.2"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.38.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 5.38.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.6.2"
    }
  }
}

variable "region" {
  type = string
}

variable "project_id" {
  type = string

}

variable "entry_point" {
  type = string
}

variable "release" {
  type = string
}

variable "description" {
  type = string
}

variable "name" {
  type = string
}

variable "vpc_connector" {
  type = string
}

variable "source_package" {
  type = string
}

variable "service_config" {
  type = object({
    max_instance_count = number
    min_instance_count = number
    available_memory   = string
    timeout_seconds    = number
    ingress_settings   = string
  })
  default = {
    max_instance_count = 5
    min_instance_count = 1
    available_memory   = "256M"
    timeout_seconds    = 60
    ingress_settings   = "ALLOW_INTERNAL_AND_GCLB"
  }
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "random_id" "bucket" {
  byte_length = 8
}

// trunk-ignore(trivy/AVD-GCP-0066)
resource "google_storage_bucket" "source" {
  name                        = "${random_id.bucket.hex}-minipay-cloud-fn-source" # Every bucket name must be globally unique
  location                    = "US"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

resource "google_storage_bucket_object" "source" {
  name   = "${var.release}.zip"
  bucket = google_storage_bucket.source.name
  source = var.source_package
}

resource "google_cloudfunctions2_function" "function" {
  name        = var.name
  location    = var.region
  description = var.description

  build_config {
    runtime     = "nodejs20"
    entry_point = var.entry_point
    environment_variables = {
      # Causes a re-deploy of the function when the source changes
      "VERSION" = var.release
    }
    source {
      storage_source {
        bucket = google_storage_bucket.source.name
        object = google_storage_bucket_object.source.name
      }
    }
  }

  service_config {
    environment_variables = var.env_vars
    vpc_connector         = var.vpc_connector
    max_instance_count    = var.service_config.max_instance_count
    min_instance_count    = var.service_config.min_instance_count
    available_memory      = var.service_config.available_memory
    timeout_seconds       = var.service_config.timeout_seconds
    ingress_settings      = var.service_config.ingress_settings

    secret_environment_variables {
      key        = "DUNE_API"
      secret     = "dune-api-key"
      project_id = var.project_id
      version    = "latest"
    }
  }

  labels = {
    deployment-tool = "terraform",
    version         = var.release
  }

  depends_on = [google_storage_bucket_object.source]
}

resource "google_cloud_run_service_iam_member" "public-access" {
  location = var.region
  service  = google_cloudfunctions2_function.function.service_config[0].service
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [google_cloudfunctions2_function.function]
}

output "function_uri" {
  value = google_cloudfunctions2_function.function.service_config[0].uri
}

output "function_name" {
  value = google_cloudfunctions2_function.function.name
}

