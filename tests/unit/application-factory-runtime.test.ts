import test from "node:test";
import assert from "node:assert/strict";
import {
  ApplicationFactoryEngine,
  type GenerateApplicationInput,
} from "../../src/application/factory/application-generator.js";
import { ApplicationValidator } from "../../src/domain/application/application-contract.js";
import { Tenant } from "../../src/domain/tenant/tenant.js";

test("Prompt 91 - Application Factory: Generates complete application skeleton with PlatformClient adapter", () => {
  const input: GenerateApplicationInput = {
    applicationId: "industrial-iot-copilot",
    name: "Industrial IoT Machinery Copilot",
    version: "1.0.0",
    description: "Predictive maintenance and telemetry analysis copilot for manufacturing machinery.",
    category: "Industrial IoT",
    tenantId: "tenant-industrial",
    capabilities: ["product.discovery", "automation.execute"],
    runtime: "node",
  };

  const freeTenant = Tenant.create("tenant-industrial", "Industrial Co", "PRO");
  const result = ApplicationFactoryEngine.generateSkeleton(input, freeTenant);

  assert.equal(result.manifest.applicationId, "industrial-iot-copilot");
  assert.equal(result.manifest.version, "1.0.0");
  assert.equal(result.validation.valid, true);
  assert.equal(result.entitlement.entitled, true);
  assert.equal(result.lifecycle, "VALIDATED");

  // Verify generated files structure
  const paths = result.files.map((f) => f.path);
  assert.ok(paths.includes("application.json"));
  assert.ok(paths.includes("src/adapter.ts"));
  assert.ok(paths.includes("src/health.ts"));
  assert.ok(paths.includes("src/observability.ts"));
  assert.ok(paths.includes("README.md"));
  assert.ok(paths.includes("tests/integration.test.ts"));

  // Check adapter contents
  const adapterFile = result.files.find((f) => f.path === "src/adapter.ts");
  assert.ok(adapterFile?.content.includes("IndustrialIotCopilotPlatformAdapter"));
  assert.ok(adapterFile?.content.includes("createPlatformClient"));
});

test("Prompt 91 - Manifest Validation: Rejects invalid IDs, malformed SemVer, and leaked secrets", () => {
  // Invalid ID
  const invalidId = ApplicationValidator.validateManifest({
    applicationId: "bad ID with spaces!",
    name: "Bad App",
    version: "1.0.0",
    runtime: "node",
    capabilities: ["product.discovery"],
    minimumPlatformVersion: "1.1.0",
  });
  assert.equal(invalidId.valid, false);
  assert.ok(invalidId.errors.some((e) => e.includes("applicationId")));

  // Invalid SemVer
  const invalidVersion = ApplicationValidator.validateManifest({
    applicationId: "valid-app-id",
    name: "Valid App",
    version: "v1-invalid",
    runtime: "node",
    capabilities: ["product.discovery"],
    minimumPlatformVersion: "1.1.0",
  });
  assert.equal(invalidVersion.valid, false);
  assert.ok(invalidVersion.errors.some((e) => e.includes("version")));

  // Leaked Secret in Manifest
  const leakedSecret = ApplicationValidator.validateManifest({
    applicationId: "secret-leaker-app",
    name: "Secret App",
    version: "1.0.0",
    runtime: "node",
    capabilities: ["product.discovery"],
    minimumPlatformVersion: "1.1.0",
    apiKey: "sk-proj-1234567890abcdef",
  });
  assert.equal(leakedSecret.valid, false);
  assert.ok(leakedSecret.errors.some((e) => e.includes("sensitive credential")));
});

test("Prompt 91 - Capability Entitlement: Enforces Tenant Plan vs Capability Tier hierarchy", () => {
  const freeTenant = Tenant.create("tenant-free-tier", "Free User", "FREE");
  const proTenant = Tenant.create("tenant-pro-tier", "Pro User", "PRO");

  // ar.fitting_room requires PRO plan
  const freeCheck = ApplicationFactoryEngine.checkEntitlements(
    ["product.discovery", "ar.fitting_room"],
    freeTenant
  );
  assert.equal(freeCheck.entitled, false);
  assert.equal(freeCheck.grantedCapabilities.includes("product.discovery"), true);
  assert.equal(freeCheck.rejectedCapabilities.length, 1);
  assert.equal(freeCheck.rejectedCapabilities[0]?.capabilityId, "ar.fitting_room");

  // Pro tenant should pass
  const proCheck = ApplicationFactoryEngine.checkEntitlements(
    ["product.discovery", "ar.fitting_room"],
    proTenant
  );
  assert.equal(proCheck.entitled, true);
  assert.equal(proCheck.rejectedCapabilities.length, 0);
});

test("Prompt 91 - Application Test Harness: Verifies all 7 criteria before passing candidate", () => {
  const validManifest = {
    applicationId: "diagnostics-copilot",
    name: "Diagnostics Copilot",
    version: "1.0.0",
    runtime: "node",
    capabilities: ["product.discovery"],
    requiredFeatures: [],
    minimumPlatformVersion: "1.1.0",
  };

  const proTenant = Tenant.create("tenant-pro", "Pro Org", "PRO");
  const harnessPassed = ApplicationFactoryEngine.runHarness(validManifest, proTenant, true);

  assert.equal(harnessPassed.passed, true);
  assert.equal(harnessPassed.checks.identity.ok, true);
  assert.equal(harnessPassed.checks.authentication.ok, true);
  assert.equal(harnessPassed.checks.authorization.ok, true);
  assert.equal(harnessPassed.checks.capabilities.ok, true);
  assert.equal(harnessPassed.checks.health.ok, true);
  assert.equal(harnessPassed.checks.version.ok, true);
  assert.equal(harnessPassed.checks.observability.ok, true);

  // Failure scenario: Missing auth credentials
  const harnessNoAuth = ApplicationFactoryEngine.runHarness(validManifest, proTenant, false);
  assert.equal(harnessNoAuth.passed, false);
  assert.equal(harnessNoAuth.checks.authentication.ok, false);
});
