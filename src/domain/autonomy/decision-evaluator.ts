import { AutonomousOperation } from "./autonomous-operation.js";
import { Plan } from "./plan.js";
import { Observation } from "./observation.js";
import { ObjectiveEvaluation } from "./objective-evaluation.js";
import { Decision } from "./decision.js";

export class DecisionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionEvaluationError";
  }
}

export interface DecisionEvaluationContext {
  readonly operation: AutonomousOperation;
  readonly plan: Plan;
  readonly observation: Observation;
  readonly objectiveEvaluation?: ObjectiveEvaluation | undefined;
  readonly stopRequested?: boolean | undefined;
  readonly stopReason?: string | undefined;
}

/**
 * DecisionEvaluatorPort defines the domain port for evaluating step observations
 * and current operational context to determine the next discrete Decision.
 * It is a pure evaluation component: it never executes tasks, tools or runtimes.
 */
export interface DecisionEvaluatorPort {
  evaluate(context: DecisionEvaluationContext): Decision;
}

export interface DeterministicDecisionEvaluatorOptions {
  readonly onPlanExhausted?: "STOP" | "FAIL" | undefined;
}

/**
 * DeterministicDecisionEvaluator is a pure, side-effect free implementation of
 * DecisionEvaluatorPort that applies explicit deterministic rules to derive decisions.
 */
export class DeterministicDecisionEvaluator implements DecisionEvaluatorPort {
  private readonly onPlanExhausted: "STOP" | "FAIL";

  constructor(options: DeterministicDecisionEvaluatorOptions = {}) {
    this.onPlanExhausted = options.onPlanExhausted ?? "STOP";
  }

  evaluate(context: DecisionEvaluationContext): Decision {
    if (context === null || typeof context !== "object" || Array.isArray(context)) {
      throw new DecisionEvaluationError("Evaluation context must be a valid non-null object");
    }

    const { operation, plan, observation, objectiveEvaluation, stopRequested, stopReason } = context;

    if (!(operation instanceof AutonomousOperation)) {
      throw new DecisionEvaluationError("Evaluation context requires a valid AutonomousOperation instance");
    }

    if (!(plan instanceof Plan)) {
      throw new DecisionEvaluationError("Evaluation context requires a valid Plan instance");
    }

    if (!(observation instanceof Observation)) {
      throw new DecisionEvaluationError("Evaluation context requires a valid Observation instance");
    }

    const terminalStatuses: readonly string[] = ["COMPLETED", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"];
    if (terminalStatuses.includes(operation.status)) {
      throw new DecisionEvaluationError(
        `Cannot evaluate decisions for operation '${operation.id}' in terminal state '${operation.status}'`
      );
    }

    if (plan.operationId !== operation.id) {
      throw new DecisionEvaluationError(
        `Plan operationId '${plan.operationId}' does not match operation '${operation.id}'`
      );
    }

    if (observation.operationId !== operation.id) {
      throw new DecisionEvaluationError(
        `Observation operationId '${observation.operationId}' does not match operation '${operation.id}'`
      );
    }

    const currentStep = plan.getStepById(observation.stepId);
    if (!currentStep) {
      throw new DecisionEvaluationError(
        `Observed stepId '${observation.stepId}' does not belong to plan '${plan.id}'`
      );
    }

    // Rule 1: Explicit Stop Signal
    if (stopRequested === true) {
      const reason = stopReason && stopReason.trim() ? stopReason.trim() : "Explicit stop requested by operator";
      return Decision.stop({
        operationId: operation.id,
        reason,
        rationale: "External stop signal was received and evaluated",
      });
    }

    // Rule 2: Step Cancelled
    if (observation.status === "CANCELLED") {
      const reason = observation.error?.message ?? "Step execution was cancelled";
      return Decision.stop({
        operationId: operation.id,
        reason,
        rationale: `Step '${observation.stepId}' was cancelled during execution`,
      });
    }

    // Rule 3: Step Failed (Fail-Closed Governance)
    if (observation.status === "FAILED") {
      const failureError = observation.error ?? {
        code: "STEP_EXECUTION_FAILURE",
        message: `Step '${observation.stepId}' failed during execution`,
      };
      return Decision.fail({
        operationId: operation.id,
        failureError,
        rationale: `Step '${observation.stepId}' failed with error code '${failureError.code}'`,
      });
    }

    // Rule 4: Step Succeeded - Check Objective Completion
    if (objectiveEvaluation?.isAchieved) {
      return Decision.complete({
        operationId: operation.id,
        output: observation.output,
        rationale: objectiveEvaluation.rationale ?? "Objective achieved according to evaluation",
      });
    }

    // Rule 5: Step Succeeded, Objective NOT Achieved - Check Budget Boundaries
    const budgetCheck = operation.checkBudget();
    if (!budgetCheck.hasBudget) {
      return Decision.stop({
        operationId: operation.id,
        reason: `Autonomy budget exhausted: ${budgetCheck.reason ?? "UNKNOWN"}`,
        rationale: "Budget bounds reached; stopping further step execution",
      });
    }

    // Check if step count would exceed budget maxSteps
    if (currentStep.order >= operation.budget.maxSteps) {
      return Decision.stop({
        operationId: operation.id,
        reason: "Autonomy budget maxSteps reached",
        rationale: `Completed step order ${currentStep.order} meets or exceeds budget maxSteps limit of ${operation.budget.maxSteps}`,
      });
    }

    // Rule 6: Step Succeeded, Objective NOT Achieved, Budget Available - Find Next Step
    const nextStepOrder = currentStep.order + 1;
    const nextStep = plan.getStep(nextStepOrder);

    if (nextStep) {
      return Decision.executeStep({
        operationId: operation.id,
        stepId: nextStep.id,
        action: nextStep.action,
        input: nextStep.input,
        rationale: `Step ${currentStep.order} completed successfully; proceeding to planned step ${nextStep.order}: ${nextStep.id}`,
      });
    }

    // Rule 7: Plan Exhausted Without Achieving Objective
    if (this.onPlanExhausted === "FAIL") {
      return Decision.fail({
        operationId: operation.id,
        failureError: {
          code: "PLAN_EXHAUSTED",
          message: `All ${plan.totalSteps} planned steps completed without achieving objective`,
        },
        rationale: "No remaining steps in plan to fulfill objective",
      });
    }

    return Decision.stop({
      operationId: operation.id,
      reason: `Plan steps exhausted (${plan.totalSteps}/${plan.totalSteps}) without objective completion`,
      rationale: "All planned steps executed but goal assessment indicates objective was not met",
    });
  }
}
