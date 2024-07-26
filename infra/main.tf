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

variable "project_id" {
  type    = string
  default = "mento-prod"
}

module "build" {
  source = "./build-source"
}

module "internal_cf" {
  source         = "./cloud-function"
  region         = var.region
  project_id     = var.project_id
  entry_point    = "internal"
  source_package = module.build.package
  release        = module.build.release
  name           = "minipay-api-internal"
  description    = <<EOF
  Internal API for running the tasks that import data from Dune into Redis to be served by the external API
  EOF
  env_vars = {
    GOOGLE_PROJECT           = var.project_id
    GOOGLE_LOCATION          = var.region
    GOOGLE_TASK_QUEUE        = "todo"
    IMPORT_TASK_URL          = "todo"
    DUNE_API_KEY             = "todo"
    REDIS_INSERT_CONCURRENCY = "10000"
    IMPORT_BATCH_SIZE        = "30000"
  }
  service_config = {
    max_instance_count = 10
    min_instance_count = 0
    available_memory   = "256M"
    timeout_seconds    = 60
    ingress_settings   = "ALLOW_INTERNAL_ONLY"
  }
}

module "external_cf" {
  source         = "./cloud-function"
  region         = var.region
  project_id     = var.project_id
  entry_point    = "external"
  source_package = module.build.package
  release        = module.build.release
  name           = "minipay-api-external"
  description    = <<EOF
  External API for getting the MiniPay airdrop allocation.
  EOF
  service_config = {
    max_instance_count = 10
    min_instance_count = 1
    available_memory   = "256M"
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

// provider "google" {
//   project     = var.project_id
//   region      = var.region
//   credentials = "credentials.json"
// }

provider "google-beta" {
  project     = "mento-prod"
  credentials = "credentials.json"
}

// 
// locals {
//   package = jsondecode(file("../package.json"))
//   release = "${local.package.name}-${local.package.version}"
// }
// 
// 
// 


output "function_uris" {
  value = {
    internal = module.internal_cf.function_uri
    external = module.external_cf.function_uri
  }
}
// 
