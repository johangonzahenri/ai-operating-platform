import assert from "node:assert/strict";
import test from "node:test";
import { MultiAgentCoordinator } from "../../src/application/coordination/multi-agent-coordinator.js";
import { Agent } from "../../src/domain/agent/agent.js";
import {
  AgentHandoff,
  CoordinationRequest,
  CoordinationValidationError,
  evaluateVerificationOutput,
} from "../../src/domain/coordination/coordination.js";
import { DomainEvent } from "../../src/domain/events/events.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { InMemoryAgentRegistry } from "../../src/infrastructure/agent/in-memory-agent-registry.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { Task } from "../../src/domain/task/task.js";

type AgentOutputGenerator = (task: Task, agentDef: { id: string }) => Record<string, unknown>;

function createFixture(options: {
  customOutputs?: Record<string, Record<string, unknown> | ((task: Task) => Record<string, unknown>)>;
  executionFailures?: Record<string, boolean>;
  policyDecider?: (request: { action: string; agentId?: string; metadata?: Record<string, unknown> }) => { allowed: boolean; reason?: string };
  currentTime?: number;
} = {}) {
  const registry = new InMemoryAgentRegistry();

  const diagnosticAgent = Agent.create({ id: "diagnostic-agent", name: "Diagnostic Agent", model: "stub-diag" });
  const decisionAgent = Agent.create({ id: "decision-agent", name: "Decision Agent", model: "stub-dec" });
  const executionAgent = Agent.create({ id: "execution-agent", name: "Execution Agent", model: "stub-exec" });
  const verificationAgent = Agent.create({ id: "verification-agent", name: "Verification Agent", model: "stub-verif" });
  const inactiveAgent = Agent.create({ id: "inactive-agent", name: "Inactive Agent", model: "stub-inact" }).deactivate();

  registry.register(diagnosticAgent);
  registry.register(decisionAgent);
  registry.register(executionAgent);
  registry.register(verificationAgent);
  registry.register(inactiveAgent);

  const publishedEvents: DomainEvent[] = [];
  const publisher = {
    publish: (ev: DomainEvent) => {
      publishedEvents.push(ev);
    },
  };

  const executedTasks: Task[] = [];
  let simulatedTime = options.currentTime ?? 1000000;
  const now = () => new Date(simulatedTime);
  const advanceTime = (ms: number) => { simulatedTime += ms; };

  const runtime = {
    execute: async (task: Task, agentDef: { id: string }) => {
      executedTasks.push(task);
      const execution = Execution.create(`exec-${agentDef.id}-${task.id}`, task.id, task.traceId).start();

      if (options.executionFailures?.[agentDef.id]) {
        const failedExecution = execution.fail({ code: "CRASH", message: `Agent ${agentDef.id} crashed` });
        const failedTask = task.transition("QUEUED").transition("RUNNING").fail({ code: "CRASH", message: `Agent ${agentDef.id} crashed` });
        return {
          task: failedTask,
          execution: failedExecution,
          context: ExecutionContext.create(task.traceId, failedExecution.id, task.id),
        };
      }

      let output: Record<string, unknown>;
      const custom = options.customOutputs?.[agentDef.id];
      if (typeof custom === "function") {
        output = custom(task);
      } else if (custom !== undefined) {
        output = custom;
      } else {
        // Default canonical outputs per agent
        switch (agentDef.id) {
          case "diagnostic-agent":
            output = { incident: "high_memory", rootCause: "leak in worker pool", severity: "HIGH" };
            break;
          case "decision-agent":
            output = { action: "restart_pool", poolId: "worker-3", priority: 1 };
            break;
          case "execution-agent":
            output = { executed: true, poolId: "worker-3", result: "restarted_ok" };
            break;
          case "verification-agent":
            output = { status: "PASS", verified: true, reason: "Memory usage normal after restart", evidence: { memoryUsageMb: 240 } };
            break;
          default:
            output = { agentId: agentDef.id, completed: true };
        }
      }

      const completedTask = task.transition("QUEUED").transition("RUNNING").complete(output);
      const completedExecution = execution.complete({ agentId: agentDef.id });
      return {
        task: completedTask,
        execution: completedExecution,
        context: ExecutionContext.create(task.traceId, completedExecution.id, task.id).withInput(task.request.input),
      };
    },
  };

  const policy = new InMemoryPolicyGateway((req) => {
    if (options.policyDecider) {
      const res = options.policyDecider(req as any);
      return { allowed: res.allowed, policyId: "test-policy", reason: res.reason };
    }
    return { allowed: true, policyId: "allow-all" };
  });

  return {
    registry,
    publishedEvents,
    publisher,
    runtime,
    policy,
    now,
    advanceTime,
    executedTasks,
  };
}

