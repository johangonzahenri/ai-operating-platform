import { MembershipRole } from "../organization/agent-membership.js";
import {
  ApprovalValidationError,
  ApprovalInvalidStateTransitionError,
  SelfApprovalError,
  ApprovalExpiredError,
} from "./approval-errors.js";

export type ApprovalStatus =
  | "REQUESTED"
  | "REVIEWING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED"
  | "ESCALATED";

export interface ApprovalAuthority {
  readonly tenantId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly requiredPermissions?: readonly string[] | undefined;
  readonly operationType?: string | undefined;
  readonly resourceScope?: string | undefined;
}

export interface CreateApprovalRequestProps {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly verificationResultId?: string | undefined;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly purpose: string;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly expiresAt?: Date | undefined;
}

export interface RehydrateApprovalRequestProps {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly verificationResultId?: string | undefined;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly reviewerPrincipalId?: string | undefined;
  readonly approverPrincipalId?: string | undefined;
  readonly purpose: string;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly status: ApprovalStatus;
  readonly decisionReason?: string | undefined;
  readonly decisionMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly escalationTarget?: string | undefined;
  readonly expiresAt?: Date | undefined;
  readonly decidedAt?: Date | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export class ApprovalRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly verificationResultId?: string | undefined;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly reviewerPrincipalId?: string | undefined;
  readonly approverPrincipalId?: string | undefined;
  readonly purpose: string;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly status: ApprovalStatus;
  readonly decisionReason?: string | undefined;
  readonly decisionMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly escalationTarget?: string | undefined;
  readonly expiresAt?: Date | undefined;
  readonly decidedAt?: Date | undefined;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: RehydrateApprovalRequestProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.workflowId = props.workflowId;
    this.workflowInstanceId = props.workflowInstanceId;
    this.workflowStepId = props.workflowStepId;
    this.taskId = props.taskId;
    this.executionId = props.executionId;
    this.verificationResultId = props.verificationResultId;
    this.requesterPrincipalId = props.requesterPrincipalId;
    this.producerPrincipalId = props.producerPrincipalId;
    this.reviewerPrincipalId = props.reviewerPrincipalId;
    this.approverPrincipalId = props.approverPrincipalId;
    this.purpose = props.purpose;
    this.requiredAuthority = props.requiredAuthority;
    this.requiredRole = props.requiredRole;
    this.status = props.status;
    this.decisionReason = props.decisionReason;
    this.decisionMetadata = props.decisionMetadata ? Object.freeze({ ...props.decisionMetadata }) : undefined;
    this.escalationTarget = props.escalationTarget;
    this.expiresAt = props.expiresAt;
    this.decidedAt = props.decidedAt;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: CreateApprovalRequestProps): ApprovalRequest {
    if (!props.id || typeof props.id !== "string" || !ID_REGEX.test(props.id.trim())) {
      throw new ApprovalValidationError("ApprovalRequest id must be a valid alphanumeric string");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || props.tenantId.trim() === "") {
      throw new ApprovalValidationError("ApprovalRequest requires a valid tenantId");
    }
    if (!props.workflowId || typeof props.workflowId !== "string" || props.workflowId.trim() === "") {
      throw new ApprovalValidationError("ApprovalRequest requires a valid workflowId");
    }
    if (!props.workflowInstanceId || typeof props.workflowInstanceId !== "string" || props.workflowInstanceId.trim() === "") {
      throw new ApprovalValidationError("ApprovalRequest requires a valid workflowInstanceId");
    }
    if (!props.workflowStepId || typeof props.workflowStepId !== "string" || props.workflowStepId.trim() === "") {
      throw new ApprovalValidationError("ApprovalRequest requires a valid workflowStepId");
    }
    if (!props.requesterPrincipalId || typeof props.requesterPrincipalId !== "string" || props.requesterPrincipalId.trim() === "") {
      throw new ApprovalValidationError("ApprovalRequest requires a valid requesterPrincipalId");
    }
    if (!props.purpose || typeof props.purpose !== "string" || props.purpose.trim() === "") {
      throw new ApprovalValidationError("ApprovalRequest requires a non-empty purpose");
    }

    const now = new Date();
    return new ApprovalRequest({
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      workflowId: props.workflowId.trim(),
      workflowInstanceId: props.workflowInstanceId.trim(),
      workflowStepId: props.workflowStepId.trim(),
      taskId: props.taskId?.trim(),
      executionId: props.executionId?.trim(),
      verificationResultId: props.verificationResultId?.trim(),
      requesterPrincipalId: props.requesterPrincipalId.trim(),
      producerPrincipalId: props.producerPrincipalId?.trim(),
      reviewerPrincipalId: undefined,
      approverPrincipalId: undefined,
      purpose: props.purpose.trim(),
      requiredAuthority: props.requiredAuthority,
      requiredRole: props.requiredRole,
      status: "REQUESTED",
      decisionReason: undefined,
      decisionMetadata: undefined,
      escalationTarget: undefined,
      expiresAt: props.expiresAt,
      decidedAt: undefined,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateApprovalRequestProps): ApprovalRequest {
    return new ApprovalRequest(props);
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt ? now.getTime() > this.expiresAt.getTime() : false;
  }

  isPending(): boolean {
    return this.status === "REQUESTED" || this.status === "REVIEWING";
  }

  isApproved(): boolean {
    return this.status === "APPROVED";
  }

  startReview(reviewerId: string, now: Date = new Date()): ApprovalRequest {
    if (this.status !== "REQUESTED") {
      throw new ApprovalInvalidStateTransitionError(this.id, this.status, "REVIEWING");
    }
    if (this.isExpired(now)) {
      throw new ApprovalExpiredError(this.id);
    }
    if (!reviewerId || typeof reviewerId !== "string" || reviewerId.trim() === "") {
      throw new ApprovalValidationError("Reviewer id must be a non-empty string");
    }

    const cleanReviewer = reviewerId.trim();

    return new ApprovalRequest({
      ...this,
      reviewerPrincipalId: cleanReviewer,
      status: "REVIEWING",
      version: this.version + 1,
      updatedAt: now,
    });
  }

  approve(
    approverId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
    now: Date = new Date()
  ): ApprovalRequest {
    if (this.status !== "REQUESTED" && this.status !== "REVIEWING") {
      throw new ApprovalInvalidStateTransitionError(this.id, this.status, "APPROVED");
    }
    if (this.isExpired(now)) {
      throw new ApprovalExpiredError(this.id);
    }
    if (!approverId || typeof approverId !== "string" || approverId.trim() === "") {
      throw new ApprovalValidationError("Approver id must be a non-empty string");
    }

    const cleanApprover = approverId.trim();

    // Segregation of duties invariant: Requester cannot approve
    if (cleanApprover === this.requesterPrincipalId) {
      throw new SelfApprovalError(
        cleanApprover,
        `Self-approval rejected: Requester '${cleanApprover}' cannot approve their own request`
      );
    }

    // Segregation of duties invariant: Producer cannot approve
    if (this.producerPrincipalId && cleanApprover === this.producerPrincipalId) {
      throw new SelfApprovalError(
        cleanApprover,
        `Self-approval rejected: Producer '${cleanApprover}' cannot approve output they generated`
      );
    }

    return new ApprovalRequest({
      ...this,
      approverPrincipalId: cleanApprover,
      status: "APPROVED",
      decisionReason: reason?.trim(),
      decisionMetadata: metadata,
      decidedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  reject(
    rejecterId: string,
    reason: string,
    metadata?: Record<string, unknown>,
    now: Date = new Date()
  ): ApprovalRequest {
    if (this.status !== "REQUESTED" && this.status !== "REVIEWING") {
      throw new ApprovalInvalidStateTransitionError(this.id, this.status, "REJECTED");
    }
    if (this.isExpired(now)) {
      throw new ApprovalExpiredError(this.id);
    }
    if (!rejecterId || typeof rejecterId !== "string" || rejecterId.trim() === "") {
      throw new ApprovalValidationError("Rejecter id must be a non-empty string");
    }
    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      throw new ApprovalValidationError("Rejection requires an explicit reason");
    }

    const cleanRejecter = rejecterId.trim();

    return new ApprovalRequest({
      ...this,
      approverPrincipalId: cleanRejecter,
      status: "REJECTED",
      decisionReason: reason.trim(),
      decisionMetadata: metadata,
      decidedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  escalate(targetId: string, reason: string, now: Date = new Date()): ApprovalRequest {
    if (this.status !== "REQUESTED" && this.status !== "REVIEWING") {
      throw new ApprovalInvalidStateTransitionError(this.id, this.status, "ESCALATED");
    }
    if (!targetId || typeof targetId !== "string" || targetId.trim() === "") {
      throw new ApprovalValidationError("Escalation target must be a non-empty string");
    }
    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      throw new ApprovalValidationError("Escalation requires an explicit reason");
    }

    return new ApprovalRequest({
      ...this,
      escalationTarget: targetId.trim(),
      status: "ESCALATED",
      decisionReason: reason.trim(),
      version: this.version + 1,
      updatedAt: now,
    });
  }

  expire(now: Date = new Date()): ApprovalRequest {
    if (this.status !== "REQUESTED" && this.status !== "REVIEWING") {
      throw new ApprovalInvalidStateTransitionError(this.id, this.status, "EXPIRED");
    }

    return new ApprovalRequest({
      ...this,
      status: "EXPIRED",
      decidedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }

  cancel(reason?: string, now: Date = new Date()): ApprovalRequest {
    if (this.status !== "REQUESTED" && this.status !== "REVIEWING") {
      throw new ApprovalInvalidStateTransitionError(this.id, this.status, "CANCELLED");
    }

    return new ApprovalRequest({
      ...this,
      status: "CANCELLED",
      decisionReason: reason?.trim() ?? "Cancelled by requester or system",
      decidedAt: now,
      version: this.version + 1,
      updatedAt: now,
    });
  }
}
