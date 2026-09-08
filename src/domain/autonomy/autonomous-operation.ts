import { AutonomyBudget, AutonomyBudgetSnapshot } from "./autonomy-budget.js";
import {
  AutonomyConsumption,
  AutonomyConsumptionSnapshot,
} from "./autonomy-consumption.js";

export type AutonomousOperationStatus =
  | "SUBMITTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BUDGET_EXHAUSTED";

export type BudgetExhaustionReason =
  | "STEPS_EXHAUSTED"
  | "DURATION_EXCEEDED"
  | "TOOLS_EXHAUSTED"
  | "TOKENS_EXHAUSTED";

export class AutonomousOperationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutonomousOperationValidationError";
  }
}

export class InvalidAutonomousOperationTransitionError extends Error {
  constructor(
    readonly from: AutonomousOperationStatus,
    readonly to: AutonomousOperationStatus
  ) {
    super(`Cannot transition AutonomousOperation from ${from} to ${to}`);
    this.name = "InvalidAutonomousOperationTransitionError";
  }
}

const allowedTransitions: Readonly<Record<AutonomousOperationStatus, readonly AutonomousOperationStatus[]>> = {
  SUBMITTED: ["RUNNING"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  BUDGET_EXHAUSTED: [],
};

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new AutonomousOperationValidationError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new AutonomousOperationValidationError(
      `${name} must be alphanumeric, dashes or underscores (1-128 chars)`
    );
  }
  return trimmed;
}

export interface AutonomousOperationCreateProps {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudget;
  readonly createdAt?: Date | undefined;
}

export interface AutonomousOperationSnapshot {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly status: AutonomousOperationStatus;
  readonly budget: AutonomyBudgetSnapshot;
  readonly consumption: AutonomyConsumptionSnapshot;
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly terminationReason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * AutonomousOperation represents a bounded, goal-oriented operational supervisor
 * governing an Agent across discrete, measured steps toward an objective.
 */
export class AutonomousOperation {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudget;
  readonly consumption: AutonomyConsumption;
  readonly status: AutonomousOperationStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly terminationReason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;

  private constructor(
    id: string,
    objective: string,
    agentId: string,
    budget: AutonomyBudget,
    consumption: AutonomyConsumption,
    status: AutonomousOperationStatus,
    createdAt: Date,
    startedAt?: Date | undefined,
    completedAt?: Date | undefined,
    terminationReason?: string | undefined,
    failureError?: { readonly code: string; readonly message: string } | undefined,
    resultOutput?: Readonly<Record<string, unknown>> | undefined
  ) {
    this.id = id;
    this.objective = objective;
    this.agentId = agentId;
    this.budget = budget;
    this.consumption = consumption;
    this.status = status;
    this.createdAt = createdAt;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.terminationReason = terminationReason;
    this.failureError = failureError;
    this.resultOutput = resultOutput;
    Object.freeze(this);
  }

  static create(props: AutonomousOperationCreateProps): AutonomousOperation {
    if (props === null || typeof props !== "object" || Array.isArray(props)) {
      throw new AutonomousOperationValidationError("AutonomousOperation props must be a valid non-null object");
    }

    const id = validateIdentifier(props.id, "Operation id");
    const agentId = validateIdentifier(props.agentId, "Agent id");

    if (typeof props.objective !== "string") {
      throw new AutonomousOperationValidationError("Objective must be a string");
    }
    const trimmedObjective = props.objective.trim();
    if (!trimmedObjective) {
      throw new AutonomousOperationValidationError("Objective must be a non-empty string");
    }
    if (trimmedObjective.length > 4096) {
      throw new AutonomousOperationValidationError("Objective exceeds maximum length of 4096 characters");
    }

    if (!(props.budget instanceof AutonomyBudget)) {
      throw new AutonomousOperationValidationError("Budget must be a valid AutonomyBudget instance");
    }

    const createdAt = props.createdAt ?? new Date();

    return new AutonomousOperation(
      id,
      trimmedObjective,
      agentId,
      props.budget,
      AutonomyConsumption.zero(),
      "SUBMITTED",
      createdAt
    );
  }

  private transition(
    to: AutonomousOperationStatus,
    updates: {
      readonly startedAt?: Date | undefined;
      readonly completedAt?: Date | undefined;
      readonly terminationReason?: string | undefined;
      readonly failureError?: { readonly code: string; readonly message: string } | undefined;
      readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;
      readonly consumption?: AutonomyConsumption | undefined;
    } = {}
  ): AutonomousOperation {
    if (!allowedTransitions[this.status].includes(to)) {
      throw new InvalidAutonomousOperationTransitionError(this.status, to);
    }

    return new AutonomousOperation(
      this.id,
      this.objective,
      this.agentId,
      this.budget,
      updates.consumption ?? this.consumption,
      to,
      this.createdAt,
      updates.startedAt ?? this.startedAt,
      updates.completedAt ?? this.completedAt,
      updates.terminationReason ?? this.terminationReason,
      updates.failureError ?? this.failureError,
      updates.resultOutput ?? this.resultOutput
    );
  }