function canonicalSteps() {
  return [
    { agentId: "diagnostic-agent", role: "DIAGNOSTIC" as const },
    { agentId: "decision-agent", role: "DECISION" as const },
    { agentId: "execution-agent", role: "EXECUTION" as const },
    { agentId: "verification-agent", role: "VERIFICATION" as const },
  ];
}

// ══════════════════════════════════════════════════════════════════════
// 1-5. HAPPY PATH & CANONICAL FLOW
// ══════════════════════════════════════════════════════════════════════

test("1. canonical 4-agent flow executes sequentially and produces COMPLETED", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-canonical",
    objective: "Resolve memory alert",
    input: { alertId: "ALT-992" },
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.steps.length, 4);
  assert.equal(result.handoffs.length, 3);
  assert.equal(result.agentsExecuted, 4);
  assert.equal(result.handoffsCreated, 3);
  assert.equal(result.output?.status, "PASS");
  assert.equal(result.output?.verified, true);
});

test("2. diagnostic success delivers structured findings to handoff", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-diag",
    objective: "Diagnose system",
    input: { cluster: "prod-useast" },
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.steps[0]?.role, "DIAGNOSTIC");
  assert.equal(result.steps[0]?.output?.rootCause, "leak in worker pool");
  assert.equal(result.handoffs[0]?.sourceAgentId, "diagnostic-agent");
  assert.equal(result.handoffs[0]?.targetAgentId, "decision-agent");
  assert.equal(result.handoffs[0]?.payload?.rootCause, "leak in worker pool");
});

test("3. decision success interprets diagnosis and produces plan in handoff", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-dec",
    objective: "Plan mitigation",
    input: { incident: "mem_leak" },
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.steps[1]?.role, "DECISION");
  assert.equal(result.steps[1]?.output?.action, "restart_pool");
  assert.equal(result.handoffs[1]?.sourceAgentId, "decision-agent");
  assert.equal(result.handoffs[1]?.targetAgentId, "execution-agent");
  assert.equal(result.handoffs[1]?.payload?.action, "restart_pool");
});

test("4. execution success performs authorized action and delivers result to verification", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-exec",
    objective: "Execute restart",
    input: { req: 1 },
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.steps[2]?.role, "EXECUTION");
  assert.equal(result.steps[2]?.output?.result, "restarted_ok");
  assert.equal(result.handoffs[2]?.sourceAgentId, "execution-agent");
  assert.equal(result.handoffs[2]?.targetAgentId, "verification-agent");
});

