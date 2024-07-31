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
  type    = string
  default = "us-central1"
}

variable "redis_region" {
  type = object({
    main        = string
    alternative = string
  })

  default = {
    main        = "us-central1-a"
    alternative = "us-central1-f"
  }
}

variable "project_id" {
  type    = string
  default = "mento-prod"
}

provider "google-beta" {
  project = var.project_id
}

module "build" {
  source = "./build-source"
}

variable "redis_insert_concurrency" {
  type    = number
  default = 100
}

variable "import_batch_size" {
  type    = number
  default = 32000
}

resource "google_vpc_access_connector" "connector" {
  project       = var.project_id
  region        = var.region
  name          = "minipay-vpc"
  ip_cidr_range = "10.8.0.0/28"
  network       = "default"
}

locals {
  redis_url = "redis://${google_redis_instance.database.host}:${google_redis_instance.database.port}"
}

module "internal_import_cf" {
  source         = "./cloud-function"
  region         = var.region
  project_id     = var.project_id
  vpc_connector  = google_vpc_access_connector.connector.id
  entry_point    = "internal"
  source_package = module.build.package
  release        = module.build.release
  name           = "minipay-api-internal-import"
  description    = <<EOF
  Internal API for running the tasks that import data from Dune into Redis to be served by the external API
  EOF
  env_vars = {
    GOOGLE_PROJECT           = var.project_id
    GOOGLE_LOCATION          = var.region
    GOOGLE_TASK_QUEUE        = google_cloud_tasks_queue.import_queue.name
    REDIS_URL                = local.redis_url
    REDIS_INSERT_CONCURRENCY = var.redis_insert_concurrency
    IMPORT_BATCH_SIZE        = var.import_batch_size
  }
  service_config = {
    max_instance_count = 40
    min_instance_count = 0
    available_memory   = "512Mi"
    available_cpu      = "0.333"
    timeout_seconds    = 120
    ingress_settings   = "ALLOW_INTERNAL_ONLY"
  }
}

module "internal_refresh_cf" {
  source         = "./cloud-function"
  region         = var.region
  project_id     = var.project_id
  vpc_connector  = google_vpc_access_connector.connector.id
  entry_point    = "internal"
  source_package = module.build.package
  release        = module.build.release
  name           = "minipay-api-internal-refresh"
  description    = <<EOF
  Internal API for running the tasks that import data from Dune into Redis to be served by the external API
  EOF
  env_vars = {
    GOOGLE_PROJECT           = var.project_id
    GOOGLE_LOCATION          = var.region
    GOOGLE_TASK_QUEUE        = google_cloud_tasks_queue.import_queue.name
    IMPORT_TASK_URL          = "${module.internal_import_cf.function_uri}/import"
    REDIS_URL                = local.redis_url
    REDIS_INSERT_CONCURRENCY = var.redis_insert_concurrency
    IMPORT_BATCH_SIZE        = var.import_batch_size
  }
  service_config = {
    max_instance_count = 1
    min_instance_count = 0
    available_memory   = "256Mi"
    available_cpu      = "0.167"
    timeout_seconds    = 60
    ingress_settings   = "ALLOW_INTERNAL_ONLY"
  }
}

module "external_cf" {
  source         = "./cloud-function"
  region         = var.region
  project_id     = var.project_id
  vpc_connector  = google_vpc_access_connector.connector.id
  entry_point    = "external"
  source_package = module.build.package
  release        = module.build.release
  name           = "minipay-api-external"
  description    = <<EOF
  External API for getting the MiniPay airdrop allocation.
  EOF
  env_vars = {
    REDIS_URL = local.redis_url
  }
  service_config = {
    max_instance_count = 10
    min_instance_count = 1
    available_memory   = "256Mi"
    available_cpu      = "0.167"
    timeout_seconds    = 60
    ingress_settings   = "ALLOW_INTERNAL_AND_GCLB"
  }
}

output "build" {
  value = {
    id      = module.build.build_id,
    release = module.build.release,
    package = module.build.package
  }
}

output "function_uris" {
  value = {
    internal_import  = module.internal_import_cf.function_uri
    internal_refresh = module.internal_refresh_cf.function_uri
    external         = module.external_cf.function_uri
  }
}
