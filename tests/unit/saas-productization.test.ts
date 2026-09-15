import test from "node:test";
import assert from "node:assert/strict";
import { Tenant, DEFAULT_PLAN_LIMITS } from "../../src/domain/tenant/tenant.js";
import { QuotaService } from "../../src/application/billing/quota-service.js";
import { QuotaExceededError } from "../../src/domain/billing/quota.js";
import { FeatureFlagService } from "../../src/application/tenant/feature-flag-service.js";

test("Prompt 78 - SaaS Model: creates tenant with proper plan limits and default ACTIVE status", () => {
  const freeTenant = Tenant.create("tenant-free-01", "Free Tier Customer", "FREE");
  assert.equal(freeTenant.id, "tenant-free-01");
  assert.equal(freeTenant.plan, "FREE");
  assert.equal(freeTenant.status, "ACTIVE");
  assert.equal(freeTenant.limits.maxTasksPerMonth, 500);
  assert.equal(freeTenant.isCapabilityAllowed("commerce.catalog"), true);
  assert.equal(freeTenant.isCapabilityAllowed("advanced.analytics"), false);

  const enterpriseTenant = Tenant.create("tenant-ent-01", "Enterprise Global", "ENTERPRISE");
  assert.equal(enterpriseTenant.isCapabilityAllowed("advanced.analytics"), true);
});

test("Prompt 78 - SaaS Quotas: QuotaService enforces task and execution limits fail-closed", () => {
  const quotaService = new QuotaService();
  const tenant = Tenant.create("tenant-test-quota", "Testing Quotas", "FREE");

  // Consume within limits
  quotaService.consumeQuota(tenant, "tasks", 10);
  const check1 = quotaService.checkQuota(tenant, "tasks", 1);
  assert.equal(check1.allowed, true);
  assert.equal(check1.currentUsage, 10);
  assert.equal(check1.remaining, 490);

  // Attempt to exceed limits
  assert.throws(
    () => quotaService.consumeQuota(tenant, "tasks", 500),
    (err: any) => err instanceof QuotaExceededError && err.code === "QUOTA_EXCEEDED"
  );
});

test("Prompt 78 - SaaS Feature Flags: FeatureFlagService gates capabilities by tenant plan and overrides", () => {
  const ffService = new FeatureFlagService();
  const freeTenant = Tenant.create("tenant-free-ff", "Free Tenant", "FREE");
  const proTenant = Tenant.create("tenant-pro-ff", "Pro Tenant", "PRO");

  assert.equal(ffService.isFeatureEnabled(freeTenant, "real_llm_routing"), false);
  assert.equal(ffService.isFeatureEnabled(proTenant, "real_llm_routing"), true);
  assert.equal(ffService.isFeatureEnabled(freeTenant, "n8n_integration"), false);

  // Explicit override grants feature to free tenant
  ffService.enableFeatureForTenant(freeTenant.id, "real_llm_routing");
  assert.equal(ffService.isFeatureEnabled(freeTenant, "real_llm_routing"), true);
});
