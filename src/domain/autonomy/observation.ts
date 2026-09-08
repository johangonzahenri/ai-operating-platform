export type ObservationStatus = "SUCCESS" | "FAILED" | "CANCELLED";

export class ObservationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservationValidationError";
  }
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new ObservationValidationError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new ObservationValidationError(
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
      throw new ObservationValidationError(`${contextName} cannot contain functions (key: ${key})`);
    }
  }
}

export interface ObservationError {
  readonly code: string;
  readonly message: string;
}

export interface ObservationProps {
  readonly observationId: string;
  readonly operationId: string;
  readonly stepId: string;
  readonly status: ObservationStatus;
  readonly durationMs: number;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: ObservationError | undefined;
  readonly toolCalls?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ObservationSnapshot {
  readonly observationId: string;
  readonly operationId: string;
  readonly stepId: string;
  readonly status: ObservationStatus;
  readonly durationMs: number;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: ObservationError | undefined;
  readonly toolCalls?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Observation represents the immutable, structured and verifiable result of an executed step
 * within an AutonomousOperation. It bridges the execution runtime with the decision evaluation engine.
 * An Observation contains purely declarative data and never executes code.
 */
export class Observation {
  readonly observationId: string;
  readonly operationId: string;
  readonly stepId: string;
  readonly status: ObservationStatus;
  readonly durationMs: number;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: ObservationError | undefined;
  readonly toolCalls?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;

  private constructor(
    observationId: string,
    operationId: string,
    stepId: string,
    status: ObservationStatus,
    durationMs: number,
    output?: Readonly<Record<string, unknown>> | undefined,
    error?: ObservationError | undefined,
    toolCalls?: number | undefined,
    metadata?: Readonly<Record<string, unknown>> | undefined
  ) {
    this.observationId = observationId;
    this.operationId = operationId;
    this.stepId = stepId;
    this.status = status;
    this.durationMs = durationMs;
    this.output = output;
    this.error = error;
    this.toolCalls = toolCalls;
    this.metadata = metadata;
    Object.freeze(this);
  }

  static create(props: ObservationProps): Observation {
    if (!isPlainObject(props)) {
      throw new ObservationValidationError("Observation props must be a valid non-null object");
    }

    const observationId = validateIdentifier(props.observationId, "observationId");
    const operationId = validateIdentifier(props.operationId, "operationId");
    const stepId = validateIdentifier(props.stepId, "stepId");

    const validStatuses: readonly ObservationStatus[] = ["SUCCESS", "FAILED", "CANCELLED"];
    if (!validStatuses.includes(props.status)) {
      throw new ObservationValidationError(
        `Invalid observation status '${props.status}'. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    if (
      typeof props.durationMs !== "number" ||
      !Number.isInteger(props.durationMs) ||
      props.durationMs < 0
    ) {
      throw new ObservationValidationError(
        "durationMs must be a non-negative integer (greater than or equal to 0)"
      );
    }

    let toolCalls: number | undefined;
    if (props.toolCalls !== undefined) {
      if (
        typeof props.toolCalls !== "number" ||
        !Number.isInteger(props.toolCalls) ||
        props.toolCalls < 0
      ) {
        throw new ObservationValidationError(
          "toolCalls must be a non-negative integer when provided"
        );
      }
      toolCalls = props.toolCalls;
    }

    let frozenMetadata: Readonly<Record<string, unknown>> | undefined;
    if (props.metadata !== undefined) {
      if (!isPlainObject(props.metadata)) {
        throw new ObservationValidationError("metadata must be a plain object when provided");
      }
      assertNoFunctions(props.metadata, "Observation metadata");
      frozenMetadata = Object.freeze({ ...props.metadata });
    }

    let frozenOutput: Readonly<Record<string, unknown>> | undefined;
    let frozenError: ObservationError | undefined;

    switch (props.status) {
      case "SUCCESS": {
        if (props.error !== undefined) {
          throw new ObservationValidationError("SUCCESS observation cannot contain an error");
        }
        if (props.output !== undefined) {
          if (!isPlainObject(props.output)) {
            throw new ObservationValidationError("output must be a plain object when provided");
          }
          assertNoFunctions(props.output, "Observation output");
          frozenOutput = Object.freeze({ ...props.output });
        } else {
          frozenOutput = Object.freeze({});
        }
        break;
      }

      case "FAILED": {
        if (props.output !== undefined) {
          throw new ObservationValidationError("FAILED observation cannot contain output");
        }
        if (!isPlainObject(props.error)) {
          throw new ObservationValidationError("FAILED observation requires an error object");
        }
        if (typeof props.error.code !== "string" || !props.error.code.trim()) {
          throw new ObservationValidationError("FAILED observation error requires a non-empty code");
        }
        if (typeof props.error.message !== "string" || !props.error.message.trim()) {
          throw new ObservationValidationError(
            "FAILED observation error requires a non-empty message"
          );
        }
        frozenError = Object.freeze({
          code: props.error.code.trim(),
          message: props.error.message.trim(),
        });
        break;
      }

      case "CANCELLED": {
        if (props.output !== undefined) {
          throw new ObservationValidationError("CANCELLED observation cannot contain output");
        }
        if (props.error !== undefined) {
          if (!isPlainObject(props.error)) {
            throw new ObservationValidationError("CANCELLED observation error must be a plain object when provided");
          }
          if (typeof props.error.code !== "string" || !props.error.code.trim()) {
            throw new ObservationValidationError("CANCELLED observation error requires a non-empty code when provided");
          }
          if (typeof props.error.message !== "string" || !props.error.message.trim()) {
            throw new ObservationValidationError("CANCELLED observation error requires a non-empty message when provided");
          }
          frozenError = Object.freeze({
            code: props.error.code.trim(),
            message: props.error.message.trim(),
          });
        }
        break;
      }
    }

    return new Observation(
      observationId,
      operationId,
      stepId,
      props.status,
      props.durationMs,
      frozenOutput,
      frozenError,
      toolCalls,
      frozenMetadata
    );
  }

  static success(props: {
    readonly observationId: string;
    readonly operationId: string;
    readonly stepId: string;
    readonly durationMs: number;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly toolCalls?: number | undefined;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  }): Observation {
    return Observation.create({
      observationId: props.observationId,
      operationId: props.operationId,
      stepId: props.stepId,
      status: "SUCCESS",
      durationMs: props.durationMs,
      output: props.output,
      toolCalls: props.toolCalls,
      metadata: props.metadata,
    });
  }

  static failure(props: {
    readonly observationId: string;
    readonly operationId: string;
    readonly stepId: string;
    readonly durationMs: number;
    readonly error: ObservationError;
    readonly toolCalls?: number | undefined;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  }): Observation {
    return Observation.create({
      observationId: props.observationId,
      operationId: props.operationId,
      stepId: props.stepId,
      status: "FAILED",
      durationMs: props.durationMs,
      error: props.error,
      toolCalls: props.toolCalls,
      metadata: props.metadata,
    });
  }

  static cancelled(props: {
    readonly observationId: string;
    readonly operationId: string;
    readonly stepId: string;
    readonly durationMs: number;
    readonly error?: ObservationError | undefined;
    readonly toolCalls?: number | undefined;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  }): Observation {
    return Observation.create({
      observationId: props.observationId,
      operationId: props.operationId,
      stepId: props.stepId,
      status: "CANCELLED",
      durationMs: props.durationMs,
      error: props.error,
      toolCalls: props.toolCalls,
      metadata: props.metadata,
    });
  }

  snapshot(): ObservationSnapshot {
    return Object.freeze({
      observationId: this.observationId,
      operationId: this.operationId,
      stepId: this.stepId,
      status: this.status,
      durationMs: this.durationMs,
      ...(this.output !== undefined ? { output: Object.freeze({ ...this.output }) } : {}),
      ...(this.error !== undefined ? { error: Object.freeze({ ...this.error }) } : {}),
      ...(this.toolCalls !== undefined ? { toolCalls: this.toolCalls } : {}),
      ...(this.metadata !== undefined ? { metadata: Object.freeze({ ...this.metadata }) } : {}),
    });
  }
}
