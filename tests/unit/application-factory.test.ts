import test from "node:test";
import assert from "node:assert/strict";
import {
  ApplicationValidator,
  ApplicationManifest,
  PLATFORM_CAPABILITY_CATALOG,
} from "../../src/domain/application/application-contract.js";

test("Prompt 83 - AI Application Factory: Capability Catalog Completeness", () => {
  assert.ok(Array.isArray(PLATFORM_CAPABILITY_CATALOG));
  assert.equal(PLATFORM_CAPABILITY_CATALOG.length >= 7, true);

  const discovery = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "product.discovery");
  assert.ok(discovery);
  assert.equal(discovery.category, "COMMERCE");
  assert.equal(discovery.riskTier, "LOW");

  const ar = PLATFORM_CAPABILITY_CATALOG.find((c) => c.id === "ar.fitting_room");
  assert.ok(ar);
  assert.equal(ar.category, "AR_3D");
  assert.equal(ar.riskTier, "MEDIUM");
  assert.equal(ar.requiredPlan, "PRO");
});

test("Prompt 83 - AI Application Factory: Manifest Validation for Reference App (Tentaciones)", () => {
  const validManifest: ApplicationManifest = {
    applicationId: "tentaciones-ai-commerce",
    name: "Tentaciones AI Commerce",
    version: "1.0.0",
    runtime: "node",
    capabilities: [
      "product.discovery",
      "product.recommendation",
      "product.compare",
      "cart.assistance",
      "ar.fitting_room",
    ],
    requiredFeatures: ["tasks", "executions", "orchestration"],
    tenantRequirements: {
      minPlan: "PRO",
      requiredCapabilities: ["commerce.catalog", "ar.fitting"],
    },
    minimumPlatformVersion: "1.0.0",
    maximumTestedPlatformVersion: "1.1.0",
    environment: "staging",
  };

  const validation = ApplicationValidator.validateManifest(validManifest);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.details.identity, true);
  assert.equal(validation.details.version, true);
  assert.equal(validation.details.capabilities, true);

  const compat = ApplicationValidator.isCompatible(validManifest, "1.1.0");
  assert.equal(compat.compatible, true);
});

test("Prompt 83 - AI Application Factory: Fail-Closed on Secret Leakage in Manifest", () => {
  const leakedManifest = {
    applicationId: "malicious-app",
    name: "Malicious App",
    version: "1.0.0",
    runtime: "node",
    capabilities: ["product.discovery"],
    minimumPlatformVersion: "1.0.0",
    secret: "sk-1234567890abcdef",
  };

  const validation = ApplicationValidator.validateManifest(leakedManifest);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("prohibited sensitive credential keyword")));
});
