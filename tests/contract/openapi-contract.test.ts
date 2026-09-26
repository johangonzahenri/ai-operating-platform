import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPlatformClient } from "../../src/platform-client/index.js";

const ROOT_DIR = process.cwd();
const OPENAPI_PATH = path.join(ROOT_DIR, "docs", "openapi.yaml");

test("OpenAPI 3.1 Specification Contract: File existence and version", () => {
  assert.ok(fs.existsSync(OPENAPI_PATH), "docs/openapi.yaml exists");
  const content = fs.readFileSync(OPENAPI_PATH, "utf8");

  assert.ok(content.includes("openapi: 3.1.0"), "declares openapi: 3.1.0");
  assert.ok(content.includes("title: AI Operating Platform REST API"), "declares correct API title");
  assert.ok(content.includes("version: 1.4.0"), "declares platform version 1.4.0");
});

test("OpenAPI 3.1 Specification Contract: Structural integrity and zero unresolved refs", () => {
  const content = fs.readFileSync(OPENAPI_PATH, "utf8");

  // Check unique operationIds
  const opIdMatches = content.match(/operationId:\s*([a-zA-Z0-9_]+)/g) || [];
  const opIds = opIdMatches.map((m) => m.replace(/operationId:\s*/, "").trim());
  const opIdSet = new Set(opIds);
  assert.equal(opIds.length, opIdSet.size, "all operationIds must be unique");
  assert.ok(opIds.length >= 70, `expected at least 70 operationIds, found ${opIds.length}`);

  // Check all $ref components resolve
  const refMatches = content.match(/\$ref:\s*['"]?#\/components\/([a-zA-Z0-9_\/]+)['"]?/g) || [];
  assert.ok(refMatches.length > 50, "expected multiple component references");

  for (const ref of refMatches) {
    const target = ref.replace(/\$ref:\s*['"]?#\/components\//, "").replace(/['"]?$/, "").trim();
    const [, name] = target.split("/");
    assert.ok(
      content.includes(`    ${name}:`),
      `Unresolved component reference: #/components/${target}`
    );
  }
});

test("OpenAPI 3.1 Specification Contract: Core Domain Paths Coverage", () => {
  const content = fs.readFileSync(OPENAPI_PATH, "utf8");

  const requiredPaths = [
    "/status",
    "/health",
    "/health/live",
    "/health/ready",
    "/diagnostics",
    "/platform",
    "/metrics",
    "/events",
    "/events/stream",
    "/tools",
    "/models",
    "/agents",
    "/agents/{id}",
    "/agents/{id}/profile",
    "/agents/{id}/lifecycle",
    "/agents/{id}/evaluations",
    "/tasks",
    "/tasks/{id}",
    "/tasks/{id}/cancel",
    "/tasks/{id}/execute",
    "/executions/{id}",
    "/orchestrate",
    "/operations",
    "/operations/{id}",
    "/autonomous/runtime",
    "/autonomous/triggers",
    "/workflows",
    "/workflows/{id}",
    "/workflows/instances/{id}",
    "/verifications",
    "/approvals",
    "/solutions",
    "/solutions/{id}",
    "/organizations",
    "/organizations/{id}/hierarchy",
    "/coordination/request",
    "/credentials",
    "/credentials/{id}/rotate",
    "/credentials/{id}/revoke",
    "/portfolios",
    "/portfolios/{id}",
    "/mandates",
    "/mandates/reconcile-expired",
    "/governance/evidence/export",
    "/applications",
    "/applications/register",
    "/factory/generate",
    "/factory/validate",
    "/devices",
    "/devices/{id}/print-jobs",
    "/spareparts/search",
  ];

  for (const reqPath of requiredPaths) {
    assert.ok(
      content.includes(`  ${reqPath}:`),
      `Required OpenAPI path '${reqPath}' is missing from docs/openapi.yaml`
    );
  }
});

test("OpenAPI 3.1 Specification Contract: Standard Error and Security Models", () => {
  const content = fs.readFileSync(OPENAPI_PATH, "utf8");

  // Verify Error schema properties
  assert.ok(content.includes("Error:"), "components.schemas.Error is defined");
  assert.ok(content.includes("required: [error, status, code, requestId, correlationId, timestamp]"));

  // Verify standard response codes
  assert.ok(content.includes("BadRequestError:"), "components.responses.BadRequestError defined");
  assert.ok(content.includes("UnauthorizedError:"), "components.responses.UnauthorizedError defined");
  assert.ok(content.includes("ForbiddenError:"), "components.responses.ForbiddenError defined");
  assert.ok(content.includes("NotFoundError:"), "components.responses.NotFoundError defined");
  assert.ok(content.includes("ConflictError:"), "components.responses.ConflictError defined");
  assert.ok(content.includes("RateLimitError:"), "components.responses.RateLimitError defined");

  // Verify Security Schemes
  assert.ok(content.includes("apiKeyAuth:"), "apiKeyAuth security scheme defined");
  assert.ok(content.includes("bearerAuth:"), "bearerAuth security scheme defined");
  assert.ok(content.includes("name: X-API-Key"), "X-API-Key header specified");
});

test("OpenAPI 3.1 Specification Contract: PlatformClient SDK 1:1 Alignment", () => {
  const client = createPlatformClient({
    baseUrl: "http://127.0.0.1:3000",
    apiKey: "aop_live_test",
  });

  // Client root methods
  assert.equal(typeof client.health, "function");
  assert.equal(typeof client.getPlatformInfo, "function");
  assert.equal(typeof client.createTask, "function");

  // Task & Execution namespaces
  assert.equal(typeof client.tasks.create, "function");
  assert.equal(typeof client.tasks.get, "function");
  assert.equal(typeof client.tasks.cancel, "function");
  assert.equal(typeof client.tasks.execute, "function");
  assert.equal(typeof client.executions.get, "function");

  // Agent & Application namespaces
  assert.equal(typeof client.agents.list, "function");
  assert.equal(typeof client.applications.list, "function");
  assert.equal(typeof client.applications.get, "function");
  assert.equal(typeof client.applications.analytics, "function");
  assert.equal(typeof client.applications.updateLifecycle, "function");

  // Factory namespace
  assert.equal(typeof client.factory.generate, "function");
  assert.equal(typeof client.factory.validate, "function");
  assert.equal(typeof client.factory.register, "function");

  // Credentials namespace
  assert.equal(typeof client.credentials.create, "function");
  assert.equal(typeof client.credentials.rotate, "function");
  assert.equal(typeof client.credentials.revoke, "function");

  // Multi-Enterprise Governance namespace
  assert.equal(typeof client.portfolios.create, "function");
  assert.equal(typeof client.portfolios.grantMandate, "function");
  assert.equal(typeof client.portfolios.revokeMandate, "function");
  assert.equal(typeof client.portfolios.reconcileExpiredMandates, "function");
  assert.equal(typeof client.governance.exportEvidence, "function");
});
