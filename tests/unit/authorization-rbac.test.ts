import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { Principal, SecurityContext } from "../../src/domain/security/security.js";
import {
  Permission,
  PermissionValidationError,
  Role,
  RoleValidationError,
  AuthorizationRequest,
} from "../../src/domain/security/authorization.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import {
  RbacAuthorizationEvaluator,
  ExplicitPolicyRule,
} from "../../src/application/security/rbac-authorization-evaluator.js";
import { RbacPolicyGateway } from "../../src/infrastructure/policy/rbac-policy-gateway.js";
import { EventPublisher, DomainEvent } from "../../src/domain/events/events.js";
import { PolicyContext } from "../../src/domain/policy/policy.js";

class MockEventPublisher implements EventPublisher {
  readonly publishedEvents: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.publishedEvents.push(event);
  }
}

test("1. Permission: creates valid permission, parses strings, and matches wildcards", () => {
  const perm1 = Permission.create({ resource: "tool", action: "invoke" });
  assert.equal(perm1.resource, "tool");
  assert.equal(perm1.action, "invoke");
  assert.equal(perm1.toFormattedString(), "tool.invoke");
  assert.equal(perm1.matches("tool", "invoke"), true);
  assert.equal(perm1.matches("tool", "read"), false);
  assert.equal(perm1.matches("agent", "invoke"), false);

  const wildcardPerm = Permission.parse("task.*");
  assert.equal(wildcardPerm.matches("task", "create"), true);
  assert.equal(wildcardPerm.matches("task", "execute"), true);
  assert.equal(wildcardPerm.matches("tool", "execute"), false);

  const universalPerm = Permission.parse("*");
  assert.equal(universalPerm.matches("any", "anything"), true);

  assert.throws(
    () => Permission.create({ resource: "", action: "read" }),
    (err: Error) => err instanceof PermissionValidationError,
  );
});

test("2. Role: creates immutable role with permissions and verifies matches", () => {
  const role = Role.create({
    id: "editor",
    name: "Content Editor",
    permissions: ["content.read", "content.write", "media.*"],
    description: "Can edit content and manage media",
  });

  assert.equal(role.id, "editor");
  assert.equal(role.name, "Content Editor");
  assert.equal(role.hasPermission("content.read"), true);
  assert.equal(role.hasPermission("content.write"), true);
  assert.equal(role.hasPermission("media.upload"), true);
  assert.equal(role.hasPermission("media.delete"), true);
  assert.equal(role.hasPermission("admin.delete"), false);
  assert.equal(Object.isFrozen(role), true);

  assert.throws(
    () => Role.create({ id: "", name: "Invalid", permissions: [] }),
    (err: Error) => err instanceof RoleValidationError,
  );
});

test("3. RBAC Evaluator: Authenticated user with matching role permission is ALLOWED", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const principal = Principal.create({
    id: "user_alice",
    type: "HUMAN",
    roles: ["user"],
  });
  const context = SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "corr-1",
  });

  const request: AuthorizationRequest = {
    context,
    action: "task.create",
    resourceType: "TASK",
    resourceId: "task-100",
  };

  const result = await evaluator.evaluate(request);
  assert.equal(result.allowed, true);
  assert.equal(result.code, "SECURITY_RBAC_ALLOWED");
  assert.deepEqual(result.matchedRoles, ["user"]);
});

test("4. RBAC Evaluator: Authenticated user without matching permission is DENIED (Default Deny)", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const principal = Principal.create({
    id: "user_bob",
    type: "HUMAN",
    roles: ["user"],
  });
  const context = SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "corr-2",
  });

  const request: AuthorizationRequest = {
    context,
    action: "system.reboot",
    resourceType: "SYSTEM",
    resourceId: "platform-kernel",
  };

  const result = await evaluator.evaluate(request);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "SECURITY_DEFAULT_DENY");
});

test("5. Anonymous: Public operations are ALLOWED, protected operations are DENIED", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const anonContext = SecurityContext.anonymous("corr-anon");

  const publicReq: AuthorizationRequest = {
    context: anonContext,
    action: "public.read",
    resourceType: "API",
    resourceId: "status-page",
  };
  const publicRes = await evaluator.evaluate(publicReq);
  assert.equal(publicRes.allowed, true);
  assert.equal(publicRes.code, "SECURITY_PUBLIC_ALLOWED");

  const healthReq: AuthorizationRequest = {
    context: anonContext,
    action: "health.check",
    resourceType: "API",
    resourceId: "healthz",
  };
  const healthRes = await evaluator.evaluate(healthReq);
  assert.equal(healthRes.allowed, true);

  const protectedReq: AuthorizationRequest = {
    context: anonContext,
    action: "task.create",
    resourceType: "TASK",
    resourceId: "task-secret",
  };
  const protectedRes = await evaluator.evaluate(protectedReq);
  assert.equal(protectedRes.allowed, false);
  assert.equal(protectedRes.code, "SECURITY_UNAUTHENTICATED");
});

