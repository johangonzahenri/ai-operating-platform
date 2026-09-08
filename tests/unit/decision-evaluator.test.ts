import assert from "node:assert/strict";
import test from "node:test";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { Observation } from "../../src/domain/autonomy/observation.js";
import {
  ObjectiveEvaluation,
  ObjectiveEvaluationValidationError,
} from "../../src/domain/autonomy/objective-evaluation.js";
import {
  DeterministicDecisionEvaluator,
  DecisionEvaluationError,
  DecisionEvaluationContext,
} from "../../src/domain/autonomy/decision-evaluator.js";

const createTestFixtures = (maxSteps = 5) => {
  const budget = AutonomyBudget.create({
    maxSteps,
    maxDurationMs: 60000,
    maxToolCalls: 10,
  });

  const operation = AutonomousOperation.create({
    id: "op-eval-test",
    objective: "Analyze codebase and generate report",
    agentId: "agent-eval-1",
    budget,
  }).start();

  const step1 = PlanStep.create({
    id: "step-1",
    order: 1,
    action: "read_files",
    input: { pattern: "*.ts" },
  });
  const step2 = PlanStep.create({
    id: "step-2",
    order: 2,
    action: "analyze_ast",
    input: { strict: true },
  });
  const step3 = PlanStep.create({
    id: "step-3",
    order: 3,
    action: "write_summary",
    input: { format: "markdown" },
  });

  const plan = Plan.create({
    id: "plan-eval-test",
    operationId: "op-eval-test",
    steps: [step1, step2, step3],
  });

  return { budget, operation, plan, step1, step2, step3 };
};

test("ObjectiveEvaluation Domain Value Object Suite", async (t) => {
  await t.test("creates ACHIEVED evaluation via factory", () => {
    const evalResult = ObjectiveEvaluation.achieved({
      rationale: "All acceptance criteria verified",
      evidence: { passed: 10, failed: 0 },
    });

    assert.equal(evalResult.status, "ACHIEVED");
    assert.equal(evalResult.isAchieved, true);
    assert.equal(evalResult.rationale, "All acceptance criteria verified");
    assert.deepEqual(evalResult.evidence, { passed: 10, failed: 0 });
  });

  await t.test("creates NOT_ACHIEVED evaluation via factory", () => {
    const evalResult = ObjectiveEvaluation.notAchieved({
      rationale: "Step completed but goal remains pending",
    });

    assert.equal(evalResult.status, "NOT_ACHIEVED");
    assert.equal(evalResult.isAchieved, false);
    assert.equal(evalResult.rationale, "Step completed but goal remains pending");
  });

  await t.test("creates UNKNOWN evaluation via factory", () => {
    const evalResult = ObjectiveEvaluation.unknown({ rationale: "Cannot determine goal status" });
    assert.equal(evalResult.status, "UNKNOWN");
    assert.equal(evalResult.isAchieved, false);
  });

  await t.test("rejects invalid status or non-object props", () => {
    assert.throws(
      () => ObjectiveEvaluation.create(null as unknown as { status: "ACHIEVED" }),
      (err: unknown) => err instanceof ObjectiveEvaluationValidationError
    );

    assert.throws(
      () =>
        ObjectiveEvaluation.create({
          status: "INVALID" as unknown as "ACHIEVED",
        }),
      (err: unknown) =>
        err instanceof ObjectiveEvaluationValidationError && err.message.includes("Invalid objective status")
    );
  });

  await t.test("rejects functions in evidence", () => {
    assert.throws(
      () =>
        ObjectiveEvaluation.create({
          status: "ACHIEVED",
          evidence: { fn: () => true },
        }),
      (err: unknown) =>
        err instanceof ObjectiveEvaluationValidationError && err.message.includes("cannot contain functions")
    );
  });

  await t.test("enforces immutability and frozen snapshot", () => {
    const evalResult = ObjectiveEvaluation.achieved({
      rationale: "done",
      evidence: { metric: 100 },
    });

    assert.throws(() => {
      (evalResult as unknown as { status: string }).status = "MUTATED";
    }, TypeError);

    const snap = evalResult.snapshot();
    assert.equal(snap.status, "ACHIEVED");
    assert.ok(Object.isFrozen(snap));
  });
});

