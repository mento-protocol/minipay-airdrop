// trunk-ignore(checkov/CKV_TF_1)
module "security_policy" {
  source  = "GoogleCloudPlatform/cloud-armor/google"
  version = "2.2.0"

  project_id                           = var.project_id
  name                                 = "minipay-api-cloud-armour"
  description                          = "MiniPay API Cloud Armor security policy with preconfigured rules, security rules and custom rules"
  default_rule_action                  = "allow"
  type                                 = "CLOUD_ARMOR"
  layer_7_ddos_defense_enable          = true
  layer_7_ddos_defense_rule_visibility = "STANDARD"
  json_parsing                         = "STANDARD"
  log_level                            = "VERBOSE"


  # Pre-configured WAF Rules
  pre_configured_rules = {
  }

  # Action against specific IP addresses or IP adress ranges
  security_rules = {
  }

  # Custom Rules using CEL
  custom_rules = {
    deny_specific_regions = {
      action      = "deny(502)"
      priority    = 21
      description = "Deny specific Regions"
      expression  = <<-EOT
        '[US]'.contains(origin.region_code)
      EOT
    }
  }
}
