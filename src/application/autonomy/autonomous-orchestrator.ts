import crypto from "node:crypto";
import { AgentDefinition } from "../../domain/agent/agent.js";
import { AutonomousOperation, BudgetExhaustionReason } from "../../domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../domain/autonomy/autonomy-budget.js";
import { Decision } from "../../domain/autonomy/decision.js";
import { DecisionEvaluatorPort } from "../../domain/autonomy/decision-evaluator.js";
import { ObjectiveEvaluation } from "../../domain/autonomy/objective-evaluation.js";
import { Observation } from "../../domain/autonomy/observation.js";
import { Plan, PlanStep } from "../../domain/autonomy/plan.js";
import { PlannerPort } from "../../domain/autonomy/planner-port.js";
import { PlanningRequest } from "../../domain/autonomy/planning-request.js";
import { TaskContext } from "../../domain/context/task-context.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { Runtime, RuntimeResult } from "../../domain/execution/runtime.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { Task, TaskError } from "../../domain/task/task.js";
import { IdGenerator } from "../runtime/core-runtime.js";

export class AutonomousOrchestratorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutonomousOrchestratorValidationError";
  }
}

export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string | undefined;
}

export interface AutonomousOperationRequest {
  readonly operationId?: string | undefined;
  readonly objective?: string | undefined;
  readonly agent: AgentDefinition;
  readonly budget?: AutonomyBudget | undefined;
  readonly operation?: AutonomousOperation | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly cancellationToken?: CancellationToken | undefined;
  readonly evaluateObjective?: ((context: {
    readonly operation: AutonomousOperation;
    readonly plan: Plan;
    readonly observation: Observation;
    readonly step: PlanStep;
  }) => ObjectiveEvaluation | undefined) | undefined;
}

