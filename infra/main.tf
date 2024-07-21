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

variable "functions" {
  type = map(string)
  default = {
    get_allocation = "getAllocation"
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

provider "google" {
  project     = var.project_id
  region      = var.region
  credentials = "credentials.json"
}

provider "google-beta" {
  project     = "mento-prod"
  credentials = "credentials.json"
}

resource "random_id" "default" {
  byte_length = 8
}

// trunk-ignore(trivy/AVD-GCP-0066)
resource "google_storage_bucket" "default" {
  name                        = "${random_id.default.hex}-minipay-cloud-fn-source" # Every bucket name must be globally unique
  location                    = "US"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

locals {
  package = jsondecode(file("../package.json"))
  release = "${local.package.name}-${local.package.version}"
}

resource "null_resource" "clean_staging" {
  triggers = {
    always_run = timestamp()
  }
  provisioner "local-exec" {
    command = "rm -rf ../.staging && mkdir ../.staging"
  }
}

resource "null_resource" "build_and_pack" {
  triggers = {
    always_run = timestamp()
  }
  depends_on = [null_resource.clean_staging]

  provisioner "local-exec" {
    command = "pnpm tsc && pnpm pack --pack-destination .staging"
  }
}

resource "null_resource" "unpack" {
  triggers = {
    always_run = timestamp()
  }
  depends_on = [null_resource.build_and_pack]

  provisioner "local-exec" {
    command = "cd ../.staging && tar -zxvf ${local.release}.tgz"
  }
}

data "archive_file" "source" {
  type        = "zip"
  output_path = "../.staging/${local.release}.zip"
  source_dir  = "../.staging/package"
  depends_on  = [null_resource.unpack]
}

resource "google_storage_bucket_object" "source" {
  name   = "${local.release}-${data.archive_file.source.output_sha}.zip"
  bucket = google_storage_bucket.default.name
  source = data.archive_file.source.output_path
}

resource "google_cloudfunctions2_function" "functions" {
  for_each    = var.functions
  name        = each.key
  location    = "us-central1"
  description = "minipay-airdrop-function"

  build_config {
    runtime     = "nodejs20"
    entry_point = each.value
    environment_variables = {
      # Causes a re-deploy of the function when the source changes
      "SOURCE_SHA" = data.archive_file.source.output_sha
    }
    source {
      storage_source {
        bucket = google_storage_bucket.default.name
        object = google_storage_bucket_object.source.name
      }
    }
  }

  service_config {
    max_instance_count = 5
    min_instance_count = 1
    available_memory   = "256M"
    timeout_seconds    = 60
    ingress_settings   = "ALLOW_INTERNAL_AND_GCLB"
  }

  labels = {
    deployment-tool = "terraform",
    version-sha     = data.archive_file.source.output_sha
  }

  depends_on = [google_storage_bucket_object.source]
}

resource "google_cloud_run_service_iam_member" "public-access" {
  for_each = var.functions
  location = google_cloudfunctions2_function.functions[each.key].location
  service  = google_cloudfunctions2_function.functions[each.key].service_config[0].service
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [google_cloudfunctions2_function.functions]

  lifecycle {
    replace_triggered_by = [google_cloudfunctions2_function.functions[each.key]]
  }
}

output "function_uris" {
  value = {
    for k, v in var.functions : k => google_cloudfunctions2_function.functions[k].service_config[0].uri
  }
  depends_on = [google_cloudfunctions2_function.functions]
}

