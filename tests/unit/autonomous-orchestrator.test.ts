import assert from "node:assert/strict";
import test from "node:test";
import { AgentDefinition } from "../../src/domain/agent/agent.js";
import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { Decision } from "../../src/domain/autonomy/decision.js";
import {
  DecisionEvaluatorPort,
  DeterministicDecisionEvaluator,
} from "../../src/domain/autonomy/decision-evaluator.js";
import { ObjectiveEvaluation } from "../../src/domain/autonomy/objective-evaluation.js";
import { Observation } from "../../src/domain/autonomy/observation.js";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { PlannerPort } from "../../src/domain/autonomy/planner-port.js";
import { PlanningRequest } from "../../src/domain/autonomy/planning-request.js";
import { DomainEvent, EventPublisher } from "../../src/domain/events/events.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { Runtime, RuntimeResult } from "../../src/domain/execution/runtime.js";
import { PolicyContext, PolicyDecision, PolicyGateway } from "../../src/domain/policy/policy.js";
import { Task, TaskError } from "../../src/domain/task/task.js";
import {
  AutonomousOrchestrator,
  AutonomousOrchestratorValidationError,
  CancellationToken,
} from "../../src/application/autonomy/autonomous-orchestrator.js";

interface TestHarnessOptions {
  readonly planSteps?: readonly PlanStep[] | undefined;
  readonly onPlanExhausted?: "STOP" | "FAIL" | undefined;
  readonly policyAllowed?: boolean | undefined;
  readonly policyFailOnEvaluate?: boolean | undefined;
  readonly runtimeFailTask?: boolean | undefined;
  readonly runtimeToolCalls?: number | undefined;
  readonly runtimeDurationMs?: number | undefined;
  readonly plannerThrows?: boolean | undefined;
  readonly evaluatorThrows?: boolean | undefined;
}

const createTestHarness = (options: TestHarnessOptions = {}) => {
  const publishedEvents: DomainEvent[] = [];
  const events: EventPublisher = {
    publish(e: DomainEvent): void {
      publishedEvents.push(e);
    },
  };

  let fixedTime = new Date("2026-09-07T12:00:00.000Z").getTime();
  const now = () => {
    const current = new Date(fixedTime);
    fixedTime += 10;
    return current;
  };

  let idCounter = 1;
  const ids = {
    next: () => `id-${idCounter++}`,
  };

  const executedTasks: Task[] = [];
  const policyEvaluations: PolicyContext[] = [];

  const policyGateway: PolicyGateway = {
    async evaluate(context: PolicyContext): Promise<PolicyDecision> {
      policyEvaluations.push(context);
      if (options.policyFailOnEvaluate) {
        throw new Error("Policy service network timeout");
      }
      return {
        allowed: options.policyAllowed !== false,
        policyId: "security-policy-v1",
        ...(options.policyAllowed === false ? { reason: "Operation forbidden by security rules" } : {}),
      };
    },
  };

  const defaultSteps = [
    PlanStep.create({ id: "step-1", order: 1, action: "read_repo", input: { target: "src" } }),
    PlanStep.create({ id: "step-2", order: 2, action: "build_ast", input: { mode: "strict" } }),
  ];

  const stepsToUse = options.planSteps ?? defaultSteps;

  const planner: PlannerPort = {
    async plan(request: PlanningRequest): Promise<Plan> {
      if (options.plannerThrows) {
        throw new Error("Planner service unavailable");
      }
      return Plan.create({
        id: "plan-test-1",
        operationId: request.operationId,
        steps: stepsToUse,
      });
    },
  };

  const baseEvaluator = new DeterministicDecisionEvaluator({
    onPlanExhausted: options.onPlanExhausted ?? "STOP",
  });

  const evaluator: DecisionEvaluatorPort = {
    evaluate(context) {
      if (options.evaluatorThrows) {
        throw new Error("Evaluator internal crash");
      }
      return baseEvaluator.evaluate(context);
    },
  };

  const runtime: Runtime = {
    async execute(task: Task, agent: AgentDefinition): Promise<RuntimeResult> {
      executedTasks.push(task);
      const executionId = `exec-${task.id}`;
      const context = ExecutionContext.create(task.traceId, executionId, task.id, {}, now()).withInput(task.request.input);

      if (options.runtimeFailTask) {
        const error = new TaskError("COMMAND_FAILED", "Command exited with status code 1");
        const execution = Execution.create(executionId, task.id, task.traceId, now()).start(now()).fail(error, now());
        const failedTask = task.transition("QUEUED").transition("RUNNING").fail(error);
        return { task: failedTask, execution, context };
      }

      const duration = options.runtimeDurationMs ?? 50;
      const startedAt = now();
      const completedAt = new Date(startedAt.getTime() + duration);

      const execution = Execution.create(executionId, task.id, task.traceId, startedAt)
        .start(startedAt)
        .complete({ toolCalls: options.runtimeToolCalls ?? 1 }, completedAt);

      const completedTask = task.transition("QUEUED").transition("RUNNING").complete({ result: "step output data", toolCalls: options.runtimeToolCalls ?? 1 }, completedAt);
      return { task: completedTask, execution, context };
    },
  };

  const orchestrator = new AutonomousOrchestrator(
    runtime,
    planner,
    evaluator,
    policyGateway,
    events,
    ids,
    now
  );

  const agent: AgentDefinition = {
    id: "agent-test-1",
    name: "Autonomy Agent",
    capabilities: ["code_analysis", "execution"],
    model: "test-model",
  };

  return {
    orchestrator,
    runtime,
    planner,
    evaluator,
    policyGateway,
    events,
    publishedEvents,
    executedTasks,
    policyEvaluations,
    agent,
    now,
  };
};

