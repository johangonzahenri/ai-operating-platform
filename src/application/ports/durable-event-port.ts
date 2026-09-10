/**
 * Immutable historical record of an event persisted in durable storage.
 */
export interface DurableEvent {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly schemaVersion: number;
}

/**
 * Data required to append a new event before sequence_number is assigned by storage.
 */
export interface NewDurableEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt?: Date | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly schemaVersion?: number | undefined;
}

/**
 * Append-only port for committing durable events to storage.
 * Explicitly omits update and delete methods to guarantee immutable ledger semantics.
 */
export interface DurableEventStore {
  append(event: NewDurableEvent): DurableEvent;
  appendBatch(events: readonly NewDurableEvent[]): readonly DurableEvent[];
}

/**
 * Multi-criteria filter and pagination options for durable event queries.
 */
export interface AuditQueryOptions {
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly eventType?: string | undefined;
  readonly aggregateType?: string | undefined;
  readonly aggregateId?: string | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly afterSequence?: number | undefined;
  readonly beforeSequence?: number | undefined;
  readonly limit?: number | undefined;
}

/**
 * Semantic query port for querying historical audit events by aggregate, trace, type,
 * time range, or structured multi-criteria filtering with deterministic sequence pagination.
 */
export interface DurableEventQueryPort {
  getEventsByTask(taskId: string): readonly DurableEvent[];
  getEventsByExecution(executionId: string): readonly DurableEvent[];
  getEventsByAgent(agentId: string): readonly DurableEvent[];
  getEventsByTrace(traceId: string): readonly DurableEvent[];
  getEventsByCorrelation(correlationId: string): readonly DurableEvent[];
  getEventsByType(eventType: string): readonly DurableEvent[];
  getAllEvents(): readonly DurableEvent[];
  getEventsByTimeRange(from: Date, to: Date): readonly DurableEvent[];
  query(options: AuditQueryOptions): readonly DurableEvent[];
}
