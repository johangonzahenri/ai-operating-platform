/**
 * AI Operating Platform - Mandate Reconciliation Domain Events
 */

import { randomUUID } from "node:crypto";
import { DomainEvent } from "../events/events.js";

export function createMandateReconciliationStartedEvent(
  reconciliationId: string,
  tenantId: string,
  mandateId: string,
  triggerType: string,
  portfolioId: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "mandate.reconciliation.started",
    traceId: traceId ?? randomUUID(),
    aggregateId: reconciliationId,
    occurredAt: new Date(),
    payload: {
      reconciliationId,
      tenantId,
      mandateId,
      triggerType,
      portfolioId,
    },
  };
}

export function createMandateReconciliationCompletedEvent(
  reconciliationId: string,
  tenantId: string,
  mandateId: string,
  triggerType: string,
  portfolioId: string,
  summary: {
    readonly totalEvaluated: number;
    readonly totalMutated: number;
    readonly totalCancelled: number;
    readonly totalPaused: number;
    readonly totalSkipped: number;
  },
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "mandate.reconciliation.completed",
    traceId: traceId ?? randomUUID(),
    aggregateId: reconciliationId,
    occurredAt: new Date(),
    payload: {
      reconciliationId,
      tenantId,
      mandateId,
      triggerType,
      portfolioId,
      ...summary,
    },
  };
}

export function createWorkflowReconciledEvent(
  workflowInstanceId: string,
  tenantId: string,
  mandateId: string,
  previousStatus: string,
  resultingStatus: string,
  reconciliationReason: string,
  actionApplied: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "workflow.reconciled",
    traceId: traceId ?? randomUUID(),
    aggregateId: workflowInstanceId,
    occurredAt: new Date(),
    payload: {
      workflowInstanceId,
      tenantId,
      mandateId,
      previousStatus,
      resultingStatus,
      reconciliationReason,
      actionApplied,
    },
  };
}

export function createApprovalRequestReconciledEvent(
  approvalRequestId: string,
  tenantId: string,
  mandateId: string,
  previousStatus: string,
  resultingStatus: string,
  reconciliationReason: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "approval_request.reconciled",
    traceId: traceId ?? randomUUID(),
    aggregateId: approvalRequestId,
    occurredAt: new Date(),
    payload: {
      approvalRequestId,
      tenantId,
      mandateId,
      previousStatus,
      resultingStatus,
      reconciliationReason,
    },
  };
}
