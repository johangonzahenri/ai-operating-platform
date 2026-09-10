# 0022. Observability, Audit Query & Runtime Diagnostics

## Status

Accepted

## Context

Following milestones v0.11 through v0.14, the AI Operating Platform achieved:
1. Formal domain aggregate rehydration boundaries (ADR 0017, ADR 0018).
2. Durable SQLite persistence for `Task`, `Execution`, `Agent`, and `AutonomousOperation` under Schema Version 2 (ADR 0019).
3. Deterministic crash recovery and restart reconciliation via `RestartRecoveryService` (ADR 0020).
4. Durable, append-only event logging in SQLite Schema Version 3, achieving transactional atomicity between state mutations and event publication without introducing Event Sourcing (ADR 0021).

While events are now durably committed to SQLite in the `events` table, the operational capabilities to inspect, query, filter, paginate, and diagnose runtime execution were limited:
- **Restricted Querying**: The initial `DurableEventQueryPort` provided only fixed single-key filters (`getEventsByTask`, `getEventsByExecution`, `getEventsByTrace`, etc.) without multi-criteria filtering, temporal range constraints (`from`, `to`), or bounded pagination.
- **Unbounded Memory Risk on Bulk Reads**: `getAllEvents()` reads the entire event ledger into memory, creating an unbounded heap exhaustion vulnerability as the database grows to thousands or millions of records.
- **Absence of Unified Diagnostic Reconstruction**: A platform operator or system auditor seeking to understand why an execution failed, whether a task was interrupted by a crash, how long an operation took, or the exact causal lineage between tasks and executions had to manually assemble disjoint event lists.
- **Infrastructure Leakage Hazard**: Consuming components might be tempted to bypass application ports and issue raw SQL queries directly against SQLite to perform filtering or pagination.

The platform requires a clean, read-only observability and diagnostics layer adhering strictly to Hexagonal Architecture and DDD, without introducing heavyweight external telemetry stacks (OpenTelemetry, Prometheus, Grafana, Kafka, Elasticsearch).

## Decision

We formalize and implement the **Observability, Audit Query & Runtime Diagnostics Architecture** for AI Operating Platform.

### 1. Retention of SQLite Schema Version 3

We evaluate Schema Version 3 (`CURRENT_SCHEMA_VERSION = 3`) and determine that **no database schema migration or Schema V4 is required**.
The existing physical schema:
```sql
CREATE TABLE IF NOT EXISTS events (
  sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1
);
```
already possesses all required columns and comprehensive indexes:
- `idx_events_aggregate ON events(aggregate_type, aggregate_id)`
- `idx_events_trace_id ON events(trace_id)`
- `idx_events_correlation_id ON events(correlation_id)`
- `idx_events_event_type ON events(event_type)`
- `idx_events_occurred_at ON events(occurred_at)`

Retaining Schema V3 preserves backward compatibility, avoids risky data migrations, and fully supports structured multi-criteria filtering, temporal ranges, and sequence-based pagination.

### 2. Evolution of `DurableEventQueryPort` with `AuditQueryOptions`

We expand `DurableEventQueryPort` in `src/application/ports/durable-event-port.ts` while preserving all existing single-key methods for 100% backward compatibility:

```typescript
export interface AuditQueryOptions {
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly eventType?: string | undefined;
  readonly aggregateType?: string | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  readonly afterSequence?: number | undefined;
  readonly beforeSequence?: number | undefined;
  readonly limit?: number | undefined;
}

export interface DurableEventQueryPort {
  // Existing query methods (preserved)
  getEventsByTask(taskId: string): readonly DurableEvent[];
  getEventsByExecution(executionId: string): readonly DurableEvent[];
  getEventsByAgent(agentId: string): readonly DurableEvent[];
  getEventsByTrace(traceId: string): readonly DurableEvent[];
  getEventsByCorrelation(correlationId: string): readonly DurableEvent[];
  getEventsByType(eventType: string): readonly DurableEvent[];
  getAllEvents(): readonly DurableEvent[];

  // Expanded query methods
  getEventsByTimeRange(from: Date, to: Date): readonly DurableEvent[];
  query(options: AuditQueryOptions): readonly DurableEvent[];
}
```

Both `SqliteEventStore` and `InMemoryEventStore` implement this contract.

### 3. Deterministic, Sequence-Based Pagination

