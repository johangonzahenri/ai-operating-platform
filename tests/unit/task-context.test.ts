import assert from "node:assert/strict";
import test from "node:test";
import { TaskContext, TaskContextValidationError } from "../../src/domain/context/task-context.js";
import { LLMPlanner } from "../../src/infrastructure/autonomy/llm-planner.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { PlanningRequest } from "../../src/domain/autonomy/planning-request.js";
import { ModelGateway, ModelRequest, ModelResponse } from "../../src/domain/model/model-gateway.js";

const base = {
  taskId: "task-context-1",
  executionId: "execution-context-1",
  objective: "Find the relevant result",
};

test("TaskContext creates an empty bounded context", () => {
  const context = TaskContext.create(base);
  assert.equal(context.taskId, base.taskId);
  assert.equal(context.currentRound, 0);
  assert.deepEqual(context.messages, []);
  assert.deepEqual(context.observations, []);
  assert.equal(context.truncated, false);
});

test("TaskContext sanitizes nested secrets and bounds messages, observations, and strings", () => {
  const context = TaskContext.create({
    ...base,
    taskMetadata: { authorization: "Bearer secret", nested: { password: "hidden", value: "ok" } },
    messages: Array.from({ length: 4 }, (_, index) => ({ role: "user", content: `message-${index}` })),
    observations: Array.from({ length: 4 }, (_, index) => ({ index, token: "secret" })),
    suppliedContext: { long: "x".repeat(80) },
  }, {
    maxMessages: 2,
    maxObservations: 2,
    maxStringLength: 64,
    maxDepth: 3,
    maxObjectKeys: 8,
  });

  assert.equal(context.messages.length, 2);
  assert.equal(context.observations.length, 2);
  assert.equal(context.truncated, true);
  assert.equal(context.taskMetadata.authorization, "[redacted]");
  assert.equal((context.taskMetadata.nested as Record<string, unknown>).password, "[redacted]");
  assert.equal(context.suppliedContext.long, `${"x".repeat(64)}[truncated]`);
});

test("TaskContext preserves provider-neutral message and observation evolution", () => {
  const context = TaskContext.create({
    ...base,
    currentRound: 2,
    currentTool: "calculator",
    messages: [
      { role: "user", content: "Find the result" },
      { role: "assistant", toolCalls: [{ id: "call-1", name: "calculator", arguments: { left: 2, right: 3 } }] },
      { role: "tool", toolResult: { toolCallId: "call-1", name: "calculator", output: { value: 5 }, success: true } },
    ],
    observations: [{ toolCallId: "call-1", success: true, result: { value: 5 } }],
  });
  assert.equal(context.currentRound, 2);
  assert.equal(context.currentTool, "calculator");
  assert.equal(context.messages[1]?.role, "assistant");
  assert.equal(context.observations[0]?.toolCallId, "call-1");
  assert.throws(() => {
    (context.observations[0] as Record<string, unknown>).success = false;
  }, TypeError);
  assert.deepEqual(context.snapshot({ includeMessages: false }).messages, []);
  assert.equal(context.snapshot({ includeMessages: false }).messageCount, 3);
});

test("TaskContext rejects missing identity and invalid limits", () => {
  assert.throws(() => TaskContext.create({ ...base, taskId: "" }), TaskContextValidationError);
  assert.throws(() => TaskContext.create(base, { maxMessages: 0, maxObservations: 1, maxStringLength: 1, maxDepth: 1, maxObjectKeys: 1 }), TaskContextValidationError);
});

test("LLMPlanner passes TaskContext to the provider-neutral model request", async () => {
  let captured: ModelRequest | undefined;
  const gateway: ModelGateway = {
    generate: async (request: ModelRequest): Promise<ModelResponse> => {
      captured = request;
      return { provider: "stub", model: request.model, output: { steps: [{ action: "inspect", input: {} }] } };
    },
  };
  const taskContext = TaskContext.create({ ...base, suppliedContext: { scope: "bounded" } });
  const request = PlanningRequest.create({
    operationId: "operation-context-1",
    objective: base.objective,
    agentId: "agent-context",
    budget: AutonomyBudget.create({ maxSteps: 2, maxDurationMs: 1000, maxToolCalls: 2 }),
    currentStep: 0,
    taskContext,
  });
  await new LLMPlanner(gateway, { allowedActions: ["inspect"] }).plan(request);
  assert.equal((captured?.input.taskContext as { taskId: string }).taskId, base.taskId);
  assert.equal((captured?.input.taskContext as { suppliedContext: { scope: string } }).suppliedContext.scope, "bounded");
});
