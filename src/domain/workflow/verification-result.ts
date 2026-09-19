import {
  VerificationValidationError,
  SelfVerificationError,
} from "./verification-errors.js";

export type VerificationVerdict =
  | "PASS"
  | "FAIL"
  | "MISSING"
  | "MALFORMED"
  | "CONFLICT"
  | "AMBIGUOUS";

export type VerificationMethod =
  | "SCHEMA"
  | "INVARIANT"
  | "RULE"
  | "DETERMINISTIC"
  | "POLICY"
  | "SPECIALIZED";

export type VerifierSource =
  | "SYSTEM"
  | "POLICY"
  | "AGENT"
  | "HUMAN";

export type ExpectedFieldType = "string" | "number" | "boolean" | "object" | "array";

export interface WorkflowStepVerificationRule {
  readonly method?: VerificationMethod | undefined;
  readonly requiredFields?: readonly string[] | undefined;
  readonly fieldTypes?: Readonly<Record<string, ExpectedFieldType>> | undefined;
  readonly allowedValues?: Readonly<Record<string, readonly unknown[]>> | undefined;
  readonly numericRanges?: Readonly<Record<string, { readonly min?: number; readonly max?: number }>> | undefined;
  readonly customInvariants?: readonly string[] | undefined;
}

export interface CreateVerificationResultProps {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly verifierPrincipalId: string;
  readonly verifierSource: VerifierSource;
  readonly verdict: VerificationVerdict;
  readonly method: VerificationMethod;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly verifiedAt?: Date | undefined;
}

export interface RehydrateVerificationResultProps {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly verifierPrincipalId: string;
  readonly verifierSource: VerifierSource;
  readonly verdict: VerificationVerdict;
  readonly method: VerificationMethod;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly verifiedAt: Date;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class VerificationResult {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly verifierPrincipalId: string;
  readonly verifierSource: VerifierSource;
  readonly verdict: VerificationVerdict;
  readonly method: VerificationMethod;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly verifiedAt: Date;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RehydrateVerificationResultProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.workflowId = props.workflowId;
    this.workflowInstanceId = props.workflowInstanceId;
    this.workflowStepId = props.workflowStepId;
    this.taskId = props.taskId;
    this.executionId = props.executionId;
    this.producerPrincipalId = props.producerPrincipalId;
    this.verifierPrincipalId = props.verifierPrincipalId;
    this.verifierSource = props.verifierSource;
    this.verdict = props.verdict;
    this.method = props.method;
    this.evidence = props.evidence;
    this.reason = props.reason;
    this.verifiedAt = props.verifiedAt;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CreateVerificationResultProps): VerificationResult {
    if (!props.id || !props.id.trim()) {
      throw new VerificationValidationError("id is required for VerificationResult");
    }
    if (!props.tenantId || !props.tenantId.trim()) {
      throw new VerificationValidationError("tenantId is required for VerificationResult");
    }
    if (!props.workflowId || !props.workflowId.trim()) {
      throw new VerificationValidationError("workflowId is required for VerificationResult");
    }
    if (!props.workflowInstanceId || !props.workflowInstanceId.trim()) {
      throw new VerificationValidationError("workflowInstanceId is required for VerificationResult");
    }
    if (!props.workflowStepId || !props.workflowStepId.trim()) {
      throw new VerificationValidationError("workflowStepId is required for VerificationResult");
    }
    if (!props.verifierPrincipalId || !props.verifierPrincipalId.trim()) {
      throw new VerificationValidationError("verifierPrincipalId is required for VerificationResult");
    }
    if (!props.verdict || !props.verdict.trim()) {
      throw new VerificationValidationError("verdict is required for VerificationResult");
    }
    if (!props.method || !props.method.trim()) {
      throw new VerificationValidationError("method is required for VerificationResult");
    }

    // Invariant: Producer cannot self-certify
    if (
      props.producerPrincipalId &&
      props.producerPrincipalId.trim() &&
      props.producerPrincipalId.trim() === props.verifierPrincipalId.trim()
    ) {
      throw new SelfVerificationError(props.producerPrincipalId, props.verifierPrincipalId);
    }

    const now = new Date();
    return new VerificationResult({
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      workflowId: props.workflowId.trim(),
      workflowInstanceId: props.workflowInstanceId.trim(),
      workflowStepId: props.workflowStepId.trim(),
      taskId: props.taskId?.trim() || undefined,
      executionId: props.executionId?.trim() || undefined,
      producerPrincipalId: props.producerPrincipalId?.trim() || undefined,
      verifierPrincipalId: props.verifierPrincipalId.trim(),
      verifierSource: props.verifierSource,
      verdict: props.verdict,
      method: props.method,
      evidence: props.evidence,
      reason: props.reason?.trim() || undefined,
      verifiedAt: props.verifiedAt ?? now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateVerificationResultProps): VerificationResult {
    return new VerificationResult(props);
  }

  isPass(): boolean {
    return this.verdict === "PASS";
  }

  updateVerdict(props: {
    readonly verdict: VerificationVerdict;
    readonly reason?: string | undefined;
    readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  }): VerificationResult {
    const now = new Date();
    return new VerificationResult({
      ...this,
      verdict: props.verdict,
      reason: props.reason !== undefined ? props.reason.trim() : this.reason,
      evidence: props.evidence !== undefined ? props.evidence : this.evidence,
      verifiedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }
}
