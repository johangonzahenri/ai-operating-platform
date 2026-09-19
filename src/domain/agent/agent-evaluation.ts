import {
  AgentLifecycleValidationError,
  AgentEvaluationConcurrencyConflictError,
  SelfGovernanceError,
} from "./agent-lifecycle-errors.js";

export type EvaluationType =
  | "IDENTITY_CHECK"
  | "PROFILE_CHECK"
  | "CAPABILITY_CHECK"
  | "POLICY_CHECK"
  | "CONTRACT_CHECK"
  | "REGRESSION_CHECK";

export const VALID_EVALUATION_TYPES: readonly EvaluationType[] = [
  "IDENTITY_CHECK",
  "PROFILE_CHECK",
  "CAPABILITY_CHECK",
  "POLICY_CHECK",
  "CONTRACT_CHECK",
  "REGRESSION_CHECK",
];

export type EvaluationVerdict = "PASS" | "FAIL" | "PENDING" | "EXPIRED";

export const VALID_EVALUATION_VERDICTS: readonly EvaluationVerdict[] = [
  "PASS",
  "FAIL",
  "PENDING",
  "EXPIRED",
];

const ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;

export interface AgentEvaluationProps {
  readonly id: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly evaluatedProfileVersion: number;
  readonly evaluatorPrincipalId: string;
  readonly evaluationType: EvaluationType;
  readonly verdict?: EvaluationVerdict | undefined;
  readonly criteriaReference: string;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly evaluatedAt?: Date | undefined;
  readonly expiresAt?: Date | undefined;
  readonly version?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface RehydrateAgentEvaluationProps {
  readonly id: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly evaluatedProfileVersion: number;
  readonly evaluatorPrincipalId: string;
  readonly evaluationType: EvaluationType;
  readonly verdict: EvaluationVerdict;
  readonly criteriaReference: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly evaluatedAt: Date;
  readonly expiresAt?: Date | undefined;
  readonly version: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

function validateId(val: unknown, fieldName: string): string {
  if (typeof val !== "string" || !val.trim() || !ID_REGEX.test(val.trim())) {
    throw new AgentLifecycleValidationError(`${fieldName} must be a valid non-empty string matching ${ID_REGEX}`);
  }
  return val.trim();
}

export class AgentEvaluation {
  readonly id: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly evaluatedProfileVersion: number;
  readonly evaluatorPrincipalId: string;
  readonly evaluationType: EvaluationType;
  readonly verdict: EvaluationVerdict;
  readonly criteriaReference: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly evaluatedAt: Date;
  readonly expiresAt?: Date | undefined;
  readonly version: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;

  private constructor(props: {
    readonly id: string;
    readonly tenantId: string;
    readonly agentId: string;
    readonly evaluatedProfileVersion: number;
    readonly evaluatorPrincipalId: string;
    readonly evaluationType: EvaluationType;
    readonly verdict: EvaluationVerdict;
    readonly criteriaReference: string;
    readonly evidence: Readonly<Record<string, unknown>>;
    readonly evaluatedAt: Date;
    readonly expiresAt?: Date | undefined;
    readonly version: number;
    readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.agentId = props.agentId;
    this.evaluatedProfileVersion = props.evaluatedProfileVersion;
    this.evaluatorPrincipalId = props.evaluatorPrincipalId;
    this.evaluationType = props.evaluationType;
    this.verdict = props.verdict;
    this.criteriaReference = props.criteriaReference;
    this.evidence = props.evidence;
    this.evaluatedAt = props.evaluatedAt;
    this.expiresAt = props.expiresAt;
    this.version = props.version;
    this.metadata = props.metadata;
    Object.freeze(this);
  }

  static create(props: AgentEvaluationProps, now: Date = new Date()): AgentEvaluation {
    const id = validateId(props.id, "id");
    const tenantId = validateId(props.tenantId, "tenantId");
    const agentId = validateId(props.agentId, "agentId");
    const evaluatorPrincipalId = validateId(props.evaluatorPrincipalId, "evaluatorPrincipalId");

    // Segregation of Duties: agent cannot evaluate itself
    if (evaluatorPrincipalId.toLowerCase() === agentId.toLowerCase()) {
      throw new SelfGovernanceError(agentId, "evaluateAgent");
    }

    if (typeof props.evaluatedProfileVersion !== "number" || props.evaluatedProfileVersion < 1) {
      throw new AgentLifecycleValidationError("evaluatedProfileVersion must be an integer >= 1");
    }

    if (!VALID_EVALUATION_TYPES.includes(props.evaluationType)) {
      throw new AgentLifecycleValidationError(`Invalid evaluationType: '${props.evaluationType}'`);
    }

    const verdict: EvaluationVerdict = props.verdict ?? "PENDING";
    if (!VALID_EVALUATION_VERDICTS.includes(verdict)) {
      throw new AgentLifecycleValidationError(`Invalid verdict: '${verdict}'`);
    }

    const criteriaReference = props.criteriaReference?.trim();
    if (!criteriaReference) {
      throw new AgentLifecycleValidationError("criteriaReference is required");
    }

    const evidence = props.evidence ? Object.freeze({ ...props.evidence }) : Object.freeze({});
    const evaluatedAt = props.evaluatedAt ? new Date(props.evaluatedAt.getTime()) : new Date(now.getTime());
    const expiresAt = props.expiresAt ? new Date(props.expiresAt.getTime()) : undefined;
    if (expiresAt && expiresAt.getTime() <= evaluatedAt.getTime()) {
      throw new AgentLifecycleValidationError("expiresAt must be in the future of evaluatedAt");
    }

    const version = typeof props.version === "number" && props.version >= 1 ? props.version : 1;
    const metadata = props.metadata ? Object.freeze({ ...props.metadata }) : undefined;

    return new AgentEvaluation({
      id,
      tenantId,
      agentId,
      evaluatedProfileVersion: props.evaluatedProfileVersion,
      evaluatorPrincipalId,
      evaluationType: props.evaluationType,
      verdict,
      criteriaReference,
      evidence,
      evaluatedAt,
      expiresAt,
      version,
      metadata,
    });
  }

  static rehydrate(props: RehydrateAgentEvaluationProps): AgentEvaluation {
    const id = validateId(props.id, "id");
    const tenantId = validateId(props.tenantId, "tenantId");
    const agentId = validateId(props.agentId, "agentId");
    const evaluatorPrincipalId = validateId(props.evaluatorPrincipalId, "evaluatorPrincipalId");

    if (typeof props.evaluatedProfileVersion !== "number" || props.evaluatedProfileVersion < 1) {
      throw new AgentLifecycleValidationError("evaluatedProfileVersion must be an integer >= 1");
    }

    if (!VALID_EVALUATION_TYPES.includes(props.evaluationType)) {
      throw new AgentLifecycleValidationError(`Invalid evaluationType: '${props.evaluationType}'`);
    }

    if (!VALID_EVALUATION_VERDICTS.includes(props.verdict)) {
      throw new AgentLifecycleValidationError(`Invalid verdict: '${props.verdict}'`);
    }

    if (typeof props.criteriaReference !== "string" || !props.criteriaReference.trim()) {
      throw new AgentLifecycleValidationError("criteriaReference must be a non-empty string");
    }

    if (!(props.evaluatedAt instanceof Date) || Number.isNaN(props.evaluatedAt.getTime())) {
      throw new AgentLifecycleValidationError("evaluatedAt must be a valid Date");
    }

    const expiresAt = props.expiresAt ? new Date(props.expiresAt.getTime()) : undefined;

    return new AgentEvaluation({
      id,
      tenantId,
      agentId,
      evaluatedProfileVersion: props.evaluatedProfileVersion,
      evaluatorPrincipalId,
      evaluationType: props.evaluationType,
      verdict: props.verdict,
      criteriaReference: props.criteriaReference.trim(),
      evidence: Object.freeze({ ...props.evidence }),
      evaluatedAt: new Date(props.evaluatedAt.getTime()),
      expiresAt,
      version: props.version,
      metadata: props.metadata ? Object.freeze({ ...props.metadata }) : undefined,
    });
  }

  isExpired(now: Date = new Date()): boolean {
    if (this.verdict === "EXPIRED") return true;
    if (this.expiresAt && this.expiresAt.getTime() <= now.getTime()) return true;
    return false;
  }

  qualifiesProfile(profileVersion: number, now: Date = new Date()): boolean {
    if (this.verdict !== "PASS") return false;
    if (this.evaluatedProfileVersion !== profileVersion) return false;
    if (this.isExpired(now)) return false;
    return true;
  }

  complete(
    verdict: "PASS" | "FAIL",
    evidence?: Readonly<Record<string, unknown>>,
    expectedVersion?: number,
    now: Date = new Date()
  ): AgentEvaluation {
    if (expectedVersion !== undefined && expectedVersion !== this.version) {
      throw new AgentEvaluationConcurrencyConflictError(
        `Agent evaluation OCC conflict: expected version ${expectedVersion}, but current version is ${this.version}`
      );
    }
    if (this.verdict === "PASS" || this.verdict === "FAIL") {
      throw new AgentLifecycleValidationError(`Evaluation '${this.id}' is already finalized with verdict '${this.verdict}'`);
    }

    const updatedEvidence = evidence
      ? Object.freeze({ ...this.evidence, ...evidence })
      : this.evidence;

    return new AgentEvaluation({
      ...this,
      verdict,
      evidence: updatedEvidence,
      evaluatedAt: now,
      version: this.version + 1,
    });
  }

  expire(expectedVersion?: number, now: Date = new Date()): AgentEvaluation {
    if (expectedVersion !== undefined && expectedVersion !== this.version) {
      throw new AgentEvaluationConcurrencyConflictError(
        `Agent evaluation OCC conflict: expected version ${expectedVersion}, but current version is ${this.version}`
      );
    }
    if (this.verdict === "EXPIRED") {
      return this;
    }

    return new AgentEvaluation({
      ...this,
      verdict: "EXPIRED",
      version: this.version + 1,
    });
  }
}
