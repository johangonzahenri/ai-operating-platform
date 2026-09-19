import { DomainEvent, event } from "../events/events.js";
import { ApprovalRequest } from "./approval-request.js";

function getEventReferences(approval: ApprovalRequest): { taskId?: string; executionId?: string } {
  const refs: { taskId?: string; executionId?: string } = {};
  if (approval.taskId) refs.taskId = approval.taskId;
  if (approval.executionId) refs.executionId = approval.executionId;
  return refs;
}

export function createApprovalRequestedEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.requested",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowId: approval.workflowId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      taskId: approval.taskId,
      executionId: approval.executionId,
      verificationResultId: approval.verificationResultId,
      requesterPrincipalId: approval.requesterPrincipalId,
      producerPrincipalId: approval.producerPrincipalId,
      purpose: approval.purpose,
      requiredRole: approval.requiredRole,
      status: approval.status,
      expiresAt: approval.expiresAt?.toISOString(),
      version: approval.version,
    },
    undefined,
    approval.createdAt,
    getEventReferences(approval)
  );
}

export function createApprovalReviewingEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.reviewing",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      reviewerPrincipalId: approval.reviewerPrincipalId,
      status: approval.status,
      version: approval.version,
    },
    undefined,
    approval.updatedAt,
    getEventReferences(approval)
  );
}

export function createApprovalApprovedEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.approved",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      approverPrincipalId: approval.approverPrincipalId,
      status: approval.status,
      reason: approval.decisionReason,
      metadata: approval.decisionMetadata,
      decidedAt: approval.decidedAt?.toISOString(),
      version: approval.version,
    },
    undefined,
    approval.decidedAt ?? approval.updatedAt,
    getEventReferences(approval)
  );
}

export function createApprovalRejectedEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.rejected",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      approverPrincipalId: approval.approverPrincipalId,
      status: approval.status,
      reason: approval.decisionReason,
      metadata: approval.decisionMetadata,
      decidedAt: approval.decidedAt?.toISOString(),
      version: approval.version,
    },
    undefined,
    approval.decidedAt ?? approval.updatedAt,
    getEventReferences(approval)
  );
}

export function createApprovalExpiredEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.expired",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      status: approval.status,
      version: approval.version,
    },
    undefined,
    approval.updatedAt,
    getEventReferences(approval)
  );
}

export function createApprovalCancelledEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.cancelled",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      status: approval.status,
      reason: approval.decisionReason,
      version: approval.version,
    },
    undefined,
    approval.updatedAt,
    getEventReferences(approval)
  );
}

export function createApprovalEscalatedEvent(
  approval: ApprovalRequest,
  traceId: string
): DomainEvent {
  return event(
    "approval.escalated",
    traceId,
    approval.id,
    {
      approvalId: approval.id,
      tenantId: approval.tenantId,
      workflowInstanceId: approval.workflowInstanceId,
      workflowStepId: approval.workflowStepId,
      escalationTarget: approval.escalationTarget,
      status: approval.status,
      reason: approval.decisionReason,
      version: approval.version,
    },
    undefined,
    approval.updatedAt,
    getEventReferences(approval)
  );
}