test("DeterministicDecisionEvaluator Decision Matrix Suite", async (t) => {
  const evaluator = new DeterministicDecisionEvaluator();

  await t.test("Caso 1: SUCCESS + objective ACHIEVED -> Decision COMPLETE", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-1",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 500,
      output: { summary: "Analysis finished early" },
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
      objectiveEvaluation: ObjectiveEvaluation.achieved({
        rationale: "Goal achieved in first step",
      }),
    });

    assert.equal(decision.type, "COMPLETE");
    assert.equal(decision.operationId, operation.id);
    assert.deepEqual(decision.output, { summary: "Analysis finished early" });
    assert.equal(decision.rationale, "Goal achieved in first step");
  });

  await t.test("Caso 2: SUCCESS + objective NOT_ACHIEVED + next step exists -> Decision EXECUTE_STEP", () => {
    const { operation, plan, step2 } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-1",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 300,
      output: { files: ["a.ts", "b.ts"] },
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
      objectiveEvaluation: ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(decision.type, "EXECUTE_STEP");
    assert.equal(decision.operationId, operation.id);
    assert.equal(decision.stepId, step2.id);
    assert.equal(decision.action, step2.action);
    assert.deepEqual(decision.input, step2.input);
    assert.ok(decision.rationale?.includes("proceeding to planned step 2"));
  });

  await t.test("Caso 3: SUCCESS + objective NOT_ACHIEVED + no next step -> Decision STOP (default)", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-3",
      operationId: operation.id,
      stepId: "step-3", // last step of the plan
      durationMs: 400,
      output: { summary: "End of plan" },
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
      objectiveEvaluation: ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(decision.type, "STOP");
    assert.equal(decision.operationId, operation.id);
    assert.ok(decision.reason?.includes("exhausted"));
  });

  await t.test("Caso 3b: SUCCESS + objective NOT_ACHIEVED + no next step -> Decision FAIL (when configured)", () => {
    const failEvaluator = new DeterministicDecisionEvaluator({ onPlanExhausted: "FAIL" });
    const { operation, plan } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-3",
      operationId: operation.id,
      stepId: "step-3",
      durationMs: 400,
    });

    const decision = failEvaluator.evaluate({
      operation,
      plan,
      observation,
      objectiveEvaluation: ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(decision.type, "FAIL");
    assert.equal(decision.operationId, operation.id);
    assert.equal(decision.failureError?.code, "PLAN_EXHAUSTED");
  });

  await t.test("Caso 4: FAILED observation -> Decision FAIL with failure error", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.failure({
      observationId: "obs-fail",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 120,
      error: { code: "PARSING_ERROR", message: "Failed to parse AST" },
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
    });

    assert.equal(decision.type, "FAIL");
    assert.equal(decision.operationId, operation.id);
    assert.deepEqual(decision.failureError, {
      code: "PARSING_ERROR",
      message: "Failed to parse AST",
    });
  });

  await t.test("Caso 5: stopRequested = true -> Decision STOP", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-1",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 100,
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
      stopRequested: true,
      stopReason: "User aborted execution",
    });

    assert.equal(decision.type, "STOP");
    assert.equal(decision.operationId, operation.id);
    assert.equal(decision.reason, "User aborted execution");
  });

  await t.test("Caso 6: CANCELLED observation -> Decision STOP", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.cancelled({
      observationId: "obs-canc",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 10,
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
    });

    assert.equal(decision.type, "STOP");
    assert.equal(decision.operationId, operation.id);
    assert.ok(decision.reason?.includes("cancelled"));
  });

  await t.test("Caso 7: Budget maxSteps reached -> Decision STOP", () => {
    const { budget, plan } = createTestFixtures(1); // maxSteps = 1
    const operation = AutonomousOperation.create({
      id: "op-eval-test",
      objective: "Short budget test",
      agentId: "agent-1",
      budget,
    }).start();

    const observation = Observation.success({
      observationId: "obs-1",
      operationId: operation.id,
      stepId: "step-1", // order is 1, which reaches maxSteps = 1
      durationMs: 100,
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
      objectiveEvaluation: ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(decision.type, "STOP");
    assert.ok(decision.reason?.includes("maxSteps reached"));
  });

  await t.test("Caso 8: rejects invalid evaluation context", () => {
    assert.throws(
      () => evaluator.evaluate(null as unknown as DecisionEvaluationContext),
      (err: unknown) => err instanceof DecisionEvaluationError
    );

    assert.throws(
      () => evaluator.evaluate({} as unknown as DecisionEvaluationContext),
      (err: unknown) => err instanceof DecisionEvaluationError
    );
  });

  await t.test("Caso 9: rejects observed stepId not present in Plan", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-foreign",
      operationId: operation.id,
      stepId: "unknown-step-id",
      durationMs: 100,
    });

    assert.throws(
      () => evaluator.evaluate({ operation, plan, observation }),
      (err: unknown) =>
        err instanceof DecisionEvaluationError && err.message.includes("does not belong to plan")
    );
  });

  await t.test("Caso 10: rejects operationId mismatch across operation, plan, observation", () => {
    const { operation, plan } = createTestFixtures();
    const observationMismatched = Observation.success({
      observationId: "obs-1",
      operationId: "different-op-id",
      stepId: "step-1",
      durationMs: 100,
    });

    assert.throws(
      () => evaluator.evaluate({ operation, plan, observation: observationMismatched }),
      (err: unknown) =>
        err instanceof DecisionEvaluationError && err.message.includes("does not match operation")
    );
  });

  await t.test("Caso 11: rejects evaluating operation in terminal state", () => {
    const { operation, plan } = createTestFixtures();
    const completedOp = operation.complete({ done: true });
    const observation = Observation.success({
      observationId: "obs-1",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 100,
    });

    assert.throws(
      () => evaluator.evaluate({ operation: completedOp, plan, observation }),
      (err: unknown) =>
        err instanceof DecisionEvaluationError && err.message.includes("in terminal state")
    );
  });

  await t.test("Caso 12: guarantees returned Decision is immutable", () => {
    const { operation, plan } = createTestFixtures();
    const observation = Observation.success({
      observationId: "obs-1",
      operationId: operation.id,
      stepId: "step-1",
      durationMs: 100,
    });

    const decision = evaluator.evaluate({
      operation,
      plan,
      observation,
    });

    assert.ok(Object.isFrozen(decision));
    assert.throws(() => {
      (decision as unknown as { type: string }).type = "COMPLETE";
    }, TypeError);
  });

  await t.test("Single-step plan edge case: reaches final step on step 1", () => {
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 10000, maxToolCalls: 2 });
    const operation = AutonomousOperation.create({
      id: "op-single",
      objective: "Single task",
      agentId: "agent-1",
      budget,
    }).start();

    const singleStep = PlanStep.create({ id: "only-step", order: 1, action: "execute", input: {} });
    const singlePlan = Plan.create({
      id: "plan-single",
      operationId: "op-single",
      steps: [singleStep],
    });

    const obs = Observation.success({
      observationId: "obs-single",
      operationId: "op-single",
      stepId: "only-step",
      durationMs: 200,
    });

    const decision = evaluator.evaluate({
      operation,
      plan: singlePlan,
      observation: obs,
      objectiveEvaluation: ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(decision.type, "STOP");
    assert.ok(decision.reason?.includes("exhausted"));
  });
});

