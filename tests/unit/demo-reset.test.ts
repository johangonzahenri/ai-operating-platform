import test from "node:test";
import assert from "node:assert/strict";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatform } from "../../src/interfaces/composition.js";

function createMockPlatformService(): PlatformService {
  const platform = createPlatform();
  return new PlatformService({
    ...platform,
    models: platform.modelRegistry,
  });
}

test("Prompt 87 - Demo Reset: Resets demo tenant and preserves non-demo database schema", () => {
  const service = createMockPlatformService();

  const resetResult = service.resetDemoData();
  assert.equal(resetResult.status, "RESET_COMPLETED");
  assert.equal(resetResult.tenantId, "tenant-tentaciones");
  assert.ok(resetResult.resetEntities.includes("demo-tenant"));
  assert.ok(resetResult.resetEntities.includes("demo-tasks"));

  // Check tenant is restored with active PRO plan
  const tenant = service.getTenant("tenant-tentaciones");
  assert.ok(tenant);
  assert.equal(tenant?.plan, "PRO");
  assert.equal(tenant?.status, "ACTIVE");
});
