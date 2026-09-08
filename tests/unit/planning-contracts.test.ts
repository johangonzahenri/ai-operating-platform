import assert from "node:assert/strict";
import test from "node:test";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import {
  PlanningRequest,
  PlanningValidationError,
} from "../../src/domain/autonomy/planning-request.js";
import {
  Plan,
  PlanStep,
  InvalidPlanError,
  PlanStepValidationError,
  MAX_PLAN_STEPS,
} from "../../src/domain/autonomy/plan.js";
import {
  Decision,
  DecisionValidationError,
} from "../../src/domain/autonomy/decision.js";
import { PlannerPort } from "../../src/domain/autonomy/planner-port.js";

const createValidBudget = (): AutonomyBudget =>
  AutonomyBudget.create({
    maxSteps: 10,
    maxDurationMs: 60000,
    maxToolCalls: 5,
  });

test("PlanningRequest Domain Contract Suite", async (t) => {
  await t.test("creates a valid PlanningRequest with required fields", () => {
    const budget = createValidBudget();
    const req = PlanningRequest.create({
      operationId: "op-101",
      objective: "Analyze security vulnerabilities in repository",
      agentId: "agent-sec-1",
      budget,
      currentStep: 0,
    });

    assert.equal(req.operationId, "op-101");
    assert.equal(req.objective, "Analyze security vulnerabilities in repository");
    assert.equal(req.agentId, "agent-sec-1");
    assert.equal(req.budget, budget);
    assert.equal(req.currentStep, 0);
    assert.equal(req.metadata, undefined);
  });

  await t.test("creates a valid PlanningRequest with optional metadata", () => {
    const budget = createValidBudget();
    const req = PlanningRequest.create({
      operationId: "op-102",
      objective: "Generate test report",
      agentId: "agent-qa-1",
      budget,
      currentStep: 2,
      metadata: { priority: "high", retries: 1 },
    });

    assert.equal(req.currentStep, 2);
    assert.deepEqual(req.metadata, { priority: "high", retries: 1 });
  });

  await t.test("rejects invalid props (null, array, primitive)", () => {
    assert.throws(
      () => PlanningRequest.create(null as unknown as { operationId: string; objective: string; agentId: string; budget: AutonomyBudget; currentStep: number }),
      (err: unknown) => err instanceof PlanningValidationError
    );
    assert.throws(
      () => PlanningRequest.create([] as unknown as { operationId: string; objective: string; agentId: string; budget: AutonomyBudget; currentStep: number }),
      (err: unknown) => err instanceof PlanningValidationError
    );
  });

  await t.test("rejects invalid operationId and agentId", () => {
    const budget = createValidBudget();
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "invalid/id",
          objective: "test",
          agentId: "agent-1",
          budget,
          currentStep: 0,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "test",
          agentId: "   ",
          budget,
          currentStep: 0,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
  });

  await t.test("rejects invalid objective (empty, whitespace, too long)", () => {
    const budget = createValidBudget();
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "",
          agentId: "agent-1",
          budget,
          currentStep: 0,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "   ",
          agentId: "agent-1",
          budget,
          currentStep: 0,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "a".repeat(4097),
          agentId: "agent-1",
          budget,
          currentStep: 0,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
  });

  await t.test("rejects missing or invalid budget", () => {
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "test",
          agentId: "agent-1",
          budget: {} as AutonomyBudget,
          currentStep: 0,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
  });

  await t.test("rejects invalid currentStep (negative, float, string)", () => {
    const budget = createValidBudget();
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "test",
          agentId: "agent-1",
          budget,
          currentStep: -1,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "test",
          agentId: "agent-1",
          budget,
          currentStep: 1.5,
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
  });

  await t.test("rejects metadata containing executable functions", () => {
    const budget = createValidBudget();
    assert.throws(
      () =>
        PlanningRequest.create({
          operationId: "op-1",
          objective: "test",
          agentId: "agent-1",
          budget,
          currentStep: 0,
          metadata: { callback: () => true },
        }),
      (err: unknown) => err instanceof PlanningValidationError
    );
  });

  await t.test("enforces runtime immutability and generates frozen snapshot", () => {
    const budget = createValidBudget();
    const req = PlanningRequest.create({
      operationId: "op-1",
      objective: "immutable test",
      agentId: "agent-1",
      budget,
      currentStep: 0,
      metadata: { key: "val" },
    });

    assert.throws(() => {
      (req as unknown as { currentStep: number }).currentStep = 5;
    }, TypeError);

    const snap = req.snapshot();
    assert.equal(snap.operationId, "op-1");
    assert.equal(snap.objective, "immutable test");
    assert.equal(snap.budget.maxSteps, 10);
    assert.deepEqual(snap.metadata, { key: "val" });
    assert.ok(Object.isFrozen(snap));
  });
});