test("Autonomy Domain Architecture & Isolation Suite", async (t) => {
  const forbiddenKeywords = [
    "from \"http\"",
    "from \"node:http\"",
    "from \"fs\"",
    "from \"node:fs\"",
    "from \"path\"",
    "from \"node:path\"",
    "from \"crypto\"",
    "from \"node:crypto\"",
    "from \"child_process\"",
    "from \"node:child_process\"",
    "from \"worker_threads\"",
    "from \"node:worker_threads\"",
    "openai",
    "anthropic",
    "@google/genai",
    "ollama",
    "langchain",
  ];

  const domainFiles = [
    new URL("../../../src/domain/autonomy/observation.ts", import.meta.url),
    new URL("../../../src/domain/autonomy/objective-evaluation.ts", import.meta.url),
    new URL("../../../src/domain/autonomy/decision-evaluator.ts", import.meta.url),
    new URL("../../../src/domain/autonomy/planner-port.ts", import.meta.url),
    new URL("../../../src/domain/autonomy/planning-request.ts", import.meta.url),
    new URL("../../../src/domain/autonomy/plan.ts", import.meta.url),
    new URL("../../../src/domain/autonomy/decision.ts", import.meta.url),
  ];

  await t.test("verifies all domain autonomy files have zero forbidden imports", async () => {
    const fs = await import("node:fs/promises");
    for (const fileUrl of domainFiles) {
      const content = await fs.readFile(fileUrl, "utf-8");
      for (const keyword of forbiddenKeywords) {
        assert.equal(
          content.toLowerCase().includes(keyword.toLowerCase()),
          false,
          `File ${fileUrl.pathname} contains forbidden dependency keyword: ${keyword}`
        );
      }
    }
  });
});

