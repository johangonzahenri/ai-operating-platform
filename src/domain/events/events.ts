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
  | "model.tool.call.requested" | "model.tool.call.authorized" | "model.tool.call.rejected"
  | "model.tool.result.returned" | "model.final.response"
  | "coordination.started" | "coordination.agent.selected" | "coordination.handoff.requested"
  | "coordination.handoff.accepted" | "coordination.handoff.rejected"
  | "coordination.agent.completed" | "coordination.agent.failed"
  | "coordination.completed" | "coordination.failed";

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
