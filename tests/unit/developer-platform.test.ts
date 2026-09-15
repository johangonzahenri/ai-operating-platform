import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { ApplicationTrustEngine } from "../../src/domain/application/application-trust.js";

test("Prompt 94 - Developer Platform: SDK initialization and method signatures", () => {
  const client = createPlatformClient({
    baseUrl: "http://localhost:3000",
    apiKey: "test-api-key",
  });

  assert.equal(typeof client.connect, "function");
  assert.equal(typeof client.health, "function");
  assert.equal(typeof client.createTask, "function");
  assert.equal(typeof client.tasks.create, "function");
  assert.equal(typeof client.tasks.get, "function");
  assert.equal(typeof client.tasks.execute, "function");
  assert.equal(typeof client.executions.get, "function");
  assert.equal(typeof client.applications.list, "function");
  assert.equal(typeof client.applications.analytics, "function");
  assert.equal(typeof client.applications.updateLifecycle, "function");
  assert.equal(typeof client.factory.generate, "function");
  assert.equal(typeof client.factory.validate, "function");
  assert.equal(typeof client.factory.register, "function");
});

test("Prompt 94 - Developer Platform: Application Trust & Compatibility Engine", () => {
  const trustUnverified = ApplicationTrustEngine.evaluateTrust({
    hasValidManifest: false,
    passesHarness: false,
    securityCompliant: false,
  });
  assert.equal(trustUnverified, "UNVERIFIED");

  const trustValidated = ApplicationTrustEngine.evaluateTrust({
    hasValidManifest: true,
    passesHarness: false,
    securityCompliant: false,
  });
  assert.equal(trustValidated, "VALIDATED");

  const trustVerified = ApplicationTrustEngine.evaluateTrust({
    hasValidManifest: true,
    passesHarness: true,
    securityCompliant: false,
  });
  assert.equal(trustVerified, "VERIFIED");

  const trustTrusted = ApplicationTrustEngine.evaluateTrust({
    hasValidManifest: true,
    passesHarness: true,
    securityCompliant: true,
  });
  assert.equal(trustTrusted, "TRUSTED");

  const trustSuspended = ApplicationTrustEngine.evaluateTrust({
    hasValidManifest: true,
    passesHarness: true,
    securityCompliant: true,
    isSuspended: true,
  });
  assert.equal(trustSuspended, "SUSPENDED");
});

test("Prompt 94 - Developer Platform: Capability Compatibility Matrix check", () => {
  const platformCaps = ["product.discovery", "product.recommendation", "cart.assistance"];
  
  const compOk = ApplicationTrustEngine.checkCompatibility(
    ["product.discovery", "cart.assistance"],
    platformCaps,
    "node"
  );
  assert.equal(compOk.isCompatible, true);
  assert.equal(compOk.status, "Compatible");
  assert.equal(compOk.missingCapabilities.length, 0);

  const compPartial = ApplicationTrustEngine.checkCompatibility(
    ["product.discovery", "unknown.advanced.feature"],
    platformCaps,
    "node"
  );
  assert.equal(compPartial.isCompatible, false);
  assert.equal(compPartial.status, "Partially Compatible");
  assert.equal(compPartial.missingCapabilities.length, 1);
});
