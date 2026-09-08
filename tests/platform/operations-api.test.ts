import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PolicyContext, PolicyDecision } from "../../src/domain/policy/policy.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { StubPlanner } from "../../src/infrastructure/autonomy/stub-planner.js";
import { PlanStep } from "../../src/domain/autonomy/plan.js";

function setupTestServer(options?: {
  policyRule?: (context: PolicyContext) => PolicyDecision;
  policyThrows?: boolean;
}) {
  let runtimeExecuteCallCount = 0;

  const policy = new InMemoryPolicyGateway((context) => {
    if (options?.policyThrows) {
      throw new Error("Simulated policy gateway fatal crash");
    }
    if (options?.policyRule) {
      return options.policyRule(context);
    }
    return {
      allowed: true,
      policyId: "default-allow",
    };
  });

  const platform = createPlatform({ policy });

  // Wrap agentRuntime.execute to monitor if CoreRuntime is invoked
  const originalExecute = platform.agentRuntime.execute.bind(platform.agentRuntime);
  platform.agentRuntime.execute = async (task, agent) => {
    runtimeExecuteCallCount++;
    return originalExecute(task, agent);
  };

  const service = new PlatformService({
    tasks: platform.tasks,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
    operations: platform.operations,
    operationService: platform.operationService,
  });

  const server = createHttpServer(service);
  return {
    platform,
    service,
    server,
    getRuntimeCallCount: () => runtimeExecuteCallCount,
  };
}

