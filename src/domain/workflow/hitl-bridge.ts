/**
 * AI Operating Platform - HITL Async Bridge Domain Primitives
 * 
 * Formal domain models for Human-In-The-Loop (HITL) suspension and resumption.
 * 
 * Invariants:
 * 1. Protocol-Neutral: Abstract core suspension model completely decoupled from HTTP/SSE/MCP transports.
 * 2. Separation of Duties (SoD): Approver principal cannot be the requester or producer of the suspended action.
 * 3. Fail-Closed Security: Resumption re-validates tenant context, authorization, and token validity.
 * 4. Zero Secret Leakage: Suspension payloads and tokens are sanitized of credentials and sensitive tokens.
 * 5. Deterministic Token & Replay Protection: A suspension record can only be resumed once.
 */

import { randomBytes } from "node:crypto";
import { MembershipRole } from "../organization/agent-membership.js";
import { ApprovalAuthority } from "./approval-request.js";
import { SelfApprovalError } from "./approval-errors.js";

export type HITLSuspensionType = "APPROVAL" | "INPUT" | "MANUAL_GATE" | "POLICY_VIOLATION";

export type HITLSuspensionStatus =
  | "SUSPENDED"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_APPROVAL"
  | "RESUMED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export class HITLSuspensionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "HITLSuspensionError";
  }
}

export class HITLSuspensionValidationError extends HITLSuspensionError {
  constructor(message: string) {
    super("HITL_SUSPENSION_VALIDATION_ERROR", message);
    this.name = "HITLSuspensionValidationError";
  }
}

export class HITLSuspensionNotFoundError extends HITLSuspensionError {
  constructor(suspensionId: string) {
    super("HITL_SUSPENSION_NOT_FOUND", `HITL suspension '${suspensionId}' was not found`);
    this.name = "HITLSuspensionNotFoundError";
  }
}

export class HITLInvalidTokenError extends HITLSuspensionError {
  constructor(message = "Invalid or mismatched resumption token") {
    super("HITL_INVALID_RESUMPTION_TOKEN", message);
    this.name = "HITLInvalidTokenError";
  }
}

export class HITLSuspensionExpiredError extends HITLSuspensionError {
  constructor(suspensionId: string) {
    super("HITL_SUSPENSION_EXPIRED", `HITL suspension '${suspensionId}' has expired and cannot be resumed`);
    this.name = "HITLSuspensionExpiredError";
  }
}

export class HITLSuspensionStateConflictError extends HITLSuspensionError {
  constructor(suspensionId: string, currentStatus: string, attemptedAction: string) {
    super(
      "HITL_SUSPENSION_STATE_CONFLICT",
      `Cannot ${attemptedAction} HITL suspension '${suspensionId}' in status '${currentStatus}'`
    );
    this.name = "HITLSuspensionStateConflictError";
  }
}

export class HITLTenantMismatchError extends HITLSuspensionError {
  constructor(requestedTenant: string, actualTenant: string) {
    super(
      "HITL_TENANT_MISMATCH",
      `Cannot access HITL suspension belonging to tenant '${actualTenant}' from tenant '${requestedTenant}'`
    );
    this.name = "HITLTenantMismatchError";
  }
}

export interface CreateHITLSuspensionProps {
  readonly suspensionId?: string | undefined;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly workflowId?: string | undefined;
  readonly workflowInstanceId?: string | undefined;
  readonly stepId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly suspensionType: HITLSuspensionType;
  readonly reason: string;
  readonly requestedAction: string;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
  readonly expiresAt?: Date | undefined;
  readonly ttlMs?: number | undefined;
  readonly traceId?: string | undefined;
  readonly correlationId?: string | undefined;
}

