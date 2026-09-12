import { AutonomyBudget, AutonomyBudgetSnapshot } from "./autonomy-budget.js";
import { TaskContext, TaskContextSnapshot } from "../context/task-context.js";

export class PlanningValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningValidationError";
  }
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new PlanningValidationError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new PlanningValidationError(
      `${name} must be alphanumeric, dashes or underscores (1-128 chars)`
    );
  }
  return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNoFunctions(obj: Record<string, unknown>, contextName: string): void {
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "function") {
      throw new PlanningValidationError(`${contextName} cannot contain functions (key: ${key})`);
    }
  }
}

export interface PlanningRequestProps {
  readonly operationId: string;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudget;
  readonly currentStep: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly taskContext?: TaskContext | undefined;
}

export interface PlanningRequestSnapshot {
  readonly operationId: string;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudgetSnapshot;
  readonly currentStep: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly taskContext?: TaskContextSnapshot | undefined;
}

/**
 * PlanningRequest represents the immutable, validated input passed to a PlannerPort,
 * providing the operation context, goal, assigned agent, budget boundaries, and execution step.
 */
export class PlanningRequest {
  readonly operationId: string;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudget;
  readonly currentStep: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly taskContext?: TaskContext | undefined;

  private constructor(
    operationId: string,
    objective: string,
    agentId: string,
    budget: AutonomyBudget,
    currentStep: number,
    metadata?: Readonly<Record<string, unknown>> | undefined,
    taskContext?: TaskContext | undefined
  ) {
    this.operationId = operationId;
    this.objective = objective;
    this.agentId = agentId;
    this.budget = budget;
    this.currentStep = currentStep;
    this.metadata = metadata;
    this.taskContext = taskContext;
    Object.freeze(this);
  }

  static create(props: PlanningRequestProps): PlanningRequest {
    if (!isPlainObject(props)) {
      throw new PlanningValidationError("PlanningRequest props must be a valid non-null object");
    }

    const operationId = validateIdentifier(props.operationId, "operationId");
    const agentId = validateIdentifier(props.agentId, "agentId");

    if (typeof props.objective !== "string") {
      throw new PlanningValidationError("objective must be a string");
    }
    const trimmedObjective = props.objective.trim();
    if (!trimmedObjective) {
      throw new PlanningValidationError("objective cannot be empty");
    }
    if (trimmedObjective.length > 4096) {
      throw new PlanningValidationError("objective cannot exceed 4096 characters");
    }

    if (!(props.budget instanceof AutonomyBudget)) {
      throw new PlanningValidationError("budget must be an instance of AutonomyBudget");
    }

    if (
      typeof props.currentStep !== "number" ||
      !Number.isInteger(props.currentStep) ||
      props.currentStep < 0
    ) {
      throw new PlanningValidationError("currentStep must be a non-negative integer (>= 0)");
    }

    let frozenMetadata: Readonly<Record<string, unknown>> | undefined;
    if (props.metadata !== undefined) {
      if (!isPlainObject(props.metadata)) {
        throw new PlanningValidationError("metadata must be a plain object when provided");
      }
      assertNoFunctions(props.metadata, "metadata");
      frozenMetadata = Object.freeze({ ...props.metadata });
    }

    return new PlanningRequest(
      operationId,
      trimmedObjective,
      agentId,
      props.budget,
      props.currentStep,
      frozenMetadata,
      props.taskContext
    );
  }

  snapshot(): PlanningRequestSnapshot {
    return Object.freeze({
      operationId: this.operationId,
      objective: this.objective,
      agentId: this.agentId,
      budget: this.budget.snapshot(),
      currentStep: this.currentStep,
      ...(this.metadata !== undefined ? { metadata: Object.freeze({ ...this.metadata }) } : {}),
      ...(this.taskContext !== undefined ? { taskContext: this.taskContext.snapshot() } : {}),
    });
  }
}
