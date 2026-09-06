import { DomainEvent } from "../../domain/events/events.js";
import { AuditLog, MetricsCollector, Observation } from "../../domain/observability/observability.js";
/** Infrastructure subscriber: failures are isolated by the existing EventPublisher. */
export class EventObservabilitySubscriber {
  constructor(private readonly audit: AuditLog, private readonly metrics: MetricsCollector) {}
  handle(event: DomainEvent): void { const observation: Observation = { eventId: event.id, occurredAt: event.occurredAt, type: event.type, traceId: event.traceId, aggregateId: event.aggregateId, payload: event.payload, ...(event.taskId ? { taskId: event.taskId } : {}), ...(event.executionId ? { executionId: event.executionId } : {}), ...(typeof event.payload.operationId === "string" ? { operationId: event.payload.operationId } : {}) }; this.audit.record(observation); this.metric(event); }
  private metric(event: DomainEvent): void { const map: Record<string, string> = { "execution.started": "executions.started", "execution.completed": "executions.completed", "execution.failed": "executions.failed", "operation.started": "operations.started", "operation.completed": "operations.completed", "operation.failed": "operations.failed", "model.requested": "model.calls", "tool.execution.started": "tool.calls", "memory.stored": "memory.stores", "memory.retrieved": "memory.retrieves", "memory.deleted": "memory.deletes", "policy.allowed": "policy.allowed", "policy.denied": "policy.denied" }; const metric = map[event.type]; if (metric) this.metrics.increment(metric); }
}
