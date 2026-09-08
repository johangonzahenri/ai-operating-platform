export type ObjectiveStatus = "ACHIEVED" | "NOT_ACHIEVED" | "UNKNOWN";

export class ObjectiveEvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectiveEvaluationValidationError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNoFunctions(obj: Record<string, unknown>, contextName: string): void {
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "function") {
      throw new ObjectiveEvaluationValidationError(
        `${contextName} cannot contain functions (key: ${key})`
      );
    }
  }
}

export interface ObjectiveEvaluationProps {
  readonly status: ObjectiveStatus;
  readonly rationale?: string | undefined;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
}

export interface ObjectiveEvaluationSnapshot {
  readonly status: ObjectiveStatus;
  readonly rationale?: string | undefined;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * ObjectiveEvaluation represents the assessment of whether an AutonomousOperation's
 * overarching objective has been achieved. Decouples step execution success from goal completion.
 */
export class ObjectiveEvaluation {
  readonly status: ObjectiveStatus;
  readonly rationale?: string | undefined;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;

  private constructor(
    status: ObjectiveStatus,
    rationale?: string | undefined,
    evidence?: Readonly<Record<string, unknown>> | undefined
  ) {
    this.status = status;
    this.rationale = rationale;
    this.evidence = evidence;
    Object.freeze(this);
  }

  static create(props: ObjectiveEvaluationProps): ObjectiveEvaluation {
    if (!isPlainObject(props)) {
      throw new ObjectiveEvaluationValidationError(
        "ObjectiveEvaluation props must be a valid non-null object"
      );
    }

    const validStatuses: readonly ObjectiveStatus[] = ["ACHIEVED", "NOT_ACHIEVED", "UNKNOWN"];
    if (!validStatuses.includes(props.status)) {
      throw new ObjectiveEvaluationValidationError(
        `Invalid objective status '${props.status}'. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    let rationale: string | undefined;
    if (props.rationale !== undefined) {
      if (typeof props.rationale !== "string") {
        throw new ObjectiveEvaluationValidationError("rationale must be a string when provided");
      }
      const trimmed = props.rationale.trim();
      if (!trimmed) {
        throw new ObjectiveEvaluationValidationError("rationale cannot be empty whitespace when provided");
      }
      rationale = trimmed;
    }

    let frozenEvidence: Readonly<Record<string, unknown>> | undefined;
    if (props.evidence !== undefined) {
      if (!isPlainObject(props.evidence)) {
        throw new ObjectiveEvaluationValidationError("evidence must be a plain object when provided");
      }
      assertNoFunctions(props.evidence, "ObjectiveEvaluation evidence");
      frozenEvidence = Object.freeze({ ...props.evidence });
    }

    return new ObjectiveEvaluation(props.status, rationale, frozenEvidence);
  }

  static achieved(props?: {
    readonly rationale?: string | undefined;
    readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  }): ObjectiveEvaluation {
    return ObjectiveEvaluation.create({
      status: "ACHIEVED",
      rationale: props?.rationale,
      evidence: props?.evidence,
    });
  }

  static notAchieved(props?: {
    readonly rationale?: string | undefined;
    readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  }): ObjectiveEvaluation {
    return ObjectiveEvaluation.create({
      status: "NOT_ACHIEVED",
      rationale: props?.rationale,
      evidence: props?.evidence,
    });
  }

  static unknown(props?: {
    readonly rationale?: string | undefined;
  }): ObjectiveEvaluation {
    return ObjectiveEvaluation.create({
      status: "UNKNOWN",
      rationale: props?.rationale,
    });
  }

  get isAchieved(): boolean {
    return this.status === "ACHIEVED";
  }

  snapshot(): ObjectiveEvaluationSnapshot {
    return Object.freeze({
      status: this.status,
      ...(this.rationale !== undefined ? { rationale: this.rationale } : {}),
      ...(this.evidence !== undefined ? { evidence: Object.freeze({ ...this.evidence }) } : {}),
    });
  }
}