test("PlanStep Domain Contract Suite", async (t) => {
  await t.test("creates a valid PlanStep", () => {
    const step = PlanStep.create({
      id: "step-1",
      order: 1,
      action: "fetch_schema",
      input: { table: "users" },
      metadata: { retries: 2 },
    });

    assert.equal(step.id, "step-1");
    assert.equal(step.order, 1);
    assert.equal(step.action, "fetch_schema");
    assert.deepEqual(step.input, { table: "users" });
    assert.deepEqual(step.metadata, { retries: 2 });
  });

  await t.test("rejects invalid PlanStep properties", () => {
    assert.throws(
      () =>
        PlanStep.create({
          id: "invalid/step",
          order: 1,
          action: "test",
          input: {},
        }),
      (err: unknown) => err instanceof PlanStepValidationError
    );

    assert.throws(
      () =>
        PlanStep.create({
          id: "step-1",
          order: 0,
          action: "test",
          input: {},
        }),
      (err: unknown) => err instanceof PlanStepValidationError
    );

    assert.throws(
      () =>
        PlanStep.create({
          id: "step-1",
          order: 1,
          action: "   ",
          input: {},
        }),
      (err: unknown) => err instanceof PlanStepValidationError
    );

    assert.throws(
      () =>
        PlanStep.create({
          id: "step-1",
          order: 1,
          action: "test",
          input: null as unknown as Record<string, unknown>,
        }),
      (err: unknown) => err instanceof PlanStepValidationError
    );
  });

  await t.test("rejects functions in input or metadata", () => {
    assert.throws(
      () =>
        PlanStep.create({
          id: "step-1",
          order: 1,
          action: "test",
          input: { fn: () => {} },
        }),
      (err: unknown) => err instanceof PlanStepValidationError
    );

    assert.throws(
      () =>
        PlanStep.create({
          id: "step-1",
          order: 1,
          action: "test",
          input: {},
          metadata: { fn: () => {} },
        }),
      (err: unknown) => err instanceof PlanStepValidationError
    );
  });

  await t.test("enforces immutability and frozen snapshot", () => {
    const step = PlanStep.create({
      id: "step-1",
      order: 1,
      action: "read_file",
      input: { path: "package.json" },
    });

    assert.throws(() => {
      (step as unknown as { order: number }).order = 2;
    }, TypeError);

    const snap = step.snapshot();
    assert.equal(snap.id, "step-1");
    assert.equal(snap.order, 1);
    assert.ok(Object.isFrozen(snap));
  });
});

test("Plan Domain Contract Suite", async (t) => {
  const step1 = PlanStep.create({ id: "step-1", order: 1, action: "read", input: {} });
  const step2 = PlanStep.create({ id: "step-2", order: 2, action: "process", input: {} });

  await t.test("creates a valid Plan with ordered steps", () => {
    const plan = Plan.create({
      id: "plan-1",
      operationId: "op-1",
      steps: [step1, step2],
    });

    assert.equal(plan.id, "plan-1");
    assert.equal(plan.operationId, "op-1");
    assert.equal(plan.totalSteps, 2);
    assert.equal(plan.getStep(1), step1);
    assert.equal(plan.getStep(2), step2);
    assert.equal(plan.getStep(3), undefined);
    assert.equal(plan.getStepById("step-1"), step1);
    assert.equal(plan.getStepById("step-999"), undefined);
    assert.equal(plan.hasStep(1), true);
    assert.equal(plan.hasStep(5), false);
  });

  await t.test("rejects empty steps array", () => {
    assert.throws(
      () =>
        Plan.create({
          id: "plan-1",
          operationId: "op-1",
          steps: [],
        }),
      (err: unknown) => err instanceof InvalidPlanError
    );
  });

  await t.test("rejects non-array steps or non-PlanStep items", () => {
    assert.throws(
      () =>
        Plan.create({
          id: "plan-1",
          operationId: "op-1",
          steps: null as unknown as PlanStep[],
        }),
      (err: unknown) => err instanceof InvalidPlanError
    );

    assert.throws(
      () =>
        Plan.create({
          id: "plan-1",
          operationId: "op-1",
          steps: [{ id: "step-1", order: 1 }] as unknown as PlanStep[],
        }),
      (err: unknown) => err instanceof InvalidPlanError
    );
  });

  await t.test("rejects exceeding MAX_PLAN_STEPS limit", () => {
    const manySteps: PlanStep[] = [];
    for (let i = 1; i <= MAX_PLAN_STEPS + 1; i++) {
      manySteps.push(PlanStep.create({ id: `step-${i}`, order: i, action: "run", input: {} }));
    }

    assert.throws(
      () =>
        Plan.create({
          id: "plan-1",
          operationId: "op-1",
          steps: manySteps,
        }),
      (err: unknown) =>
        err instanceof InvalidPlanError && err.message.includes(`limit of ${MAX_PLAN_STEPS}`)
    );
  });

  await t.test("rejects duplicate step IDs", () => {
    const duplicateStep = PlanStep.create({ id: "step-1", order: 2, action: "repeat", input: {} });
    assert.throws(
      () =>
        Plan.create({
          id: "plan-1",
          operationId: "op-1",
          steps: [step1, duplicateStep],
        }),
      (err: unknown) =>
        err instanceof InvalidPlanError && err.message.includes("Duplicate step ID")
    );
  });

  await t.test("rejects non-sequential step order", () => {
    const nonSequentialStep = PlanStep.create({ id: "step-3", order: 3, action: "skip", input: {} });
    assert.throws(
      () =>
        Plan.create({
          id: "plan-1",
          operationId: "op-1",
          steps: [step1, nonSequentialStep],
        }),
      (err: unknown) =>
        err instanceof InvalidPlanError && err.message.includes("ordered sequentially")
    );
  });

  await t.test("defensively copies steps and createdAt", () => {
    const mutableSteps = [step1, step2];
    const initialDate = new Date("2026-09-07T12:00:00Z");
    const plan = Plan.create({
      id: "plan-1",
      operationId: "op-1",
      steps: mutableSteps,
      createdAt: initialDate,
    });

    mutableSteps.push(PlanStep.create({ id: "step-3", order: 3, action: "extra", input: {} }));
    assert.equal(plan.totalSteps, 2);

    initialDate.setFullYear(2099);
    assert.equal(plan.createdAt.getFullYear(), 2026);
  });

  await t.test("produces frozen snapshot", () => {
    const plan = Plan.create({
      id: "plan-1",
      operationId: "op-1",
      steps: [step1],
    });

    const snap = plan.snapshot();
    assert.equal(snap.id, "plan-1");
    assert.equal(snap.operationId, "op-1");
    assert.equal(snap.steps.length, 1);
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.steps));
  });
});