test("5. verification PASS evaluates independently and yields COMPLETED without fabricated verified=true", async () => {
  const fixture = createFixture({
    customOutputs: {
      "verification-agent": {
        status: "PASS",
        verified: true,
        reason: "metrics stable",
        evidence: { latencyMs: 12 },
      },
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-verif-pass",
    objective: "Verify latency",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.output?.status, "PASS");
  assert.equal(result.output?.verified, true);
  assert.equal(result.output?.reason, "metrics stable");
  assert.deepEqual(result.output?.evidence, { latencyMs: 12 });
});

// ══════════════════════════════════════════════════════════════════════
// 6-10. VERIFICATION SEMANTICS
// ══════════════════════════════════════════════════════════════════════

test("6. verification FAIL produces FAILED and records reason", async () => {
  const fixture = createFixture({
    customOutputs: {
      "verification-agent": {
        status: "FAIL",
        verified: false,
        reason: "Healthcheck 500 error after restart",
        evidence: { httpStatus: 500 },
      },
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-verif-fail",
    objective: "Verify health",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "VERIFICATION_FAILED");
  assert.equal(result.error?.message, "Healthcheck 500 error after restart");
  assert.equal(result.output?.status, "FAIL");
});

test("7. missing verification result (empty object) produces FAILED with VERIFICATION_MISSING", async () => {
  const fixture = createFixture({
    customOutputs: {
      "verification-agent": {},
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-verif-missing",
    objective: "Verify missing",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "VERIFICATION_MISSING");
});

test("8. malformed verification result (not an object) produces FAILED with VERIFICATION_MALFORMED", () => {
  const evalResult = evaluateVerificationOutput("unexpected string output");
  assert.equal(evalResult.pass, false);
  assert.equal(evalResult.error?.code, "VERIFICATION_MALFORMED");

  const evalArray = evaluateVerificationOutput(["status", "PASS"]);
  assert.equal(evalArray.pass, false);
  assert.equal(evalArray.error?.code, "VERIFICATION_MALFORMED");

  const evalNull = evaluateVerificationOutput(null);
  assert.equal(evalNull.pass, false);
  assert.equal(evalNull.error?.code, "VERIFICATION_MALFORMED");
});

test("9. ambiguous verification (unknown status without boolean) produces FAILED with VERIFICATION_AMBIGUOUS", async () => {
  const fixture = createFixture({
    customOutputs: {
      "verification-agent": {
        status: "MAYBE_RESOLVED",
        note: "Cannot determine if healthy",
      },
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-verif-ambig",
    objective: "Verify ambiguous",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "VERIFICATION_AMBIGUOUS");
});

test("10. verification conflict (status PASS but verified false) produces FAILED with VERIFICATION_CONFLICT", async () => {
  const fixture = createFixture({
    customOutputs: {
      "verification-agent": {
        status: "PASS",
        verified: false,
        reason: "contradiction in verdict",
      },
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-verif-conflict",
    objective: "Verify conflict",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "VERIFICATION_CONFLICT");
});

// ══════════════════════════════════════════════════════════════════════
// 11-16. AGENT SELECTION & REGISTRY
// ══════════════════════════════════════════════════════════════════════

test("11. unknown agent in step produces FAILED with UNKNOWN_AGENT", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-unknown-agent",
    objective: "Test unknown",
    input: {},
    steps: [
      { agentId: "non-existent-agent", role: "DIAGNOSTIC" },
      { agentId: "verification-agent", role: "VERIFICATION" },
    ],
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "UNKNOWN_AGENT");
  assert.ok(result.error?.message.includes("non-existent-agent"));
});

test("12. inactive agent produces FAILED with INACTIVE_AGENT", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-inactive-agent",
    objective: "Test inactive",
    input: {},
    steps: [
      { agentId: "inactive-agent", role: "DIAGNOSTIC" },
      { agentId: "verification-agent", role: "VERIFICATION" },
    ],
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "INACTIVE_AGENT");
});

test("13. duplicate agent in steps is rejected by CoordinationRequest", () => {
  assert.throws(
    () =>
      CoordinationRequest.create({
        taskId: "task-dup",
        objective: "Duplicate check",
        input: {},
        steps: [
          { agentId: "diagnostic-agent", role: "DIAGNOSTIC" },
          { agentId: "diagnostic-agent", role: "VERIFICATION" },
        ],
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("cannot repeat an agent"),
  );
});

test("14. more than 4 agents is rejected by CoordinationRequest", () => {
  assert.throws(
    () =>
      CoordinationRequest.create({
        taskId: "task-over-4",
        objective: "Too many agents",
        input: {},
        steps: [
          { agentId: "agent-1", role: "DIAGNOSTIC" },
          { agentId: "agent-2", role: "DECISION" },
          { agentId: "agent-3", role: "EXECUTION" },
          { agentId: "agent-4", role: "DECISION" },
          { agentId: "agent-5", role: "VERIFICATION" },
        ],
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("between 2 and 4 steps"),
  );
});

test("15. less than 2 agents is rejected by CoordinationRequest", () => {
  assert.throws(
    () =>
      CoordinationRequest.create({
        taskId: "task-under-2",
        objective: "Too few agents",
        input: {},
        steps: [{ agentId: "verification-agent", role: "VERIFICATION" }],
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("between 2 and 4 steps"),
  );
});

test("16. invalid agent step (missing or invalid role) is rejected", () => {
  assert.throws(
    () =>
      CoordinationRequest.create({
        taskId: "task-invalid-role",
        objective: "Invalid role",
        input: {},
        steps: [
          { agentId: "diagnostic-agent", role: "INVALID_ROLE" as any },
          { agentId: "verification-agent", role: "VERIFICATION" },
        ],
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("valid role"),
  );
});

// ══════════════════════════════════════════════════════════════════════
// 17-21. POLICY ENFORCEMENT
// ══════════════════════════════════════════════════════════════════════

test("17. coordination denied globally returns POLICY_DENIED and executes zero steps", async () => {
  const fixture = createFixture({
    policyDecider: () => ({ allowed: false, reason: "Global coordination restricted" }),
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-pol-global",
    objective: "Global denial",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "POLICY_DENIED");
  assert.equal(result.steps.length, 0);
  assert.equal(result.error?.code, "POLICY_DENIED");
});

test("18. diagnostic stage denied by policy stops before execution", async () => {
  const fixture = createFixture({
    policyDecider: (req) => {
      if (req.metadata?.role === "DIAGNOSTIC") return { allowed: false, reason: "Diagnostic role not authorized" };
      return { allowed: true };
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-pol-diag",
    objective: "Deny diag",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "POLICY_DENIED");
  assert.equal(result.steps.length, 0);
  assert.equal(result.error?.message, "Diagnostic role not authorized");
});

test("19. decision stage denied by policy stops after diagnostic", async () => {
  const fixture = createFixture({
    policyDecider: (req) => {
      if (req.metadata?.role === "DECISION") return { allowed: false, reason: "Decision role not authorized" };
      return { allowed: true };
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-pol-dec",
    objective: "Deny dec",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "POLICY_DENIED");
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.role, "DIAGNOSTIC");
  assert.equal(result.error?.message, "Decision role not authorized");
});

test("20. execution stage denied by policy stops after decision", async () => {
  const fixture = createFixture({
    policyDecider: (req) => {
      if (req.metadata?.role === "EXECUTION") return { allowed: false, reason: "Execution action prohibited" };
      return { allowed: true };
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-pol-exec",
    objective: "Deny exec",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "POLICY_DENIED");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1]?.role, "DECISION");
  assert.equal(result.error?.message, "Execution action prohibited");
});

test("21. verification stage denied by policy stops after execution", async () => {
  const fixture = createFixture({
    policyDecider: (req) => {
      if (req.metadata?.role === "VERIFICATION") return { allowed: false, reason: "Verification role restricted" };
      return { allowed: true };
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-pol-verif",
    objective: "Deny verif",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "POLICY_DENIED");
  assert.equal(result.steps.length, 3);
  assert.equal(result.steps[2]?.role, "EXECUTION");
  assert.equal(result.error?.message, "Verification role restricted");
});

// ══════════════════════════════════════════════════════════════════════
// 22-28. HANDOFF VALIDATION & SECURITY
// ══════════════════════════════════════════════════════════════════════

test("22. handoff rejects source == target", () => {
  assert.throws(
    () =>
      AgentHandoff.create({
        correlationId: "corr-1",
        taskId: "task-1",
        executionId: "exec-1",
        sourceAgentId: "agent-a",
        targetAgentId: "agent-a",
        objective: "same target test",
        payload: { test: true },
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("source and target agents must differ"),
  );
});

test("23. duplicate handoff validation preserves immutable identity", () => {
  const handoff = AgentHandoff.create({
    handoffId: "handoff-fixed-id",
    correlationId: "corr-1",
    taskId: "task-1",
    executionId: "exec-1",
    sourceAgentId: "agent-a",
    targetAgentId: "agent-b",
    objective: "unique transfer",
    payload: { key: "value" },
  });

  assert.equal(handoff.handoffId, "handoff-fixed-id");
  assert.equal(Object.isFrozen(handoff), true);
  assert.equal(Object.isFrozen(handoff.payload), true);
});

test("24. unknown handoff target agent publishes coordination.handoff.rejected", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  // Modify registry to delete verification agent midway
  const request = CoordinationRequest.create({
    taskId: "task-unknown-target",
    objective: "Test target unknown",
    input: {},
    steps: [
      { agentId: "diagnostic-agent", role: "DIAGNOSTIC" },
      { agentId: "verification-agent", role: "VERIFICATION" },
    ],
  });

  fixture.registry.delete("verification-agent");

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "HANDOFF_REJECTED");
  const rejectedEvent = fixture.publishedEvents.find((e) => e.type === "coordination.handoff.rejected");
  assert.ok(rejectedEvent);
});

test("25. inactive handoff target agent publishes coordination.handoff.rejected", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-inactive-target",
    objective: "Test target inactive",
    input: {},
    steps: [
      { agentId: "diagnostic-agent", role: "DIAGNOSTIC" },
      { agentId: "inactive-agent", role: "VERIFICATION" },
    ],
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "HANDOFF_REJECTED");
  const rejectedEvent = fixture.publishedEvents.find((e) => e.type === "coordination.handoff.rejected");
  assert.ok(rejectedEvent);
});

test("26. oversized payload is sanitized and bounded in handoff", () => {
  const longString = "A".repeat(5000);
  const handoff = AgentHandoff.create({
    correlationId: "corr-1",
    taskId: "task-1",
    executionId: "exec-1",
    sourceAgentId: "agent-a",
    targetAgentId: "agent-b",
    objective: "transfer long string",
    payload: { message: longString },
  });

  const message = handoff.payload.message as string;
  assert.ok(message.endsWith("[truncated]"));
  assert.ok(message.length <= 2048 + "[truncated]".length);
});

test("27. malformed handoff payload (array or non-object) throws CoordinationValidationError", () => {
  assert.throws(
    () =>
      AgentHandoff.create({
        correlationId: "corr-1",
        taskId: "task-1",
        executionId: "exec-1",
        sourceAgentId: "agent-a",
        targetAgentId: "agent-b",
        objective: "transfer",
        payload: ["invalid array"] as any,
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("payload must be an object"),
  );
});

test("28. secret-bearing payload is automatically redacted in handoff", () => {
  const handoff = AgentHandoff.create({
    correlationId: "corr-1",
    taskId: "task-1",
    executionId: "exec-1",
    sourceAgentId: "agent-a",
    targetAgentId: "agent-b",
    objective: "transfer secret",
    payload: {
      apiKey: "secret-key-123",
      authorization: "Bearer token",
      password: "pass",
      normalField: "safe data",
    },
  });

  assert.equal(handoff.payload.apiKey, "[redacted]");
  assert.equal(handoff.payload.authorization, "[redacted]");
  assert.equal(handoff.payload.password, "[redacted]");
  assert.equal(handoff.payload.normalField, "safe data");
});

// ══════════════════════════════════════════════════════════════════════
// 29-31. BUDGETS & BOUNDS
// ══════════════════════════════════════════════════════════════════════

test("29. handoff budget validation rejects invalid maxHandoffs", () => {
  assert.throws(
    () =>
      CoordinationRequest.create({
        taskId: "task-budget",
        objective: "Handoff budget check",
        input: {},
        steps: canonicalSteps(),
        maxHandoffs: 1, // 4 steps requires at least 3 handoffs
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("Invalid coordination handoff budget"),
  );
});

test("30. coordination depth exceeded (depth >= maxDepth) throws CoordinationValidationError", () => {
  assert.throws(
    () =>
      CoordinationRequest.create({
        taskId: "task-depth",
        objective: "Depth check",
        input: {},
        steps: canonicalSteps(),
        depth: 1, // default maxDepth is 1, so depth 1 is disallowed
      }),
    (err: Error) => err instanceof CoordinationValidationError && err.message.includes("Recursive coordination is not permitted"),
  );
});

test("31. runtime coordinator rejects request with recursive depth", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, {
    limits: { ...fixture.runtime, maxAgents: 4, maxHandoffs: 3, maxDepth: 1, data: {} as any },
  });

  // Construct request object bypassing constructor to simulate runtime check
  const fakeRequest = {
    coordinationId: "coord-fake",
    correlationId: "corr-fake",
    taskId: "task-fake",
    objective: "fake",
    input: {},
    steps: canonicalSteps(),
    maxHandoffs: 3,
    timeoutMs: 30000,
    verificationCriteria: {},
    depth: 2,
  } as unknown as CoordinationRequest;

  const result = await coordinator.run(fakeRequest);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "RECURSIVE_COORDINATION_REJECTED");
});

// ══════════════════════════════════════════════════════════════════════
// 32-34. LIFECYCLE & FAILURE PROPAGATION
// ══════════════════════════════════════════════════════════════════════

test("32. execution failure in intermediate agent aborts coordination and records failure", async () => {
  const fixture = createFixture({
    executionFailures: {
      "decision-agent": true,
    },
  });
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-exec-fail",
    objective: "Fail at decision",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "AGENT_EXECUTION_FAILED");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0]?.status, "COMPLETED");
  assert.equal(result.steps[1]?.status, "FAILED");
  // Third and fourth agents must not have run
  assert.equal(result.agentsExecuted, 2);
  assert.ok(fixture.publishedEvents.some((e) => e.type === "coordination.agent.failed"));
});

test("33. timeout produces TIMEOUT status and stops subsequent steps", async () => {
  const fixture = createFixture();
  // Simulate delay in diagnostic execution that exceeds timeout
  const originalExecute = fixture.runtime.execute;
  fixture.runtime.execute = async (task: Task, agentDef: { id: string }) => {
    fixture.advanceTime(600);
    return originalExecute(task, agentDef);
  };

  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-timeout",
    objective: "Timeout test",
    input: {},
    steps: canonicalSteps(),
    timeoutMs: 500,
  });

  const result = await coordinator.run(request);
  assert.equal(result.status, "TIMEOUT");
  assert.equal(result.error?.code, "TIMEOUT");
  assert.equal(result.steps.length, 1);
  assert.equal(result.agentsExecuted, 1);
});

test("34. cancellation before or during execution returns CANCELLED and halts work", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-cancel",
    objective: "Cancel test",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request, { isCancelled: true, reason: "User requested cancel" });
  assert.equal(result.status, "CANCELLED");
  assert.equal(result.error?.code, "CANCELLED");
  assert.equal(result.error?.message, "User requested cancel");
  assert.equal(result.steps.length, 0);
});

// ══════════════════════════════════════════════════════════════════════
// 35-36. ISOLATION
// ══════════════════════════════════════════════════════════════════════

test("35. cross-agent context isolation: agent B receives strictly the bounded handoff payload", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-iso",
    objective: "Context isolation test",
    input: { originalClientQuery: "should not bleed to agent B directly" },
    steps: canonicalSteps(),
  });

  await coordinator.run(request);

  // Task 0 is diagnostic-agent: receives initial payload with input
  assert.equal((fixture.executedTasks[0]?.request.input.input as any)?.originalClientQuery, "should not bleed to agent B directly");
  // Task 1 is decision-agent: receives strictly diagnostic output in handoff payload
  assert.equal((fixture.executedTasks[1]?.request.input as any)?.originalClientQuery, undefined);
  assert.equal(fixture.executedTasks[1]?.request.input.incident, "high_memory");
  // Task 2 is execution-agent: receives strictly decision output in handoff payload
  assert.equal(fixture.executedTasks[2]?.request.input.action, "restart_pool");
});

test("36. memory isolation: agents retain distinct memory scopes without coordination memory bus", () => {
  const fixture = createFixture();
  const diag = fixture.registry.findById("diagnostic-agent");
  const exec = fixture.registry.findById("execution-agent");

  assert.equal(diag?.memoryScope, "agent-diagnostic-agent");
  assert.equal(exec?.memoryScope, "agent-execution-agent");
  assert.notEqual(diag?.memoryScope, exec?.memoryScope);
});

// ══════════════════════════════════════════════════════════════════════
// 37-39. OBSERVABILITY & CORRELATION
// ══════════════════════════════════════════════════════════════════════

test("37. correlation IDs are preserved across coordination, tasks, executions, and handoffs", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    coordinationId: "coord-c100",
    correlationId: "corr-c100",
    taskId: "task-c100",
    objective: "Correlation test",
    input: {},
    steps: canonicalSteps(),
  });

  const result = await coordinator.run(request);
  assert.equal(result.coordinationId, "coord-c100");
  assert.equal(result.correlationId, "corr-c100");
  assert.equal(result.taskId, "task-c100");

  for (const handoff of result.handoffs) {
    assert.equal(handoff.correlationId, "corr-c100");
    assert.equal(handoff.taskId, "task-c100");
    assert.ok(handoff.executionId.startsWith("exec-"));
  }

  for (const event of fixture.publishedEvents) {
    assert.equal(event.traceId, "corr-c100");
  }
});

test("38. handoff event lifecycle publishes requested and accepted events in order", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-events",
    objective: "Events test",
    input: {},
    steps: canonicalSteps(),
  });

  await coordinator.run(request);

  const eventTypes = fixture.publishedEvents.map((e) => e.type);
  assert.ok(eventTypes.includes("coordination.started"));
  assert.ok(eventTypes.includes("coordination.agent.selected"));
  assert.ok(eventTypes.includes("coordination.handoff.requested"));
  assert.ok(eventTypes.includes("coordination.handoff.accepted"));
  assert.ok(eventTypes.includes("coordination.completed"));
});

test("39. published events do not leak sensitive payloads or credentials", async () => {
  const fixture = createFixture();
  const coordinator = new MultiAgentCoordinator(fixture.runtime, fixture.registry, fixture.policy, fixture.publisher, { now: fixture.now });

  const request = CoordinationRequest.create({
    taskId: "task-leak-check",
    objective: "Check leak",
    input: { password: "super-secret-password" },
    steps: canonicalSteps(),
  });

  await coordinator.run(request);

  for (const ev of fixture.publishedEvents) {
    const serialized = JSON.stringify(ev);
    assert.ok(!serialized.includes("super-secret-password"));
  }
});

// ══════════════════════════════════════════════════════════════════════
// 40. DETERMINISTIC AGGREGATION
// ══════════════════════════════════════════════════════════════════════

test("40. deterministic aggregation: identical inputs yield identical structured outputs", async () => {
  const fixture1 = createFixture({ currentTime: 2000000 });
  const coordinator1 = new MultiAgentCoordinator(fixture1.runtime, fixture1.registry, fixture1.policy, fixture1.publisher, {
    now: fixture1.now,
    ids: { next: () => "fixed-child-id" },
  });

  const fixture2 = createFixture({ currentTime: 2000000 });
  const coordinator2 = new MultiAgentCoordinator(fixture2.runtime, fixture2.registry, fixture2.policy, fixture2.publisher, {
    now: fixture2.now,
    ids: { next: () => "fixed-child-id" },
  });

  const req1 = CoordinationRequest.create({
    coordinationId: "fixed-coord",
    correlationId: "fixed-corr",
    taskId: "fixed-task",
    objective: "Deterministic run",
    input: { val: 42 },
    steps: canonicalSteps(),
  });

  const req2 = CoordinationRequest.create({
    coordinationId: "fixed-coord",
    correlationId: "fixed-corr",
    taskId: "fixed-task",
    objective: "Deterministic run",
    input: { val: 42 },
    steps: canonicalSteps(),
  });

  const res1 = await coordinator1.run(req1);
  const res2 = await coordinator2.run(req2);

  assert.equal(res1.status, res2.status);
  assert.equal(res1.steps.length, res2.steps.length);
  assert.equal(res1.handoffs.length, res2.handoffs.length);
  assert.deepEqual(res1.output, res2.output);
});
