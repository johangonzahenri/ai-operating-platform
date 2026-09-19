import crypto from "node:crypto";

export type EventType =
  | "task.created" | "task.started" | "task.completed" | "task.failed" | "task.cancelled"
  | "execution.created" | "execution.started" | "execution.completed" | "execution.failed" | "execution.cancelled"
  | "orchestration.started" | "orchestration.completed" | "orchestration.failed" | "orchestration.cancelled"
  | "operation.started" | "operation.step_completed" | "operation.completed" | "operation.failed" | "operation.cancelled" | "operation.budget_exhausted"
  | "context.created" | "context.updated" | "memory.stored" | "memory.retrieved" | "memory.deleted" | "memory.failed"
  | "policy.evaluated" | "policy.allowed" | "policy.denied"
  | "agent.started" | "agent.completed" | "agent.failed"
  | "model.requested" | "model.completed" | "model.failed"
  | "tool.execution.started" | "tool.execution.completed" | "tool.execution.failed"
  | "tool.requested" | "tool.started" | "tool.completed" | "tool.failed"
  | "tool.registered" | "tool.unregistered" | "tool.invocation.requested" | "tool.authorized" | "tool.rejected"
  | "tool.execution.timed_out" | "tool.execution.cancelled" | "tool.approval_required"
  | "model.tool.call.requested" | "model.tool.call.authorized" | "model.tool.call.rejected"
  | "model.tool.result.returned" | "model.final.response"
  | "coordination.requested" | "coordination.authorized" | "coordination.rejected"
  | "coordination.started" | "coordination.agent.selected" | "coordination.handoff.requested"
  | "coordination.handoff.accepted" | "coordination.handoff.rejected"
  | "coordination.agent.completed" | "coordination.agent.failed"
  | "coordination.completed" | "coordination.failed"
    | "auth.succeeded" | "auth.failed" | "auth.revoked" | "auth.expired"
  | "authorization.allowed" | "authorization.denied"
  | "plan.requested" | "plan.generated" | "plan.validated" | "plan.rejected" | "plan.accepted" | "plan.execution_started"
  | "device.registered" | "device.unregistered" | "device.health_checked"
  | "print.job.created" | "print.job.started" | "print.job.completed" | "print.job.failed" | "print.job.cancelled"
  | "organization.created" | "organization.updated" | "organization.status_changed"
  | "area.created" | "area.updated"
  | "team.created" | "team.updated"
  | "agent.assigned_to_team" | "agent.removed_from_team"
  | "agent.profile.created" | "agent.profile.updated" | "agent.role.changed" | "agent.responsibility.changed"
  | "agent.capability.added" | "agent.capability.removed" | "agent.capability.verified"
  | "team.budget.created" | "team.budget.updated" | "team.budget.exhausted" | "team.budget.status_changed"
  | "team.resource.consumption.authorized" | "team.resource.consumption.denied"
  | "workflow.created" | "workflow.updated" | "workflow.started"
  | "workflow.step.started" | "workflow.step.completed" | "workflow.step.failed"
  | "workflow.step.verification.requested" | "workflow.step.verification.completed" | "workflow.step.verification.failed"
  | "workflow.completed" | "workflow.failed" | "workflow.cancelled";


export interface DomainEvent {
  readonly id: string;
  readonly type: EventType;
  readonly occurredAt: Date;
  readonly traceId: string;
  readonly aggregateId: string;
  readonly taskId?: string;
  readonly executionId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EventPublisher {
  publish(event: DomainEvent): void;
}

export const event = (
  type: EventType, traceId: string, aggregateId: string, payload: Readonly<Record<string, unknown>> = {},
  id: string = crypto.randomUUID(), occurredAt: Date = new Date(), references: Readonly<{ taskId?: string; executionId?: string }> = {},
): DomainEvent => ({ id, type, traceId, aggregateId, payload, occurredAt, ...references });
