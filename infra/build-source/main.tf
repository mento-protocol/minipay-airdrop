/*
 * Terraform module that builds the source locally into a zip package for cloud function deployment
 * Steps: 
 * 1. Compile the package
 * 2. Pack it (pnpm pack). It gives us a tgz file
 * 3. Unpack the tgz file
 * 4. Archive it into a zip file
 * The release is: {name}-{version}-{commit_sha}
 */
terraform {
  required_version = "1.9.2"
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "3.6.2"
    }
    external = {
      source  = "hashicorp/external"
      version = "2.3.3"
    }
    null = {
      source  = "hashicorp/null"
      version = "3.2.2"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "2.4.2"
    }
  }
}

locals {
  time = timestamp()
}

resource "random_id" "build_id" {
  byte_length = 8
  keepers = {
    time = local.time
  }
}

data "external" "git" {
  working_dir = "${path.root}/../"
  program = [
    "git",
    "log",
    "--pretty=format:{ \"sha\": \"%H\" }",
    "-1",
    "HEAD"
  ]
}

locals {
  package    = jsondecode(file("${path.root}/../package.json"))
  build_id   = random_id.build_id.hex
  build_dir  = "/tmp/build-${local.build_id}"
  commit_sha = data.external.git.result.sha
  release    = replace("${local.package.name}-${local.package.version}-${local.commit_sha}", ".", "-")
}


resource "null_resource" "build_and_pack" {
  provisioner "local-exec" {
    working_dir = "${path.root}/../"
    command     = "rm -rf dist && pnpm tsc && pnpm pack --pack-destination ${local.build_dir}"
  }

  depends_on = [random_id.build_id]
  lifecycle {
    replace_triggered_by = [random_id.build_id]
  }
}

resource "null_resource" "unpack" {
  provisioner "local-exec" {
    working_dir = local.build_dir
    command     = "tar -zxvf ${local.package.name}-${local.package.version}.tgz"
  }

  depends_on = [null_resource.build_and_pack]
  lifecycle {
    replace_triggered_by = [null_resource.build_and_pack]
  }
}

data "archive_file" "source" {
  type        = "zip"
  output_path = "${local.build_dir}/${local.release}.zip"
  source_dir  = "${local.build_dir}/package"
  depends_on  = [null_resource.unpack]
}

output "release" {
  value = local.release
}

output "package" {
  value = data.archive_file.source.output_path
}

output "build_id" {
  value = local.build_id
}


