import assert from "node:assert/strict";
import test from "node:test";
import { AgentDefinition } from "../../src/domain/agent/agent.js";
import { ExecuteTask } from "../../src/application/execute-task.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { StubModelGateway } from "../../src/infrastructure/model/stub-model-gateway.js";
import { InMemoryTaskRepository } from "../../src/infrastructure/persistence/in-memory-task-repository.js";
import { Task } from "../../src/domain/task/task.js";

const agent: AgentDefinition = { id: "agent-1", name: "Foundation agent", capabilities: ["reasoning"], model: "stub-model" };
test("execution completes through the model port and emits correlated events", async () => {
  const tasks = new InMemoryTaskRepository(); const events = new InMemoryEventPublisher();
  const useCase = new ExecuteTask(tasks, new StubModelGateway(), events, () => new Date("2026-01-02T00:00:00Z"));
  const task = Task.create("task-1", "trace-1", { agentId: agent.id, input: { value: 1 } });
  const result = await useCase.execute(task, agent);
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(tasks.findById(task.id)?.result?.output, { echoedInput: { value: 1 }, model: "stub-model" });
  assert.deepEqual(events.events.map((item) => item.type), ["task.created", "task.started", "agent.started", "model.requested", "model.completed", "task.completed", "agent.completed"]);
  assert.ok(events.events.every((item) => item.traceId === "trace-1"));
});

test("provider failure persists a failed task and emits correlated failure events", async () => {
  const tasks = new InMemoryTaskRepository(); const events = new InMemoryEventPublisher();
  const unavailableProvider = { generate: async () => { throw new Error("provider unavailable"); } };
  const useCase = new ExecuteTask(tasks, unavailableProvider, events);
  const task = Task.create("task-2", "trace-2", { agentId: agent.id, input: { value: 2 } });
  const result = await useCase.execute(task, agent);
  assert.equal(result.status, "FAILED"); assert.equal(result.error?.code, "MODEL_FAILURE"); assert.equal(result.error?.message, "provider unavailable");
  assert.equal(tasks.findById(task.id)?.status, "FAILED");
  assert.deepEqual(events.events.map((item) => item.type), ["task.created", "task.started", "agent.started", "model.requested", "model.failed", "task.failed", "agent.failed"]);
  assert.ok(events.events.every((item) => item.traceId === "trace-2"));
});
