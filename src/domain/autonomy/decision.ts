export type DecisionType = "EXECUTE_STEP" | "COMPLETE" | "STOP" | "FAIL";

export class DecisionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionValidationError";
  }
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateIdentifier(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new DecisionValidationError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new DecisionValidationError(
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
      throw new DecisionValidationError(`${contextName} cannot contain functions (key: ${key})`);
    }
  }
}

export interface DecisionFailureError {
  readonly code: string;
  readonly message: string;
}

export interface DecisionProps {
  readonly operationId: string;
  readonly type: DecisionType;
  readonly stepId?: string | undefined;
  readonly action?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly failureError?: DecisionFailureError | undefined;
  readonly rationale?: string | undefined;
  readonly decidedAt?: Date | undefined;
}

export interface DecisionSnapshot {
  readonly operationId: string;
  readonly type: DecisionType;
  readonly stepId?: string | undefined;
  readonly action?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly failureError?: DecisionFailureError | undefined;
  readonly rationale?: string | undefined;
  readonly decidedAt: Date;
}

/**
 * Decision represents a discrete, immutable outcome produced by planning or evaluation logic.
 * Governs the exact next step, graceful completion, stop request, or operational failure.
 */
export class Decision {
  readonly operationId: string;
  readonly type: DecisionType;
  readonly stepId?: string | undefined;
  readonly action?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly failureError?: DecisionFailureError | undefined;
  readonly rationale?: string | undefined;
  readonly decidedAt: Date;

  private constructor(
    operationId: string,
    type: DecisionType,
    decidedAt: Date,
    stepId?: string | undefined,
    action?: string | undefined,
    input?: Readonly<Record<string, unknown>> | undefined,
    output?: Readonly<Record<string, unknown>> | undefined,
    reason?: string | undefined,
    failureError?: DecisionFailureError | undefined,
    rationale?: string | undefined
  ) {
    this.operationId = operationId;
    this.type = type;
    this.decidedAt = decidedAt;
    this.stepId = stepId;
    this.action = action;
    this.input = input;
    this.output = output;
    this.reason = reason;
    this.failureError = failureError;
    this.rationale = rationale;
    Object.freeze(this);
  }

  static create(props: DecisionProps): Decision {
    if (!isPlainObject(props)) {
      throw new DecisionValidationError("Decision props must be a valid non-null object");
    }

    const operationId = validateIdentifier(props.operationId, "operationId");

    const validTypes: readonly DecisionType[] = ["EXECUTE_STEP", "COMPLETE", "STOP", "FAIL"];
    if (!validTypes.includes(props.type)) {
      throw new DecisionValidationError(
        `Invalid decision type '${props.type}'. Must be one of: ${validTypes.join(", ")}`
      );
    }

    let decidedAt: Date;
    if (props.decidedAt !== undefined) {
      if (!(props.decidedAt instanceof Date) || Number.isNaN(props.decidedAt.getTime())) {
        throw new DecisionValidationError("decidedAt must be a valid Date when provided");
      }
      decidedAt = new Date(props.decidedAt.getTime());
    } else {
      decidedAt = new Date();
    }

    let rationale: string | undefined;
    if (props.rationale !== undefined) {
      if (typeof props.rationale !== "string") {
        throw new DecisionValidationError("rationale must be a string when provided");
      }
      const trimmedRationale = props.rationale.trim();
      if (!trimmedRationale) {
        throw new DecisionValidationError("rationale cannot be empty whitespace when provided");
      }
      rationale = trimmedRationale;
    }

    switch (props.type) {
      case "EXECUTE_STEP": {
        if (props.output !== undefined) {
          throw new DecisionValidationError("EXECUTE_STEP decision cannot contain output");
        }
        if (props.reason !== undefined) {
          throw new DecisionValidationError("EXECUTE_STEP decision cannot contain reason");
        }
        if (props.failureError !== undefined) {
          throw new DecisionValidationError("EXECUTE_STEP decision cannot contain failureError");
        }

        const stepId = validateIdentifier(props.stepId, "stepId");

        if (typeof props.action !== "string") {
          throw new DecisionValidationError("EXECUTE_STEP decision requires an action string");
        }
        const trimmedAction = props.action.trim();
        if (!trimmedAction) {
          throw new DecisionValidationError("EXECUTE_STEP decision action cannot be empty");
        }

        let input: Readonly<Record<string, unknown>> = Object.freeze({});
        if (props.input !== undefined) {
          if (!isPlainObject(props.input)) {
            throw new DecisionValidationError("EXECUTE_STEP decision input must be a plain object");
          }
          assertNoFunctions(props.input, "EXECUTE_STEP decision input");
          input = Object.freeze({ ...props.input });
        }

        return new Decision(
          operationId,
          "EXECUTE_STEP",
          decidedAt,
          stepId,
          trimmedAction,
          input,
          undefined,
          undefined,
          undefined,
          rationale
        );
      }

      case "COMPLETE": {
        if (props.stepId !== undefined) {
          throw new DecisionValidationError("COMPLETE decision cannot contain stepId");
        }
        if (props.action !== undefined) {
          throw new DecisionValidationError("COMPLETE decision cannot contain action");
        }
        if (props.input !== undefined) {
          throw new DecisionValidationError("COMPLETE decision cannot contain input");
        }
        if (props.reason !== undefined) {
          throw new DecisionValidationError("COMPLETE decision cannot contain reason");
        }
        if (props.failureError !== undefined) {
          throw new DecisionValidationError("COMPLETE decision cannot contain failureError");
        }

        let output: Readonly<Record<string, unknown>> | undefined;
        if (props.output !== undefined) {
          if (!isPlainObject(props.output)) {
            throw new DecisionValidationError("COMPLETE decision output must be a plain object when provided");
          }
          assertNoFunctions(props.output, "COMPLETE decision output");
          output = Object.freeze({ ...props.output });
        }

        return new Decision(
          operationId,
          "COMPLETE",
          decidedAt,
          undefined,
          undefined,
          undefined,
          output,
          undefined,
          undefined,
          rationale
        );
      }

      case "STOP": {
        if (props.stepId !== undefined) {
          throw new DecisionValidationError("STOP decision cannot contain stepId");
        }
        if (props.action !== undefined) {
          throw new DecisionValidationError("STOP decision cannot contain action");
        }
        if (props.input !== undefined) {
          throw new DecisionValidationError("STOP decision cannot contain input");
        }
        if (props.output !== undefined) {
          throw new DecisionValidationError("STOP decision cannot contain output");
        }
        if (props.failureError !== undefined) {
          throw new DecisionValidationError("STOP decision cannot contain failureError");
        }

        if (typeof props.reason !== "string") {
          throw new DecisionValidationError("STOP decision requires a reason string");
        }
        const trimmedReason = props.reason.trim();
        if (!trimmedReason) {
          throw new DecisionValidationError("STOP decision reason cannot be empty");
        }

        return new Decision(
          operationId,
          "STOP",
          decidedAt,
          undefined,
          undefined,
          undefined,
          undefined,
          trimmedReason,
          undefined,
          rationale
        );
      }

      case "FAIL": {
        if (props.stepId !== undefined) {
          throw new DecisionValidationError("FAIL decision cannot contain stepId");
        }
        if (props.action !== undefined) {
          throw new DecisionValidationError("FAIL decision cannot contain action");
        }
        if (props.input !== undefined) {
          throw new DecisionValidationError("FAIL decision cannot contain input");
        }
        if (props.output !== undefined) {
          throw new DecisionValidationError("FAIL decision cannot contain output");
        }
        if (props.reason !== undefined) {
          throw new DecisionValidationError("FAIL decision cannot contain reason");
        }

        if (!isPlainObject(props.failureError)) {
          throw new DecisionValidationError("FAIL decision requires a valid failureError object");
        }
        if (typeof props.failureError.code !== "string" || !props.failureError.code.trim()) {
          throw new DecisionValidationError("FAIL decision failureError requires a non-empty code");
        }
        if (typeof props.failureError.message !== "string" || !props.failureError.message.trim()) {
          throw new DecisionValidationError("FAIL decision failureError requires a non-empty message");
        }

        const failureError: DecisionFailureError = Object.freeze({
          code: props.failureError.code.trim(),
          message: props.failureError.message.trim(),
        });

        return new Decision(
          operationId,
          "FAIL",
          decidedAt,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          failureError,
          rationale
        );
      }
    }
  }

