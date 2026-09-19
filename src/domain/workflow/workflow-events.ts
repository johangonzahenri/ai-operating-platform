import crypto from "node:crypto";
import { DomainEvent, event } from "../events/events.js";
import { WorkflowDefinition } from "./workflow-definition.js";
import { WorkflowInstance, WorkflowStepState } from "./workflow-instance.js";
import { VerificationResult } from "./verification-result.js";

export function createWorkflowCreatedEvent(
  definition: WorkflowDefinition,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.created",
    traceId,
    definition.id,
    {
      workflowDefinitionId: definition.id,
      tenantId: definition.tenantId,
      organizationId: definition.organizationId,
      name: definition.name,
      version: definition.version,
      status: definition.status,
      stepCount: definition.steps.length,
    }
  );
}

export function createWorkflowUpdatedEvent(
  definition: WorkflowDefinition,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.updated",
    traceId,
    definition.id,
    {
      workflowDefinitionId: definition.id,
      tenantId: definition.tenantId,
      organizationId: definition.organizationId,
      name: definition.name,
      version: definition.version,
      status: definition.status,
      stepCount: definition.steps.length,
    }
  );
}

export function createWorkflowStartedEvent(
  instance: WorkflowInstance,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.started",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      workflowDefinitionVersion: instance.workflowDefinitionVersion,
      tenantId: instance.tenantId,
      organizationId: instance.organizationId,
      initiatorId: instance.initiatorId,
      stepCount: Object.keys(instance.stepStates).length,
    }
  );
}

export function createWorkflowStepStartedEvent(
  instance: WorkflowInstance,
  stepState: WorkflowStepState,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  const references: { taskId?: string; executionId?: string } = {};
  if (stepState.taskId) references.taskId = stepState.taskId;
  if (stepState.executionId) references.executionId = stepState.executionId;

  return event(
    "workflow.step.started",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      stepId: stepState.stepId,
      assignedAgentId: stepState.assignedAgentId,
      assignedTeamId: stepState.assignedTeamId,
      taskId: stepState.taskId,
      executionId: stepState.executionId,
      coordinationId: stepState.coordinationId,
      attempts: stepState.attempts,
      startedAt: stepState.startedAt?.toISOString(),
    },
    crypto.randomUUID(),
    new Date(),
    references
  );
}

export function createWorkflowStepCompletedEvent(
  instance: WorkflowInstance,
  stepState: WorkflowStepState,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  const references: { taskId?: string; executionId?: string } = {};
  if (stepState.taskId) references.taskId = stepState.taskId;
  if (stepState.executionId) references.executionId = stepState.executionId;

  return event(
    "workflow.step.completed",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      stepId: stepState.stepId,
      assignedAgentId: stepState.assignedAgentId,
      assignedTeamId: stepState.assignedTeamId,
      taskId: stepState.taskId,
      executionId: stepState.executionId,
      output: stepState.output,
      completedAt: stepState.completedAt?.toISOString(),
    },
    crypto.randomUUID(),
    new Date(),
    references
  );
}

export function createWorkflowStepFailedEvent(
  instance: WorkflowInstance,
  stepState: WorkflowStepState,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  const references: { taskId?: string; executionId?: string } = {};
  if (stepState.taskId) references.taskId = stepState.taskId;
  if (stepState.executionId) references.executionId = stepState.executionId;

  return event(
    "workflow.step.failed",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      stepId: stepState.stepId,
      assignedAgentId: stepState.assignedAgentId,
      taskId: stepState.taskId,
      executionId: stepState.executionId,
      error: stepState.error,
      attempts: stepState.attempts,
    },
    crypto.randomUUID(),
    new Date(),
    references
  );
}

export function createWorkflowCompletedEvent(
  instance: WorkflowInstance,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.completed",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      initiatorId: instance.initiatorId,
      completedAt: instance.completedAt?.toISOString(),
      output: instance.output,
    }
  );
}

export function createWorkflowFailedEvent(
  instance: WorkflowInstance,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.failed",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      failure: instance.failure,
      completedAt: instance.completedAt?.toISOString(),
    }
  );
}

export function createWorkflowCancelledEvent(
  instance: WorkflowInstance,
  reason?: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.cancelled",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      reason,
      completedAt: instance.completedAt?.toISOString(),
    }
  );
}

export function createWorkflowStepVerificationRequestedEvent(
  instance: WorkflowInstance,
  stepId: string,
  verificationId: string,
  verifierPrincipalId: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.step.verification.requested",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      stepId,
      verificationId,
      verifierPrincipalId,
    }
  );
}

export function createWorkflowStepVerificationCompletedEvent(
  instance: WorkflowInstance,
  verification: VerificationResult,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  const references: { taskId?: string; executionId?: string } = {};
  if (verification.taskId) references.taskId = verification.taskId;
  if (verification.executionId) references.executionId = verification.executionId;

  return event(
    "workflow.step.verification.completed",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      stepId: verification.workflowStepId,
      verificationId: verification.id,
      verdict: verification.verdict,
      method: verification.method,
      verifierPrincipalId: verification.verifierPrincipalId,
      verifierSource: verification.verifierSource,
      evidence: verification.evidence,
      reason: verification.reason,
      verifiedAt: verification.verifiedAt.toISOString(),
    },
    crypto.randomUUID(),
    new Date(),
    references
  );
}

export function createWorkflowStepVerificationFailedEvent(
  instance: WorkflowInstance,
  stepId: string,
  verificationId: string,
  verdict: string,
  error: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "workflow.step.verification.failed",
    traceId,
    instance.id,
    {
      workflowInstanceId: instance.id,
      workflowDefinitionId: instance.workflowDefinitionId,
      tenantId: instance.tenantId,
      stepId,
      verificationId,
      verdict,
      error,
    }
  );
}