test("6. Explicit Policy Precedence: Explicit DENY overrides matching role permission", async () => {
  const roleRepo = new InMemoryRoleRepository();

  const maintenanceDenyPolicy: ExplicitPolicyRule = {
    id: "deny-during-maintenance",
    effect: "DENY",
    description: "Denies all task creations during maintenance window",
    matches: (req) => req.action === "task.create",
  };

  const evaluator = new RbacAuthorizationEvaluator(roleRepo, undefined, [maintenanceDenyPolicy]);

  const principal = Principal.create({
    id: "operator_dave",
    type: "HUMAN",
    roles: ["operator"],
  });
  const context = SecurityContext.create({ principal, authenticated: true, correlationId: "corr-maint" });

  const result = await evaluator.evaluate({
    context,
    action: "task.create",
    resourceType: "TASK",
    resourceId: "task-emergency",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "SECURITY_EXPLICIT_DENIED");
  assert.equal(result.matchedPolicyId, "deny-during-maintenance");
});

test("7. Tenant Isolation: Cross-tenant access is DENIED fail-closed", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const principal = Principal.create({
    id: "tenant_a_user",
    type: "HUMAN",
    roles: ["operator"],
    tenantId: "tenant-alpha",
  });
  const context = SecurityContext.create({
    principal,
    authenticated: true,
    tenantId: "tenant-alpha",
    correlationId: "corr-tenant",
  });

  const request: AuthorizationRequest = {
    context,
    action: "task.read",
    resourceType: "TASK",
    resourceId: "task-beta-1",
    targetTenantId: "tenant-beta", // Attempting cross-tenant access!
  };

  const result = await evaluator.evaluate(request);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "SECURITY_TENANT_ISOLATION_VIOLATION");
});

test("8. Scope Isolation: Out-of-scope resource access is DENIED", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const principal = Principal.create({
    id: "scoped_worker",
    type: "SERVICE",
    roles: ["operator"],
  });
  const context = SecurityContext.create({
    principal,
    authenticated: true,
    resourceScope: "scope:billing",
    correlationId: "corr-scope",
  });

  const request: AuthorizationRequest = {
    context,
    action: "task.read",
    resourceType: "TASK",
    resourceId: "task-hr-1",
    targetScope: "scope:hr", // Mismatched scope!
  };

  const result = await evaluator.evaluate(request);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "SECURITY_SCOPE_ISOLATION_VIOLATION");
});

test("9. Agent Self-Escalation & Cross-Agent Boundaries: Agents cannot modify roles or access other agents without handoff", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const agentPrincipal = Principal.create({
    id: "agent_researcher",
    type: "AGENT",
    roles: ["agent"],
  });
  const agentContext = SecurityContext.create({
    principal: agentPrincipal,
    authenticated: true,
    correlationId: "corr-agent-escalate",
  });

  // Attempting role self-escalation
  const escalationReq: AuthorizationRequest = {
    context: agentContext,
    action: "role.assign",
    resourceType: "SYSTEM",
    resourceId: "role-system-admin",
  };
  const escalationRes = await evaluator.evaluate(escalationReq);
  assert.equal(escalationRes.allowed, false);
  assert.equal(escalationRes.code, "SECURITY_AGENT_ESCALATION_BLOCKED");

  // Attempting cross-agent access without handoff.transfer
  const crossAgentReq: AuthorizationRequest = {
    context: agentContext,
    action: "memory.read",
    resourceType: "MEMORY",
    resourceId: "agent_coder_memory",
    targetAgentId: "agent_coder",
  };
  const crossAgentRes = await evaluator.evaluate(crossAgentReq);
  assert.equal(crossAgentRes.allowed, false);
  assert.equal(crossAgentRes.code, "SECURITY_CROSS_AGENT_VIOLATION");

  // Authorized handoff transfer is permitted for AGENT role
  const handoffReq: AuthorizationRequest = {
    context: agentContext,
    action: "handoff.transfer",
    resourceType: "COORDINATION",
    resourceId: "coord-session-1",
    targetAgentId: "agent_coder",
  };
  const handoffRes = await evaluator.evaluate(handoffReq);
  assert.equal(handoffRes.allowed, true);
  assert.equal(handoffRes.code, "SECURITY_RBAC_ALLOWED");
});

test("10. SYSTEM Protection: External identities claiming SYSTEM type are DENIED", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const fakeSystemPrincipal = Principal.create({
    id: "malicious_external_actor",
    type: "SYSTEM",
    roles: ["system-admin"],
  });
  const context = SecurityContext.create({
    principal: fakeSystemPrincipal,
    authenticated: true,
    correlationId: "corr-fake-sys",
  });

  const request: AuthorizationRequest = {
    context,
    action: "system.shutdown",
    resourceType: "SYSTEM",
    resourceId: "cluster-root",
  };

  const result = await evaluator.evaluate(request);
  assert.equal(result.allowed, false);
  assert.equal(result.code, "SECURITY_SYSTEM_PROTECTED");
});

