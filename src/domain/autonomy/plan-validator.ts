import {
  Plan,
  PlanStep,
  InvalidPlanError,
  MAX_PLAN_STEPS,
  MAX_PLAN_DEPTH,
  MAX_DEPENDENCIES,
  PlanCycleDetectedError,
} from "./plan.js";

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
  readonly maxDepth?: number | undefined;
  readonly disallowedKeywords?: readonly string[] | undefined;
  readonly requireDagCheck?: boolean | undefined;
}

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
  readonly validatedStepCount: number;
}

export const PLAN_JSON_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  type: "object",
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      minItems: 1,
      maxItems: MAX_PLAN_STEPS,
      items: {
        type: "object",
        required: ["order", "action", "input"],
        properties: {
          id: { type: "string" },
          order: { type: "integer", minimum: 1 },
          action: { type: "string" },
          tool: { type: "string" },
          toolId: { type: "string" },
          toolVersion: { type: "string" },
          input: { type: "object" },
          dependencies: {
            type: "array",
            maxItems: MAX_DEPENDENCIES,
            items: { type: "string" },
          },
          constraints: {
            type: "array",
            items: { type: "string" },
          },
          reason: { type: "string" },
          metadata: { type: "object" },
        },
        additionalProperties: false,
      },
    },
    goal: { type: "string" },
    constraints: {
      type: "array",
      items: { type: "string" },
    },
    metadata: { type: "object" },
  },
  additionalProperties: false,
});

/**
 * PlanValidator enforces fail-closed structural, schema, and semantic invariants on declarative Plans
 * before they can be accepted by the AutonomousOrchestrator or dispatched to CoreRuntime.
 */
export class PlanValidator {
  /**
   * Evaluates a Plan against structural, DAG, and semantic boundary constraints.
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
    const disallowedKeywords = options.disallowedKeywords ?? [
      "__proto__",
      "constructor",
      "prototype",
      "eval",
      "spawn",
      "exec",
      "system",
      "admin",
    ];

    const stepIdMap = new Map<string, PlanStep>();
    const orderMap = new Map<number, PlanStep>();

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (!step) {
        violations.push(`Step at index ${i} is undefined or null`);
        continue;
      }

      stepIdMap.set(step.id, step);
      orderMap.set(step.order, step);

      // Check action whitelist if provided
      if (allowedActions && !allowedActions.has(step.action)) {
        violations.push(
          `Step ${step.order} ('${step.id}') specifies unauthorized action '${step.action}'. Allowed: [${Array.from(allowedActions).join(", ")}]`
        );
      }

      // Security check: ensure no dangerous privilege escalation attempts or prototype pollution in input keys
      const checkedKeys = new Set([
        ...Object.keys(step.input),
        ...Object.getOwnPropertyNames(step.input),
      ]);

      // Untrusted claim checking: LLM plan cannot inject security context or system elevation
      const forbiddenSecurityKeys = ["principal", "roles", "permissions", "tenantId", "securityLevel", "principalId"];
      for (const fKey of forbiddenSecurityKeys) {
        if (checkedKeys.has(fKey)) {
          violations.push(
            `Step ${step.order} attempts forbidden security property injection '${fKey}'`
          );
        }
      }

      for (const kw of disallowedKeywords) {
        if (
          Object.prototype.hasOwnProperty.call(step.input, kw) ||
          (kw.toLowerCase() === "__proto__" &&
            Object.getPrototypeOf(step.input) !== Object.prototype &&
            Object.getPrototypeOf(step.input) !== null)
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

    // Dependency references and DAG cycle validation
    if (options.requireDagCheck !== false) {
      this.validateDependenciesAndCycles(plan, stepIdMap, violations);
    }

    return {
      valid: violations.length === 0,
      violations: Object.freeze(violations),
      validatedStepCount: plan.totalSteps,
    };
  }

  private static validateDependenciesAndCycles(
    plan: Plan,
    stepIdMap: Map<string, PlanStep>,
    violations: string[]
  ): void {
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const step of plan.steps) {
      adj.set(step.id, []);
      inDegree.set(step.id, 0);
    }

    for (const step of plan.steps) {
      for (const depId of step.dependencies) {
        if (!stepIdMap.has(depId)) {
          violations.push(
            `Step ${step.order} ('${step.id}') references non-existent dependency step ID '${depId}'`
          );
          continue;
        }

        const depStep = stepIdMap.get(depId)!;
        // Invariant: Dependencies must precede the current step in order
        if (depStep.order >= step.order) {
          violations.push(
            `Step ${step.order} ('${step.id}') depends on step ${depStep.order} ('${depId}') which does not strictly precede it`
          );
        }

        adj.get(depId)!.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
      }
    }

    // Kahn's algorithm for topological sorting / cycle detection
    const queue: string[] = [];
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const u = queue.shift()!;
      visitedCount++;

      for (const v of adj.get(u) ?? []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    if (visitedCount < plan.steps.length) {
      violations.push("Circular dependency cycle detected in plan steps graph");
    }
  }

  /**
   * Fail-closed assertion: throws PlanValidationError or PlanCycleDetectedError if any violation is detected.
   */
  static assertValid(plan: Plan, options: PlanValidationOptions = {}): void {
    const result = PlanValidator.validate(plan, options);
    if (!result.valid) {
      if (result.violations.some((v) => v.toLowerCase().includes("cycle"))) {
        throw new PlanCycleDetectedError(
          `Plan validation detected cyclic dependency: ${result.violations.join("; ")}`
        );
      }
      throw new PlanValidationError(
        `Plan validation failed with ${result.violations.length} violation(s): ${result.violations.join("; ")}`,
        result.violations
      );
    }
  }
}