  start(startedAt: Date = new Date()): AutonomousOperation {
    return this.transition("RUNNING", { startedAt });
  }

  complete(
    output?: Readonly<Record<string, unknown>>,
    completedAt: Date = new Date()
  ): AutonomousOperation {
    return this.transition("COMPLETED", {
      completedAt,
      resultOutput: output !== undefined ? Object.freeze({ ...output }) : undefined,
    });
  }

  fail(
    error: { readonly code: string; readonly message: string },
    completedAt: Date = new Date()
  ): AutonomousOperation {
    if (
      error === null ||
      typeof error !== "object" ||
      typeof error.code !== "string" ||
      !error.code.trim() ||
      typeof error.message !== "string" ||
      !error.message.trim()
    ) {
      throw new AutonomousOperationValidationError("Failure error requires a non-empty code and message");
    }

    return this.transition("FAILED", {
      completedAt,
      failureError: Object.freeze({ code: error.code.trim(), message: error.message.trim() }),
      terminationReason: error.message.trim(),
    });
  }

  cancel(
    reason: string = "Operation cancelled by operator",
    completedAt: Date = new Date()
  ): AutonomousOperation {
    const trimmedReason = typeof reason === "string" && reason.trim() ? reason.trim() : "Operation cancelled by operator";
    return this.transition("CANCELLED", {
      completedAt,
      terminationReason: trimmedReason,
    });
  }

  exhaustBudget(
    reason: BudgetExhaustionReason,
    completedAt: Date = new Date()
  ): AutonomousOperation {
    const validReasons: readonly BudgetExhaustionReason[] = [
      "STEPS_EXHAUSTED",
      "DURATION_EXCEEDED",
      "TOOLS_EXHAUSTED",
      "TOKENS_EXHAUSTED",
    ];

    if (!validReasons.includes(reason)) {
      throw new AutonomousOperationValidationError(`Invalid budget exhaustion reason: '${String(reason)}'`);
    }

    return this.transition("BUDGET_EXHAUSTED", {
      completedAt,
      terminationReason: reason,
    });
  }

  recordStep(delta: {
    readonly toolCalls?: number | undefined;
    readonly elapsedMs?: number | undefined;
    readonly tokens?: number | undefined;
  } = {}): AutonomousOperation {
    if (this.status !== "RUNNING") {
      throw new AutonomousOperationValidationError(
        `Cannot record step on operation in '${this.status}' status (must be RUNNING)`
      );
    }

    const nextConsumption = this.consumption.recordStep(delta);

    return new AutonomousOperation(
      this.id,
      this.objective,
      this.agentId,
      this.budget,
      nextConsumption,
      this.status,
      this.createdAt,
      this.startedAt,
      this.completedAt,
      this.terminationReason,
      this.failureError,
      this.resultOutput
    );
  }

  checkBudget(
    currentElapsedMs?: number,
    nextToolCalls: number = 0
  ): { readonly hasBudget: boolean; readonly reason?: BudgetExhaustionReason } {
    if (this.consumption.stepsUsed >= this.budget.maxSteps) {
      return { hasBudget: false, reason: "STEPS_EXHAUSTED" };
    }

    const effectiveElapsed =
      currentElapsedMs !== undefined ? currentElapsedMs : this.consumption.elapsedMs;
    if (effectiveElapsed >= this.budget.maxDurationMs) {
      return { hasBudget: false, reason: "DURATION_EXCEEDED" };
    }

    if (this.consumption.toolCallsUsed + nextToolCalls > this.budget.maxToolCalls) {
      return { hasBudget: false, reason: "TOOLS_EXHAUSTED" };
    }

    if (
      this.budget.maxTokens !== undefined &&
      (this.consumption.tokensUsed ?? 0) >= this.budget.maxTokens
    ) {
      return { hasBudget: false, reason: "TOKENS_EXHAUSTED" };
    }

    return { hasBudget: true };
  }

  hasBudgetRemaining(currentElapsedMs?: number): boolean {
    return this.checkBudget(currentElapsedMs).hasBudget;
  }

  snapshot(): AutonomousOperationSnapshot {
    return Object.freeze({
      id: this.id,
      objective: this.objective,
      agentId: this.agentId,
      status: this.status,
      budget: this.budget.snapshot(),
      consumption: this.consumption.snapshot(),
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      terminationReason: this.terminationReason,
      failureError: this.failureError ? Object.freeze({ ...this.failureError }) : undefined,
      resultOutput: this.resultOutput ? Object.freeze({ ...this.resultOutput }) : undefined,
    });
  }
}
