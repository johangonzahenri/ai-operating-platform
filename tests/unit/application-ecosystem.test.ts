import test from "node:test";
import assert from "node:assert/strict";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createPlatform } from "../../src/interfaces/composition.js";
import { type ApplicationManifest } from "../../src/domain/application/application-contract.js";

function createMockPlatformService(): PlatformService {
  const platform = createPlatform();
  return new PlatformService({
    ...platform,
    models: platform.modelRegistry,
  });
}

test("Prompt 93 - Application Ecosystem: Dynamic application registration and lifecycle management", () => {
  const service = createMockPlatformService();

  const customManifest: ApplicationManifest = {
    applicationId: "energy-grid-optimizer",
    name: "Energy Grid Optimizer Assistant",
    version: "1.0.0",
    runtime: "node",
    capabilities: ["product.discovery", "automation.execute"],
    requiredFeatures: [],
    tenantRequirements: {
      minPlan: "PRO",
    },
    minimumPlatformVersion: "1.1.0",
  };

  // 1. Register application under PRO tenant
  const registered = service.registerApplication(customManifest, "tenant-tentaciones");
  assert.equal(registered.id, "energy-grid-optimizer");
  assert.equal(registered.implementationStatus, "IMPLEMENTED");
  assert.equal(registered.runtimeStatus, "HEALTHY");

  // Verify in application registry listing
  const apps = service.listApplications();
  assert.ok(apps.some((a) => a.id === "energy-grid-optimizer"));

  // 2. Query application analytics
  const analytics = service.getApplicationAnalytics("energy-grid-optimizer");
  assert.equal(analytics.applicationId, "energy-grid-optimizer");
  assert.equal(analytics.totalTasks, 0);
  assert.equal(analytics.lifecycleStatus, "HEALTHY");

  // 3. Suspend application lifecycle
  const suspended = service.updateApplicationLifecycle("energy-grid-optimizer", "SUSPENDED", "Maintenance window");
  assert.equal(suspended.runtimeStatus, "DEGRADED");
  assert.equal(suspended.allowedCapabilities.length, 0); // Capabilities revoked while suspended

  // 4. Reactivate application
  const reactivated = service.updateApplicationLifecycle("energy-grid-optimizer", "OPERATIONAL", "Maintenance complete");
  assert.equal(reactivated.runtimeStatus, "HEALTHY");
});

test("Prompt 93 - Application Ecosystem: Platform-wide Analytics reflects active ecosystem state", () => {
  const service = createMockPlatformService();
  const summary = service.getGlobalUsageSummary();

  assert.ok(summary.activeTenantsCount >= 2);
  assert.ok(summary.activeApplicationsCount >= 2);
  assert.ok(typeof summary.totalTasks === "number");
  assert.ok(typeof summary.totalExecutions === "number");
});