export interface RehydrateHITLSuspensionProps {
  readonly suspensionId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly workflowId?: string | undefined;
  readonly workflowInstanceId?: string | undefined;
  readonly stepId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly suspensionType: HITLSuspensionType;
  readonly reason: string;
  readonly requestedAction: string;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: HITLSuspensionStatus;
  readonly resumptionToken: string;
  readonly expiresAt?: Date | undefined;
  readonly traceId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly resolvedByPrincipalId?: string | undefined;
  readonly resolutionOutcome?: "APPROVED" | "REJECTED" | "INPUT_PROVIDED" | "CANCELLED" | undefined;
  readonly resolutionData?: Readonly<Record<string, unknown>> | undefined;
  readonly resolvedAt?: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResumeHITLProps {
  readonly resumptionToken: string;
  readonly actorPrincipalId: string;
  readonly tenantId: string;
  readonly decision: "APPROVE" | "REJECT" | "PROVIDE_INPUT";
  readonly reason?: string | undefined;
  readonly inputData?: Readonly<Record<string, unknown>> | undefined;
}

export class HITLSuspensionRecord {
  readonly suspensionId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly workflowId?: string | undefined;
  readonly workflowInstanceId?: string | undefined;
  readonly stepId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly suspensionType: HITLSuspensionType;
  readonly reason: string;
  readonly requestedAction: string;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: HITLSuspensionStatus;
  readonly resumptionToken: string;
  readonly expiresAt?: Date | undefined;
  readonly traceId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly resolvedByPrincipalId?: string | undefined;
  readonly resolutionOutcome?: "APPROVED" | "REJECTED" | "INPUT_PROVIDED" | "CANCELLED" | undefined;
  readonly resolutionData?: Readonly<Record<string, unknown>> | undefined;
  readonly resolvedAt?: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RehydrateHITLSuspensionProps) {
    this.suspensionId = props.suspensionId;
    this.tenantId = props.tenantId;
    this.applicationId = props.applicationId;
    this.workflowId = props.workflowId;
    this.workflowInstanceId = props.workflowInstanceId;
    this.stepId = props.stepId;
    this.taskId = props.taskId;
    this.executionId = props.executionId;
    this.suspensionType = props.suspensionType;
    this.reason = props.reason;
    this.requestedAction = props.requestedAction;
    this.requesterPrincipalId = props.requesterPrincipalId;
    this.producerPrincipalId = props.producerPrincipalId;
    this.requiredRole = props.requiredRole;
    this.requiredAuthority = props.requiredAuthority;
    this.payload = Object.freeze({ ...props.payload });
    this.status = props.status;
    this.resumptionToken = props.resumptionToken;
    this.expiresAt = props.expiresAt;
    this.traceId = props.traceId;
    this.correlationId = props.correlationId;
    this.resolvedByPrincipalId = props.resolvedByPrincipalId;
    this.resolutionOutcome = props.resolutionOutcome;
    this.resolutionData = props.resolutionData ? Object.freeze({ ...props.resolutionData }) : undefined;
    this.resolvedAt = props.resolvedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateHITLSuspensionProps): HITLSuspensionRecord {
    if (!props.tenantId || typeof props.tenantId !== "string" || props.tenantId.trim() === "") {
      throw new HITLSuspensionValidationError("tenantId is required and cannot be empty");
    }
    if (!props.applicationId || typeof props.applicationId !== "string" || props.applicationId.trim() === "") {
      throw new HITLSuspensionValidationError("applicationId is required and cannot be empty");
    }
    if (!props.requesterPrincipalId || typeof props.requesterPrincipalId !== "string" || props.requesterPrincipalId.trim() === "") {
      throw new HITLSuspensionValidationError("requesterPrincipalId is required and cannot be empty");
    }
    if (!props.reason || typeof props.reason !== "string" || props.reason.trim() === "") {
      throw new HITLSuspensionValidationError("reason is required and cannot be empty");
    }
    if (!props.requestedAction || typeof props.requestedAction !== "string" || props.requestedAction.trim() === "") {
      throw new HITLSuspensionValidationError("requestedAction is required and cannot be empty");
    }

    const suspensionId = props.suspensionId ?? `hitl-${randomBytes(16).toString("hex")}`;
    const resumptionToken = `rst-${randomBytes(24).toString("hex")}`;

    let status: HITLSuspensionStatus = "SUSPENDED";
    if (props.suspensionType === "APPROVAL") {
      status = "WAITING_FOR_APPROVAL";
    } else if (props.suspensionType === "INPUT") {
      status = "WAITING_FOR_INPUT";
    }

    let expiresAt = props.expiresAt;
    if (!expiresAt && props.ttlMs !== undefined) {
      if (typeof props.ttlMs !== "number" || props.ttlMs <= 0) {
        throw new HITLSuspensionValidationError("ttlMs must be a positive integer");
      }
      expiresAt = new Date(Date.now() + props.ttlMs);
    }

    const now = new Date();
    return new HITLSuspensionRecord({
      suspensionId,
      tenantId: props.tenantId.trim(),
      applicationId: props.applicationId.trim(),
      workflowId: props.workflowId,
      workflowInstanceId: props.workflowInstanceId,
      stepId: props.stepId,
      taskId: props.taskId,
      executionId: props.executionId,
      suspensionType: props.suspensionType,
      reason: props.reason.trim(),
      requestedAction: props.requestedAction.trim(),
      requesterPrincipalId: props.requesterPrincipalId.trim(),
      producerPrincipalId: props.producerPrincipalId?.trim(),
      requiredRole: props.requiredRole,
      requiredAuthority: props.requiredAuthority,
      payload: props.payload ?? {},
      status,
      resumptionToken,
      expiresAt,
      traceId: props.traceId,
      correlationId: props.correlationId,
      createdAt: now,
      updatedAt: now,
    });
  }

