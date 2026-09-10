import {
  AuditQueryOptions,
  DurableEvent,
  DurableEventQueryPort,
  DurableEventStore,
  NewDurableEvent,
} from "../../application/ports/durable-event-port.js";

/**
 * Transient in-memory implementation of DurableEventStore & DurableEventQueryPort.
 * Primarily used for isolated unit testing and volatile execution mode.
 */
export class InMemoryEventStore implements DurableEventStore, DurableEventQueryPort {
  private readonly events: DurableEvent[] = [];
  private currentSequence = 0;

  append(event: NewDurableEvent): DurableEvent {
    if (this.events.some((e) => e.eventId === event.eventId)) {
      throw new Error(`Duplicate eventId: ${event.eventId}`);
    }

    const stored: DurableEvent = {
      sequenceNumber: ++this.currentSequence,
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      traceId: event.traceId,
      correlationId: event.correlationId,
      causationId: event.causationId,
      occurredAt: event.occurredAt ?? new Date(),
      payload: Object.freeze({ ...event.payload }),
      schemaVersion: event.schemaVersion ?? 1,
    };
    this.events.push(stored);
    return stored;
  }

  appendBatch(events: readonly NewDurableEvent[]): readonly DurableEvent[] {
    return events.map((e) => this.append(e));
  }

  getEventsByTask(taskId: string): readonly DurableEvent[] {
    return this.events.filter(
      (e) =>
        (e.aggregateType === "task" && e.aggregateId === taskId) ||
        (e.payload as Record<string, unknown>)?.taskId === taskId
    );
  }

  getEventsByExecution(executionId: string): readonly DurableEvent[] {
    return this.events.filter(
      (e) =>
        (e.aggregateType === "execution" && e.aggregateId === executionId) ||
        (e.payload as Record<string, unknown>)?.executionId === executionId
    );
  }

  getEventsByAgent(agentId: string): readonly DurableEvent[] {
    return this.events.filter(
      (e) =>
        (e.aggregateType === "agent" && e.aggregateId === agentId) ||
        (e.payload as Record<string, unknown>)?.agentId === agentId
    );
  }

  getEventsByTrace(traceId: string): readonly DurableEvent[] {
    return this.events.filter((e) => e.traceId === traceId);
  }

  getEventsByCorrelation(correlationId: string): readonly DurableEvent[] {
    return this.events.filter((e) => e.correlationId === correlationId);
  }

  getEventsByType(eventType: string): readonly DurableEvent[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  getAllEvents(): readonly DurableEvent[] {
    return [...this.events];
  }

  getEventsByTimeRange(from: Date, to: Date): readonly DurableEvent[] {
    return this.query({ from, to });
  }

  query(options: AuditQueryOptions): readonly DurableEvent[] {
    let result = this.events.filter((e) => {
      if (options.taskId) {
        const matchesTask =
          (e.aggregateType === "task" && e.aggregateId === options.taskId) ||
          (e.payload as Record<string, unknown>)?.taskId === options.taskId;
        if (!matchesTask) return false;
      }
      if (options.executionId) {
        const matchesExec =
          (e.aggregateType === "execution" && e.aggregateId === options.executionId) ||
          (e.payload as Record<string, unknown>)?.executionId === options.executionId;
        if (!matchesExec) return false;
      }
      if (options.agentId) {
        const matchesAgent =
          (e.aggregateType === "agent" && e.aggregateId === options.agentId) ||
          (e.payload as Record<string, unknown>)?.agentId === options.agentId;
        if (!matchesAgent) return false;
      }
      if (options.traceId && e.traceId !== options.traceId) {
        return false;
      }
      if (options.correlationId && e.correlationId !== options.correlationId) {
        return false;
      }
      if (options.eventType && e.eventType !== options.eventType) {
        return false;
      }
      if (options.aggregateType && e.aggregateType !== options.aggregateType) {
        return false;
      }
      if (options.from && e.occurredAt.getTime() < options.from.getTime()) {
        return false;
      }
      if (options.to && e.occurredAt.getTime() > options.to.getTime()) {
        return false;
      }
      if (options.afterSequence !== undefined && e.sequenceNumber <= options.afterSequence) {
        return false;
      }
      if (options.beforeSequence !== undefined && e.sequenceNumber >= options.beforeSequence) {
        return false;
      }
      return true;
    });

    result.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    if (options.limit !== undefined && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }
}
