import assert from "node:assert/strict";
import test from "node:test";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import {
  AutonomyConsumption,
  AutonomyConsumptionValidationError,
} from "../../src/domain/autonomy/autonomy-consumption.js";
import {
  AutonomousOperation,
  AutonomousOperationValidationError,
  InvalidAutonomousOperationTransitionError,
} from "../../src/domain/autonomy/autonomous-operation.js";

test("AutonomyConsumption Unit Suite", async (t) => {
  await t.test("creates zero consumption by default", () => {
    const consumption = AutonomyConsumption.zero();
    assert.equal(consumption.stepsUsed, 0);
    assert.equal(consumption.toolCallsUsed, 0);
    assert.equal(consumption.elapsedMs, 0);
    assert.equal(consumption.tokensUsed, undefined);
  });

  await t.test("creates consumption with explicit props", () => {
    const consumption = AutonomyConsumption.create({
      stepsUsed: 3,
      toolCallsUsed: 5,
      elapsedMs: 12000,
      tokensUsed: 1500,
    });
    assert.equal(consumption.stepsUsed, 3);
    assert.equal(consumption.toolCallsUsed, 5);
    assert.equal(consumption.elapsedMs, 12000);
    assert.equal(consumption.tokensUsed, 1500);
  });

  await t.test("rejects invalid consumption props", () => {
    assert.throws(
      () => AutonomyConsumption.create(null as unknown as { stepsUsed: number; toolCallsUsed: number; elapsedMs: number }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => AutonomyConsumption.create({ stepsUsed: -1, toolCallsUsed: 0, elapsedMs: 0 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => AutonomyConsumption.create({ stepsUsed: 0, toolCallsUsed: -1, elapsedMs: 0 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => AutonomyConsumption.create({ stepsUsed: 0, toolCallsUsed: 0, elapsedMs: -1 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => AutonomyConsumption.create({ stepsUsed: 0, toolCallsUsed: 0, elapsedMs: 0, tokensUsed: -1 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
  });

  await t.test("recordStep increments stepsUsed and accumulates deltas immutably", () => {
    const initial = AutonomyConsumption.zero();
    const afterStep1 = initial.recordStep({ toolCalls: 2, elapsedMs: 1500 });

    assert.equal(initial.stepsUsed, 0); // initial is untouched
    assert.equal(afterStep1.stepsUsed, 1);
    assert.equal(afterStep1.toolCallsUsed, 2);
    assert.equal(afterStep1.elapsedMs, 1500);
    assert.equal(afterStep1.tokensUsed, undefined);

    const afterStep2 = afterStep1.recordStep({ toolCalls: 1, elapsedMs: 2000, tokens: 300 });
    assert.equal(afterStep2.stepsUsed, 2);
    assert.equal(afterStep2.toolCallsUsed, 3);
    assert.equal(afterStep2.elapsedMs, 3500);
    assert.equal(afterStep2.tokensUsed, 300);
  });

  await t.test("recordStep rejects negative or decimal deltas", () => {
    const consumption = AutonomyConsumption.zero();
    assert.throws(
      () => consumption.recordStep({ toolCalls: -1 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => consumption.recordStep({ elapsedMs: -50 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => consumption.recordStep({ tokens: -10 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
    assert.throws(
      () => consumption.recordStep({ toolCalls: 1.5 }),
      (err: unknown) => err instanceof AutonomyConsumptionValidationError
    );
  });

  await t.test("snapshot produces frozen representation", () => {
    const consumption = AutonomyConsumption.create({
      stepsUsed: 2,
      toolCallsUsed: 4,
      elapsedMs: 8000,
    });
    const snap = consumption.snapshot();
    assert.deepEqual(snap, {
      stepsUsed: 2,
      toolCallsUsed: 4,
      elapsedMs: 8000,
    });
    assert.ok(Object.isFrozen(snap));
  });

  await t.test("equality check via equals()", () => {
    const c1 = AutonomyConsumption.create({ stepsUsed: 1, toolCallsUsed: 2, elapsedMs: 500 });
    const c2 = AutonomyConsumption.create({ stepsUsed: 1, toolCallsUsed: 2, elapsedMs: 500 });
    const c3 = AutonomyConsumption.create({ stepsUsed: 2, toolCallsUsed: 2, elapsedMs: 500 });

    assert.ok(c1.equals(c2));
    assert.equal(c1.equals(c3), false);
    assert.equal(c1.equals(null), false);
  });
});

test("AutonomousOperation Entity Suite", async (t) => {
  const createTestBudget = (overrides = {}) =>
    AutonomyBudget.create({
      maxSteps: 5,
      maxDurationMs: 30000,
      maxToolCalls: 10,
      ...overrides,
    });

  await t.test("creates an operation in SUBMITTED status with zero consumption", () => {
    const budget = createTestBudget();
    const createdDate = new Date("2026-09-07T10:00:00.000Z");
    const op = AutonomousOperation.create({
      id: "op-101",
      objective: "Analyze quarterly logs",
      agentId: "agent-analyst",
      budget,
      createdAt: createdDate,
    });

    assert.equal(op.id, "op-101");
    assert.equal(op.objective, "Analyze quarterly logs");
    assert.equal(op.agentId, "agent-analyst");
    assert.equal(op.status, "SUBMITTED");
    assert.equal(op.createdAt, createdDate);
    assert.equal(op.startedAt, undefined);
    assert.equal(op.completedAt, undefined);
    assert.equal(op.consumption.stepsUsed, 0);
    assert.equal(op.consumption.toolCallsUsed, 0);
    assert.equal(op.consumption.elapsedMs, 0);
    assert.ok(Object.isFrozen(op));
  });

  await t.test("rejects invalid inputs on creation", () => {
    const budget = createTestBudget();

    assert.throws(
      () => AutonomousOperation.create(null as unknown as { id: string; objective: string; agentId: string; budget: AutonomyBudget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );

    // Empty or invalid id
    assert.throws(
      () => AutonomousOperation.create({ id: "", objective: "Obj", agentId: "agent-1", budget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );
    assert.throws(
      () => AutonomousOperation.create({ id: "invalid id with spaces", objective: "Obj", agentId: "agent-1", budget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );

    // Empty or invalid agentId
    assert.throws(
      () => AutonomousOperation.create({ id: "op-1", objective: "Obj", agentId: "", budget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );
    assert.throws(
      () => AutonomousOperation.create({ id: "op-1", objective: "Obj", agentId: "invalid!agent", budget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );

    // Empty or whitespace objective
    assert.throws(
      () => AutonomousOperation.create({ id: "op-1", objective: "   ", agentId: "agent-1", budget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );
    assert.throws(
      () => AutonomousOperation.create({ id: "op-1", objective: 123 as unknown as string, agentId: "agent-1", budget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );

    // Missing budget
    assert.throws(
      () => AutonomousOperation.create({ id: "op-1", objective: "Obj", agentId: "agent-1", budget: null as unknown as AutonomyBudget }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );
  });

  await t.test("executes valid lifecycle transitions: SUBMITTED -> RUNNING -> COMPLETED", () => {
    const budget = createTestBudget();
    const op = AutonomousOperation.create({
      id: "op-lifecycle-1",
      objective: "Complete task",
      agentId: "agent-1",
      budget,
    });

    const startDate = new Date("2026-09-07T10:05:00.000Z");
    const running = op.start(startDate);
    assert.equal(op.status, "SUBMITTED"); // original unchanged
    assert.equal(running.status, "RUNNING");
    assert.equal(running.startedAt, startDate);

    const completeDate = new Date("2026-09-07T10:05:30.000Z");
    const completed = running.complete({ resultSummary: "Success" }, completeDate);
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.completedAt, completeDate);
    assert.deepEqual(completed.resultOutput, { resultSummary: "Success" });
  });

  await t.test("executes valid lifecycle transition: RUNNING -> FAILED with error", () => {
    const budget = createTestBudget();
    const running = AutonomousOperation.create({
      id: "op-lifecycle-fail",
      objective: "Failing task",
      agentId: "agent-1",
      budget,
    }).start();

    const failDate = new Date("2026-09-07T10:06:00.000Z");
    const failed = running.fail({ code: "POLICY_DENIAL", message: "Tool call was denied by governance" }, failDate);

    assert.equal(failed.status, "FAILED");
    assert.equal(failed.completedAt, failDate);
    assert.equal(failed.terminationReason, "Tool call was denied by governance");
    assert.deepEqual(failed.failureError, { code: "POLICY_DENIAL", message: "Tool call was denied by governance" });

    // Rejects invalid failure error
    assert.throws(
      () => running.fail({ code: "", message: "Empty code" }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );
    assert.throws(
      () => running.fail({ code: "ERR", message: "" }),
      (err: unknown) => err instanceof AutonomousOperationValidationError
    );
  });

  await t.test("executes valid lifecycle transition: RUNNING -> CANCELLED", () => {
    const budget = createTestBudget();
    const running = AutonomousOperation.create({
      id: "op-cancel-1",
      objective: "Cancellable task",
      agentId: "agent-1",
      budget,
    }).start();

    const cancelDate = new Date("2026-09-07T10:07:00.000Z");
    const cancelled = running.cancel("User clicked abort", cancelDate);

    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.completedAt, cancelDate);
    assert.equal(cancelled.terminationReason, "User clicked abort");
  });

  await t.test("executes valid lifecycle transition: RUNNING -> BUDGET_EXHAUSTED", () => {
    const budget = createTestBudget();
    const running = AutonomousOperation.create({
      id: "op-exhaust-1",
      objective: "Long task",
      agentId: "agent-1",
      budget,
    }).start();

    const exhaustDate = new Date("2026-09-07T10:08:00.000Z");
    const exhausted = running.exhaustBudget("STEPS_EXHAUSTED", exhaustDate);

    assert.equal(exhausted.status, "BUDGET_EXHAUSTED");
    assert.equal(exhausted.completedAt, exhaustDate);
    assert.equal(exhausted.terminationReason, "STEPS_EXHAUSTED");
  });

  await t.test("rejects invalid transitions from SUBMITTED directly to terminal states", () => {
    const op = AutonomousOperation.create({
      id: "op-invalid-sub",
      objective: "Test invalid sub",
      agentId: "agent-1",
      budget: createTestBudget(),
    });

    assert.throws(() => op.complete(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => op.fail({ code: "ERR", message: "Fail" }), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => op.cancel(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => op.exhaustBudget("STEPS_EXHAUSTED"), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
  });

  await t.test("rejects transitions from terminal states", () => {
    const budget = createTestBudget();
    const running = AutonomousOperation.create({
      id: "op-term-1",
      objective: "Terminal checks",
      agentId: "agent-1",
      budget,
    }).start();

    const completed = running.complete();
    assert.throws(() => completed.start(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => completed.cancel(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => completed.fail({ code: "ERR", message: "Fail" }), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => completed.exhaustBudget("STEPS_EXHAUSTED"), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);

    const cancelled = running.cancel();
    assert.throws(() => cancelled.start(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => cancelled.complete(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);

    const failed = running.fail({ code: "ERR", message: "Fail" });
    assert.throws(() => failed.start(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => failed.cancel(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);

    const exhausted = running.exhaustBudget("STEPS_EXHAUSTED");
    assert.throws(() => exhausted.start(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
    assert.throws(() => exhausted.cancel(), (err: unknown) => err instanceof InvalidAutonomousOperationTransitionError);
  });

  await t.test("evaluates step budget correctly (stepsUsed < maxSteps)", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 3,
      maxDurationMs: 60000,
      maxToolCalls: 10,
    });
    let op = AutonomousOperation.create({
      id: "op-step-budget",
      objective: "Step tracking",
      agentId: "agent-1",
      budget,
    }).start();

    // Step 0 used < 3 -> hasBudget: true
    assert.equal(op.hasBudgetRemaining(), true);
    assert.deepEqual(op.checkBudget(), { hasBudget: true });

    // Step 1 recorded
    op = op.recordStep({ toolCalls: 1, elapsedMs: 1000 });
    assert.equal(op.consumption.stepsUsed, 1);
    assert.equal(op.hasBudgetRemaining(), true);

    // Step 2 recorded
    op = op.recordStep({ toolCalls: 1, elapsedMs: 1000 });
    assert.equal(op.consumption.stepsUsed, 2);
    assert.equal(op.hasBudgetRemaining(), true);

    // Step 3 recorded -> stepsUsed === 3 === maxSteps
    op = op.recordStep({ toolCalls: 1, elapsedMs: 1000 });
    assert.equal(op.consumption.stepsUsed, 3);
    assert.equal(op.hasBudgetRemaining(), false);
    assert.deepEqual(op.checkBudget(), { hasBudget: false, reason: "STEPS_EXHAUSTED" });
  });

  await t.test("evaluates tool call budget correctly", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 60000,
      maxToolCalls: 2,
    });
    let op = AutonomousOperation.create({
      id: "op-tool-budget",
      objective: "Tool tracking",
      agentId: "agent-1",
      budget,
    }).start();

    op = op.recordStep({ toolCalls: 2 });
    assert.equal(op.consumption.toolCallsUsed, 2);

    // Next step attempting 1 tool call -> TOOLS_EXHAUSTED
    assert.deepEqual(op.checkBudget(undefined, 1), {
      hasBudget: false,
      reason: "TOOLS_EXHAUSTED",
    });
  });

  await t.test("evaluates zero tool call budget (maxToolCalls = 0)", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 5,
      maxDurationMs: 10000,
      maxToolCalls: 0,
    });
    const op = AutonomousOperation.create({
      id: "op-zero-tools",
      objective: "No tool calls allowed",
      agentId: "agent-1",
      budget,
    }).start();

    // Without tools: allowed
    assert.deepEqual(op.checkBudget(undefined, 0), { hasBudget: true });
    // Any tool invocation requested: exhausted
    assert.deepEqual(op.checkBudget(undefined, 1), { hasBudget: false, reason: "TOOLS_EXHAUSTED" });
  });

  await t.test("evaluates duration budget deterministically without Date.now()", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 5000,
      maxToolCalls: 10,
    });
    const op = AutonomousOperation.create({
      id: "op-dur-budget",
      objective: "Duration tracking",
      agentId: "agent-1",
      budget,
    }).start();

    // Within limit: 4999 ms
    assert.deepEqual(op.checkBudget(4999), { hasBudget: true });

    // Reached/exceeded: 5000 ms -> DURATION_EXCEEDED (treated as budget exhaustion, NOT cancelled)
    assert.deepEqual(op.checkBudget(5000), {
      hasBudget: false,
      reason: "DURATION_EXCEEDED",
    });
    assert.deepEqual(op.checkBudget(6000), {
      hasBudget: false,
      reason: "DURATION_EXCEEDED",
    });
  });

  await t.test("evaluates token budget correctly when specified", () => {
    const budget = AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 60000,
      maxToolCalls: 10,
      maxTokens: 500,
    });
    let op = AutonomousOperation.create({
      id: "op-token-budget",
      objective: "Token tracking",
      agentId: "agent-1",
      budget,
    }).start();

    op = op.recordStep({ tokens: 500 });
    assert.deepEqual(op.checkBudget(), {
      hasBudget: false,
      reason: "TOKENS_EXHAUSTED",
    });
  });

  await t.test("recordStep rejects being called on non-RUNNING operation", () => {
    const budget = createTestBudget();
    const op = AutonomousOperation.create({
      id: "op-not-running",
      objective: "Test step rejection",
      agentId: "agent-1",
      budget,
    });

    assert.throws(
      () => op.recordStep({ toolCalls: 1 }),
      (err: unknown) =>
        err instanceof AutonomousOperationValidationError &&
        err.message.includes("must be RUNNING")
    );
  });

  await t.test("snapshot produces complete, frozen and independent representation", () => {
    const budget = createTestBudget();
    const op = AutonomousOperation.create({
      id: "op-snapshot-1",
      objective: "Snapshot test",
      agentId: "agent-1",
      budget,
    }).start().recordStep({ toolCalls: 1, elapsedMs: 500 });

    const snap = op.snapshot();

    assert.equal(snap.id, "op-snapshot-1");
    assert.equal(snap.objective, "Snapshot test");
    assert.equal(snap.agentId, "agent-1");
    assert.equal(snap.status, "RUNNING");
    assert.equal(snap.budget.maxSteps, 5);
    assert.equal(snap.consumption.stepsUsed, 1);
    assert.equal(snap.consumption.toolCallsUsed, 1);
    assert.equal(snap.consumption.elapsedMs, 500);
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.budget));
    assert.ok(Object.isFrozen(snap.consumption));

    // Mutating snapshot fails
    assert.throws(
      () => {
        (snap as unknown as Record<string, unknown>).status = "COMPLETED";
      },
      (err: unknown) => err instanceof TypeError
    );
  });
});