  static executeStep(props: {
    readonly operationId: string;
    readonly stepId: string;
    readonly action: string;
    readonly input?: Readonly<Record<string, unknown>> | undefined;
    readonly rationale?: string | undefined;
    readonly decidedAt?: Date | undefined;
  }): Decision {
    return Decision.create({
      operationId: props.operationId,
      type: "EXECUTE_STEP",
      stepId: props.stepId,
      action: props.action,
      input: props.input,
      rationale: props.rationale,
      decidedAt: props.decidedAt,
    });
  }

  static complete(props: {
    readonly operationId: string;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly rationale?: string | undefined;
    readonly decidedAt?: Date | undefined;
  }): Decision {
    return Decision.create({
      operationId: props.operationId,
      type: "COMPLETE",
      output: props.output,
      rationale: props.rationale,
      decidedAt: props.decidedAt,
    });
  }

  static stop(props: {
    readonly operationId: string;
    readonly reason: string;
    readonly rationale?: string | undefined;
    readonly decidedAt?: Date | undefined;
  }): Decision {
    return Decision.create({
      operationId: props.operationId,
      type: "STOP",
      reason: props.reason,
      rationale: props.rationale,
      decidedAt: props.decidedAt,
    });
  }

  static fail(props: {
    readonly operationId: string;
    readonly failureError: { readonly code: string; readonly message: string };
    readonly rationale?: string | undefined;
    readonly decidedAt?: Date | undefined;
  }): Decision {
    return Decision.create({
      operationId: props.operationId,
      type: "FAIL",
      failureError: props.failureError,
      rationale: props.rationale,
      decidedAt: props.decidedAt,
    });
  }

  snapshot(): DecisionSnapshot {
    return Object.freeze({
      operationId: this.operationId,
      type: this.type,
      decidedAt: new Date(this.decidedAt.getTime()),
      ...(this.stepId !== undefined ? { stepId: this.stepId } : {}),
      ...(this.action !== undefined ? { action: this.action } : {}),
      ...(this.input !== undefined ? { input: Object.freeze({ ...this.input }) } : {}),
      ...(this.output !== undefined ? { output: Object.freeze({ ...this.output }) } : {}),
      ...(this.reason !== undefined ? { reason: this.reason } : {}),
      ...(this.failureError !== undefined ? { failureError: Object.freeze({ ...this.failureError }) } : {}),
      ...(this.rationale !== undefined ? { rationale: this.rationale } : {}),
    });
  }
}