test("Decision Domain Contract Suite", async (t) => {
  await t.test("creates EXECUTE_STEP decision with valid parameters", () => {
    const decision = Decision.executeStep({
      operationId: "op-1",
      stepId: "step-1",
      action: "query_database",
      input: { query: "SELECT 1" },
      rationale: "Need to fetch primary key records",
    });

    assert.equal(decision.type, "EXECUTE_STEP");
    assert.equal(decision.operationId, "op-1");
    assert.equal(decision.stepId, "step-1");
    assert.equal(decision.action, "query_database");
    assert.deepEqual(decision.input, { query: "SELECT 1" });
    assert.equal(decision.rationale, "Need to fetch primary key records");
    assert.equal(decision.output, undefined);
    assert.equal(decision.reason, undefined);
    assert.equal(decision.failureError, undefined);
  });

  await t.test("EXECUTE_STEP defaults input to empty object when omitted", () => {
    const decision = Decision.executeStep({
      operationId: "op-1",
      stepId: "step-1",
      action: "ping",
    });

    assert.deepEqual(decision.input, {});
  });

  await t.test("rejects invalid EXECUTE_STEP properties", () => {
    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "EXECUTE_STEP",
          stepId: "step-1",
          action: "act",
          output: { result: "done" },
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("cannot contain output")
    );

    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "EXECUTE_STEP",
          stepId: "step-1",
          action: "",
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("action cannot be empty")
    );
  });

  await t.test("creates COMPLETE decision with valid output and rationale", () => {
    const decision = Decision.complete({
      operationId: "op-1",
      output: { summary: "Analysis completed successfully", itemsFound: 42 },
      rationale: "Goal criteria reached",
    });

    assert.equal(decision.type, "COMPLETE");
    assert.equal(decision.operationId, "op-1");
    assert.deepEqual(decision.output, { summary: "Analysis completed successfully", itemsFound: 42 });
    assert.equal(decision.rationale, "Goal criteria reached");
    assert.equal(decision.stepId, undefined);
    assert.equal(decision.action, undefined);
    assert.equal(decision.input, undefined);
  });

  await t.test("rejects COMPLETE decision with invalid fields", () => {
    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "COMPLETE",
          action: "do_something",
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("cannot contain action")
    );
  });

  await t.test("creates STOP decision with reason", () => {
    const decision = Decision.stop({
      operationId: "op-1",
      reason: "External intervention requested by supervisor",
    });

    assert.equal(decision.type, "STOP");
    assert.equal(decision.operationId, "op-1");
    assert.equal(decision.reason, "External intervention requested by supervisor");
  });

  await t.test("rejects STOP decision without reason or with invalid fields", () => {
    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "STOP",
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("requires a reason")
    );

    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "STOP",
          reason: "stop now",
          stepId: "step-1",
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("cannot contain stepId")
    );
  });

  await t.test("creates FAIL decision with failureError", () => {
    const decision = Decision.fail({
      operationId: "op-1",
      failureError: {
        code: "UNRECOVERABLE_TOOL_ERROR",
        message: "File could not be parsed as JSON",
      },
      rationale: "Critical failure encountered",
    });

    assert.equal(decision.type, "FAIL");
    assert.equal(decision.operationId, "op-1");
    assert.deepEqual(decision.failureError, {
      code: "UNRECOVERABLE_TOOL_ERROR",
      message: "File could not be parsed as JSON",
    });
    assert.equal(decision.rationale, "Critical failure encountered");
  });

  await t.test("rejects FAIL decision without valid failureError", () => {
    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "FAIL",
          failureError: { code: "", message: "msg" },
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("requires a non-empty code")
    );
  });

  await t.test("rejects unknown decision type", () => {
    assert.throws(
      () =>
        Decision.create({
          operationId: "op-1",
          type: "UNKNOWN_TYPE" as unknown as "EXECUTE_STEP",
        }),
      (err: unknown) =>
        err instanceof DecisionValidationError && err.message.includes("Invalid decision type")
    );
  });

  await t.test("enforces runtime immutability and frozen snapshot", () => {
    const decision = Decision.executeStep({
      operationId: "op-1",
      stepId: "step-1",
      action: "test_action",
    });

    assert.throws(() => {
      (decision as unknown as { action: string }).action = "mutated";
    }, TypeError);

    const snap = decision.snapshot();
    assert.equal(snap.type, "EXECUTE_STEP");
    assert.equal(snap.stepId, "step-1");
    assert.ok(Object.isFrozen(snap));
  });
});