test("AutonomousOrchestrator - Bounded Orchestration & Execution Loop Suite", async (t) => {
  // Scenario A: Happy Path (Multi-step to COMPLETE)
  await t.test("Scenario A: Happy Path multi-step execution to COMPLETE", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    let stepCount = 0;
    const result = await harness.orchestrator.run({
      operationId: "op-happy-path",
      objective: "Analyze and refactor codebase",
      agent: harness.agent,
      budget,
      evaluateObjective: ({ step }) => {
        stepCount++;
        if (step.id === "step-2") {
          return ObjectiveEvaluation.achieved({ rationale: "All 2 steps achieved objective" });
        }
        return ObjectiveEvaluation.notAchieved();
      },
    });

    assert.equal(result.operation.status, "COMPLETED");
    assert.equal(result.observations.length, 2);
    assert.equal(result.decisions.length, 3); // initial EXECUTE_STEP, EXECUTE_STEP, COMPLETE
    assert.equal(result.operation.consumption.stepsUsed, 2);
    assert.equal(stepCount, 2);
    assert.equal(harness.executedTasks.length, 2);

    // Verify events
    const eventTypes = harness.publishedEvents.map((e) => e.type);
    assert.ok(eventTypes.includes("operation.started"));
    assert.ok(eventTypes.includes("policy.evaluated"));
    assert.ok(eventTypes.includes("policy.allowed"));
    assert.ok(eventTypes.includes("operation.step_completed"));
    assert.ok(eventTypes.includes("operation.completed"));
  });

  // Scenario B: Single-Step Completion
  await t.test("Scenario B: Single-step plan execution directly to COMPLETE", async () => {
    const singleStep = PlanStep.create({ id: "step-1", order: 1, action: "quick_action", input: { quick: true } });
    const harness = createTestHarness({ planSteps: [singleStep] });
    const budget = AutonomyBudget.create({ maxSteps: 3, maxDurationMs: 30000, maxToolCalls: 5 });

    const result = await harness.orchestrator.run({
      operationId: "op-single-step",
      objective: "Quick single operation",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.achieved({ rationale: "Quick check finished" }),
    });

    assert.equal(result.operation.status, "COMPLETED");
    assert.equal(result.observations.length, 1);
    assert.equal(result.decisions.length, 2); // initial EXECUTE_STEP, COMPLETE
    assert.equal(result.operation.consumption.stepsUsed, 1);
    assert.equal(harness.executedTasks.length, 1);
  });

  // Scenario C: Plan Exhaustion without Objective
  await t.test("Scenario C: Plan exhaustion stops gracefully without executing non-existent step", async () => {
    const harness = createTestHarness({ onPlanExhausted: "STOP" });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-plan-exhausted",
      objective: "Inspect system",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.notAchieved({ rationale: "Not completed" }),
    });

    assert.equal(result.operation.status, "CANCELLED");
    assert.ok(result.operation.terminationReason?.includes("exhausted"));
    assert.equal(result.observations.length, 2);
    assert.equal(harness.executedTasks.length, 2);
  });

  // Scenario D: maxSteps Bound Enforcement
  await t.test("Scenario D: Strictly bounds execution to maxSteps limit", async () => {
    const steps = [
      PlanStep.create({ id: "s-1", order: 1, action: "a1", input: {} }),
      PlanStep.create({ id: "s-2", order: 2, action: "a2", input: {} }),
      PlanStep.create({ id: "s-3", order: 3, action: "a3", input: {} }),
      PlanStep.create({ id: "s-4", order: 4, action: "a4", input: {} }),
    ];
    const harness = createTestHarness({ planSteps: steps });
    const budget = AutonomyBudget.create({ maxSteps: 2, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-max-steps",
      objective: "Execute capped steps",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(result.operation.status, "BUDGET_EXHAUSTED");
    assert.equal(result.operation.terminationReason, "STEPS_EXHAUSTED");
    assert.equal(result.operation.consumption.stepsUsed, 2);
    assert.equal(harness.executedTasks.length, 2);
    assert.ok(harness.publishedEvents.some((e) => e.type === "operation.budget_exhausted"));
  });

  // Scenario E: maxDurationMs Exhaustion
  await t.test("Scenario E: Terminates with BUDGET_EXHAUSTED (DURATION_EXCEEDED), NOT CANCELLED", async () => {
    const harness = createTestHarness({ runtimeDurationMs: 1500 });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 1000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-max-duration",
      objective: "Long running execution",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(result.operation.status, "BUDGET_EXHAUSTED");
    assert.equal(result.operation.terminationReason, "DURATION_EXCEEDED");
    assert.notEqual(result.operation.status, "CANCELLED");
  });

  // Scenario F: maxToolCalls Limit Enforcement
  await t.test("Scenario F: Enforces maxToolCalls bound and halts when exhausted", async () => {
    const harness = createTestHarness({ runtimeToolCalls: 3 });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 2 });

    const result = await harness.orchestrator.run({
      operationId: "op-max-tools",
      objective: "Tool-heavy task",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.notAchieved(),
    });

    assert.equal(result.operation.status, "BUDGET_EXHAUSTED");
    assert.equal(result.operation.terminationReason, "TOOLS_EXHAUSTED");
    assert.equal(harness.executedTasks.length, 1);
  });

  // Scenario G: Explicit Cancellation Signal
  await t.test("Scenario G: Explicit cancellation token aborts operation with CANCELLED", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const cancellationToken: CancellationToken = {
      isCancelled: false,
      reason: "User manually stopped",
    };

    let stepRun = 0;
    const result = await harness.orchestrator.run({
      operationId: "op-cancellation",
      objective: "Cancellable job",
      agent: harness.agent,
      budget,
      cancellationToken,
      evaluateObjective: () => {
        stepRun++;
        (cancellationToken as { isCancelled: boolean }).isCancelled = true;
        return ObjectiveEvaluation.notAchieved();
      },
    });

    assert.equal(result.operation.status, "CANCELLED");
    assert.equal(result.operation.terminationReason, "User manually stopped");
    assert.equal(stepRun, 1);
    assert.equal(harness.executedTasks.length, 1);
    assert.ok(harness.publishedEvents.some((e) => e.type === "operation.cancelled"));
  });

  // Scenario H: Policy Denial (Fail-Closed Governance)
  await t.test("Scenario H: Policy DENY halts execution fail-closed without invoking CoreRuntime", async () => {
    const harness = createTestHarness({ policyAllowed: false });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-policy-denied",
      objective: "Restricted command",
      agent: harness.agent,
      budget,
    });

    assert.equal(result.operation.status, "FAILED");
    assert.equal(result.operation.failureError?.code, "POLICY_DENIED");
    assert.equal(harness.executedTasks.length, 0); // CoreRuntime MUST NOT be called!
    assert.ok(harness.publishedEvents.some((e) => e.type === "policy.denied"));
    assert.ok(harness.publishedEvents.some((e) => e.type === "operation.failed"));
  });

  // Scenario H2: Policy Gateway Exception (Fail-Closed Governance on Exception)
  await t.test("Scenario H2: Policy throws exception halts execution fail-closed without invoking CoreRuntime", async () => {
    const harness = createTestHarness({ policyFailOnEvaluate: true });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-policy-exception",
      objective: "Restricted command with policy failure",
      agent: harness.agent,
      budget,
    });

    assert.equal(result.operation.status, "FAILED");
    assert.equal(result.operation.failureError?.code, "POLICY_EVALUATION_ERROR");
    assert.ok(result.operation.failureError?.message.includes("Policy service network timeout"));
    assert.equal(harness.executedTasks.length, 0); // CoreRuntime MUST NOT be called!
    assert.ok(harness.publishedEvents.some((e) => e.type === "policy.denied"));
    assert.ok(harness.publishedEvents.some((e) => e.type === "operation.failed"));
  });

  // Scenario I: Runtime Failure Handling
  await t.test("Scenario I: CoreRuntime task failure propagates to Observation FAILED and operation FAILED", async () => {
    const harness = createTestHarness({ runtimeFailTask: true });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-runtime-fail",
      objective: "Failing task",
      agent: harness.agent,
      budget,
    });

    assert.equal(result.operation.status, "FAILED");
    assert.equal(result.observations.length, 1);
    const firstObs = result.observations[0];
    assert.ok(firstObs);
    assert.equal(firstObs.status, "FAILED");
    const secondDecision = result.decisions[1];
    assert.ok(secondDecision);
    assert.equal(result.operation.failureError?.code, "COMMAND_FAILED");
    assert.ok(result.operation.failureError?.message.includes("Command exited with status code 1"));
  });

  // Scenario J: Observation Mapping Verification
  await t.test("Scenario J: Observation captures runtime error and metadata correctly", async () => {
    const harness = createTestHarness({ runtimeFailTask: true });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-obs-mapping",
      objective: "Test observation structure",
      agent: harness.agent,
      budget,
    });

    const obs = result.observations[0];
    assert.ok(obs);
    assert.ok(obs instanceof Observation);
    assert.equal(obs.status, "FAILED");
    assert.ok(obs.error);
    assert.equal(obs.error.code, "COMMAND_FAILED");
    assert.equal(obs.error.message, "Command exited with status code 1");
    assert.ok(obs.durationMs >= 0);
  });

  // Scenario K: Invalid Decision Rejection
  await t.test("Scenario K: Decision referencing unknown stepId fails closed", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    // Custom evaluator returning an unknown stepId
    const rogueEvaluator: DecisionEvaluatorPort = {
      evaluate(ctx) {
        return Decision.executeStep({
          operationId: ctx.operation.id,
          stepId: "non-existent-step-xyz",
          action: "ghost_action",
        });
      },
    };

    const orchestratorWithRogue = new AutonomousOrchestrator(
      harness.runtime,
      harness.planner,
      rogueEvaluator,
      harness.policyGateway,
      harness.events,
      { next: () => "rogue-id" },
      harness.now
    );

    const result = await orchestratorWithRogue.run({
      operationId: "op-invalid-decision",
      objective: "Test rogue decision",
      agent: harness.agent,
      budget,
    });

    assert.equal(result.operation.status, "FAILED");
    assert.equal(result.operation.failureError?.code, "INVALID_DECISION");
    assert.ok(result.operation.failureError?.message.includes("non-existent-step-xyz"));
  });

  // Scenario L: Planner Failure Handling
  await t.test("Scenario L: Planner exception transitions operation to FAILED", async () => {
    const harness = createTestHarness({ plannerThrows: true });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-planner-fail",
      objective: "Plan test",
      agent: harness.agent,
      budget,
    });

    assert.equal(result.operation.status, "FAILED");
    assert.equal(result.operation.failureError?.code, "PLANNING_FAILURE");
    assert.ok(result.operation.failureError?.message.includes("Planner service unavailable"));
    assert.equal(harness.executedTasks.length, 0);
  });

  // Scenario M: DecisionEvaluator Failure Handling
  await t.test("Scenario M: DecisionEvaluator exception transitions operation to FAILED", async () => {
    const harness = createTestHarness({ evaluatorThrows: true });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-evaluator-fail",
      objective: "Evaluator test",
      agent: harness.agent,
      budget,
    });

    assert.equal(result.operation.status, "FAILED");
    assert.equal(result.operation.failureError?.code, "DECISION_EVALUATION_FAILURE");
    assert.ok(result.operation.failureError?.message.includes("Evaluator internal crash"));
  });

  // Scenario N: Cancellation Before Execution
  await t.test("Scenario N: Cancellation before execution starts never calls CoreRuntime", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-pre-cancelled",
      objective: "Cancelled before start",
      agent: harness.agent,
      budget,
      cancellationToken: { isCancelled: true, reason: "Aborted early" },
    });

    assert.equal(result.operation.status, "CANCELLED");
    assert.equal(result.operation.terminationReason, "Aborted early");
    assert.equal(harness.executedTasks.length, 0);
  });

  // Scenario O: Cancellation After Execution
  await t.test("Scenario O: Cancellation after step 1 prevents execution of step 2", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const token: CancellationToken = { isCancelled: false, reason: "Halt after step 1" };
    const result = await harness.orchestrator.run({
      operationId: "op-mid-cancelled",
      objective: "Cancel mid-way",
      agent: harness.agent,
      budget,
      cancellationToken: token,
      evaluateObjective: () => {
        (token as { isCancelled: boolean }).isCancelled = true;
        return ObjectiveEvaluation.notAchieved();
      },
    });

    assert.equal(result.operation.status, "CANCELLED");
    assert.equal(result.operation.consumption.stepsUsed, 1);
    assert.equal(harness.executedTasks.length, 1);
  });

  // Scenario P: Policy Bypass Test
  await t.test("Scenario P: Proves that EXECUTE_STEP cannot reach CoreRuntime without PolicyGateway", async () => {
    const harness = createTestHarness({ policyAllowed: false });
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    await harness.orchestrator.run({
      operationId: "op-bypass-test",
      objective: "Bypass verification",
      agent: harness.agent,
      budget,
    });

    assert.equal(harness.policyEvaluations.length, 1);
    assert.equal(harness.executedTasks.length, 0);
  });

  // Scenario Q: Runtime Ownership Test
  await t.test("Scenario Q: Demonstrates AutonomousOrchestrator delegates task execution exclusively to CoreRuntime", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    await harness.orchestrator.run({
      operationId: "op-runtime-ownership",
      objective: "Verify runtime delegation",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.achieved(),
    });

    assert.equal(harness.executedTasks.length, 1);
    const executedTask = harness.executedTasks[0];
    assert.ok(executedTask);
    assert.equal(executedTask.request.agentId, harness.agent.id);
    assert.equal(executedTask.traceId, "op-runtime-ownership");
  });

  // Scenario R: Plan Immutability Test
  await t.test("Scenario R: Plan object remains immutable during and after orchestration", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const result = await harness.orchestrator.run({
      operationId: "op-plan-immutable",
      objective: "Immutability verification",
      agent: harness.agent,
      budget,
      evaluateObjective: () => ObjectiveEvaluation.achieved(),
    });

    assert.ok(result.plan);
    assert.ok(Object.isFrozen(result.plan));
    assert.ok(Object.isFrozen(result.plan.steps));
    assert.throws(() => {
      (result.plan!.steps as unknown as PlanStep[]).push(
        PlanStep.create({ id: "illegal-step", order: 3, action: "hack", input: {} })
      );
    }, TypeError);
  });

  // Scenario S: Operation Lifecycle Test
  await t.test("Scenario S: Operation transitions through SUBMITTED -> RUNNING -> terminal", async () => {
    const harness = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const opSubmitted = AutonomousOperation.create({
      id: "op-lifecycle-s",
      objective: "Check lifecycle transitions",
      agentId: harness.agent.id,
      budget,
    });
    assert.equal(opSubmitted.status, "SUBMITTED");

    const result = await harness.orchestrator.run({
      operation: opSubmitted,
      agent: harness.agent,
      evaluateObjective: () => ObjectiveEvaluation.achieved(),
    });

    assert.equal(result.operation.status, "COMPLETED");

    // Cannot re-orchestrate a completed operation
    await assert.rejects(
      async () => {
        await harness.orchestrator.run({
          operation: result.operation,
          agent: harness.agent,
        });
      },
      (err: unknown) =>
        err instanceof AutonomousOrchestratorValidationError &&
        err.message.includes("Cannot orchestrate operation in terminal state")
    );
  });

  // Scenario T: Determinism Test
  await t.test("Scenario T: Identical runs with deterministic inputs produce identical results and snapshots", async () => {
    const harness1 = createTestHarness();
    const harness2 = createTestHarness();
    const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

    const run1 = await harness1.orchestrator.run({
      operationId: "op-det",
      objective: "Deterministic run",
      agent: harness1.agent,
      budget,
      evaluateObjective: ({ step }) => {
        if (step.id === "step-2") return ObjectiveEvaluation.achieved();
        return ObjectiveEvaluation.notAchieved();
      },
    });

    const run2 = await harness2.orchestrator.run({
      operationId: "op-det",
      objective: "Deterministic run",
      agent: harness2.agent,
      budget,
      evaluateObjective: ({ step }) => {
        if (step.id === "step-2") return ObjectiveEvaluation.achieved();
        return ObjectiveEvaluation.notAchieved();
      },
    });

    assert.equal(run1.operation.status, run2.operation.status);
    assert.equal(run1.operation.consumption.stepsUsed, run2.operation.consumption.stepsUsed);
    assert.equal(run1.observations.length, run2.observations.length);
    assert.equal(run1.decisions.length, run2.decisions.length);
    assert.deepEqual(
      run1.decisions.map((d) => d.type),
      run2.decisions.map((d) => d.type)
    );
  });

  // Request Validation Tests
  await t.test("Rejects invalid request inputs fail-closed", async () => {
    const harness = createTestHarness();

    await assert.rejects(
      async () => harness.orchestrator.run(null as unknown as { agent: AgentDefinition }),
      AutonomousOrchestratorValidationError
    );

    await assert.rejects(
      async () =>
        harness.orchestrator.run({
          operationId: "op-no-agent",
          objective: "test",
          agent: null as unknown as AgentDefinition,
          budget: AutonomyBudget.create({ maxSteps: 1, maxDurationMs: 1000, maxToolCalls: 1 }),
        }),
      AutonomousOrchestratorValidationError
    );
  });
});

test("Autonomous Orchestrator Architecture & Dependency Isolation Suite", async (t) => {
  const forbiddenKeywords = [
    "from \"http\"",
    "from \"node:http\"",
    "from \"fs\"",
    "from \"node:fs\"",
    "from \"child_process\"",
    "from \"node:child_process\"",
    "from \"worker_threads\"",
    "from \"node:worker_threads\"",
    "openai",
    "anthropic",
    "@google/genai",
    "ollama",
    "langchain",
    "while (true)",
    "while(true)",
    "for (;;)",
    "for(;;)",
  ];

  const orchestratorFile = new URL(
    "../../../src/application/autonomy/autonomous-orchestrator.ts",
    import.meta.url
  );

  await t.test("verifies AutonomousOrchestrator has zero forbidden imports or unbounded loop patterns", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(orchestratorFile, "utf-8");

    for (const keyword of forbiddenKeywords) {
      assert.equal(
        content.toLowerCase().includes(keyword.toLowerCase()),
        false,
        `AutonomousOrchestrator contains forbidden pattern: ${keyword}`
      );
    }
  });
});
