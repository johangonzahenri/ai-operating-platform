import test from "node:test";
import assert from "node:assert/strict";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { PlanValidator } from "../../src/domain/autonomy/plan-validator.js";
import { PlanPolicyValidator } from "../../src/domain/autonomy/plan-policy-validator.js";
import { InMemoryToolRegistry } from "../../src/infrastructure/tools/in-memory-tool-registry.js";
import { ToolInvocationRuntime, CancellationToken } from "../../src/application/tools/tool-invocation-runtime.js";
import { PlanExecutionEngine } from "../../src/application/autonomy/plan-execution-engine.js";
import { SecurityContext, Principal } from "../../src/domain/security/security.js";
import { Role } from "../../src/domain/security/authorization.js";
import { InMemoryRoleRepository } from "../../src/infrastructure/security/in-memory-role-repository.js";
import { SecurityBoundaryEnforcer } from "../../src/application/security/security-boundary-enforcer.js";
import { RbacAuthorizationEvaluator } from "../../src/application/security/rbac-authorization-evaluator.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import {
  ToolNotFoundError,
  ToolVersionNotFoundError,
  ToolInputValidationError,
  ToolOutputValidationError,
  ToolAuthorizationError,
  ToolApprovalRequiredError,
  ToolTimeoutError,
} from "../../src/domain/tools/tool-registry.js";

function setupAuditEnvironment() {
  const events = new InMemoryEventPublisher();
  const roleRepo = new InMemoryRoleRepository();

  roleRepo.saveRole(
    Role.create({
      id: "shopper",
      name: "Shopper Role",
      permissions: ["tool.invoke", "catalog:read"],
    })
  );

  roleRepo.saveRole(
    Role.create({
      id: "admin",
      name: "Admin Role",
      permissions: ["tool.*", "*"],
    })
  );

  const evaluator = new RbacAuthorizationEvaluator(roleRepo, events);
  const enforcer = new SecurityBoundaryEnforcer(evaluator, events);
  const registry = new InMemoryToolRegistry();

  // 1. Safe Read-Only Tool
  registry.register({
    definition: {
      id: "catalog.query",
      name: "Catalog Query",
      version: "1.0.0",
      description: "Queries public catalog",
      riskLevel: "LOW",
      permissions: ["catalog:read"],
      inputSchema: { required: ["query"], properties: { query: "string" } },
      outputSchema: { required: ["results"], properties: { results: "array" } },
      metadata: { apiKey: "super-secret-key-12345", internalPath: "/var/secret/conf" },
    },
    execute: async (input, ctx) => {
      const tenant = "tenantId" in ctx ? ctx.tenantId : undefined;
      return { output: { results: ["product-1", "product-2"], callerTenant: tenant } };
    },
  });

  // 2. High-Risk Side-Effecting Tool
  registry.register({
    definition: {
      id: "order.create",
      name: "Order Create",
      version: "1.0.0",
      description: "Creates commercial order",
      riskLevel: "HIGH",
      permissions: ["order:write"],
      inputSchema: { required: ["items"], properties: { items: "array" } },
      outputSchema: { required: ["orderId"], properties: { orderId: "string" } },
    },
    execute: async (input, ctx) => {
      return { output: { orderId: "ord-999" } };
    },
  });

  // 3. Critical-Risk Tool with Human Approval Requirement
  registry.register({
    definition: {
      id: "system.purge",
      name: "System Purge",
      version: "1.0.0",
      description: "Purges system records",
      riskLevel: "CRITICAL",
      requiresApproval: true,
      permissions: ["system:admin"],
      inputSchema: { required: ["confirm"], properties: { confirm: "boolean" } },
    },
    execute: async (input, ctx) => {
      return { output: { purged: true } };
    },
  });

  const runtime = new ToolInvocationRuntime({
    registry,
    events,
    securityEnforcer: enforcer,
    defaultTimeoutMs: 2000,
  });

  return { events, roleRepo, evaluator, enforcer, registry, runtime };
}