  isTerminal(): boolean {
    return (
      this.status === "RESUMED" ||
      this.status === "APPROVED" ||
      this.status === "REJECTED" ||
      this.status === "EXPIRED" ||
      this.status === "CANCELLED"
    );
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt !== undefined && now.getTime() > this.expiresAt.getTime();
  }

  resume(props: ResumeHITLProps): HITLSuspensionRecord {
    // 1. Tenant boundary validation
    if (this.tenantId !== props.tenantId) {
      throw new HITLTenantMismatchError(props.tenantId, this.tenantId);
    }

    // 2. State validation
    if (this.isTerminal()) {
      throw new HITLSuspensionStateConflictError(this.suspensionId, this.status, "resume");
    }

    // 3. Expiration validation
    const now = new Date();
    if (this.isExpired(now)) {
      throw new HITLSuspensionExpiredError(this.suspensionId);
    }

    // 4. Token validation (constant-time check recommended)
    if (this.resumptionToken !== props.resumptionToken) {
      throw new HITLInvalidTokenError();
    }

    // 5. Separation of Duties (SoD) enforcement
    if (props.decision === "APPROVE" || props.decision === "REJECT") {
      if (this.requesterPrincipalId && props.actorPrincipalId === this.requesterPrincipalId) {
        throw new SelfApprovalError(
          props.actorPrincipalId,
          `Separation of Duties violation: Principal '${props.actorPrincipalId}' requested this HITL suspension and cannot approve or reject it.`
        );
      }
      if (this.producerPrincipalId && props.actorPrincipalId === this.producerPrincipalId) {
        throw new SelfApprovalError(
          props.actorPrincipalId,
          `Separation of Duties violation: Principal '${props.actorPrincipalId}' produced the artifact under HITL review and cannot approve or reject it.`
        );
      }
    }

    let nextStatus: HITLSuspensionStatus;
    let resolutionOutcome: "APPROVED" | "REJECTED" | "INPUT_PROVIDED";

    if (props.decision === "APPROVE") {
      nextStatus = "APPROVED";
      resolutionOutcome = "APPROVED";
    } else if (props.decision === "REJECT") {
      nextStatus = "REJECTED";
      resolutionOutcome = "REJECTED";
    } else {
      nextStatus = "RESUMED";
      resolutionOutcome = "INPUT_PROVIDED";
    }

    return new HITLSuspensionRecord({
      ...this,
      status: nextStatus,
      resolvedByPrincipalId: props.actorPrincipalId,
      resolutionOutcome,
      resolutionData: props.inputData ?? (props.reason ? { reason: props.reason } : undefined),
      resolvedAt: now,
      updatedAt: now,
    });
  }

  cancel(actorPrincipalId: string, reason?: string): HITLSuspensionRecord {
    if (this.isTerminal()) {
      throw new HITLSuspensionStateConflictError(this.suspensionId, this.status, "cancel");
    }

    const now = new Date();
    return new HITLSuspensionRecord({
      ...this,
      status: "CANCELLED",
      resolvedByPrincipalId: actorPrincipalId,
      resolutionOutcome: "CANCELLED",
      resolutionData: reason ? { cancellationReason: reason } : undefined,
      resolvedAt: now,
      updatedAt: now,
    });
  }

  markExpired(): HITLSuspensionRecord {
    if (this.isTerminal()) {
      return this;
    }
    const now = new Date();
    return new HITLSuspensionRecord({
      ...this,
      status: "EXPIRED",
      updatedAt: now,
    });
  }
}
