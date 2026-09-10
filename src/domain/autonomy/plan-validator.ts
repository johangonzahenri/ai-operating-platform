import { Plan, PlanStep, InvalidPlanError, MAX_PLAN_STEPS } from "./plan.js";

export class PlanValidationError extends Error {
  readonly code = "PLAN_VALIDATION_FAILED";
  constructor(message: string, readonly violations: readonly string[] = []) {
    super(message);
    this.name = "PlanValidationError";
  }
}

export interface PlanValidationOptions {
  readonly allowedActions?: readonly string[] | undefined;
  readonly maxSteps?: number | undefined;
  readonly disallowedKeywords?: readonly string[] | undefined;
}

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
  readonly validatedStepCount: number;
}

/**
 * PlanValidator enforces fail-closed structural and semantic invariants on declarative Plans
 * before they can be accepted by the AutonomousOrchestrator or dispatched to CoreRuntime.
 */
export class PlanValidator {
  /**
   * Evaluates a Plan against structural and semantic boundary constraints.
   * Returns a clean PlanValidationResult with all detected violations.
   */
  static validate(plan: Plan, options: PlanValidationOptions = {}): PlanValidationResult {
    const violations: string[] = [];

    if (!plan || !(plan instanceof Plan)) {
      return {
        valid: false,
        violations: ["Plan must be a valid instance of Plan"],
        validatedStepCount: 0,
      };
    }

    const maxSteps = options.maxSteps ?? MAX_PLAN_STEPS;
    if (plan.totalSteps > maxSteps) {
      violations.push(
        `Plan step count (${plan.totalSteps}) exceeds maximum allowed constraint of ${maxSteps}`
      );
    }

    const allowedActions = options.allowedActions ? new Set(options.allowedActions) : null;
    const disallowedKeywords = options.disallowedKeywords ?? ["__proto__", "constructor", "prototype", "eval", "spawn", "exec"];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (!step) {
        violations.push(`Step at index ${i} is undefined or null`);
        continue;
      }

      // Check action whitelist if provided
      if (allowedActions && !allowedActions.has(step.action)) {
        violations.push(
          `Step ${step.order} ('${step.id}') specifies unauthorized action '${step.action}'. Allowed: [${Array.from(allowedActions).join(", ")}]`
        );
      }

      // Security check: ensure no dangerous keyword tampering in input keys
      const checkedKeys = new Set([
        ...Object.keys(step.input),
        ...Object.getOwnPropertyNames(step.input),
      ]);
      for (const kw of disallowedKeywords) {
        if (
          Object.prototype.hasOwnProperty.call(step.input, kw) ||
          (kw.toLowerCase() === "__proto__" && (
            Object.getPrototypeOf(step.input) !== Object.prototype &&
            Object.getPrototypeOf(step.input) !== null
          ))
        ) {
          checkedKeys.add(kw);
        }
      }
      for (const key of checkedKeys) {
        if (disallowedKeywords.includes(key.toLowerCase())) {
          violations.push(
            `Step ${step.order} contains disallowed input property '${key}'`
          );
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations: Object.freeze(violations),
      validatedStepCount: plan.totalSteps,
    };
  }

  /**
   * Fail-closed assertion: throws PlanValidationError if any violation is detected.
   */
  static assertValid(plan: Plan, options: PlanValidationOptions = {}): void {
    const result = PlanValidator.validate(plan, options);
    if (!result.valid) {
      throw new PlanValidationError(
        `Plan validation failed with ${result.violations.length} violation(s): ${result.violations.join("; ")}`,
        result.violations
      );
    }
  }
}