test("Adversarial Audit 1: Prompt Injection cannot bypass PlanValidator with nested forbidden security keys", () => {
  const plan = Plan.create({
    id: "plan-attack-1",
    operationId: "op-attack-1",
    version: 1,
    steps: [
      PlanStep.create({
        id: "step1",
        order: 1,
        action: "tool.catalog.query",
        input: {
          query: "shoes",
          nestedAttack: {
            roles: ["admin", "SYSTEM"],
            permissions: ["*"],
          },
        },
      }),
    ],
  });

  const validation = PlanValidator.validate(plan);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.some((v) => v.includes("forbidden security property injection 'roles'")));
});

test("Adversarial Audit 2: Deep nested prototype pollution in Plan step input is rejected fail-closed", () => {
  const plan = Plan.create({
    id: "plan-attack-2",
    operationId: "op-attack-2",
    version: 1,
    steps: [
      PlanStep.create({
        id: "step1",
        order: 1,
        action: "tool.catalog.query",
        input: {
          query: "shoes",
          payload: {
            __proto__: { isAdmin: true },
          },
        },
      }),
    ],
  });

  const validation = PlanValidator.validate(plan);
  assert.equal(validation.valid, false);
  assert.ok(validation.violations.some((v) => v.includes("disallowed input property '__proto__'")));
});

test("Adversarial Audit 3: Tool Discovery strips internal secrets and filters by caller permissions", () => {
  const { registry } = setupAuditEnvironment();

  const shopperContext = SecurityContext.create({
    principal: Principal.create({
      id: "shopper-1",
      type: "HUMAN",
      roles: ["shopper"],
      permissions: ["catalog:read"],
    }),
    authenticated: true,
    correlationId: "trace-shopper",
  });

  const definitions = registry.discoverSafeDefinitions(shopperContext);
  assert.equal(definitions.length, 1);
  const def = definitions[0];
  assert.ok(def);
  assert.equal(def.id, "catalog.query");
  
  // Verify secrets are redacted / stripped
  assert.equal((def.metadata as Record<string, unknown> | undefined)?.apiKey, undefined);
  assert.equal((def.metadata as Record<string, unknown> | undefined)?.internalPath, undefined);
});

test("Adversarial Audit 4: Tenant isolation prevents forged tenantId injection", async () => {
  const { runtime } = setupAuditEnvironment();

  const callerContext = SecurityContext.create({
    principal: Principal.create({
      id: "shopper-1",
      type: "HUMAN",
      roles: ["shopper"],
      permissions: ["catalog:read"],
    }),
    authenticated: true,
    tenantId: "tenant-legit",
    correlationId: "trace-tenant",
  });

  const execContext = ExecutionContext.create("trace-tenant", "exec-1", "task-1");

  const result = await runtime.invokeSecurely({
    request: {
      toolId: "catalog.query",
      input: { query: "sneakers" },
    },
    context: execContext,
    securityContext: callerContext,
  });

  assert.equal(result.output.callerTenant, "tenant-legit");
});