export interface AutonomousOperationResult {
  readonly operation: AutonomousOperation;
  readonly plan?: Plan | undefined;
  readonly observations: readonly Observation[];
  readonly decisions: readonly Decision[];
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

/**
 * AutonomousOrchestrator coordinates the bounded autonomous operational loop.
 * It strictly coordinates Domain, PlannerPort, PolicyGateway, CoreRuntime,
 * Observation pipeline, and DecisionEvaluatorPort.
 * CoreRuntime remains the SOLE execution owner.
 */
export class AutonomousOrchestrator {
  constructor(
    private readonly runtime: Runtime,
    private readonly planner: PlannerPort,
    private readonly evaluator: DecisionEvaluatorPort,
    private readonly policyGateway: PolicyGateway,
    private readonly events: EventPublisher,
    private readonly ids: IdGenerator = { next: () => crypto.randomUUID() },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(request: AutonomousOperationRequest): Promise<AutonomousOperationResult> {
    this.validateRequest(request);

    const observations: Observation[] = [];
    const decisions: Decision[] = [];
    const agent = request.agent;

    // 1. Initialize AutonomousOperation (SUBMITTED -> RUNNING)
    let operation: AutonomousOperation;
    if (request.operation) {
      if (request.operation.status === "SUBMITTED") {
        operation = request.operation.start(this.now());
      } else if (request.operation.status === "RUNNING") {
        operation = request.operation;
      } else {
        throw new AutonomousOrchestratorValidationError(
          `Cannot orchestrate operation in terminal state '${request.operation.status}'`
        );
      }
    } else {
      const initialOp = AutonomousOperation.create({
        id: request.operationId!,
        objective: request.objective!,
        agentId: agent.id,
        budget: request.budget!,
        createdAt: this.now(),
      });
      operation = initialOp.start(this.now());
    }

    this.publishEvent("operation.started", operation.id, {
      agentId: agent.id,
      objective: operation.objective,
    });

    // 2. Cancellation Check (pre-planning)
    if (request.cancellationToken?.isCancelled) {
      const cancelReason = request.cancellationToken.reason ?? "Operation cancelled prior to planning";
      operation = operation.cancel(cancelReason, this.now());
      this.publishEvent("operation.cancelled", operation.id, { reason: cancelReason });
      return { operation, observations, decisions };
    }

    // 3. Planning Phase
    const planningRequest = PlanningRequest.create({
      operationId: operation.id,
      objective: operation.objective,
      agentId: agent.id,
      budget: operation.budget,
      currentStep: 1,
      metadata: request.metadata,
      taskContext: TaskContext.create({
        taskId: operation.id,
        executionId: operation.id,
        objective: operation.objective,
        taskMetadata: request.metadata,
        executionStatus: operation.status,
        executionSummary: { ...operation.snapshot().consumption },
      }),
    });

    let plan: Plan;
    try {
      plan = await this.planner.plan(planningRequest);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Planning failure";
      operation = operation.fail({ code: "PLANNING_FAILURE", message }, this.now());
      this.publishEvent("operation.failed", operation.id, { code: "PLANNING_FAILURE", message });
      return { operation, observations, decisions, error: { code: "PLANNING_FAILURE", message } };
    }

    if (!(plan instanceof Plan) || plan.operationId !== operation.id || plan.totalSteps === 0) {
      const message = "Planner returned an invalid or mismatched plan";
      operation = operation.fail({ code: "INVALID_PLAN", message }, this.now());
      this.publishEvent("operation.failed", operation.id, { code: "INVALID_PLAN", message });
      return { operation, plan, observations, decisions, error: { code: "INVALID_PLAN", message } };
    }

    // 4. Initial Decision Derivation (Section 12: explicit first step derivation)
    const firstStep = plan.getStep(1);
    if (!firstStep) {
      const message = "Plan contains no initial step";
      operation = operation.fail({ code: "PLAN_EMPTY", message }, this.now());
      this.publishEvent("operation.failed", operation.id, { code: "PLAN_EMPTY", message });
      return { operation, plan, observations, decisions, error: { code: "PLAN_EMPTY", message } };
    }

    let currentDecision = Decision.executeStep({
      operationId: operation.id,
      stepId: firstStep.id,
      action: firstStep.action,
      input: firstStep.input,
      rationale: `Initial step 1 from plan: ${firstStep.id}`,
      decidedAt: this.now(),
    });
    decisions.push(currentDecision);

    // 5. Bounded Execution Loop (Strictly bounded by budget.maxSteps iterations)
    const maxIterations = operation.budget.maxSteps;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Cancellation check before step execution
      if (request.cancellationToken?.isCancelled) {
        const cancelReason = request.cancellationToken.reason ?? "Operation cancelled before step execution";
        operation = operation.cancel(cancelReason, this.now());
        this.publishEvent("operation.cancelled", operation.id, { reason: cancelReason });
        break;
      }

      // If current decision is not EXECUTE_STEP, process terminal transition and break
      if (currentDecision.type !== "EXECUTE_STEP") {
        operation = this.handleNonExecuteDecision(currentDecision, operation);
        break;
      }

      // Pre-execution validation of target step
      const stepId = currentDecision.stepId!;
      const currentStep = plan.getStepById(stepId);
      if (!currentStep) {
        const message = `Decision references unknown stepId '${stepId}' not in plan`;
        operation = operation.fail({ code: "INVALID_DECISION", message }, this.now());
        this.publishEvent("operation.failed", operation.id, { code: "INVALID_DECISION", message });
        break;
      }

      if (currentDecision.action && currentDecision.action !== currentStep.action) {
        const message = `Decision action '${currentDecision.action}' does not match plan step action '${currentStep.action}'`;
        operation = operation.fail({ code: "INVALID_DECISION", message }, this.now());
        this.publishEvent("operation.failed", operation.id, { code: "INVALID_DECISION", message });
        break;
      }

      // Pre-execution budget check
      const preBudgetCheck = operation.checkBudget();
      if (!preBudgetCheck.hasBudget) {
        const reason: BudgetExhaustionReason = preBudgetCheck.reason ?? "STEPS_EXHAUSTED";
        operation = operation.exhaustBudget(reason, this.now());
        this.publishEvent("operation.budget_exhausted", operation.id, { reason });
        break;
      }

      // Policy Gateway Evaluation (Fail-Closed Governance)
      const taskId = this.ids.next();
      let isPolicyAllowed = false;
      try {
        if (!this.policyGateway || typeof this.policyGateway.evaluate !== "function") {
          throw new Error("PolicyGateway is unavailable");
        }

        const policyDecision = await this.policyGateway.evaluate({
          traceId: operation.id,
          executionId: taskId,
          taskId,
          operationId: operation.id,
          operationType: "TOOL",
          resourceId: currentStep.action,
          metadata: {
            stepId: currentStep.id,
            action: currentStep.action,
            order: currentStep.order,
            ...currentStep.metadata,
          },
        });

        this.publishEvent("policy.evaluated", operation.id, {
          stepId: currentStep.id,
          action: currentStep.action,
          policyId: policyDecision.policyId,
          allowed: policyDecision.allowed,
        }, { taskId });

        if (!policyDecision.allowed) {
          const reason = policyDecision.reason ?? `Policy '${policyDecision.policyId}' denied step '${currentStep.id}'`;
          this.publishEvent("policy.denied", operation.id, {
            stepId: currentStep.id,
            policyId: policyDecision.policyId,
            reason,
          }, { taskId });
          operation = operation.fail({ code: "POLICY_DENIED", message: reason }, this.now());
          this.publishEvent("operation.failed", operation.id, { code: "POLICY_DENIED", message: reason }, { taskId });
          break;
        }

        this.publishEvent("policy.allowed", operation.id, {
          stepId: currentStep.id,
          policyId: policyDecision.policyId,
        }, { taskId });
        isPolicyAllowed = true;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Policy evaluation error";
        this.publishEvent("policy.denied", operation.id, {
          stepId: currentStep.id,
          reason: message,
        }, { taskId });
        operation = operation.fail({ code: "POLICY_EVALUATION_ERROR", message }, this.now());
        this.publishEvent("operation.failed", operation.id, { code: "POLICY_EVALUATION_ERROR", message }, { taskId });
        break;
      }

      if (!isPolicyAllowed) {
        break;
      }

      // Task Submission & Execution via CoreRuntime (Sole Execution Owner)
      const taskInput: Record<string, unknown> = {
        action: currentStep.action,
        stepId: currentStep.id,
        operationId: operation.id,
        ...currentStep.input,
      };

      const task = Task.create(taskId, operation.id, {
        agentId: agent.id,
        input: taskInput,
      }, this.now());

      let runtimeResult: RuntimeResult;
      const stepStartTime = this.now().getTime();
      try {
        runtimeResult = await this.runtime.execute(task, agent);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Runtime execution error";
        operation = operation.fail({ code: "RUNTIME_EXECUTION_ERROR", message }, this.now());
        this.publishEvent("operation.failed", operation.id, { code: "RUNTIME_EXECUTION_ERROR", message }, { taskId });
        break;
      }

      // RuntimeResult -> Observation Mapping
      const stepEndTime = this.now().getTime();
      const executionDuration = runtimeResult.execution.completedAt && runtimeResult.execution.startedAt
        ? Math.max(0, runtimeResult.execution.completedAt.getTime() - runtimeResult.execution.startedAt.getTime())
        : Math.max(0, stepEndTime - stepStartTime);

      let toolCalls = 0;
      if (typeof runtimeResult.execution.resultMetadata?.toolCalls === "number") {
        toolCalls = runtimeResult.execution.resultMetadata.toolCalls;
      } else if (typeof runtimeResult.task.result?.output?.toolCalls === "number") {
        toolCalls = runtimeResult.task.result.output.toolCalls as number;
      }

      const observationId = this.ids.next();
      let observation: Observation;
      if (runtimeResult.task.status === "COMPLETED") {
        observation = Observation.success({
          observationId,
          operationId: operation.id,
          stepId: currentStep.id,
          durationMs: executionDuration,
          output: runtimeResult.task.result?.output ?? {},
          toolCalls,
          metadata: {
            taskId: runtimeResult.task.id,
            executionId: runtimeResult.execution.id,
            ...runtimeResult.execution.resultMetadata,
          },
        });
      } else if (runtimeResult.task.status === "CANCELLED") {
        observation = Observation.cancelled({
          observationId,
          operationId: operation.id,
          stepId: currentStep.id,
          durationMs: executionDuration,
          error: runtimeResult.task.error ? {
            code: runtimeResult.task.error.code,
            message: runtimeResult.task.error.message,
          } : undefined,
          toolCalls,
          metadata: {
            taskId: runtimeResult.task.id,
            executionId: runtimeResult.execution.id,
          },
        });
      } else {
        const taskErr = runtimeResult.task.error ?? new TaskError("STEP_FAILURE", "Task execution failed");
        observation = Observation.failure({
          observationId,
          operationId: operation.id,
          stepId: currentStep.id,
          durationMs: executionDuration,
          error: {
            code: taskErr.code,
            message: taskErr.message,
          },
          toolCalls,
          metadata: {
            taskId: runtimeResult.task.id,
            executionId: runtimeResult.execution.id,
          },
        });
      }
      observations.push(observation);

      // Record Consumption on AutonomousOperation
      operation = operation.recordStep({
        elapsedMs: executionDuration,
        toolCalls,
      });

      this.publishEvent("operation.step_completed", operation.id, {
        stepId: currentStep.id,
        order: currentStep.order,
        status: observation.status,
        durationMs: executionDuration,
        toolCalls,
        stepsUsed: operation.consumption.stepsUsed,
      }, { taskId: runtimeResult.task.id, executionId: runtimeResult.execution.id });

      // Cancellation Check (after execution)
      if (request.cancellationToken?.isCancelled) {
        const cancelReason = request.cancellationToken.reason ?? "Operation cancelled following step execution";
        operation = operation.cancel(cancelReason, this.now());
        this.publishEvent("operation.cancelled", operation.id, { reason: cancelReason });
        break;
      }

      // Objective Evaluation
      let objectiveEvaluation: ObjectiveEvaluation | undefined;
      if (request.evaluateObjective) {
        try {
          objectiveEvaluation = request.evaluateObjective({
            operation,
            plan,
            observation,
            step: currentStep,
          });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Objective evaluation error";
          operation = operation.fail({ code: "OBJECTIVE_EVALUATION_FAILURE", message }, this.now());
          this.publishEvent("operation.failed", operation.id, { code: "OBJECTIVE_EVALUATION_FAILURE", message });
          break;
        }
      }

      // Decision Evaluation via DecisionEvaluatorPort
      let nextDecision: Decision;
      try {
        nextDecision = this.evaluator.evaluate({
          operation,
          plan,
          observation,
          objectiveEvaluation,
          stopRequested: request.cancellationToken?.isCancelled,
          stopReason: request.cancellationToken?.reason,
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Decision evaluation error";
        operation = operation.fail({ code: "DECISION_EVALUATION_FAILURE", message }, this.now());
        this.publishEvent("operation.failed", operation.id, { code: "DECISION_EVALUATION_FAILURE", message });
        break;
      }
      decisions.push(nextDecision);

      // Process Evaluation Outcome
      if (nextDecision.type === "COMPLETE") {
        const finalOutput = nextDecision.output ?? observation.output;
        operation = operation.complete(finalOutput, this.now());
        this.publishEvent("operation.completed", operation.id, { output: finalOutput });
        break;
      }

      if (nextDecision.type === "FAIL") {
        const failureError = nextDecision.failureError ?? {
          code: "DECISION_FAIL",
          message: "Decision evaluation resulted in operational failure",
        };
        operation = operation.fail(failureError, this.now());
        this.publishEvent("operation.failed", operation.id, { code: failureError.code, message: failureError.message });
        break;
      }

      if (nextDecision.type === "STOP") {
        operation = this.handleStopDecision(nextDecision, operation);
        break;
      }

      if (nextDecision.type === "EXECUTE_STEP") {
        // Validate next decision before looping
        if (!nextDecision.stepId || !plan.getStepById(nextDecision.stepId)) {
          const message = `Next decision references invalid stepId '${nextDecision.stepId}'`;
          operation = operation.fail({ code: "INVALID_DECISION", message }, this.now());
          this.publishEvent("operation.failed", operation.id, { code: "INVALID_DECISION", message });
          break;
        }

        // Pre-check budget for the next step
        const nextBudgetCheck = operation.checkBudget();
        if (!nextBudgetCheck.hasBudget) {
          const reason: BudgetExhaustionReason = nextBudgetCheck.reason ?? "STEPS_EXHAUSTED";
          operation = operation.exhaustBudget(reason, this.now());
          this.publishEvent("operation.budget_exhausted", operation.id, { reason });
          break;
        }

        currentDecision = nextDecision;
        continue;
      }
    }

    // Post-loop Bound Enforcement: if loop ended while RUNNING, maxSteps boundary was reached
    if (operation.status === "RUNNING") {
      operation = operation.exhaustBudget("STEPS_EXHAUSTED", this.now());
      this.publishEvent("operation.budget_exhausted", operation.id, { reason: "STEPS_EXHAUSTED" });
    }

    return {
      operation,
      plan,
      observations,
      decisions,
      error: operation.failureError ? { ...operation.failureError } : undefined,
    };
  }

  private handleNonExecuteDecision(decision: Decision, operation: AutonomousOperation): AutonomousOperation {
    switch (decision.type) {
      case "COMPLETE": {
        const completedOp = operation.complete(decision.output, this.now());
        this.publishEvent("operation.completed", operation.id, { output: decision.output });
        return completedOp;
      }
      case "FAIL": {
        const failureError = decision.failureError ?? { code: "DECISION_FAIL", message: "Decision failed" };
        const failedOp = operation.fail(failureError, this.now());
        this.publishEvent("operation.failed", operation.id, { code: failureError.code, message: failureError.message });
        return failedOp;
      }
      case "STOP": {
        return this.handleStopDecision(decision, operation);
      }
      default: {
        const failedOp = operation.fail({ code: "INVALID_DECISION", message: `Unexpected decision type: ${decision.type}` }, this.now());
        this.publishEvent("operation.failed", operation.id, { code: "INVALID_DECISION", message: `Unexpected decision type: ${decision.type}` });
        return failedOp;
      }
    }
  }

  private handleStopDecision(decision: Decision, operation: AutonomousOperation): AutonomousOperation {
    const budgetCheck = operation.checkBudget();
    if (!budgetCheck.hasBudget && budgetCheck.reason) {
      const exhaustedOp = operation.exhaustBudget(budgetCheck.reason, this.now());
      this.publishEvent("operation.budget_exhausted", operation.id, { reason: budgetCheck.reason });
      return exhaustedOp;
    }

    const reasonText = decision.reason?.toLowerCase() ?? "";
    if (reasonText.includes("duration") || reasonText.includes("time limit")) {
      const exhaustedOp = operation.exhaustBudget("DURATION_EXCEEDED", this.now());
      this.publishEvent("operation.budget_exhausted", operation.id, { reason: "DURATION_EXCEEDED" });
      return exhaustedOp;
    }

    if (reasonText.includes("tool") || reasonText.includes("tools_exhausted")) {
      const exhaustedOp = operation.exhaustBudget("TOOLS_EXHAUSTED", this.now());
      this.publishEvent("operation.budget_exhausted", operation.id, { reason: "TOOLS_EXHAUSTED" });
      return exhaustedOp;
    }

    if (reasonText.includes("budget") || reasonText.includes("maxsteps") || reasonText.includes("steps_exhausted")) {
      const exhaustedOp = operation.exhaustBudget("STEPS_EXHAUSTED", this.now());
      this.publishEvent("operation.budget_exhausted", operation.id, { reason: "STEPS_EXHAUSTED" });
      return exhaustedOp;
    }

    // Cancellation / external stop / plan exhaustion without objective completion
    const reason = decision.reason ?? "Operation stopped by decision evaluation";
    const cancelledOp = operation.cancel(reason, this.now());
    this.publishEvent("operation.cancelled", operation.id, { reason });
    return cancelledOp;
  }

  private validateRequest(request: AutonomousOperationRequest): void {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new AutonomousOrchestratorValidationError("Request must be a valid non-null object");
    }

    if (!request.agent || typeof request.agent !== "object" || !request.agent.id?.trim()) {
      throw new AutonomousOrchestratorValidationError("Request requires an AgentDefinition with a valid id");
    }

    if (!request.operation) {
      if (!request.operationId || typeof request.operationId !== "string" || !request.operationId.trim()) {
        throw new AutonomousOrchestratorValidationError("Request requires a non-empty operationId when operation is not provided");
      }
      if (!request.objective || typeof request.objective !== "string" || !request.objective.trim()) {
        throw new AutonomousOrchestratorValidationError("Request requires a non-empty objective when operation is not provided");
      }
      if (!(request.budget instanceof AutonomyBudget)) {
        throw new AutonomousOrchestratorValidationError("Request requires a valid AutonomyBudget when operation is not provided");
      }
    }
  }

  private publishEvent(
    type: Parameters<typeof event>[0],
    aggregateId: string,
    payload: Readonly<Record<string, unknown>>,
    refs: Readonly<{ taskId?: string; executionId?: string }> = {}
  ): void {
    const ev = event(
      type,
      aggregateId,
      aggregateId,
      payload,
      this.ids.next(),
      this.now(),
      refs
    );
    this.events.publish(ev);
  }
}
