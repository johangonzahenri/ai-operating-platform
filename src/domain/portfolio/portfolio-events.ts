/**
 * AI Operating Platform - Portfolio Domain Events
 */

import { randomUUID } from "node:crypto";
import { DomainEvent } from "../events/events.js";

export function createPortfolioCreatedEvent(
  portfolioId: string,
  tenantId: string,
  name: string,
  ownerPrincipalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "portfolio.created",
    traceId: traceId ?? randomUUID(),
    aggregateId: portfolioId,
    occurredAt: new Date(),
    payload: {
      portfolioId,
      tenantId,
      name,
      ownerPrincipalId,
    },
  };
}

export function createPortfolioEnterpriseAddedEvent(
  portfolioId: string,
  tenantId: string,
  enterpriseId: string,
  governanceScope: readonly string[],
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "portfolio.enterprise_added",
    traceId: traceId ?? randomUUID(),
    aggregateId: portfolioId,
    occurredAt: new Date(),
    payload: {
      portfolioId,
      tenantId,
      enterpriseId,
      governanceScope,
    },
  };
}

export function createPortfolioEnterpriseRemovedEvent(
  portfolioId: string,
  tenantId: string,
  enterpriseId: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "portfolio.enterprise_removed",
    traceId: traceId ?? randomUUID(),
    aggregateId: portfolioId,
    occurredAt: new Date(),
    payload: {
      portfolioId,
      tenantId,
      enterpriseId,
    },
  };
}

export function createGovernanceMandateGrantedEvent(
  mandateId: string,
  tenantId: string,
  portfolioId: string,
  sourceEnterpriseId: string,
  targetEnterpriseIds: readonly string[],
  granteePrincipalId: string,
  authorityScope: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "mandate.granted",
    traceId: traceId ?? randomUUID(),
    aggregateId: mandateId,
    occurredAt: new Date(),
    payload: {
      mandateId,
      tenantId,
      portfolioId,
      sourceEnterpriseId,
      targetEnterpriseIds,
      granteePrincipalId,
      authorityScope,
    },
  };
}

export function createGovernanceMandateRevokedEvent(
  mandateId: string,
  tenantId: string,
  portfolioId: string,
  reason?: string,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "mandate.revoked",
    traceId: traceId ?? randomUUID(),
    aggregateId: mandateId,
    occurredAt: new Date(),
    payload: {
      mandateId,
      tenantId,
      portfolioId,
      reason,
    },
  };
}

export function createPortfolioObjectiveCreatedEvent(
  objectiveId: string,
  tenantId: string,
  portfolioId: string,
  title: string,
  type: string,
  ownerPrincipalId: string,
  participatingEnterpriseIds: readonly string[],
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "portfolio_objective.created",
    traceId: traceId ?? randomUUID(),
    aggregateId: objectiveId,
    occurredAt: new Date(),
    payload: {
      objectiveId,
      tenantId,
      portfolioId,
      title,
      type,
      ownerPrincipalId,
      participatingEnterpriseIds,
    },
  };
}

export function createPortfolioObjectiveAggregatedEvent(
  objectiveId: string,
  tenantId: string,
  portfolioId: string,
  aggregatedValue: number | undefined,
  gap: number | undefined,
  participatingCount: number,
  missingCount: number,
  traceId?: string
): DomainEvent {
  return {
    id: randomUUID(),
    type: "portfolio_objective.aggregated",
    traceId: traceId ?? randomUUID(),
    aggregateId: objectiveId,
    occurredAt: new Date(),
    payload: {
      objectiveId,
      tenantId,
      portfolioId,
      aggregatedValue,
      gap,
      participatingCount,
      missingCount,
    },
  };
}
