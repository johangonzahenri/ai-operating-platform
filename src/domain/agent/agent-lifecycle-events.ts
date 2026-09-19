import { DomainEvent } from "../events/events.js";
import { AgentLifecycle } from "./agent-lifecycle.js";
import { AgentEvaluation } from "./agent-evaluation.js";

export function createAgentEvaluationRequestedEvent(
  evaluation: AgentEvaluation,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.evaluation.requested",
    occurredAt: new Date(),
    traceId,
    aggregateId: evaluation.id,
    payload: {
      evaluationId: evaluation.id,
      tenantId: evaluation.tenantId,
      agentId: evaluation.agentId,
      evaluatedProfileVersion: evaluation.evaluatedProfileVersion,
      evaluatorPrincipalId: evaluation.evaluatorPrincipalId,
      evaluationType: evaluation.evaluationType,
      criteriaReference: evaluation.criteriaReference,
      expiresAt: evaluation.expiresAt?.toISOString(),
      version: evaluation.version,
    },
  };
}

export function createAgentEvaluationCompletedEvent(
  evaluation: AgentEvaluation,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.evaluation.completed",
    occurredAt: new Date(),
    traceId,
    aggregateId: evaluation.id,
    payload: {
      evaluationId: evaluation.id,
      tenantId: evaluation.tenantId,
      agentId: evaluation.agentId,
      evaluatedProfileVersion: evaluation.evaluatedProfileVersion,
      evaluatorPrincipalId: evaluation.evaluatorPrincipalId,
      evaluationType: evaluation.evaluationType,
      verdict: evaluation.verdict,
      criteriaReference: evaluation.criteriaReference,
      evidence: evaluation.evidence,
      evaluatedAt: evaluation.evaluatedAt.toISOString(),
      expiresAt: evaluation.expiresAt?.toISOString(),
      version: evaluation.version,
    },
  };
}

export function createAgentEvaluationExpiredEvent(
  evaluation: AgentEvaluation,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.evaluation.expired",
    occurredAt: new Date(),
    traceId,
    aggregateId: evaluation.id,
    payload: {
      evaluationId: evaluation.id,
      tenantId: evaluation.tenantId,
      agentId: evaluation.agentId,
      evaluatedProfileVersion: evaluation.evaluatedProfileVersion,
      evaluationType: evaluation.evaluationType,
      version: evaluation.version,
    },
  };
}

export function createAgentSuspendedEvent(
  lifecycle: AgentLifecycle,
  operatorPrincipalId: string,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.suspended",
    occurredAt: new Date(),
    traceId,
    aggregateId: lifecycle.agentId,
    payload: {
      agentId: lifecycle.agentId,
      tenantId: lifecycle.tenantId,
      state: lifecycle.state,
      profileVersion: lifecycle.profileVersion,
      suspendedReason: lifecycle.suspendedReason,
      suspendedBy: operatorPrincipalId,
      suspendedAt: lifecycle.suspendedAt?.toISOString(),
      version: lifecycle.version,
    },
  };
}

export function createAgentActivatedEvent(
  lifecycle: AgentLifecycle,
  operatorPrincipalId: string,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.activated",
    occurredAt: new Date(),
    traceId,
    aggregateId: lifecycle.agentId,
    payload: {
      agentId: lifecycle.agentId,
      tenantId: lifecycle.tenantId,
      state: lifecycle.state,
      profileVersion: lifecycle.profileVersion,
      activatedBy: operatorPrincipalId,
      version: lifecycle.version,
    },
  };
}

export function createAgentRevokedEvent(
  lifecycle: AgentLifecycle,
  operatorPrincipalId: string,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.revoked",
    occurredAt: new Date(),
    traceId,
    aggregateId: lifecycle.agentId,
    payload: {
      agentId: lifecycle.agentId,
      tenantId: lifecycle.tenantId,
      state: lifecycle.state,
      profileVersion: lifecycle.profileVersion,
      revokedReason: lifecycle.revokedReason,
      revokedBy: operatorPrincipalId,
      revokedAt: lifecycle.revokedAt?.toISOString(),
      version: lifecycle.version,
    },
  };
}

export function createAgentDeprecatedEvent(
  lifecycle: AgentLifecycle,
  operatorPrincipalId: string,
  traceId: string
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type: "agent.deprecated",
    occurredAt: new Date(),
    traceId,
    aggregateId: lifecycle.agentId,
    payload: {
      agentId: lifecycle.agentId,
      tenantId: lifecycle.tenantId,
      state: lifecycle.state,
      profileVersion: lifecycle.profileVersion,
      deprecatedReason: lifecycle.deprecatedReason,
      deprecatedBy: operatorPrincipalId,
      deprecatedAt: lifecycle.deprecatedAt?.toISOString(),
      version: lifecycle.version,
    },
  };
}