test("Platform API - Autonomous Operations Suite", async (t) => {
  const { server, platform, getRuntimeCallCount } = setupTestServer();

  let baseUrl = "";
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  let createdOpId = "";

  await t.test("Platform status includes operationsCount", async () => {
    const res = await fetch(`${baseUrl}/api/v1/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "HEALTHY");
    assert.equal(typeof data.operationsCount, "number");
    assert.equal(data.operationsCount, 0);
  });

  await t.test("POST /api/v1/operations creates and executes bounded operation synchronously", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        objective: "Perform autonomous data processing and synthesis",
        budget: {
          maxSteps: 3,
          maxDurationMs: 15000,
          maxToolCalls: 5,
          maxTokens: 10000,
        },
        metadata: { priority: "high" },
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.operation);
    assert.ok(data.operation.id);
    assert.equal(data.operation.status, "COMPLETED");
    assert.equal(data.operation.agentId, "foundation-agent");
    assert.ok(data.operation.consumption.stepsUsed > 0);
    assert.ok(Array.isArray(data.observations));
    assert.ok(Array.isArray(data.decisions));
    assert.ok(data.observations.length > 0);

    createdOpId = data.operation.id;
  });

  await t.test("POST /api/operations (compat route) creates and executes operation", async () => {
    const res = await fetch(`${baseUrl}/api/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        objective: "Compat route execution",
        budget: {
          maxSteps: 2,
          maxDurationMs: 10000,
          maxToolCalls: 2,
        },
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.operation?.id);
    assert.equal(data.operation.status, "COMPLETED");
  });

  await t.test("GET /api/v1/operations lists operations", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations`);
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 2);
    assert.ok(list.some((op: any) => op.id === createdOpId));
  });

  await t.test("GET /api/operations (compat route) lists operations", async () => {
    const res = await fetch(`${baseUrl}/api/operations`);
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 2);
  });

  await t.test("GET /api/v1/operations/:id retrieves operation detail snapshot", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations/${createdOpId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.operation.id, createdOpId);
    assert.equal(data.operation.status, "COMPLETED");
    assert.ok(Array.isArray(data.observations));
    assert.ok(Array.isArray(data.decisions));
  });

  await t.test("GET /api/operations/:id (compat route) retrieves operation detail", async () => {
    const res = await fetch(`${baseUrl}/api/operations/${createdOpId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.operation.id, createdOpId);
  });

  await t.test("GET /api/v1/operations/:id returns 404 for unknown operation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations/unknown-op-9999`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.code, "NOT_FOUND");
  });

  await t.test("POST /api/v1/operations rejects invalid requests (400 Bad Request)", async () => {
    // Missing objective
    const res1 = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        budget: { maxSteps: 3, maxDurationMs: 1000, maxToolCalls: 1 },
      }),
    });
    assert.equal(res1.status, 400);

    // Invalid agentId format
    const res2 = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "invalid/agent/id!",
        objective: "valid objective",
        budget: { maxSteps: 3, maxDurationMs: 1000, maxToolCalls: 1 },
      }),
    });
    assert.equal(res2.status, 400);

    // Invalid budget (maxSteps <= 0)
    const res3 = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        objective: "valid objective",
        budget: { maxSteps: 0, maxDurationMs: 1000, maxToolCalls: 1 },
      }),
    });
    assert.equal(res3.status, 400);

    // Invalid media type
    const res4 = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    assert.equal(res4.status, 415);
  });

  await t.test("POST /api/v1/operations returns 404 for unknown agent", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "unknown-agent-404",
        objective: "Valid objective",
        budget: { maxSteps: 3, maxDurationMs: 1000, maxToolCalls: 1 },
      }),
    });
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.code, "AGENT_NOT_FOUND");
  });

  await t.test("POST /api/v1/operations rejects malformed JSON (400 Bad Request)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ broken: json, invalid }",
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, "MALFORMED_JSON");
  });

  await t.test("POST /api/v1/operations rejects oversized payload (413 Payload Too Large)", async () => {
    const hugePadding = "A".repeat(1024 * 1024 + 10);
    const res = await fetch(`${baseUrl}/api/v1/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        objective: "Oversized test",
        budget: { maxSteps: 1, maxDurationMs: 1000, maxToolCalls: 0 },
        padding: hugePadding,
      }),
    });
    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.code, "PAYLOAD_TOO_LARGE");
  });

  await t.test("Path traversal attempt returns 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations/..%2f..%2fetc%2fpasswd`);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, "PATH_TRAVERSAL");
  });

  await t.test("CORS origin restrictions: allowed for localhost, blocked for external", async () => {
    // Valid localhost origin
    const resLocal = await fetch(`${baseUrl}/api/v1/operations`, {
      headers: { Origin: "http://localhost:3000" },
    });
    assert.equal(resLocal.headers.get("access-control-allow-origin"), "http://localhost:3000");

    // Untrusted external origin
    const resUntrusted = await fetch(`${baseUrl}/api/v1/operations`, {
      headers: { Origin: "https://untrusted-external-domain.com" },
    });
    assert.equal(resUntrusted.headers.get("access-control-allow-origin"), null);
  });

  await t.test("POST /api/v1/operations/:id/cancel returns 409 Conflict for completed operation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations/${createdOpId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Attempting to cancel finished operation" }),
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.code, "OPERATION_CONFLICT");
  });

  await t.test("POST /api/v1/operations/:id/cancel returns 404 for unknown operation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/operations/non-existent-op/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cancel non-existent" }),
    });
    assert.equal(res.status, 404);
  });

  await t.test("POST /api/v1/operations/:id/cancel cancels pre-execution SUBMITTED operation", async () => {
    // Manually insert a submitted operation into repository
    const op = platform.operationService.createOperation({
      id: "op-to-cancel-sub",
      agentId: "foundation-agent",
      objective: "Pre-execution cancel test",
      budget: { maxSteps: 5, maxDurationMs: 10000, maxToolCalls: 2 },
    });
    platform.operations.save(op);

    const res = await fetch(`${baseUrl}/api/v1/operations/op-to-cancel-sub/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "User aborted before execution" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "CANCELLED");

    // Verify stored state in repo
    const retrieved = platform.operations.findById("op-to-cancel-sub");
    assert.ok(retrieved);
    assert.equal(retrieved.status, "CANCELLED");
  });
});

test("Platform API - Critical Security Tests (Section 21)", async (t) => {
  await t.test("Policy DENY on planned step: operation fails and CoreRuntime is NOT invoked", async () => {
    const { server, getRuntimeCallCount } = setupTestServer({
      policyRule: () => ({
        allowed: false,
        policyId: "security-lockdown",
        reason: "Autonomous operations forbidden by policy gatekeeper",
      }),
    });

    let baseUrl = "";
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    try {
      const res = await fetch(`${baseUrl}/api/v1/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "foundation-agent",
          objective: "Execute security sensitive task",
          budget: { maxSteps: 3, maxDurationMs: 10000, maxToolCalls: 1 },
        }),
      });

      // Bounded operation completed with FAILED status
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.operation.status, "FAILED");
      assert.equal(data.operation.failureError.code, "POLICY_DENIED");
      assert.ok(data.operation.failureError.message.includes("forbidden"));

      // CRITICAL VERIFICATION: CoreRuntime was NEVER invoked
      assert.equal(getRuntimeCallCount(), 0, "CoreRuntime must NOT be invoked when Policy denies the step");
    } finally {
      server.close();
    }
  });

  await t.test("Policy Gateway throws: operation fails and CoreRuntime is NOT invoked", async () => {
    const { server, getRuntimeCallCount } = setupTestServer({
      policyThrows: true,
    });

    let baseUrl = "";
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    try {
      const res = await fetch(`${baseUrl}/api/v1/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "foundation-agent",
          objective: "Execute task with crashing policy",
          budget: { maxSteps: 3, maxDurationMs: 10000, maxToolCalls: 1 },
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.operation.status, "FAILED");
      assert.equal(data.operation.failureError.code, "POLICY_EVALUATION_ERROR");

      // CRITICAL VERIFICATION: CoreRuntime was NEVER invoked
      assert.equal(getRuntimeCallCount(), 0, "CoreRuntime must NOT be invoked when Policy throws an exception");
    } finally {
      server.close();
    }
  });
});

test("Platform API - Budget Integrity Tests (Section 22)", async (t) => {
  await t.test("Budget exhaustion (maxSteps = 1): stops when budget reached and does NOT become CANCELLED", async () => {
    // Custom planner with 3 planned steps
    const customPlanner = new StubPlanner(() => [
      PlanStep.create({ id: "step-1", order: 1, action: "step1", input: {} }),
      PlanStep.create({ id: "step-2", order: 2, action: "step2", input: {} }),
      PlanStep.create({ id: "step-3", order: 3, action: "step3", input: {} }),
    ]);

    const platform = createPlatform({ planner: customPlanner });
    const service = new PlatformService({
      tasks: platform.tasks,
      executions: platform.executions,
      audit: platform.audit,
      metrics: platform.metrics,
      tools: platform.tools,
      models: platform.modelRegistry,
      agents: platform.agents,
      agentService: platform.agentService,
      submitTask: platform.submitTask,
      executeOrchestration: platform.executeOrchestration,
      operations: platform.operations,
      operationService: platform.operationService,
    });

    const server = createHttpServer(service);
    let baseUrl = "";
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    try {
      const res = await fetch(`${baseUrl}/api/v1/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "foundation-agent",
          objective: "Budget test with maxSteps = 1",
          budget: {
            maxSteps: 1,
            maxDurationMs: 30000,
            maxToolCalls: 10,
          },
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();

      // Operation executed 1 step and budget was exhausted
      assert.equal(data.operation.consumption.stepsUsed, 1);
      assert.equal(data.operation.status, "BUDGET_EXHAUSTED");
      assert.notEqual(data.operation.status, "CANCELLED", "BUDGET_EXHAUSTED must NOT become CANCELLED");
      assert.equal(data.operation.terminationReason, "STEPS_EXHAUSTED");
    } finally {
      server.close();
    }
  });
});