test("PlannerPort Contract Verification Suite", async (t) => {
  class MockDeterministicPlanner implements PlannerPort {
    async plan(request: PlanningRequest): Promise<Plan> {
      const step1 = PlanStep.create({
        id: "step-mock-1",
        order: 1,
        action: "fetch_data",
        input: { target: request.objective },
      });
      const step2 = PlanStep.create({
        id: "step-mock-2",
        order: 2,
        action: "summarize",
        input: { format: "json" },
      });

      return Plan.create({
        id: `plan-for-${request.operationId}`,
        operationId: request.operationId,
        steps: [step1, step2],
      });
    }

    async decide(request: PlanningRequest, plan?: Plan): Promise<Decision> {
      if (!plan || request.currentStep >= plan.totalSteps) {
        return Decision.complete({
          operationId: request.operationId,
          output: { done: true },
          rationale: "All plan steps completed",
        });
      }

      const nextStep = plan.getStep(request.currentStep + 1);
      if (!nextStep) {
        return Decision.fail({
          operationId: request.operationId,
          failureError: { code: "STEP_NOT_FOUND", message: "Step not found" },
        });
      }

      return Decision.executeStep({
        operationId: request.operationId,
        stepId: nextStep.id,
        action: nextStep.action,
        input: nextStep.input,
      });
    }
  }

  await t.test("mock planner satisfies PlannerPort contract and generates valid Plan", async () => {
    const planner: PlannerPort = new MockDeterministicPlanner();
    const budget = createValidBudget();
    const request = PlanningRequest.create({
      operationId: "op-plan-test",
      objective: "Gather system info",
      agentId: "agent-1",
      budget,
      currentStep: 0,
    });

    const plan = await planner.plan(request);
    assert.equal(plan.operationId, "op-plan-test");
    assert.equal(plan.totalSteps, 2);
    assert.equal(plan.steps[0]?.action, "fetch_data");

    // Test decide method if provided
    if (planner.decide) {
      const decision1 = await planner.decide(request, plan);
      assert.equal(decision1.type, "EXECUTE_STEP");
      assert.equal(decision1.stepId, "step-mock-1");

      const requestFinished = PlanningRequest.create({
        operationId: "op-plan-test",
        objective: "Gather system info",
        agentId: "agent-1",
        budget,
        currentStep: 2,
      });

      const decision2 = await planner.decide(requestFinished, plan);
      assert.equal(decision2.type, "COMPLETE");
    }
  });

  await t.test("minimal planner implementing only plan satisfies PlannerPort interface", async () => {
    const minimalPlanner: PlannerPort = {
      async plan(request: PlanningRequest): Promise<Plan> {
        return Plan.create({
          id: `plan-${request.operationId}`,
          operationId: request.operationId,
          steps: [
            PlanStep.create({
              id: "single-step",
              order: 1,
              action: "execute",
              input: {},
            }),
          ],
        });
      },
    };

    const budget = createValidBudget();
    const request = PlanningRequest.create({
      operationId: "op-minimal",
      objective: "Minimal objective",
      agentId: "agent-1",
      budget,
      currentStep: 0,
    });

    const plan = await minimalPlanner.plan(request);
    assert.equal(plan.totalSteps, 1);
  });
});
