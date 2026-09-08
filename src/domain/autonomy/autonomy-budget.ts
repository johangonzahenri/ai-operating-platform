export interface AutonomyBudgetProps {
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number | undefined;
}

export interface AutonomyBudgetSnapshot {
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number | undefined;
}

export class AutonomyBudgetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutonomyBudgetValidationError";
  }
}

/**
 * AutonomyBudget represents the immutable upper operational constraints
 * for an autonomous operation, enforcing bounds on steps, duration, and tool usage.
 */
export class AutonomyBudget {
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number | undefined;

  private constructor(
    maxSteps: number,
    maxDurationMs: number,
    maxToolCalls: number,
    maxTokens?: number | undefined
  ) {
    this.maxSteps = maxSteps;
    this.maxDurationMs = maxDurationMs;
    this.maxToolCalls = maxToolCalls;
    this.maxTokens = maxTokens;
    Object.freeze(this);
  }

  static create(props: AutonomyBudgetProps): AutonomyBudget {
    if (props === null || typeof props !== "object" || Array.isArray(props)) {
      throw new AutonomyBudgetValidationError("Autonomy budget props must be a valid non-null object");
    }

    const { maxSteps, maxDurationMs, maxToolCalls, maxTokens } = props;

    if (typeof maxSteps !== "number" || !Number.isInteger(maxSteps) || maxSteps <= 0) {
      throw new AutonomyBudgetValidationError("maxSteps must be a positive integer greater than 0");
    }

    if (typeof maxDurationMs !== "number" || !Number.isInteger(maxDurationMs) || maxDurationMs <= 0) {
      throw new AutonomyBudgetValidationError("maxDurationMs must be a positive integer greater than 0");
    }

    if (typeof maxToolCalls !== "number" || !Number.isInteger(maxToolCalls) || maxToolCalls < 0) {
      throw new AutonomyBudgetValidationError(
        "maxToolCalls must be a non-negative integer (greater than or equal to 0)"
      );
    }

    if (maxTokens !== undefined) {
      if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens <= 0) {
        throw new AutonomyBudgetValidationError("maxTokens must be a positive integer greater than 0 when provided");
      }
    }

    return new AutonomyBudget(maxSteps, maxDurationMs, maxToolCalls, maxTokens);
  }

  snapshot(): AutonomyBudgetSnapshot {
    return Object.freeze({
      maxSteps: this.maxSteps,
      maxDurationMs: this.maxDurationMs,
      maxToolCalls: this.maxToolCalls,
      ...(this.maxTokens !== undefined ? { maxTokens: this.maxTokens } : {}),
    });
  }

  equals(other: unknown): boolean {
    if (!(other instanceof AutonomyBudget)) {
      return false;
    }
    return (
      this.maxSteps === other.maxSteps &&
      this.maxDurationMs === other.maxDurationMs &&
      this.maxToolCalls === other.maxToolCalls &&
      this.maxTokens === other.maxTokens
    );
  }
}
