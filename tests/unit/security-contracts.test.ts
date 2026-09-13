import assert from "node:assert/strict";
import test from "node:test";
import {
  Principal,
  SecurityContext,
  SecurityContextValidationError,
  evaluateFailClosedAuthorization,
  SECURITY_INVARIANTS,
  TRUST_BOUNDARIES,
} from "../../src/domain/security/security.js";
import { sanitizeBoundedValue } from "../../src/domain/context/bounded-data.js";

test("1. Principal creates valid immutable identity with roles and permissions", () => {
  const principal = Principal.create({
    id: "user-123",
    type: "HUMAN",
    name: "Operator Alice",
    roles: ["operator", "admin"],
    permissions: ["task.create", "task.execute"],
  });

  assert.equal(principal.id, "user-123");
  assert.equal(principal.type, "HUMAN");
  assert.equal(principal.name, "Operator Alice");
  assert.equal(principal.hasRole("admin"), true);
  assert.equal(principal.hasRole("guest"), false);
  assert.equal(principal.hasPermission("task.create"), true);
  assert.equal(principal.hasPermission("system.shutdown"), false);
  assert.equal(Object.isFrozen(principal), true);
  assert.equal(Object.isFrozen(principal.roles), true);
  assert.equal(Object.isFrozen(principal.permissions), true);
});

test("2. Principal rejects empty id and invalid type", () => {
  assert.throws(
    () => Principal.create({ id: "", type: "HUMAN" }),
    (err: Error) => err instanceof SecurityContextValidationError && err.message.includes("id must be a non-empty string"),
  );

  assert.throws(
    () => Principal.create({ id: "valid-id", type: "INVALID_TYPE" as any }),
    (err: Error) => err instanceof SecurityContextValidationError && err.message.includes("Invalid principal type"),
  );
});

test("3. SecurityContext creates valid context and verifies authentication state", () => {
  const principal = Principal.create({ id: "agent-1", type: "AGENT", permissions: ["tool.calculator"] });
  const context = SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "corr-100",
    resourceScope: "tenant-a",
  });

  assert.equal(context.authenticated, true);
  assert.equal(context.principal.id, "agent-1");
  assert.equal(context.correlationId, "corr-100");
  assert.equal(context.resourceScope, "tenant-a");
  assert.equal(Object.isFrozen(context), true);
});

test("4. SecurityContext.anonymous creates unauthenticated principal", () => {
  const anon = SecurityContext.anonymous("corr-anon");
  assert.equal(anon.authenticated, false);
  assert.equal(anon.principal.id, "anonymous");
  assert.equal(anon.principal.permissions.length, 0);
});

test("5. SecurityContext.system creates authenticated system principal with wildcard permission", () => {
  const sys = SecurityContext.system("corr-sys", "core-engine");
  assert.equal(sys.authenticated, true);
  assert.equal(sys.principal.type, "SYSTEM");
  assert.equal(sys.principal.hasPermission("any.privileged.operation"), true);
});

test("6. Fail-Closed: Missing principal or context is DENIED", () => {
  const resNull = evaluateFailClosedAuthorization(null);
  assert.equal(resNull.allowed, false);
  assert.equal(resNull.code, "SECURITY_INVALID_REQUEST");

  const resMissingCtx = evaluateFailClosedAuthorization({ action: "read" });
  assert.equal(resMissingCtx.allowed, false);
  assert.equal(resMissingCtx.code, "SECURITY_CONTEXT_MISSING");
});

test("7. Fail-Closed: Unauthenticated principal accessing protected resource is DENIED (Invariant #1)", () => {
  const anon = SecurityContext.anonymous("corr-1");
  const decision = evaluateFailClosedAuthorization({
    context: anon,
    action: "task.execute",
    resourceType: "API",
    resourceId: "execute-endpoint",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "SECURITY_UNAUTHENTICATED");
  assert.ok(decision.reason.includes("not authenticated"));
});

test("8. Fail-Closed: Missing or denied permission is DENIED (Invariant #3)", () => {
  const principal = Principal.create({ id: "user-bob", type: "HUMAN", permissions: ["task.read"] });
  const context = SecurityContext.create({ principal, authenticated: true, correlationId: "corr-2" });

  const decision = evaluateFailClosedAuthorization({
    context,
    action: "task.delete",
    resourceType: "API",
    resourceId: "task-99",
    requiredPermission: "task.delete",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "SECURITY_PERMISSION_DENIED");
});

test("9. Fail-Closed: Unknown / empty permission string is DENIED", () => {
  const principal = Principal.create({ id: "user-bob", type: "HUMAN", permissions: ["task.read"] });
  const context = SecurityContext.create({ principal, authenticated: true, correlationId: "corr-3" });

  const decision = evaluateFailClosedAuthorization({
    context,
    action: "task.delete",
    resourceType: "API",
    resourceId: "task-99",
    requiredPermission: "   ",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "SECURITY_PERMISSION_UNKNOWN");
});

test("10. Fail-Closed: Agent privilege escalation and cross-agent scope violation is DENIED (Invariant #4, #8)", () => {
  const agentPrincipal = Principal.create({ id: "agent-alpha", type: "AGENT", permissions: ["tool.calculator"] });
  const context = SecurityContext.create({ principal: agentPrincipal, authenticated: true, correlationId: "corr-4" });

  const decision = evaluateFailClosedAuthorization({
    context,
    action: "agent.private_read",
    resourceType: "AGENT",
    resourceId: "agent-beta",
    targetAgentId: "agent-beta", // Agent Alpha attempting to access Agent Beta state directly
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "SECURITY_CROSS_AGENT_VIOLATION");
  assert.ok(decision.reason.includes("cannot directly access resources of target agent"));
});

test("11. Fail-Closed: Policy evaluator error or exception results in DENIED (Invariant #11)", () => {
  const principal = Principal.create({ id: "user-1", type: "HUMAN", permissions: ["*"] });
  const context = SecurityContext.create({ principal, authenticated: true, correlationId: "corr-5" });

  const decision = evaluateFailClosedAuthorization(
    {
      context,
      action: "model.invoke",
      resourceType: "MODEL",
      resourceId: "gpt-4",
    },
    () => {
      throw new Error("Downstream policy database offline");
    }
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "POLICY_EVALUATION_FAILED");
  assert.ok(decision.reason.includes("Downstream policy database offline"));
});

test("12. Secret sanitization: Sensitive keys in security metadata are redacted (Invariant #12)", () => {
  const rawMetadata = {
    apiKey: "sk-secret-123",
    authorization: "Bearer my-jwt-token",
    password: "superpassword",
    normalData: "safe information",
  };

  const principal = Principal.create({
    id: "service-1",
    type: "SERVICE",
    metadata: rawMetadata,
  });

  assert.equal(principal.metadata.apiKey, "[redacted]");
  assert.equal(principal.metadata.authorization, "[redacted]");
  assert.equal(principal.metadata.password, "[redacted]");
  assert.equal(principal.metadata.normalData, "safe information");
});

test("13. Trust boundaries and security invariants constants are defined and immutable", () => {
  assert.equal(TRUST_BOUNDARIES.length, 8);
  assert.equal(SECURITY_INVARIANTS.length, 15);
  assert.equal(Object.isFrozen(TRUST_BOUNDARIES), true);
  assert.equal(Object.isFrozen(SECURITY_INVARIANTS), true);
});
