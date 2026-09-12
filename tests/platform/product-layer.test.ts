import test from "node:test";
import assert from "node:assert/strict";
import { toEventDTO, toExecutionDTO, toTaskDTO } from "../../src/platform/product/execution-contract.js";
import { projectExecutionObservability } from "../../src/platform/product/execution-observability.js";

test("product contract maps task and execution identifiers without leaking internals", () => {
  const task = toTaskDTO({
    id: "task-1",
    traceId: "trace-1",
    agentId: "foundation-agent",
    status: "COMPLETED",
    createdAt: "2026-01-01T00:00:00.000Z",
    input: { prompt: "hello" },
    output: { text: "world" },
  });
  const execution = toExecutionDTO({
    id: "execution-1",
    taskId: task.taskId,
    traceId: task.traceId,
    status: "COMPLETED",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    metadata: { completedSteps: ["planner"], result: { text: "world" } },
  });

  assert.equal(task.taskId, "task-1");
  assert.equal(execution.executionId, "execution-1");
  assert.deepEqual(execution.completedSteps, ["planner"]);
  assert.deepEqual(execution.result, { text: "world" });
});

test("product contract preserves event correlation", () => {
  const event = toEventDTO({
    eventId: "event-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    type: "execution.completed",
    traceId: "trace-1",
    aggregateId: "execution-1",
    executionId: "execution-1",
    payload: { status: "COMPLETED" },
  });
  assert.deepEqual(event, {
    eventId: "event-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    eventType: "execution.completed",
    executionId: "execution-1",
    taskId: undefined,
    traceId: "trace-1",
    payload: { status: "COMPLETED" },
  });
});

test("execution observability projects real provider, model, tool lifecycle and duration", () => {
    const projection = projectExecutionObservability({
      id: "execution-1",
      taskId: "task-1",
      traceId: "trace-1",
      status: "COMPLETED",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:02.000Z",
      metadata: {},
    }, [
      {
        eventId: "event-model",
        occurredAt: "2026-01-01T00:00:00.100Z",
        type: "model.requested",
        traceId: "trace-1",
        aggregateId: "execution-1",
        payload: { provider: "stub", model: "stub-model" },
      },
      {
        eventId: "event-request",
        occurredAt: "2026-01-01T00:00:00.500Z",
        type: "model.tool.call.requested",
        traceId: "trace-1",
        aggregateId: "call-1",
        payload: {
          toolCallId: "call-1",
          toolName: "product.discovery",
          round: 1,
          arguments: { query: "shoes", apiKey: "should-not-leak" },
        },
      },
      {
        eventId: "event-result",
        occurredAt: "2026-01-01T00:00:01.500Z",
        type: "model.tool.result.returned",
        traceId: "trace-1",
        aggregateId: "call-1",
        payload: { toolCallId: "call-1", toolName: "product.discovery", round: 1, success: true, result: { product: "runner" } },
      },
      {
        eventId: "event-final",
        occurredAt: "2026-01-01T00:00:02.000Z",
        type: "model.final.response",
        traceId: "trace-1",
        aggregateId: "execution-1",
        payload: { provider: "stub", model: "stub-model", result: { answer: "done" } },
      },
    ]);

    assert.equal(projection.provider, "stub");
    assert.equal(projection.model, "stub-model");
    assert.equal(projection.currentRound, 1);
    assert.equal(projection.currentActivity, "Completed");
    assert.equal(projection.durationMs, 2000);
    assert.equal(projection.completedToolCalls, 1);
    assert.equal(projection.toolErrors, 0);
    assert.equal(projection.toolCallObservations?.[0]?.toolCallId, "call-1");
    assert.equal(projection.toolCallObservations?.[0]?.durationMs, 1000);
    assert.deepEqual(projection.finalResult, { answer: "done" });
    assert.equal((projection.toolCallObservations?.[0]?.arguments as Record<string, unknown>).apiKey, "[redacted]");
});

test("execution observability does not invent provider or model and represents rejection", () => {
    const projection = projectExecutionObservability({
      id: "execution-2",
      taskId: "task-2",
      traceId: "trace-2",
      status: "FAILED",
      metadata: {},
    }, [{
      eventId: "event-rejected",
      occurredAt: "2026-01-01T00:00:00.000Z",
      type: "model.tool.call.rejected",
      traceId: "trace-2",
      aggregateId: "call-2",
      payload: { toolCallId: "call-2", toolName: "missing", round: 1, reason: "not permitted" },
    }]);
    assert.equal(projection.provider, undefined);
    assert.equal(projection.model, undefined);
    assert.equal(projection.toolErrors, 1);
    assert.equal(projection.toolCallObservations?.[0]?.status, "REJECTED");
    assert.equal(projection.currentActivity, "Failed");
});
