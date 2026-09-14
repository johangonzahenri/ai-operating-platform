export class InvalidPlanError extends Error {
  readonly code: string = "INVALID_PLAN";
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlanError";
  }
}

export class PlanStepValidationError extends Error {
  readonly code = "PLAN_STEP_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PlanStepValidationError";
  }
}

import { PolicyDeniedError } from "../policy/policy.js";

export class PlanCycleDetectedError extends Error {
  readonly code = "PLAN_CYCLE_DETECTED";
  constructor(message: string) {
    super(message);
    this.name = "PlanCycleDetectedError";
  }
}

export class PlanPolicyRejectedError extends PolicyDeniedError {
  readonly planStepId?: string | undefined;
  constructor(message: string, policyId = "plan-policy-denied", stepId?: string) {
    super(policyId, stepId ?? "unknown", message);
    this.name = "PlanPolicyRejectedError";
    this.planStepId = stepId;
  }
}

export class PlanLimitExceededError extends InvalidPlanError {
  override readonly code = "PLAN_LIMIT_EXCEEDED";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitExceededError";
  }
}

export class PlanUnsupportedActionError extends Error {
  readonly code = "PLAN_UNSUPPORTED_ACTION";
  constructor(readonly action: string, message?: string) {
    super(message ?? `Action '${action}' is not supported or authorized`);
    this.name = "PlanUnsupportedActionError";
  }
}

