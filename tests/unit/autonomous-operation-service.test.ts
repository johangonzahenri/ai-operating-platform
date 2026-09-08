import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import {
  OperationConflictError,
  OperationNotFoundError,
  OperationValidationError,
} from "../../src/application/autonomy/autonomous-operation-service.js";
import { AgentInactiveError, AgentNotFoundError } from "../../src/domain/agent/agent.js";

const DEFAULT_BUDGET = {
  maxSteps: 3,
  maxDurationMs: 15000,
  maxToolCalls: 2,
  maxTokens: 5000,
};

test("AutonomousOperationService Suite", async (t) => {
  await t.test("Successfully creates and executes an operation synchronously", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    const result = await service.executeOperation({
      id: "op-sync-1",
      agentId: "foundation-agent",
      objective: "Calculate totals and generate summary",
      budget: DEFAULT_BUDGET,
    });

    assert.ok(result.operation);
    assert.equal(result.operation.id, "op-sync-1");
    assert.equal(result.operation.status, "COMPLETED");
    assert.ok(Array.isArray(result.observations));
    assert.ok(Array.isArray(result.decisions));

    // Verify stored in repository
    const record = platform.operations.findById("op-sync-1");
    assert.ok(record);
    assert.equal(record.status, "COMPLETED");
    assert.equal(record.agentId, "foundation-agent");

    // Verify CQRS query
    const detail = service.getOperation("op-sync-1");
    assert.ok(detail);
    assert.equal(detail?.id, "op-sync-1");
    assert.equal(detail?.status, "COMPLETED");
  });

  await t.test("Validates required fields and throws OperationValidationError", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    assert.throws(
      () => service.createOperation(null as any),
      (err: any) => err instanceof OperationValidationError && err.message.includes("Request body")
    );

    assert.throws(
      () => service.createOperation({ agentId: "", objective: "obj", budget: DEFAULT_BUDGET }),
      (err: any) => err instanceof OperationValidationError && err.message.includes("agentId")
    );

    assert.throws(
      () => service.createOperation({ agentId: "foundation-agent", objective: "", budget: DEFAULT_BUDGET }),
      (err: any) => err instanceof OperationValidationError && err.message.includes("objective")
    );

    assert.throws(
      () => service.createOperation({ agentId: "foundation-agent", objective: "obj", budget: null as any }),
      (err: any) => err instanceof OperationValidationError && err.message.includes("budget")
    );

    assert.throws(
      () =>
        service.createOperation({
          agentId: "foundation-agent",
          objective: "obj",
          budget: { ...DEFAULT_BUDGET, maxSteps: 0 },
        }),
      (err: any) => err instanceof OperationValidationError
    );
  });

  await t.test("Rejects unknown agent with AgentNotFoundError", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    assert.throws(
      () =>
        service.createOperation({
          agentId: "unknown-agent-xyz",
          objective: "obj",
          budget: DEFAULT_BUDGET,
        }),
      (err: any) => err instanceof AgentNotFoundError
    );
  });

  await t.test("Rejects inactive agent with AgentInactiveError", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    // Deactivate agent
    platform.agentService.deactivateAgent("foundation-agent");

    assert.throws(
      () =>
        service.createOperation({
          agentId: "foundation-agent",
          objective: "obj",
          budget: DEFAULT_BUDGET,
        }),
      (err: any) => err instanceof AgentInactiveError
    );
  });

  await t.test("Pre-execution cancellation cancels SUBMITTED operation", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    // Create operation and save as SUBMITTED without running
    const op = service.createOperation({
      id: "op-cancel-sub",
      agentId: "foundation-agent",
      objective: "Cancel me before run",
      budget: DEFAULT_BUDGET,
    });
    platform.operations.save(op);

    const cancelledOp = await service.cancelOperation("op-cancel-sub", "Operator cancelled");
    assert.equal(cancelledOp.status, "CANCELLED");

    const retrieved = platform.operations.findById("op-cancel-sub");
    assert.ok(retrieved);
    assert.equal(retrieved.status, "CANCELLED");
  });

  await t.test("Cancellation of non-existent operation throws OperationNotFoundError", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    await assert.rejects(
      async () => service.cancelOperation("non-existent-op-id"),
      (err: any) => err instanceof OperationNotFoundError
    );
  });

  await t.test("Cancellation of terminal operation throws OperationConflictError", async () => {
    const platform = createPlatform();
    const service = platform.operationService;

    // Run to completion
    await service.executeOperation({
      id: "op-already-completed",
      agentId: "foundation-agent",
      objective: "Complete quickly",
      budget: DEFAULT_BUDGET,
    });

    await assert.rejects(
      async () => service.cancelOperation("op-already-completed"),
      (err: any) => err instanceof OperationConflictError && err.message.includes("Cannot cancel")
    );
  });
});
