import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { SecurityBoundaryEnforcer } from "../../src/application/security/security-boundary-enforcer.js";
import { RbacAuthorizationEvaluator } from "../../src/application/security/rbac-authorization-evaluator.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import { Role } from "../../src/domain/security/authorization.js";
import { ToolAuthorizationError, ToolInputValidationError } from "../../src/domain/tools/tool-registry.js";

function setupSecurity() {
  const roleRepo = new InMemoryRoleRepository();
  roleRepo.saveRole(
    Role.create({
      id: "user",
      name: "Tenant User",
      permissions: ["catalog:read"],
    })
  );
  roleRepo.saveRole(
    Role.create({
      id: "admin",
      name: "Admin",
      permissions: ["*"],
    })
  );
  const evaluator = new RbacAuthorizationEvaluator(roleRepo);
  const enforcer = new SecurityBoundaryEnforcer(evaluator);
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();

  registry.register({
    definition: {
      id: "catalog.query",
      name: "Query Catalog",
      version: "1.0.0",
      description: "Query catalog",
      permissions: ["catalog:read"],
      inputSchema: { required: ["query"], properties: { query: "string", tenantId: "string" } },
    },
    execute: async (input, ctx) => {
      // Invariant: Tool must receive trusted tenantId from context, never from raw input
      const tenant = "tenantId" in ctx ? ctx.tenantId : undefined;
      return { output: { tenant, result: input.query } };
    },
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
    securityEnforcer: enforcer,
  });

  return { runtime, events, registry };
}

test("Security Boundary: prevents cross-tenant access and binds trusted tenantId from SecurityContext", async () => {
  const { runtime } = setupSecurity();

  const callerContext = SecurityContext.create({
    principal: Principal.create({ id: "user-alpha", type: "HUMAN", roles: ["user"], permissions: ["catalog:read"] }),
    authenticated: true,
    correlationId: "trace-tenant-1",
    tenantId: "tenant-alpha",
  });

  const execContext = ExecutionContext.create("trace-tenant-1", "exec-1", "task-1");

  // Attempting to forge a different tenantId in input should NOT override context tenantId
  const result = await runtime.invokeSecurely({
    request: {
      toolId: "catalog.query",
      input: { query: "shoes", tenantId: "tenant-bravo-victim" }, // Attacker trying to inject tenantId
    },
    context: execContext,
    securityContext: callerContext,
  });

  // Tool received tenant-alpha from trusted context
  assert.equal(result.output.tenant, "tenant-alpha");
});

test("Security Boundary: blocks risk level downgrade in caller input", async () => {
  const { runtime, registry } = setupSecurity();

  registry.register({
    definition: {
      id: "dangerous.wipe",
      name: "Wipe DB",
      version: "1.0.0",
      description: "Destructive wipe",
      riskLevel: "CRITICAL",
      permissions: ["*"],
      inputSchema: { required: [], properties: {} },
    },
    execute: async () => ({ output: { wiped: true } }),
  });

  const adminContext = SecurityContext.system();
  const execContext = ExecutionContext.create("trace-risk-1", "exec-1", "task-1");

  // Caller attempts to pass riskLevel: "LOW" to bypass approval check
  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: {
          toolId: "dangerous.wipe",
          input: { riskLevel: "LOW" }, // Injection attempt
        },
        context: execContext,
        securityContext: adminContext,
      }),
    (err: unknown) => {
      // Must enforce approval because definition riskLevel is CRITICAL
      return (err as { name?: string })?.name === "ToolApprovalRequiredError";
    }
  );
});

test("Security Boundary: blocks unauthenticated caller execution fail-closed", async () => {
  const { runtime } = setupSecurity();

  const unauthContext = SecurityContext.anonymous();
  const execContext = ExecutionContext.create("trace-unauth-1", "exec-1", "task-1");

  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: {
          toolId: "catalog.query",
          input: { query: "hats" },
        },
        context: execContext,
        securityContext: unauthContext,
      }),
    ToolAuthorizationError
  );
});