export const MAX_PLAN_STEPS = 50;
export const MAX_PLAN_DEPTH = 10;
export const MAX_DEPENDENCIES = 10;
export const MAX_STEP_INPUT_SIZE = 65536; // 64KB
export const MAX_PLAN_METADATA_SIZE = 16384; // 16KB

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
  readonly toolId?: string | undefined;
  readonly toolVersion?: string | undefined;
  readonly dependencies?: readonly string[] | undefined;
  readonly constraints?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlanStepSnapshot {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly toolId?: string | undefined;
  readonly toolVersion?: string | undefined;
  readonly dependencies?: readonly string[] | undefined;
  readonly constraints?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * PlanStep represents an immutable, declarative atomic step within an operational Plan.
 * Contains purely serializable data with zero executable callbacks.
 */
export class PlanStep {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly toolId?: string | undefined;
  readonly toolVersion?: string | undefined;
  readonly dependencies: readonly string[];
  readonly constraints: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;

  private constructor(
    id: string,
    order: number,
    action: string,
    input: Readonly<Record<string, unknown>>,
    toolId?: string | undefined,
    toolVersion?: string | undefined,
    dependencies: readonly string[] = [],
    constraints: readonly string[] = [],
    metadata?: Readonly<Record<string, unknown>> | undefined
  ) {
    this.id = id;
    this.order = order;
    this.action = action;
    this.input = input;
    this.toolId = toolId;
    this.toolVersion = toolVersion;
    this.dependencies = Object.freeze([...dependencies]);
    this.constraints = Object.freeze([...constraints]);
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
    
    // Check input size limit
    const inputSize = JSON.stringify(props.input).length;
    if (inputSize > MAX_STEP_INPUT_SIZE) {
      throw new PlanLimitExceededError(
        `PlanStep '${id}' input size (${inputSize} bytes) exceeds limit of ${MAX_STEP_INPUT_SIZE} bytes`
      );
    }
    const frozenInput = Object.freeze({ ...props.input });

    const dependencies = Array.isArray(props.dependencies)
      ? props.dependencies.map((d) => validateIdentifier(d, "dependencyStepId", true))
      : [];

    if (dependencies.length > MAX_DEPENDENCIES) {
      throw new PlanLimitExceededError(
        `PlanStep '${id}' specifies ${dependencies.length} dependencies, exceeding maximum limit of ${MAX_DEPENDENCIES}`
      );
    }

    const constraints = Array.isArray(props.constraints)
      ? props.constraints.map((c) => String(c).trim()).filter(Boolean)
      : [];

    let frozenMetadata: Readonly<Record<string, unknown>> | undefined;
    if (props.metadata !== undefined) {
      if (!isPlainObject(props.metadata)) {
        throw new PlanStepValidationError("PlanStep metadata must be a plain object when provided");
      }
      assertNoFunctions(props.metadata, "PlanStep metadata", true);
      const metaSize = JSON.stringify(props.metadata).length;
      if (metaSize > MAX_PLAN_METADATA_SIZE) {
        throw new PlanLimitExceededError(
          `PlanStep '${id}' metadata size (${metaSize} bytes) exceeds limit of ${MAX_PLAN_METADATA_SIZE} bytes`
        );
      }
      frozenMetadata = Object.freeze({ ...props.metadata });
    }

    return new PlanStep(
      id,
      props.order,
      trimmedAction,
      frozenInput,
      props.toolId?.trim(),
      props.toolVersion?.trim(),
      dependencies,
      constraints,
      frozenMetadata
    );
  }

  snapshot(): PlanStepSnapshot {
    return Object.freeze({
      id: this.id,
      order: this.order,
      action: this.action,
      input: Object.freeze({ ...this.input }),
      ...(this.toolId !== undefined ? { toolId: this.toolId } : {}),
      ...(this.toolVersion !== undefined ? { toolVersion: this.toolVersion } : {}),
      dependencies: Object.freeze([...this.dependencies]),
      constraints: Object.freeze([...this.constraints]),
      ...(this.metadata !== undefined ? { metadata: Object.freeze({ ...this.metadata }) } : {}),
    });
  }
}

export interface PlanProps {
  readonly id: string;
  readonly operationId: string;
  readonly steps: readonly PlanStep[];
  readonly schemaVersion?: number | undefined;
  readonly version?: number | undefined;
  readonly goal?: string | undefined;
  readonly constraints?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly createdAt?: Date | undefined;
}

export interface PlanSnapshot {
  readonly id: string;
  readonly operationId: string;
  readonly steps: readonly PlanStepSnapshot[];
  readonly schemaVersion: number;
  readonly version: number;
  readonly goal?: string | undefined;
  readonly constraints?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
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
  readonly schemaVersion: number;
  readonly version: number;
  readonly goal?: string | undefined;
  readonly constraints: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly createdAt: Date;

  private constructor(
    id: string,
    operationId: string,
    steps: readonly PlanStep[],
    schemaVersion: number,
    version: number,
    goal?: string | undefined,
    constraints: readonly string[] = [],
    metadata?: Readonly<Record<string, unknown>> | undefined,
    createdAt: Date = new Date()
  ) {
    this.id = id;
    this.operationId = operationId;
    this.steps = steps;
    this.schemaVersion = schemaVersion;
    this.version = version;
    this.goal = goal;
    this.constraints = Object.freeze([...constraints]);
    this.metadata = metadata;
    this.createdAt = createdAt;
    Object.freeze(this);
  }

  static create(props: PlanProps): Plan {
    if (!isPlainObject(props)) {
      throw new InvalidPlanError("Plan props must be a valid non-null object");
    }

    const id = validateIdentifier(props.id, "planId");
    const operationId = validateIdentifier(props.operationId, "operationId");
    const schemaVersion = props.schemaVersion ?? 1;
    const version = props.version ?? 1;

    if (!Array.isArray(props.steps)) {
      throw new InvalidPlanError("Plan steps must be an array");
    }

    if (props.steps.length === 0) {
      throw new InvalidPlanError("Plan must contain at least one step (cannot be empty)");
    }

    if (props.steps.length > MAX_PLAN_STEPS) {
      throw new PlanLimitExceededError(
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

    let frozenMetadata: Readonly<Record<string, unknown>> | undefined;
    if (props.metadata !== undefined) {
      if (!isPlainObject(props.metadata)) {
        throw new InvalidPlanError("Plan metadata must be a plain object when provided");
      }
      assertNoFunctions(props.metadata, "Plan metadata");
      frozenMetadata = Object.freeze({ ...props.metadata });
    }

    const frozenSteps: readonly PlanStep[] = Object.freeze([...props.steps]);
    const constraints = Array.isArray(props.constraints)
      ? props.constraints.map((c) => String(c).trim()).filter(Boolean)
      : [];

    return new Plan(
      id,
      operationId,
      frozenSteps,
      schemaVersion,
      version,
      props.goal?.trim(),
      constraints,
      frozenMetadata,
      createdAt
    );
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
      schemaVersion: this.schemaVersion,
      version: this.version,
      ...(this.goal !== undefined ? { goal: this.goal } : {}),
      constraints: Object.freeze([...this.constraints]),
      ...(this.metadata !== undefined ? { metadata: Object.freeze({ ...this.metadata }) } : {}),
      createdAt: new Date(this.createdAt.getTime()),
    });
  }
}