test("11. Fail-Closed on invalid requests and evaluator exceptions", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  // Null request
  const nullRes = await evaluator.evaluate(null);
  assert.equal(nullRes.allowed, false);
  assert.equal(nullRes.code, "SECURITY_INVALID_REQUEST");

  // Missing context
  const missingContextRes = await evaluator.evaluate({ action: "read" });
  assert.equal(missingContextRes.allowed, false);
  assert.equal(missingContextRes.code, "SECURITY_CONTEXT_MISSING");

  // Simulated crashing repository
  const crashingRepo: any = {
    getRolesForPrincipal: async () => {
      throw new Error("Database crashed unexpectedly");
    },
  };
  const crashingEvaluator = new RbacAuthorizationEvaluator(crashingRepo);
  const validContext = SecurityContext.create({
    principal: Principal.create({ id: "p1", type: "HUMAN", roles: ["user"] }),
    authenticated: true,
    correlationId: "corr-crash",
  });

  const crashRes = await crashingEvaluator.evaluate({
    context: validContext,
    action: "task.read",
    resourceType: "TASK",
    resourceId: "task-1",
  });
  assert.equal(crashRes.allowed, false);
  assert.equal(crashRes.code, "SECURITY_EVALUATION_ERROR");
});

test("12. Determinism: Identical inputs produce identical authorization decisions across multiple runs", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const principal = Principal.create({ id: "agent_runner", type: "AGENT", roles: ["agent"] });
  const context = SecurityContext.create({ principal, authenticated: true, correlationId: "corr-det" });

  const request: AuthorizationRequest = {
    context,
    action: "tool.invoke",
    resourceType: "TOOL",
    resourceId: "web-search-tool",
  };

  const run1 = await evaluator.evaluate(request);
  const run2 = await evaluator.evaluate(request);
  const run3 = await evaluator.evaluate(request);

  assert.equal(run1.allowed, true);
  assert.equal(run1.code, run2.code);
  assert.equal(run2.code, run3.code);
  assert.equal(run1.reason, run2.reason);
  assert.deepEqual(run1.matchedRoles, run2.matchedRoles);
});

test("13. PolicyGateway Integration: RbacPolicyGateway evaluates before execution and bridges PolicyContext", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);

  const principal = Principal.create({ id: "agent_01", type: "AGENT", roles: ["agent"] });
  const secContext = SecurityContext.create({ principal, authenticated: true, correlationId: "trace-gw" });

  const gateway = new RbacPolicyGateway(evaluator);

  const policyContext: PolicyContext = {
    traceId: "trace-gw",
    operationType: "TOOL",
    resourceId: "calculator-tool",
    action: "tool.invoke",
    agentId: "agent_01",
    metadata: { securityContext: secContext },
  };

  const decision = await gateway.evaluate(policyContext);
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, "SECURITY_RBAC_ALLOWED");

  // Unauthorized operation via PolicyGateway
  const deniedPolicyContext: PolicyContext = {
    traceId: "trace-gw",
    operationType: "TOOL",
    resourceId: "unauthorized-super-tool",
    action: "system.execute_shell",
    agentId: "agent_01",
    metadata: { securityContext: secContext },
  };

  const deniedDecision = await gateway.evaluate(deniedPolicyContext);
  assert.equal(deniedDecision.allowed, false);
  assert.equal(deniedDecision.code, "SECURITY_DEFAULT_DENY");
});

test("14. Authorization Events: Publishes authorization.allowed and authorization.denied events without leaking secrets", async () => {
  const roleRepo = new InMemoryRoleRepository();
  const eventPublisher = new MockEventPublisher();
  const evaluator = new RbacAuthorizationEvaluator(roleRepo, eventPublisher);

  const sensitiveSecretToken = "SENSITIVE_SECRET_TOKEN_DO_NOT_EXPOSE";
  const principal = Principal.create({ id: "user_audit", type: "HUMAN", roles: ["user"] });
  const context = SecurityContext.create({
    principal,
    authenticated: true,
    correlationId: "corr-audit-1",
    requestId: "req-audit-100",
    metadata: { sensitiveToken: sensitiveSecretToken },
  });

  // Allowed request
  await evaluator.evaluate({
    context,
    action: "task.read",
    resourceType: "TASK",
    resourceId: "task-audit-1",
  });

  // Denied request
  await evaluator.evaluate({
    context,
    action: "system.format_drive",
    resourceType: "SYSTEM",
    resourceId: "disk-0",
  });

  assert.equal(eventPublisher.publishedEvents.length, 2);

  const allowedEvent = eventPublisher.publishedEvents[0]!;
  assert.equal(allowedEvent.type, "authorization.allowed");
  assert.equal(allowedEvent.traceId, "corr-audit-1");
  assert.equal(allowedEvent.payload.decision, "ALLOW");
  assert.equal(allowedEvent.payload.principalId, "user_audit");
  assert.equal(allowedEvent.payload.requestId, "req-audit-100");

  const deniedEvent = eventPublisher.publishedEvents[1]!;
  assert.equal(deniedEvent.type, "authorization.denied");
  assert.equal(deniedEvent.payload.decision, "DENY");
  assert.equal(deniedEvent.payload.code, "SECURITY_DEFAULT_DENY");

  const allEventsJson = JSON.stringify(eventPublisher.publishedEvents);
  assert.equal(allEventsJson.includes(sensitiveSecretToken), false, "Secrets in metadata must not leak into authorization events");
});
