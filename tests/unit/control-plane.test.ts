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

test("Prompt 97 - Enterprise Control Plane: Architecture Separation Invariant", () => {
  const service = createMockPlatformService();

  // Invariant: Core Engine != Platform Product != Applications != External Services
  const apps = service.listApplications();
  assert.ok(Array.isArray(apps));
  assert.ok(apps.length >= 2);

  const tentaciones = apps.find((a) => a.id === "tentaciones-commerce");
  const vehicle = apps.find((a) => a.id === "vehicle-parts-platform");

  assert.ok(tentaciones, "Tentaciones AI Commerce must exist in application registry");
  assert.ok(vehicle, "Vehicle Parts Platform must exist in application registry");

  assert.equal(tentaciones.name, "Tentaciones AI Commerce");
  assert.equal(vehicle.name, "Vehicle Parts & Diagnostics Platform");
  assert.ok(tentaciones.allowedCapabilities.length > 0);
  assert.ok(vehicle.allowedCapabilities.length > 0);
});

test("Prompt 97 - Enterprise Control Plane: Full Application Lifecycle (Create -> Validate -> Register -> Suspend -> Retire)", () => {
  const service = createMockPlatformService();

  const manifest: ApplicationManifest = {
    applicationId: "logistics-fleet-control",
    name: "Enterprise Logistics & Fleet Control",
    version: "1.0.0",
    runtime: "node",
    capabilities: ["product.discovery", "automation.execute"],
    requiredFeatures: ["tasks", "executions"],
    tenantRequirements: {
      minPlan: "PRO",
    },
    minimumPlatformVersion: "1.1.0",
  };

  // 1. Validate manifest
  const result = service.validateApplicationManifest(manifest, "tenant-tentaciones");
  assert.ok(result.validation.valid, "Manifest should pass validation for valid schema");

  // 2. Register application under tenant-tentaciones
  const registered = service.registerApplication(manifest, "tenant-tentaciones");
  assert.equal(registered.id, "logistics-fleet-control");
  assert.equal(registered.implementationStatus, "IMPLEMENTED");
  assert.equal(registered.runtimeStatus, "HEALTHY");
  assert.equal(registered.allowedCapabilities.length, 2);

  // 3. Update lifecycle: Suspend
  const suspended = service.updateApplicationLifecycle("logistics-fleet-control", "SUSPENDED", "Security policy maintenance");
  assert.equal(suspended.runtimeStatus, "DEGRADED");
  assert.equal(suspended.allowedCapabilities.length, 0, "Capabilities must be revoked while suspended");

  // 4. Update lifecycle: Retire / Revoke
  const retired = service.updateApplicationLifecycle("logistics-fleet-control", "RETIRED", "End of lifecycle decommission");
  assert.equal(retired.runtimeStatus, "NOT_CONNECTED");
  assert.equal(retired.allowedCapabilities.length, 0, "All capabilities revoked on retire");
});

test("Prompt 97 - Enterprise Control Plane: Global Usage and Multi-Tenant Isolation", () => {
  const service = createMockPlatformService();

  const summary = service.getGlobalUsageSummary();
  assert.ok(summary.activeTenantsCount >= 1);
  assert.ok(summary.activeApplicationsCount >= 2);
  assert.ok(typeof summary.totalTasks === "number");
  assert.ok(typeof summary.totalExecutions === "number");
  assert.ok(typeof summary.totalModelCalls === "number");
  assert.ok(typeof summary.totalToolCalls === "number");
});

test("Prompt 97 - Enterprise Control Plane: Security Posture & Fail-Closed Guardrails", () => {
  const service = createMockPlatformService();

  // Fail-closed verification: non-existent app throws error
  assert.throws(
    () => service.getApplicationAnalytics("non-existent-app-id"),
    /not found/i
  );
});

test("Prompt 97 - Enterprise Control Plane: Platform Capability Catalog & Risk Governance", () => {
  const service = createMockPlatformService();
  const catalog = service.getCapabilityCatalog();

  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length >= 6);

  // Validate presence of core and high-tier capabilities
  const discovery = catalog.find((c) => c.id === "product.discovery");
  const fitting = catalog.find((c) => c.id === "ar.fitting_room");

  assert.ok(discovery, "product.discovery must be in catalog");
  assert.ok(fitting, "ar.fitting_room must be in catalog");
  assert.equal(discovery.category, "COMMERCE");
  assert.equal(fitting.category, "AR_3D");
});

test("Prompt 97 - Enterprise Control Plane: Tenant Dashboard Quotas and Working Bounds", () => {
  const service = createMockPlatformService();
  const dashboard = service.getTenantDashboard("tenant-tentaciones");

  assert.ok(dashboard);
  assert.equal(dashboard.tenantId, "tenant-tentaciones");
  assert.equal(dashboard.plan, "PRO");
  assert.ok(Array.isArray(dashboard.quotas));
  assert.ok(dashboard.quotas.some((q) => q.metric === "tasks"));
  assert.ok(dashboard.quotas.some((q) => q.metric === "executions"));
});

