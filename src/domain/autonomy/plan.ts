export class InvalidPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlanError";
  }
}

export class PlanStepValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanStepValidationError";
  }
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateIdentifier(value: unknown, name: string, isPlanStep = false): string {
  const ErrorClass = isPlanStep ? PlanStepValidationError : InvalidPlanError;
  if (typeof value !== "string") {
    throw new ErrorClass(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new ErrorClass(
      `${name} must be alphanumeric, dashes or underscores (1-128 chars)`
    );
  }
  return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNoFunctions(
  obj: Record<string, unknown>,
  contextName: string,
  isPlanStep = false
): void {
  const ErrorClass = isPlanStep ? PlanStepValidationError : InvalidPlanError;
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "function") {
      throw new ErrorClass(`${contextName} cannot contain functions (key: ${key})`);
    }
  }
}

export interface PlanStepProps {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlanStepSnapshot {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * PlanStep represents an immutable, declarative atomic step within an operational Plan.
 * Contains purely serializable data (id, order, action, input, metadata) with zero executable callbacks.
 */
export class PlanStep {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;

  private constructor(
    id: string,
    order: number,
    action: string,
    input: Readonly<Record<string, unknown>>,
    metadata?: Readonly<Record<string, unknown>> | undefined
  ) {
    this.id = id;
    this.order = order;
    this.action = action;
    this.input = input;
    this.metadata = metadata;
    Object.freeze(this);
  }

  static create(props: PlanStepProps): PlanStep {
    if (!isPlainObject(props)) {
      throw new PlanStepValidationError("PlanStep props must be a valid non-null object");
    }

    const id = validateIdentifier(props.id, "stepId", true);

    if (
      typeof props.order !== "number" ||
      !Number.isInteger(props.order) ||
      props.order <= 0
    ) {
      throw new PlanStepValidationError("PlanStep order must be a positive integer (>= 1)");
    }

    if (typeof props.action !== "string") {
      throw new PlanStepValidationError("PlanStep action must be a string");
    }
    const trimmedAction = props.action.trim();
    if (!trimmedAction) {
      throw new PlanStepValidationError("PlanStep action cannot be empty");
    }

    if (!isPlainObject(props.input)) {
      throw new PlanStepValidationError("PlanStep input must be a plain object");
    }
    assertNoFunctions(props.input, "PlanStep input", true);
    const frozenInput = Object.freeze({ ...props.input });

    let frozenMetadata: Readonly<Record<string, unknown>> | undefined;
    if (props.metadata !== undefined) {
      if (!isPlainObject(props.metadata)) {
        throw new PlanStepValidationError("PlanStep metadata must be a plain object when provided");
      }
      assertNoFunctions(props.metadata, "PlanStep metadata", true);
      frozenMetadata = Object.freeze({ ...props.metadata });
    }

    return new PlanStep(id, props.order, trimmedAction, frozenInput, frozenMetadata);
  }

  snapshot(): PlanStepSnapshot {
    return Object.freeze({
      id: this.id,
      order: this.order,
      action: this.action,
      input: Object.freeze({ ...this.input }),
      ...(this.metadata !== undefined ? { metadata: Object.freeze({ ...this.metadata }) } : {}),
    });
  }
}

export const MAX_PLAN_STEPS = 50;

export interface PlanProps {
  readonly id: string;
  readonly operationId: string;
  readonly steps: readonly PlanStep[];
  readonly createdAt?: Date | undefined;
}

export interface PlanSnapshot {
  readonly id: string;
  readonly operationId: string;
  readonly steps: readonly PlanStepSnapshot[];
  readonly createdAt: Date;
}

/**
 * Plan represents an immutable, finite, ordered sequence of PlanSteps
 * designed to achieve the objective of an AutonomousOperation.
 */
export class Plan {
  readonly id: string;
  readonly operationId: string;
  readonly steps: readonly PlanStep[];
  readonly createdAt: Date;

  private constructor(
    id: string,
    operationId: string,
    steps: readonly PlanStep[],
    createdAt: Date
  ) {
    this.id = id;
    this.operationId = operationId;
    this.steps = steps;
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  static create(props: PlanProps): Plan {
    if (!isPlainObject(props)) {
      throw new InvalidPlanError("Plan props must be a valid non-null object");
    }

    const id = validateIdentifier(props.id, "planId");
    const operationId = validateIdentifier(props.operationId, "operationId");

    if (!Array.isArray(props.steps)) {
      throw new InvalidPlanError("Plan steps must be an array");
    }

    if (props.steps.length === 0) {
      throw new InvalidPlanError("Plan must contain at least one step (cannot be empty)");
    }

    if (props.steps.length > MAX_PLAN_STEPS) {
      throw new InvalidPlanError(
        `Plan exceeds maximum allowed steps limit of ${MAX_PLAN_STEPS} (received: ${props.steps.length})`
      );
    }

    const seenStepIds = new Set<string>();
    for (let i = 0; i < props.steps.length; i++) {
      const step = props.steps[i];
      if (!(step instanceof PlanStep)) {
        throw new InvalidPlanError(`Plan step at index ${i} must be an instance of PlanStep`);
      }

      if (seenStepIds.has(step.id)) {
        throw new InvalidPlanError(`Duplicate step ID '${step.id}' detected in plan`);
      }
      seenStepIds.add(step.id);

      const expectedOrder = i + 1;
      if (step.order !== expectedOrder) {
        throw new InvalidPlanError(
          `Plan steps must be ordered sequentially starting from 1 (step index ${i} has order ${step.order}, expected ${expectedOrder})`
        );
      }
    }

    let createdAt: Date;
    if (props.createdAt !== undefined) {
      if (!(props.createdAt instanceof Date) || Number.isNaN(props.createdAt.getTime())) {
        throw new InvalidPlanError("createdAt must be a valid Date when provided");
      }
      createdAt = new Date(props.createdAt.getTime());
    } else {
      createdAt = new Date();
    }

    const frozenSteps: readonly PlanStep[] = Object.freeze([...props.steps]);

    return new Plan(id, operationId, frozenSteps, createdAt);
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  getStep(order: number): PlanStep | undefined {
    if (order < 1 || order > this.steps.length) {
      return undefined;
    }
    return this.steps[order - 1];
  }

  getStepById(id: string): PlanStep | undefined {
    return this.steps.find((s) => s.id === id);
  }

  hasStep(order: number): boolean {
    return order >= 1 && order <= this.steps.length;
  }

  snapshot(): PlanSnapshot {
    return Object.freeze({
      id: this.id,
      operationId: this.operationId,
      steps: Object.freeze(this.steps.map((s) => s.snapshot())),
      createdAt: new Date(this.createdAt.getTime()),
    });
  }
}
