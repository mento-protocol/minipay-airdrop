module "security_policy" {
  source = "GoogleCloudPlatform/cloud-armor/google"

  project_id                           = var.project_id
  name                                 = "minipay-api-cloud-armour"
  description                          = "MiniPay API Cloud Armor security policy with preconfigured rules, security rules and custom rules"
  default_rule_action                  = "deny(403)"
  type                                 = "CLOUD_ARMOR"
  layer_7_ddos_defense_enable          = true
  layer_7_ddos_defense_rule_visibility = "STANDARD"
  json_parsing                         = "STANDARD"
  log_level                            = "VERBOSE"


  # Pre-configured WAF Rules
  pre_configured_rules = {
    "sqli_sensitivity_level_4" = {
      action          = "deny(502)"
      priority        = 1
      target_rule_set = "sqli-v33-stable"
      sensitivity_level = 4
      description       = "sqli-v33-stable Sensitivity Level 4 and 2 preconfigured_waf_config_exclusions"
    }

    "xss-stable_level_2_with_exclude" = {
      action                  = "deny(502)"
      priority                = 2
      description             = "XSS Sensitivity Level 2 with excluded rules"
      preview                 = true
      target_rule_set         = "xss-v33-stable"
      sensitivity_level       = 2
      exclude_target_rule_ids = ["owasp-crs-v030301-id941380-xss", "owasp-crs-v030301-id941280-xss"]
    }

    "php-stable_level_0_with_include" = {
      action                  = "deny(502)"
      priority                = 3
      description             = "PHP Sensitivity Level 0 with included rules"
      target_rule_set         = "php-v33-stable"
      include_target_rule_ids = ["owasp-crs-v030301-id933190-php", "owasp-crs-v030301-id933111-php"]
    }

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
