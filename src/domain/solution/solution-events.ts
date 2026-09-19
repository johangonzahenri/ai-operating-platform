/**
 * AI Operating Platform - AI Solution Domain Events
 * 
 * Factory functions for durable, auditable, and traceable solution events.
 */

import { DomainEvent } from "../events/events.js";
import { AISolution } from "./ai-solution.js";
import { SolutionBlueprintValidationReport } from "./solution-blueprint.js";
import { SolutionInstance } from "./solution-instance.js";

export function createSolutionCreatedEvent(
  solution: AISolution,
  principalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.created",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      name: solution.name,
      version: solution.version,
      lifecycleState: solution.lifecycleState,
      ownerPrincipalId: solution.ownerPrincipalId,
      principalId,
    },
  };
}

export function createSolutionUpdatedEvent(
  solution: AISolution,
  principalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.updated",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      name: solution.name,
      version: solution.version,
      lifecycleState: solution.lifecycleState,
      concurrencyVersion: solution.concurrencyVersion,
      principalId,
    },
  };
}

export function createSolutionValidationStartedEvent(
  solution: AISolution,
  principalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.validation.started",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      version: solution.version,
      principalId,
    },
  };
}

export function createSolutionValidationCompletedEvent(
  solution: AISolution,
  report: SolutionBlueprintValidationReport,
  principalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.validation.completed",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      version: solution.version,
      valid: report.valid,
      errorsCount: report.errors.length,
      warningsCount: report.warnings.length,
      principalId,
    },
  };
}

export function createSolutionPublishedEvent(
  solution: AISolution,
  principalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.published",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      version: solution.version,
      publishedAt: solution.publishedAt?.toISOString(),
      principalId,
    },
  };
}

export function createSolutionArchivedEvent(
  solution: AISolution,
  principalId: string,
  reason?: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.archived",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      version: solution.version,
      reason,
      principalId,
    },
  };
}

export function createSolutionDeprecatedEvent(
  solution: AISolution,
  principalId: string,
  reason?: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.deprecated",
    occurredAt: new Date(),
    aggregateId: solution.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      solutionId: solution.id,
      tenantId: solution.tenantId,
      version: solution.version,
      reason,
      principalId,
    },
  };
}

export function createSolutionInstanceCreatedEvent(
  instance: SolutionInstance,
  principalId: string,
  traceId?: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "solution.instance.created",
    occurredAt: new Date(),
    aggregateId: instance.id,
    traceId: traceId ?? crypto.randomUUID(),
    payload: {
      instanceId: instance.id,
      solutionId: instance.solutionId,
      solutionVersion: instance.solutionVersion,
      tenantId: instance.tenantId,
      status: instance.status,
      principalId,
    },
  };
}
