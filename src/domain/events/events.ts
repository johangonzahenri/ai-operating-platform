export type EventType =
  | "task.created" | "task.started" | "task.completed" | "task.failed" | "task.cancelled"
  | "agent.started" | "agent.completed" | "agent.failed"
  | "model.requested" | "model.completed" | "model.failed"
  | "tool.requested" | "tool.started" | "tool.completed" | "tool.failed";

export interface DomainEvent {
  readonly id: string;
  readonly type: EventType;
  readonly occurredAt: Date;
  readonly traceId: string;
  readonly aggregateId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EventPublisher {
  publish(event: DomainEvent): void;
}

export const event = (
  type: EventType, traceId: string, aggregateId: string, payload: Readonly<Record<string, unknown>> = {},
  id: string = crypto.randomUUID(), occurredAt: Date = new Date(),
): DomainEvent => ({ id, type, traceId, aggregateId, payload, occurredAt });
