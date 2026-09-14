import assert from "node:assert/strict";
import test from "node:test";
import {
  Tool,
  ToolDefinition,
  ToolNotFoundError,
  ToolInputValidationError,
  ToolOutputValidationError,
  ToolTimeoutError,
  ToolCancelledError,
  ToolAuthorizationError,
  ToolApprovalRequiredError,
  ToolPolicyRejectedError,
} from "../../src/domain/tools/tool-registry.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { ToolInvocationRuntime } from "../../src/application/tools/tool-invocation-runtime.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { SecurityBoundaryEnforcer } from "../../src/application/security/security-boundary-enforcer.js";
import { RbacAuthorizationEvaluator } from "../../src/application/security/rbac-authorization-evaluator.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import { Role } from "../../src/domain/security/authorization.js";

function createTestContext(traceId = "trace-test-1"): ExecutionContext {
  return ExecutionContext.create(traceId, "exec-test-1", "task-test-1");
}

function createSecurityEnforcer(): SecurityBoundaryEnforcer {
  const roleRepo = new InMemoryRoleRepository();
  roleRepo.saveRole(
    Role.create({
      id: "operator",
      name: "Operator",
      permissions: ["catalog:read", "calc:exec"],
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
  return new SecurityBoundaryEnforcer(evaluator);
}

test("ToolInvocationRuntime: successfully executes authorized tool and sanitizes output", async () => {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();

  registry.register({
    definition: {
      id: "product.get",
      name: "Get Product",
      version: "1.0.0",
      description: "Get product details",
      riskLevel: "LOW",
      executionMode: "READ_ONLY",
      permissions: ["catalog:read"],
      inputSchema: {
        required: ["productId"],
        properties: { productId: "string" },
      },
      outputSchema: {
        required: ["id", "price"],
        properties: { id: "string", price: "number" },
      },
    },
    execute: async (input) => ({
      output: {
        id: input.productId,
        price: 99.99,
        secretApiKey: "sk-super-secret-password-12345", // must be redacted
      },
      metadata: { source: "db" },
    }),
  });

  const enforcer = createSecurityEnforcer();
  const runtime = new ToolInvocationRuntime({
    registry,
    events,
    securityEnforcer: enforcer,
  });

  const secContext = SecurityContext.create({
    principal: Principal.create({ id: "agent-caller", type: "AGENT", roles: ["operator"], permissions: ["catalog:read"] }),
    authenticated: true,
    correlationId: "trace-auth-1",
    tenantId: "tenant-1",
  });

  const result = await runtime.invokeSecurely({
    request: {
      toolId: "product.get",
      input: { productId: "prod-100" },
    },
    context: createTestContext(),
    securityContext: secContext,
  });

  assert.equal(result.output.id, "prod-100");
  assert.equal(result.output.price, 99.99);
  // Redaction check
  assert.equal(result.output.secretApiKey, "[redacted]");
  assert.ok(result.sanitized);

  // Assert events published
  assert.ok(events.events.some((e) => e.type === "tool.invocation.requested"));
  assert.ok(events.events.some((e) => e.type === "tool.authorized"));
  assert.ok(events.events.some((e) => e.type === "tool.execution.started"));
  assert.ok(events.events.some((e) => e.type === "tool.execution.completed"));
});

test("ToolInvocationRuntime: rejects unauthorized tool execution fail-closed", async () => {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();
  const enforcer = createSecurityEnforcer();

  registry.register({
    definition: {
      id: "system.reboot",
      name: "Reboot System",
      version: "1.0.0",
      description: "Reboots server",
      riskLevel: "CRITICAL",
      executionMode: "DESTRUCTIVE",
      permissions: ["system:reboot"],
      inputSchema: { required: [], properties: {} },
    },
    execute: async () => ({ output: { ok: true } }),
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
    securityEnforcer: enforcer,
  });

  const operatorContext = SecurityContext.create({
    principal: Principal.create({ id: "user-op", type: "HUMAN", roles: ["operator"], permissions: ["catalog:read"] }),
    authenticated: true,
    correlationId: "trace-unauth-1",
    tenantId: "tenant-1",
  });

  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: { toolId: "system.reboot", input: {} },
        context: createTestContext(),
        securityContext: operatorContext,
      }),
    ToolAuthorizationError
  );

  assert.ok(events.events.some((e) => e.type === "tool.rejected"));
});

test("ToolInvocationRuntime: requires approval token for CRITICAL risk tools", async () => {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();
  const enforcer = createSecurityEnforcer();

  registry.register({
    definition: {
      id: "payment.charge",
      name: "Charge Card",
      version: "1.0.0",
      description: "Charges customer card",
      riskLevel: "CRITICAL",
      executionMode: "SIDE_EFFECTING",
      permissions: ["*"],
      inputSchema: { required: ["amount"], properties: { amount: "number" } },
    },
    execute: async (input) => ({ output: { charged: input.amount } }),
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
    securityEnforcer: enforcer,
  });

  const adminContext = SecurityContext.system();

  // Missing approval token
  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: { toolId: "payment.charge", input: { amount: 150 } },
        context: createTestContext(),
        securityContext: adminContext,
      }),
    ToolApprovalRequiredError
  );

  assert.ok(events.events.some((e) => e.type === "tool.approval_required"));

  // With approval token -> succeeds
  const approvedResult = await runtime.invokeSecurely({
    request: {
      toolId: "payment.charge",
      input: { amount: 150 },
      approvalToken: "human-approval-token-xyz-123",
    },
    context: createTestContext(),
    securityContext: adminContext,
  });

  assert.equal(approvedResult.output.charged, 150);
});

test("ToolInvocationRuntime: aborts tool execution upon timeout", async () => {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();

  registry.register({
    definition: {
      id: "slow.tool",
      name: "Slow Tool",
      version: "1.0.0",
      description: "Takes too long",
      riskLevel: "LOW",
      timeoutMs: 50, // 50ms timeout
      inputSchema: { required: [], properties: {} },
    },
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { output: { done: true } };
    },
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
  });

  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: { toolId: "slow.tool", input: {} },
        context: createTestContext(),
      }),
    ToolTimeoutError
  );

  assert.ok(events.events.some((e) => e.type === "tool.execution.timed_out"));
  assert.ok(events.events.some((e) => e.type === "tool.execution.failed"));
});

test("ToolInvocationRuntime: enforces cancellation token before and during execution", async () => {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();

  registry.register({
    definition: {
      id: "calc.tool",
      name: "Calc",
      version: "1.0.0",
      description: "Quick calc",
      inputSchema: { required: [], properties: {} },
    },
    execute: async () => ({ output: { val: 42 } }),
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
  });

  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: { toolId: "calc.tool", input: {} },
        context: createTestContext(),
        cancellationToken: { isCancelled: true, reason: "User abort" },
      }),
    ToolCancelledError
  );
});

test("ToolInvocationRuntime: detects and blocks prototype pollution attempts in inputs", async () => {
  const registry = new InMemoryToolRegistry();
  const events = new InMemoryEventPublisher();

  registry.register({
    definition: {
      id: "safe.query",
      name: "Query",
      version: "1.0.0",
      description: "Safe query tool",
      inputSchema: { required: ["q"], properties: { q: "string" } },
    },
    execute: async (input) => ({ output: { echo: input.q } }),
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
  });

  const maliciousInput = JSON.parse('{"q": "hello", "__proto__": {"admin": true}}');

  await assert.rejects(
    () =>
      runtime.invokeSecurely({
        request: { toolId: "safe.query", input: maliciousInput },
        context: createTestContext(),
      }),
    ToolInputValidationError
  );
});
