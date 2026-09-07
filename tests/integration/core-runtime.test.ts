import assert from "node:assert/strict";
import test from "node:test";
import { CoreRuntime } from "../../src/application/runtime/core-runtime.js";
import { ModelExecutionStrategy } from "../../src/application/runtime/model-execution-strategy.js";
import { AgentDefinition } from "../../src/domain/agent/agent.js";
import { Task } from "../../src/domain/task/task.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { StubModelGateway } from "../../src/infrastructure/model/stub-model-gateway.js";
import { InMemoryExecutionRepository } from "../../src/infrastructure/persistence/in-memory-execution-repository.js";
import { InMemoryTaskRepository } from "../../src/infrastructure/persistence/in-memory-task-repository.js";
import { InMemoryPolicyGateway } from "../../src/infrastructure/policy/in-memory-policy-gateway.js";

const agent: AgentDefinition = { id: "agent-1", name: "Foundation agent", capabilities: ["reasoning"], model: "stub-model" };
const ids = { next: () => "execution-1" };

test("runtime completes task and execution through the model strategy with correlated events", async () => {
  const tasks = new InMemoryTaskRepository(); const executions = new InMemoryExecutionRepository(); const events = new InMemoryEventPublisher();
  const policy = new InMemoryPolicyGateway();
  const runtime = new CoreRuntime(tasks, executions, new ModelExecutionStrategy(new StubModelGateway(), events, policy), events, ids, () => new Date("2026-01-02T00:00:00Z"));
  const task = Task.create("task-1", "trace-1", { agentId: agent.id, input: { value: 1 } });
  const result = await runtime.execute(task, agent);
  assert.equal(result.task.status, "COMPLETED"); assert.equal(result.execution.status, "COMPLETED"); assert.equal(result.context.executionId, "execution-1");
  assert.deepEqual(tasks.findById(task.id)?.result?.output, { echoedInput: { value: 1 }, model: "stub-model" }); assert.equal(executions.findById("execution-1")?.status, "COMPLETED");
  assert.deepEqual(events.events.map((item) => item.type), ["context.created", "execution.created", "task.created", "execution.started", "task.started", "agent.started", "policy.evaluated", "policy.allowed", "model.requested", "model.completed", "execution.completed", "task.completed", "agent.completed"]);
  assert.ok(events.events.every((item) => item.traceId === "trace-1")); assert.ok(events.events.filter((item) => item.executionId !== undefined).every((item) => item.executionId === "execution-1"));
});

test("provider failure fails and persists task and execution with correlated error events", async () => {
  const tasks = new InMemoryTaskRepository(); const executions = new InMemoryExecutionRepository(); const events = new InMemoryEventPublisher();
  const policy = new InMemoryPolicyGateway();
  const unavailable = { generate: async () => { throw new Error("provider unavailable"); } };
  const runtime = new CoreRuntime(tasks, executions, new ModelExecutionStrategy(unavailable, events, policy), events, ids);
  const task = Task.create("task-2", "trace-2", { agentId: agent.id, input: { value: 2 } }); const result = await runtime.execute(task, agent);
  assert.equal(result.task.status, "FAILED"); assert.equal(result.execution.status, "FAILED"); assert.equal(result.task.error?.code, "EXECUTION_FAILURE");
  assert.equal(tasks.findById(task.id)?.status, "FAILED"); assert.equal(executions.findById("execution-1")?.status, "FAILED");
  assert.deepEqual(events.events.map((item) => item.type), ["context.created", "execution.created", "task.created", "execution.started", "task.started", "agent.started", "policy.evaluated", "policy.allowed", "model.requested", "model.failed", "execution.failed", "task.failed", "agent.failed"]);
  assert.ok(events.events.every((item) => item.traceId === "trace-2"));
});

test("repository infrastructure failure is propagated without changing domain state", async () => {
  const tasks = new InMemoryTaskRepository(); const events = new InMemoryEventPublisher();
  const policy = new InMemoryPolicyGateway();
  const failingExecutions = { save: () => { throw new Error("execution persistence unavailable"); }, findById: () => undefined };
  const runtime = new CoreRuntime(tasks, failingExecutions, new ModelExecutionStrategy(new StubModelGateway(), events, policy), events, ids);
  const task = Task.create("task-3", "trace-3", { agentId: agent.id, input: { value: 3 } });
  await assert.rejects(() => runtime.execute(task, agent), /execution persistence unavailable/);
  assert.equal(tasks.findById(task.id), undefined);
});