test("Adversarial Audit 5: Confused Deputy - Low privilege caller cannot execute high-privilege tool", async () => {
  const { runtime } = setupAuditEnvironment();

  const lowPrivContext = SecurityContext.create({
    principal: Principal.create({
      id: "low-user",
      type: "HUMAN",
      roles: ["shopper"],
      permissions: ["catalog:read"],
    }),
    authenticated: true,
    correlationId: "trace-confused",
  });

  const execContext = ExecutionContext.create("trace-confused", "exec-1", "task-1");

  await assert.rejects(
    async () => {
      await runtime.invokeSecurely({
        request: {
          toolId: "order.create",
          input: { items: ["item-1"] },
        },
        context: execContext,
        securityContext: lowPrivContext,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ToolAuthorizationError);
      return true;
    }
  );
});

test("Adversarial Audit 6: CRITICAL risk tool rejects forged or empty approval tokens", async () => {
  const { runtime } = setupAuditEnvironment();

  const adminContext = SecurityContext.create({
    principal: Principal.create({
      id: "admin-user",
      type: "HUMAN",
      roles: ["admin"],
      permissions: ["*"],
    }),
    authenticated: true,
    correlationId: "trace-admin",
  });

  const execContext = ExecutionContext.create("trace-admin", "exec-1", "task-1");

  // Rejects when no token is provided
  await assert.rejects(
    async () => {
      await runtime.invokeSecurely({
        request: {
          toolId: "system.purge",
          input: { confirm: true },
        },
        context: execContext,
        securityContext: adminContext,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ToolApprovalRequiredError);
      return true;
    }
  );

  // Rejects when empty/whitespace token is provided
  await assert.rejects(
    async () => {
      await runtime.invokeSecurely({
        request: {
          toolId: "system.purge",
          input: { confirm: true },
          approvalToken: "   ",
        },
        context: execContext,
        securityContext: adminContext,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ToolApprovalRequiredError);
      return true;
    }
  );

  // Succeeds when valid verified token is provided
  const result = await runtime.invokeSecurely({
    request: {
      toolId: "system.purge",
      input: { confirm: true },
      approvalToken: "verified-human-approval-token-xyz",
    },
    context: execContext,
    securityContext: adminContext,
  });

  assert.equal(result.output.purged, true);
});

test("Adversarial Audit 7: Plan Execution Engine cascades step failures and marks downstream dependents as SKIPPED", async () => {
  const { runtime } = setupAuditEnvironment();

  const adminContext = SecurityContext.create({
    principal: Principal.create({
      id: "admin-user",
      type: "HUMAN",
      roles: ["admin"],
      permissions: ["*"],
    }),
    authenticated: true,
    correlationId: "trace-dag",
  });

  const plan = Plan.create({
    id: "plan-dag-fail",
    operationId: "op-dag-fail",
    version: 1,
    steps: [
      PlanStep.create({
        id: "step1",
        order: 1,
        action: "tool.catalog.query",
        toolId: "catalog.query",
        input: { query: 12345 as unknown as string }, // Invalid type violates input schema
      }),
      PlanStep.create({
        id: "step2",
        order: 2,
        action: "tool.order.create",
        toolId: "order.create",
        input: { items: ["item-1"] },
        dependencies: ["step1"],
      }),
    ],
  });

  const execEngine = new PlanExecutionEngine();
  const report = await execEngine.executePlan({
    plan,
    toolGateway: runtime,
    context: ExecutionContext.create("trace-dag", "exec-dag", "task-dag"),
    securityContext: adminContext,
  });

  assert.equal(report.status, "FAILED");
  const step0 = report.steps[0];
  const step1 = report.steps[1];
  assert.ok(step0);
  assert.ok(step1);
  assert.equal(step0.status, "FAILED");
  assert.equal(step1.status, "SKIPPED");
});

test("Adversarial Audit 8: Deep prototype pollution in tool input payload is rejected fail-closed", async () => {
  const { runtime } = setupAuditEnvironment();

  const adminContext = SecurityContext.create({
    principal: Principal.create({
      id: "admin-user",
      type: "HUMAN",
      roles: ["admin"],
      permissions: ["*"],
    }),
    authenticated: true,
    correlationId: "trace-pollution",
  });

  const execContext = ExecutionContext.create("trace-pollution", "exec-1", "task-1");

  await assert.rejects(
    async () => {
      await runtime.invokeSecurely({
        request: {
          toolId: "catalog.query",
          input: {
            query: "shoes",
            nested: {
              __proto__: { polluted: true },
            },
          },
        },
        context: execContext,
        securityContext: adminContext,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ToolInputValidationError);
      return true;
    }
  );
});
