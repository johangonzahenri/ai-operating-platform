import assert from "node:assert/strict";
import test from "node:test";
import {
  AutonomousOperation,
  AutonomousOperationValidationError,
  InvalidAutonomousOperationTransitionError,
} from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";

test("AutonomousOperation FSM & State Transition Suite", async (t) => {
  const fixedNow = new Date("2026-09-09T10:00:00.000Z");
  const budget = AutonomyBudget.create({
    maxSteps: 5,
    maxDurationMs: 60000,
    maxToolCalls: 10,
  });

  await t.test("Lifecycle: SUBMITTED -> RUNNING -> COMPLETED", () => {
    const op = AutonomousOperation.create({
      id: "op-1",
      objective: "Complete goal",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    });

    assert.equal(op.status, "SUBMITTED");
    assert.equal(op.startedAt, undefined);
    assert.equal(op.completedAt, undefined);

    const running = op.start(new Date("2026-09-09T10:01:00.000Z"));
    assert.equal(running.status, "RUNNING");
    assert.ok(running.startedAt);

    const completed = running.complete({ result: "success" }, new Date("2026-09-09T10:02:00.000Z"));
    assert.equal(completed.status, "COMPLETED");
    assert.ok(completed.completedAt);
    assert.deepEqual(completed.resultOutput, { result: "success" });
  });

  await t.test("Lifecycle: SUBMITTED -> RUNNING -> FAILED", () => {
    const op = AutonomousOperation.create({
      id: "op-2",
      objective: "Handle failure",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    });

    const running = op.start();
    const failed = running.fail({
      code: "CRASH_RECOVERY_OPERATION_TERMINATED",
      message: "Process terminated unexpectedly",
    });

    assert.equal(failed.status, "FAILED");
    assert.equal(failed.failureError?.code, "CRASH_RECOVERY_OPERATION_TERMINATED");
    assert.equal(failed.terminationReason, "Process terminated unexpectedly");
  });

  await t.test("Lifecycle: SUBMITTED -> RUNNING -> CANCELLED", () => {
    const op = AutonomousOperation.create({
      id: "op-3",
      objective: "Handle cancel",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    });

    const running = op.start();
    const cancelled = running.cancel("Cancelled by operator");

    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.terminationReason, "Cancelled by operator");
  });

  await t.test("Lifecycle: SUBMITTED -> RUNNING -> BUDGET_EXHAUSTED", () => {
    const op = AutonomousOperation.create({
      id: "op-4",
      objective: "Exhaust budget",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    });

    const running = op.start();
    const exhausted = running.exhaustBudget("STEPS_EXHAUSTED");

    assert.equal(exhausted.status, "BUDGET_EXHAUSTED");
    assert.equal(exhausted.terminationReason, "STEPS_EXHAUSTED");
  });

  await t.test("Terminal Immutability: cannot transition from terminal states", () => {
    const op = AutonomousOperation.create({
      id: "op-5",
      objective: "Test immutability",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    });

    const running = op.start();
    const completed = running.complete();

    assert.throws(
      () => completed.start(),
      InvalidAutonomousOperationTransitionError,
      "Cannot start completed operation"
    );
    assert.throws(
      () => completed.fail({ code: "ERR", message: "fail" }),
      InvalidAutonomousOperationTransitionError,
      "Cannot fail completed operation"
    );
    assert.throws(
      () => completed.cancel("cancel"),
      InvalidAutonomousOperationTransitionError,
      "Cannot cancel completed operation"
    );
  });

  await t.test("Validation: fail requires valid code and message", () => {
    const op = AutonomousOperation.create({
      id: "op-6",
      objective: "Test fail validation",
      agentId: "agent-1",
      budget,
    }).start();

    assert.throws(
      () => op.fail(null as unknown as { code: string; message: string }),
      AutonomousOperationValidationError
    );
    assert.throws(
      () => op.fail({ code: "", message: "msg" }),
      AutonomousOperationValidationError
    );
    assert.throws(
      () => op.fail({ code: "ERR", message: "" }),
      AutonomousOperationValidationError
    );
  });
});