To prevent unbounded queries and provide stable pagination across process restarts:
- **Primary Ordering Key**: `sequence_number ASC`. Chronological ordering is determined strictly by the database engine's monotonically increasing integer sequence, eliminating timestamp collisions and clock drift.
- **Cursor Boundaries**: `afterSequence` and `beforeSequence` allow consumers to paginate deterministically forward or backward through time without duplicate or skipped events (`WHERE sequence_number > afterSequence LIMIT limit`).
- **Temporal Windows**: `from` and `to` filter on `occurred_at` using ISO 8601 UTC bounds.
- **Limit Protection**: Limits are strictly enforced in SQL via parameterized `LIMIT ?` clauses.

### 4. Pure Application Runtime Diagnostics Model

We introduce `src/application/diagnostics/runtime-diagnostics.ts` defining semantic diagnostic abstractions:
- **`DiagnosticTraceNode`**: A normalized representation of an event in an execution trace.
- **`ExecutionTraceDiagnostic`**: A complete reconstruction of an execution's operational lifecycle from root task creation to terminal state, including:
  - Overall status (`COMPLETED`, `FAILED`, `CANCELLED`, `IN_PROGRESS`).
  - Elapsed duration in milliseconds (`durationMs`).
  - Terminal resolution: failure reason and failure code (`failureReason`, `failureCode`).
  - Crash recovery flag (`isCrashRecovered`), indicating whether the execution was interrupted by a crash and subsequently reconciled by `RestartRecoveryService`.
  - Ordered chronological timeline of events.
  - Causal lineage chain (`causalChain`).
- **`CrashRecoveryDiagnostic`**: Specific forensic audit summaries of crash reconciliation events (`CRASH_RECOVERY`, `ORPHAN_EXECUTION`, `ORPHAN_TASK`).

We introduce `RuntimeDiagnosticsService`:
- Consumes `DurableEventQueryPort` as its sole dependency.
- Completely decoupled from concrete SQLite infrastructure and database connections.
- Strictly read-only: executes zero state mutations or database writes.

### 5. Strict Read-Only Immutability Guarantee

- The audit and diagnostics layer exposes exclusively read query methods.
- No methods exist to mutate, delete, prune, or truncate historical audit records.
- Deserialized payloads are deeply frozen (`Object.freeze`) to ensure caller immutability.
- Fail-closed parsing: Corrupted JSON or invalid timestamps in SQLite rows immediately throw `SqlitePersistenceError` rather than silently omitting data.

### 6. Event Schema Version vs. Database Schema Version

We explicitly distinguish between two orthogonal versioning dimensions:
- **Database Schema Version** (`CURRENT_SCHEMA_VERSION = 3`): Governs physical relational table DDL in SQLite (`schema_metadata.schema_version`).
- **Event Schema Version** (`DurableEvent.schemaVersion = 1`): Governs the schema of the individual event's JSON payload, supporting future domain payload format evolutions independently of table structure.

## Alternatives Considered

1. **Adopting OpenTelemetry / Jaeger / Prometheus**:
   *Rejected*. Introduces substantial external npm dependencies, distributed collector processes, and network transport overhead. Violates the zero-production-dependencies constraint and the single-node deterministic operational model.
2. **CQRS with Separate Read Database**:
   *Rejected*. Maintaining a separate read store (e.g. read replica or Elasticsearch) adds synchronization complexity, eventual consistency lag, and split-brain recovery risks. In a single-node SQLite deployment, indexed queries against the `events` table provide sub-millisecond retrieval with immediate read-after-write consistency.
3. **Database Schema Version 4**:
   *Rejected*. Auditing confirmed that Schema V3 contains all necessary columns and indexes. Creating a Schema V4 would introduce unnecessary migration overhead with zero functional benefit.
4. **Timestamp-Based Pagination**:
   *Rejected as Primary Cursor*. Wall-clock timestamps (`occurred_at`) can have identical values when multiple events occur within the same millisecond or during clock adjustments. `sequence_number` provides a mathematically strict, monotonically increasing total order.

## Consequences

- **Positive**: Complete operational observability: any task, execution, or crash recovery can be reconstructed with millisecond precision, root cause analysis, and causal lineage.
- **Positive**: Bounded, deterministic query performance with sequence-based pagination and parameterization preventing SQL injection and memory exhaustion.
- **Positive**: Zero production dependencies added; pure Node.js LTS and `node:sqlite`.
- **Positive**: Perfect Hexagonal separation: `RuntimeDiagnosticsService` and application consumers depend exclusively on query ports without touching SQLite.
- **Positive**: Schema V3 preserved without requiring database migrations.
- **Deferred**: Future milestones may introduce an administrative retention/compaction utility for cold log rotation, which remains outside operational runtime scope.
