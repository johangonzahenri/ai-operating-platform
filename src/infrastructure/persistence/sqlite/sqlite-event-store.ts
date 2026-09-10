import { DatabaseSync, StatementSync } from "node:sqlite";
import {
  AuditQueryOptions,
  DurableEvent,
  DurableEventQueryPort,
  DurableEventStore,
  NewDurableEvent,
} from "../../../application/ports/durable-event-port.js";
import { SqliteDatabase, SqliteDatabaseOptions } from "./sqlite-database.js";
import { SqlitePersistenceError } from "./sqlite-errors.js";
import { initializeSchema } from "./sqlite-schema.js";

export interface SqliteEventStoreOptions extends SqliteDatabaseOptions {
  readonly dbManager?: SqliteDatabase | undefined;
}

export interface EventRow {
  readonly sequence_number: number;
  readonly event_id: string;
  readonly event_type: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly trace_id: string;
  readonly correlation_id: string;
  readonly causation_id: string | null;
  readonly occurred_at: string;
  readonly payload: string;
  readonly schema_version: number;
}

function mapRowToDurableEvent(row: EventRow): DurableEvent {
  let parsedPayload: Record<string, unknown>;
  try {
    const raw = JSON.parse(row.payload);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Payload must be a non-null object");
    }
    parsedPayload = raw;
  } catch (err) {
    throw new SqlitePersistenceError(
      `Failed to parse payload for durable event '${row.event_id}'`,
      err
    );
  }

  const occurredAt = new Date(row.occurred_at);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new SqlitePersistenceError(
      `Corrupted occurred_at timestamp '${row.occurred_at}' for event '${row.event_id}'`
    );
  }

  return Object.freeze({
    sequenceNumber: row.sequence_number,
    eventId: row.event_id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    traceId: row.trace_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id ?? undefined,
    occurredAt,
    payload: Object.freeze(parsedPayload),
    schemaVersion: row.schema_version,
  });
}

/**
 * Production SQLite durable adapter for DurableEventStore and DurableEventQueryPort.
 * Provides append-only, transactional event logging with strictly monotonic sequence numbers
 * and multi-criteria audit querying with sequence-based pagination.
 */
export class SqliteEventStore implements DurableEventStore, DurableEventQueryPort {
  private readonly dbManager: SqliteDatabase;
  private readonly db: DatabaseSync;

  private readonly insertEventStmt: StatementSync;
  private readonly selectBySeqStmt: StatementSync;
  private readonly selectByEventIdStmt: StatementSync;
  private readonly selectByTaskStmt: StatementSync;
  private readonly selectByExecStmt: StatementSync;
  private readonly selectByAgentStmt: StatementSync;
  private readonly selectByTraceStmt: StatementSync;
  private readonly selectByCorrelationStmt: StatementSync;
  private readonly selectByTypeStmt: StatementSync;
  private readonly selectAllStmt: StatementSync;

