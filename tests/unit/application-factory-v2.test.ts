import test from "node:test";
import assert from "node:assert/strict";
import { ApplicationFactoryEngine } from "../../src/application/factory/application-generator.js";
import { Tenant } from "../../src/domain/tenant/tenant.js";

test("Prompt 95 - Application Factory 2.0: Official Templates retrieval", () => {
  const templates = ApplicationFactoryEngine.getFactoryTemplates();
  assert.ok(templates.length >= 4);

  const generic = templates.find((t) => t.id === "generic-ai-app");
  const commerce = templates.find((t) => t.id === "commerce-ai-app");
  const support = templates.find((t) => t.id === "support-ai-app");
  const automation = templates.find((t) => t.id === "automation-ai-app");

  assert.ok(generic);
  assert.ok(commerce);
  assert.ok(support);
  assert.ok(automation);

  assert.equal(commerce?.defaultCategory, "Commerce");
  assert.ok(commerce?.recommendedCapabilities.includes("cart.assistance"));
});

test("Prompt 95 - Application Factory 2.0: Capability Dependency Graph resolution", () => {
  const graph = ApplicationFactoryEngine.getCapabilityDependencyGraph([
    "product.discovery",
    "ar.fitting_room",
    "automation.execute",
  ]);

  assert.equal(graph.length, 3);
  const arNode = graph.find((g) => g.capabilityId === "ar.fitting_room");
  assert.ok(arNode);
  assert.ok(arNode.platformComponents.includes("AR Pipeline Subsystem"));

  const autoNode = graph.find((g) => g.capabilityId === "automation.execute");
  assert.ok(autoNode);
  assert.ok(autoNode.platformComponents.includes("Autonomous Operation Engine"));
});

test("Prompt 95 - Application Factory 2.0: Repair Configuration on invalid IDs and unentitled capabilities", () => {
  const freeTenant = Tenant.create("tenant-free-01", "Free Tenant Test", "FREE");

  const invalidManifest: any = {
    applicationId: "INVALID_APP_NAME_WITH_CAPS",
    name: "Invalid App",
    version: "1.0",
    runtime: "node",
    tenantId: "tenant-free-01",
    capabilities: ["product.discovery", "ar.fitting_room"], // ar.fitting_room requires PRO
  };

  const repairResult = ApplicationFactoryEngine.repairConfiguration(invalidManifest, freeTenant);
  assert.equal(repairResult.repaired, true);
  assert.equal(repairResult.repairedManifest.applicationId, "invalid-app-name-with-caps");
  assert.equal(repairResult.repairedManifest.capabilities.includes("ar.fitting_room"), false);
  assert.equal(repairResult.repairedManifest.capabilities.includes("product.discovery"), true);
  assert.ok(repairResult.actionsTaken.length >= 2);
});

test("Prompt 95 - Application Factory 2.0: Export Application Bundle without secrets", () => {
  const tenant = Tenant.create("tenant-test-01", "Test Tenant", "BUSINESS");
  const generated = ApplicationFactoryEngine.generateSkeleton(
    {
      applicationId: "exported-app-demo",
      name: "Exported App Demo",
      description: "Demonstration of clean bundle export",
      category: "Analytics",
      tenantId: "tenant-test-01",
      capabilities: ["product.discovery", "report.generate"],
    },
    tenant
  );

  const bundle = ApplicationFactoryEngine.exportApplicationBundle(generated);
  assert.equal(bundle.applicationId, "exported-app-demo");
  assert.ok(bundle.files.length >= 5);
  assert.ok(bundle.integrationGuide.includes("Integration Guide: Exported App Demo"));
  assert.equal(JSON.stringify(bundle).includes("sk_live_"), false);
  assert.equal(JSON.stringify(bundle).includes("secret_token"), false);
});
