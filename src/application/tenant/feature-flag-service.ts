import { Tenant } from "../../domain/tenant/tenant.js";

export type PlatformFeatureFlag =
  | "real_llm_routing"
  | "ar_3d_fitting"
  | "automation_webhooks"
  | "n8n_integration"
  | "custom_agent_creation"
  | "advanced_analytics";

export class FeatureFlagService {
  private readonly tenantOverrides: Map<string, Set<PlatformFeatureFlag>> = new Map();

  isFeatureEnabled(tenant: Tenant, feature: PlatformFeatureFlag): boolean {
    // Check explicit tenant overrides first
    const overrides = this.tenantOverrides.get(tenant.id);
    if (overrides && overrides.has(feature)) {
      return true;
    }

    // Default plan entitlement mapping
    switch (feature) {
      case "real_llm_routing":
        return tenant.plan === "PRO" || tenant.plan === "BUSINESS" || tenant.plan === "ENTERPRISE";
      case "ar_3d_fitting":
        return true; // Available on all tiers with varying asset caps
      case "automation_webhooks":
        return tenant.plan !== "FREE";
      case "n8n_integration":
        return tenant.plan === "BUSINESS" || tenant.plan === "ENTERPRISE";
      case "custom_agent_creation":
        return tenant.plan !== "FREE";
      case "advanced_analytics":
        return tenant.plan === "ENTERPRISE";
      default:
        return false;
    }
  }

  enableFeatureForTenant(tenantId: string, feature: PlatformFeatureFlag): void {
    if (!this.tenantOverrides.has(tenantId)) {
      this.tenantOverrides.set(tenantId, new Set());
    }
    this.tenantOverrides.get(tenantId)!.add(feature);
  }

  disableFeatureForTenant(tenantId: string, feature: PlatformFeatureFlag): void {
    if (this.tenantOverrides.has(tenantId)) {
      this.tenantOverrides.get(tenantId)!.delete(feature);
    }
  }
}
