/**
 * AI Operating Platform - Executive Domain Events
 */

import { DomainEvent, event } from "../events/events.js";

export function createExecutiveCycleStartedEvent(
  cycleId: string,
  tenantId: string,
  enterpriseId: string,
  traceId: string
): DomainEvent {
  return event("executive.cycle.started", traceId, cycleId, {
    cycleId,
    tenantId,
    enterpriseId,
  });
}

export function createExecutiveSignalDetectedEvent(
  cycleId: string,
  signalId: string,
  signalType: string,
  targetId: string,
  traceId: string
): DomainEvent {
  return event("executive.signal.detected", traceId, cycleId, {
    cycleId,
    signalId,
    signalType,
    targetId,
  });
}

export function createExecutiveAnalysisCreatedEvent(
  cycleId: string,
  analysisId: string,
  recommendedAction: string,
  traceId: string
): DomainEvent {
  return event("executive.analysis.created", traceId, cycleId, {
    cycleId,
    analysisId,
    recommendedAction,
  });
}

export function createExecutivePlanCreatedEvent(
  cycleId: string,
  planId: string,
  actionCount: number,
  traceId: string
): DomainEvent {
  return event("executive.plan.created", traceId, cycleId, {
    cycleId,
    planId,
    actionCount,
  });
}

export function createExecutivePlanValidatedEvent(
  cycleId: string,
  planId: string,
  traceId: string
): DomainEvent {
  return event("executive.plan.validated", traceId, cycleId, {
    cycleId,
    planId,
  });
}

export function createExecutivePlanRejectedEvent(
  cycleId: string,
  planId: string,
  reason: string,
  traceId: string
): DomainEvent {
  return event("executive.plan.rejected", traceId, cycleId, {
    cycleId,
    planId,
    reason,
  });
}

export function createExecutiveActionStartedEvent(
  cycleId: string,
  actionId: string,
  actionType: string,
  traceId: string
): DomainEvent {
  return event("executive.action.started", traceId, cycleId, {
    cycleId,
    actionId,
    actionType,
  });
}

export function createExecutiveActionCompletedEvent(
  cycleId: string,
  actionId: string,
  outcome: string,
  traceId: string
): DomainEvent {
  return event("executive.action.completed", traceId, cycleId, {
    cycleId,
    actionId,
    outcome,
  });
}

export function createExecutiveReassessmentRequestedEvent(
  cycleId: string,
  replanningCount: number,
  reason: string,
  traceId: string
): DomainEvent {
  return event("executive.reassessment.requested", traceId, cycleId, {
    cycleId,
    replanningCount,
    reason,
  });
}

export function createExecutiveCycleCompletedEvent(
  cycleId: string,
  outcomeSummary: string,
  traceId: string
): DomainEvent {
  return event("executive.cycle.completed", traceId, cycleId, {
    cycleId,
    outcomeSummary,
  });
}

export function createExecutiveCycleFailedEvent(
  cycleId: string,
  reason: string,
  traceId: string
): DomainEvent {
  return event("executive.cycle.failed", traceId, cycleId, {
    cycleId,
    reason,
  });
}

export function createExecutiveCycleBlockedEvent(
  cycleId: string,
  reason: string,
  traceId: string
): DomainEvent {
  return event("executive.cycle.blocked", traceId, cycleId, {
    cycleId,
    reason,
  });
}