  constructor(optionsOrDb: SqliteDatabase | SqliteEventStoreOptions = {}) {
    if (optionsOrDb instanceof SqliteDatabase) {
      this.dbManager = optionsOrDb;
    } else if (optionsOrDb && "dbManager" in optionsOrDb && optionsOrDb.dbManager) {
      this.dbManager = optionsOrDb.dbManager;
    } else {
      this.dbManager = new SqliteDatabase(optionsOrDb as SqliteDatabaseOptions);
    }
    this.db = this.dbManager.open();

    initializeSchema(this.db);

    this.insertEventStmt = this.db.prepare(`
      INSERT INTO events (
        event_id, event_type, aggregate_type, aggregate_id,
        trace_id, correlation_id, causation_id, occurred_at,
        payload, schema_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    this.selectBySeqStmt = this.db.prepare(
      "SELECT * FROM events WHERE sequence_number = ?;"
    );
    this.selectByEventIdStmt = this.db.prepare(
      "SELECT * FROM events WHERE event_id = ?;"
    );
    this.selectByTaskStmt = this.db.prepare(`
      SELECT * FROM events
      WHERE (aggregate_type = 'task' AND aggregate_id = ?)
         OR json_extract(payload, '$.taskId') = ?
      ORDER BY sequence_number ASC;
    `);
    this.selectByExecStmt = this.db.prepare(`
      SELECT * FROM events
      WHERE (aggregate_type = 'execution' AND aggregate_id = ?)
         OR json_extract(payload, '$.executionId') = ?
      ORDER BY sequence_number ASC;
    `);
    this.selectByAgentStmt = this.db.prepare(`
      SELECT * FROM events
      WHERE (aggregate_type = 'agent' AND aggregate_id = ?)
         OR json_extract(payload, '$.agentId') = ?
      ORDER BY sequence_number ASC;
    `);
    this.selectByTraceStmt = this.db.prepare(
      "SELECT * FROM events WHERE trace_id = ? ORDER BY sequence_number ASC;"
    );
    this.selectByCorrelationStmt = this.db.prepare(
      "SELECT * FROM events WHERE correlation_id = ? ORDER BY sequence_number ASC;"
    );
    this.selectByTypeStmt = this.db.prepare(
      "SELECT * FROM events WHERE event_type = ? ORDER BY sequence_number ASC;"
    );
    this.selectAllStmt = this.db.prepare(
      "SELECT * FROM events ORDER BY sequence_number ASC;"
    );
  }

  append(event: NewDurableEvent): DurableEvent {
    const occurredAtIso = (event.occurredAt ?? new Date()).toISOString();
    let serializedPayload: string;
    try {
      serializedPayload = JSON.stringify(event.payload);
    } catch (err) {
      throw new SqlitePersistenceError("Failed to serialize event payload to JSON", err);
    }

    try {
      const result = this.insertEventStmt.run(
        event.eventId,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        event.traceId,
        event.correlationId,
        event.causationId ?? null,
        occurredAtIso,
        serializedPayload,
        event.schemaVersion ?? 1
      );

      const seqNumber = Number(result.lastInsertRowid);
      const row = this.selectBySeqStmt.get(seqNumber) as EventRow | undefined;
      if (!row) {
        throw new SqlitePersistenceError(`Failed to retrieve newly inserted event row ${seqNumber}`);
      }
      return mapRowToDurableEvent(row);
    } catch (err) {
      if (err instanceof SqlitePersistenceError) {
        throw err;
      }
      throw new SqlitePersistenceError(
        `Failed to append durable event '${event.eventId}' to SQLite`,
        err
      );
    }
  }

  appendBatch(events: readonly NewDurableEvent[]): readonly DurableEvent[] {
    return this.dbManager.transaction(() => {
      return events.map((e) => this.append(e));
    });
  }

  getEventsByTask(taskId: string): readonly DurableEvent[] {
    const rows = this.selectByTaskStmt.all(taskId, taskId) as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getEventsByExecution(executionId: string): readonly DurableEvent[] {
    const rows = this.selectByExecStmt.all(executionId, executionId) as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getEventsByAgent(agentId: string): readonly DurableEvent[] {
    const rows = this.selectByAgentStmt.all(agentId, agentId) as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getEventsByTrace(traceId: string): readonly DurableEvent[] {
    const rows = this.selectByTraceStmt.all(traceId) as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getEventsByCorrelation(correlationId: string): readonly DurableEvent[] {
    const rows = this.selectByCorrelationStmt.all(correlationId) as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getEventsByType(eventType: string): readonly DurableEvent[] {
    const rows = this.selectByTypeStmt.all(eventType) as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getAllEvents(): readonly DurableEvent[] {
    const rows = this.selectAllStmt.all() as unknown as EventRow[];
    return rows.map(mapRowToDurableEvent);
  }

  getEventsByTimeRange(from: Date, to: Date): readonly DurableEvent[] {
    return this.query({ from, to });
  }

  query(options: AuditQueryOptions): readonly DurableEvent[] {
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (options.taskId) {
      whereClauses.push(
        "((aggregate_type = 'task' AND aggregate_id = ?) OR json_extract(payload, '$.taskId') = ?)"
      );
      params.push(options.taskId, options.taskId);
    }

    if (options.executionId) {
      whereClauses.push(
        "((aggregate_type = 'execution' AND aggregate_id = ?) OR json_extract(payload, '$.executionId') = ?)"
      );
      params.push(options.executionId, options.executionId);
    }

    if (options.agentId) {
      whereClauses.push(
        "((aggregate_type = 'agent' AND aggregate_id = ?) OR json_extract(payload, '$.agentId') = ?)"
      );
      params.push(options.agentId, options.agentId);
    }

    if (options.traceId) {
      whereClauses.push("trace_id = ?");
      params.push(options.traceId);
    }

    if (options.correlationId) {
      whereClauses.push("correlation_id = ?");
      params.push(options.correlationId);
    }

    if (options.eventType) {
      whereClauses.push("event_type = ?");
      params.push(options.eventType);
    }

    if (options.aggregateType) {
      whereClauses.push("aggregate_type = ?");
      params.push(options.aggregateType);
    }

    if (options.aggregateId) {
      whereClauses.push("aggregate_id = ?");
      params.push(options.aggregateId);
    }

    if (options.from) {
      whereClauses.push("occurred_at >= ?");
      params.push(options.from.toISOString());
    }

    if (options.to) {
      whereClauses.push("occurred_at <= ?");
      params.push(options.to.toISOString());
    }

    if (options.afterSequence !== undefined) {
      whereClauses.push("sequence_number > ?");
      params.push(options.afterSequence);
    }

    if (options.beforeSequence !== undefined) {
      whereClauses.push("sequence_number < ?");
      params.push(options.beforeSequence);
    }

    let sql = "SELECT * FROM events";
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY sequence_number ASC";

    if (options.limit !== undefined && options.limit > 0) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as unknown as EventRow[];
      return rows.map(mapRowToDurableEvent);
    } catch (err) {
      if (err instanceof SqlitePersistenceError) {
        throw err;
      }
      throw new SqlitePersistenceError("Failed to execute audit query in SQLite", err);
    }
  }
}
