import { test } from "node:test";
import assert from "node:assert";
import { EnterpriseGovernanceService } from "../../src/application/governance/governance-service.js";
import fs from "node:fs";

test("Prompt 71 - Enterprise Governance: Risk Tiering & Default-Deny Policies", () => {
  const gov = new EnterpriseGovernanceService();
  const policies = gov.getPolicies();
  assert.ok(policies.length >= 1, "Must contain default enterprise policies");
  assert.strictEqual(policies[0]?.status, "ACTIVE");

  // Discovery operation: LOW risk, AUTOMATIC oversight
  const opDiscovery = gov.evaluateOperationGovernance({
    actor: "tentaciones-app",
    resource: "commerce.catalog",
    action: "read",
    targetType: "APPLICATION",
    targetId: "tentaciones-ai-commerce",
  });
  assert.strictEqual(opDiscovery.allowed, true);
  assert.strictEqual(opDiscovery.riskTier, "LOW");
  assert.strictEqual(opDiscovery.oversight, "AUTOMATIC");

  // Cart mutation: MEDIUM risk, USER_CONFIRMATION oversight
  const opCart = gov.evaluateOperationGovernance({
    actor: "tentaciones-app",
    resource: "commerce.cart",
    action: "modify",
    targetType: "APPLICATION",
    targetId: "tentaciones-ai-commerce",
  });
  assert.strictEqual(opCart.allowed, true);
  assert.strictEqual(opCart.riskTier, "MEDIUM");
  assert.strictEqual(opCart.oversight, "USER_CONFIRMATION");

  // Unregistered resource: Default Deny
  const opUnknown = gov.evaluateOperationGovernance({
    actor: "malicious-actor",
    resource: "system.admin.root",
    action: "execute",
    targetType: "APPLICATION",
    targetId: "unknown",
  });
  assert.strictEqual(opUnknown.allowed, false);
  assert.strictEqual(opUnknown.riskTier, "HIGH");

  const auditLog = gov.getAuditTrail();
  assert.ok(auditLog.length >= 3, "Audit trail must track all evaluated decisions");
});

test("Prompt 71 - Application Governance Lifecycle & Status Updates", () => {
  const gov = new EnterpriseGovernanceService();
  const apps = gov.getApplications();
  assert.ok(apps.some((a) => a.applicationId === "tentaciones-ai-commerce"));

  const updated = gov.updateApplicationStatus("vehicle-parts-copilot", "REVIEW", "sec-admin-01");
  assert.strictEqual(updated, true);

  const vehicleApp = gov.getApplications().find((a) => a.applicationId === "vehicle-parts-copilot");
  assert.strictEqual(vehicleApp?.status, "REVIEW");
});

test("Prompt 71 - Governance Documentation Assets", () => {
  assert.ok(fs.existsSync("docs/ENTERPRISE_GOVERNANCE.md"), "ENTERPRISE_GOVERNANCE.md must exist");
});
