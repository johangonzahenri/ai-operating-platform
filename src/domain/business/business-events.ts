/**
 * AI Operating Platform - Business Domain Events
 */

import { randomUUID } from "node:crypto";
import { DomainEvent } from "../events/events.js";

export function createEnterpriseCreatedEvent(
  enterpriseId: string,
  tenantId: string,
  name: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "enterprise.created",
    traceId: traceId ?? randomUUID(),
    aggregateId: enterpriseId,
    occurredAt: new Date(),
    payload: {
      enterpriseId,
      tenantId,
      name,
    },
  };
}

export function createBusinessObjectiveCreatedEvent(
  objectiveId: string,
  tenantId: string,
  enterpriseId: string,
  title: string,
  type: string,
  ownerPrincipalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "objective.created",
    traceId: traceId ?? randomUUID(),
    aggregateId: objectiveId,
    occurredAt: new Date(),
    payload: {
      objectiveId,
      tenantId,
      enterpriseId,
      title,
      type,
      ownerPrincipalId,
    },
  };
}

export function createBusinessObjectiveStateChangedEvent(
  objectiveId: string,
  tenantId: string,
  fromState: string,
  toState: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "objective.state_changed",
    traceId: traceId ?? randomUUID(),
    aggregateId: objectiveId,
    occurredAt: new Date(),
    payload: {
      objectiveId,
      tenantId,
      fromState,
      toState,
    },
  };
}

export function createBusinessInitiativeCreatedEvent(
  initiativeId: string,
  tenantId: string,
  enterpriseId: string,
  objectiveId: string,
  title: string,
  ownerPrincipalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "initiative.created",
    traceId: traceId ?? randomUUID(),
    aggregateId: initiativeId,
    occurredAt: new Date(),
    payload: {
      initiativeId,
      tenantId,
      enterpriseId,
      objectiveId,
      title,
      ownerPrincipalId,
    },
  };
}

export function createBusinessInitiativeStateChangedEvent(
  initiativeId: string,
  tenantId: string,
  fromState: string,
  toState: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "initiative.state_changed",
    traceId: traceId ?? randomUUID(),
    aggregateId: initiativeId,
    occurredAt: new Date(),
    payload: {
      initiativeId,
      tenantId,
      fromState,
      toState,
    },
  };
}

export function createBusinessMetricUpdatedEvent(
  metricId: string,
  tenantId: string,
  objectiveId: string,
  name: string,
  currentValue: number,
  gap: number | undefined,
  status: string,
  source: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "metric.updated",
    traceId: traceId ?? randomUUID(),
    aggregateId: metricId,
    occurredAt: new Date(),
    payload: {
      metricId,
      tenantId,
      objectiveId,
      name,
      currentValue,
      gap,
      status,
      source,
    },
  };
}

export function createExecutiveDecisionRecordedEvent(
  decisionId: string,
  tenantId: string,
  enterpriseId: string,
  decisionMakerPrincipalId: string,
  authorityScope: string,
  decisionType: string,
  targetType: string,
  targetId: string,
  rationale: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "decision.recorded",
    traceId: traceId ?? randomUUID(),
    aggregateId: decisionId,
    occurredAt: new Date(),
    payload: {
      decisionId,
      tenantId,
      enterpriseId,
      decisionMakerPrincipalId,
      authorityScope,
      decisionType,
      targetType,
      targetId,
      rationale,
    },
  };
}
