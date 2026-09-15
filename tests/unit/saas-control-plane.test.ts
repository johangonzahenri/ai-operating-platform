import test from "node:test";
import assert from "node:assert/strict";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatform } from "../../src/interfaces/composition.js";

function setupService(): PlatformService {
  const platform = createPlatform();
  return new PlatformService({
    ...platform,
    models: platform.modelRegistry,
  });
}


test("Prompt 82 - SaaS Control Plane: Multi-Tenant Query & Hard Isolation", async () => {

  const service = setupService();
  const tenants = service.listTenants();

  assert.equal(tenants.length >= 3, true, "Must have default seeded tenants");
  const tentacionesTenant = service.getTenant("tenant-tentaciones");
  assert.ok(tentacionesTenant);
  assert.equal(tentacionesTenant.plan, "PRO");
  assert.equal(tentacionesTenant.status, "ACTIVE");
  assert.equal(tentacionesTenant.limits.maxTasksPerMonth, 5000);

  const nonExistent = service.getTenant("tenant-non-existent");
  assert.equal(nonExistent, undefined);
});

test("Prompt 82 - SaaS Control Plane: Tenant Dashboard & Working Set Quotas", async () => {
  const service = setupService();
  const dashboard = service.getTenantDashboard("tenant-tentaciones");

  assert.ok(dashboard);
  assert.equal(dashboard.tenantId, "tenant-tentaciones");
  assert.equal(dashboard.plan, "PRO");
  assert.equal(dashboard.status, "ACTIVE");
  assert.ok(Array.isArray(dashboard.quotas));
  assert.equal(dashboard.quotas.length, 4);

  const taskQuota = dashboard.quotas.find((q) => q.metric === "tasks");
  assert.ok(taskQuota);
  assert.equal(taskQuota.limit, 5000);
  assert.equal(taskQuota.status, "OK");
  assert.equal(typeof taskQuota.percentageUsed, "number");
});

test("Prompt 82 - SaaS Control Plane: Global Usage Telemetry & Honest Truth Reporting", async () => {
  const service = setupService();
  const usage = service.getGlobalUsageSummary();

  assert.equal(typeof usage.totalTasks, "number");
  assert.equal(typeof usage.totalExecutions, "number");
  assert.equal(typeof usage.totalToolCalls, "number");
  assert.equal(usage.totalTokens, "NOT_AVAILABLE", "Truth Mode: Token counts are NOT_AVAILABLE until tokenizer connected");
  assert.equal(usage.totalStorageMb, "NOT_AVAILABLE", "Truth Mode: Storage is NOT_AVAILABLE without disk quota manager");
  assert.equal(usage.activeTenantsCount >= 3, true);
});
