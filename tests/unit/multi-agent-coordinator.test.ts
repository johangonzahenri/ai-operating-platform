import assert from "node:assert/strict";
import test from "node:test";
import { MultiAgentCoordinator } from "../../src/application/coordination/multi-agent-coordinator.js";
import { Agent } from "../../src/domain/agent/agent.js";
import { CoordinationRequest } from "../../src/domain/coordination/coordination.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { InMemoryAgentRegistry } from "../../src/infrastructure/agent/in-memory-agent-registry.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";
import { Task } from "../../src/domain/task/task.js";

function fixture() {
  const registry = new InMemoryAgentRegistry();
  for (const id of ["diagnostic", "decision", "execution", "verification"]) {
    registry.register(Agent.create({ id, name: id, model: "stub-model" }));
  }
  const events: string[] = [];
  const publisher = { publish: (value: { type: string }) => events.push(value.type) };
  const runtime = {
    execute: async (task: Task, agent: { id: string }) => {
      const execution = Execution.create(`execution-${agent.id}`, task.id, task.traceId).start();
      const completedTask = task.transition("QUEUED").transition("RUNNING").complete({ agentId: agent.id, verified: agent.id === "verification" });
      const completedExecution = execution.complete({ agentId: agent.id });
      return { task: completedTask, execution: completedExecution, context: ExecutionContext.create(task.traceId, completedExecution.id, task.id).withInput(task.request.input) };
    },
  };
  return { registry, events, runtime, publisher };
}

test("coordinates bounded sequential agents with deterministic handoffs", async () => {
  const setup = fixture();
  const coordinator = new MultiAgentCoordinator(runtimeOf(setup.runtime), setup.registry, new InMemoryPolicyGateway(), setup.publisher);
  const request = CoordinationRequest.create({
    taskId: "parent-task", objective: "diagnose and verify", input: { incident: "service unavailable" },
    steps: [{ agentId: "diagnostic", role: "DIAGNOSTIC" }, { agentId: "decision", role: "DECISION" }, { agentId: "verification", role: "VERIFICATION" }],
  });
  const result = await coordinator.run(request);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.steps.length, 3);
  assert.equal(result.handoffs.length, 2);
  assert.equal(result.handoffs[0]?.sourceAgentId, "diagnostic");
  assert.equal(result.steps[2]?.output?.verified, true);
  assert.ok(setup.events.includes("coordination.completed"));
});

test("rejects duplicate agents and preserves isolation", () => {
  assert.throws(() => CoordinationRequest.create({
    taskId: "parent-task", objective: "invalid", input: { value: 1 },
    steps: [{ agentId: "same", role: "DIAGNOSTIC" }, { agentId: "same", role: "VERIFICATION" }],
  }));
});

test("returns policy denial without executing an agent", async () => {
  const setup = fixture();
  const coordinator = new MultiAgentCoordinator(runtimeOf(setup.runtime), setup.registry, new InMemoryPolicyGateway(() => ({ allowed: false, policyId: "deny", reason: "not permitted" })), setup.publisher);
  const result = await coordinator.run(CoordinationRequest.create({
    taskId: "parent-task", objective: "restricted", input: { value: 1 },
    steps: [{ agentId: "diagnostic", role: "DIAGNOSTIC" }, { agentId: "verification", role: "VERIFICATION" }],
  }));
  assert.equal(result.status, "POLICY_DENIED");
  assert.equal(result.steps.length, 0);
});

function runtimeOf(runtime: ReturnType<typeof fixture>["runtime"]): import("../../src/domain/execution/runtime.js").Runtime {
  return runtime;
}
