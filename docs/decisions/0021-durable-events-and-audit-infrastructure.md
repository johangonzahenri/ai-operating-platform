# 0021. Durable Event and Audit Infrastructure

## Status

Accepted

## Context

Prior to v0.14, the AI Operating Platform possessed durable persistence for domain aggregate states (`Task`, `Execution`, `Agent`, `AutonomousOperation`) backed by SQLite Schema Version 2 (ADR 0019) and restart reconciliation (ADR 0020). However, the platform's event and audit mechanism was backed strictly by in-memory components:
1. `InMemoryEventPublisher` stored emitted domain events in a transient JavaScript array (`this.events = []`).
2. `InMemoryAuditLog` stored observations in a volatile memory array (`this.observations = []`).

A forensic architectural audit revealed three critical consistency and durability vulnerabilities in this arrangement:
1. **Zero Restart Durability**: When the hosting process terminates (or crashes), all event records and audit observations are permanently lost. A newly restarted node cannot reconstruct what sequence of operations, transitions, or failures preceded the current state.
2. **Dual-Write Inconsistency (Event Without State)**: In `CoreRuntime` and elsewhere, if an aggregate mutation is rolled back by an enclosing database transaction after an event was published to the in-memory bus, subscribers observe the event as though the mutation succeeded, while the database records that the mutation never occurred.
3. **Dual-Write Inconsistency (State Without Event)**: Conversely, if a database transaction commits an aggregate mutation and the node crashes before the in-memory event is published or consumed by the audit logger, the aggregate state is persisted on disk without any audit record existing.
4. **Absence of Ordering and Causation**: Events lacked persistent sequence numbering, correlation tracking, and causation references. Event order depended solely on ephemeral array insertion or system clock timestamps subject to resolution limits and clock drift.

The platform requires a durable, transactional, append-only event and audit infrastructure.

## Decision

We introduce **Durable Event & Audit Infrastructure** backed by SQLite Schema Version 3, establishing transactional atomicity between state mutations and event publication.

### 1. Fundamental Principle: This is NOT Event Sourcing

We explicitly affirm that this architecture is **not Event Sourcing**:
- **State as Source of Truth**: Aggregate tables (`tasks`, `executions`, `agents`, `operations`) remain the authoritative, validated source of truth for the platform runtime. Rehydration continues to reconstruct aggregates from these relational records via authentic domain factories (`Task.rehydrate`, `Execution.rehydrate`, `Agent.rehydrate`).
- **Append-Only Historical Audit Trail**: The `events` table serves strictly as an immutable, append-only ledger for observability, compliance, operational forensics, and auditability. Aggregate state is not derived or replayed from events at runtime.

### 2. Transactional Atomicity: Unified Single-Transaction Boundary

To eliminate the dual-write problem, aggregate state persistence and durable event append are executed within the **exact same SQLite transaction**:

```text
Application Use Case (e.g. CoreRuntime / RestartRecoveryService)
       ↓
BEGIN IMMEDIATE TRANSACTION
       ↓
persist aggregate state (tasks / executions / agents)
       ↓
append durable event record (events table)
       ↓
COMMIT TRANSACTION
       ↓
publish to transient in-memory subscribers (EventPublisher)
```

- **All-or-Nothing Guarantee**: If the transaction succeeds, both the aggregate state and its corresponding audit event are written atomically to WAL storage.
- **Rollback Guarantee**: If any failure occurs during aggregate persistence or event serialization, SQLite rolls back the entire transaction (`ROLLBACK`). No orphan state and no phantom events are ever persisted.
- **Post-Commit In-Memory Notification**: Transient in-memory event subscribers (such as real-time loggers or metrics counters) are only notified after the transaction has successfully committed to disk.

### 3. Schema Evolution: Schema Version 3

We increment `CURRENT_SCHEMA_VERSION` from 2 to 3 in `src/infrastructure/persistence/sqlite/sqlite-schema.ts`.

#### Physical DDL (`V3_ADDITIONS_DDL`)
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

CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_trace_id ON events(trace_id);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
```

#### Migration Guarantees
- **Fresh Bootstrap**: Initializes V1, V2, and V3 DDL in a single atomic transaction, setting `schema_version = '3'`.
- **V2 $\rightarrow$ V3 Migration**: Executes `migrateV2ToV3(db)` in an immediate transaction, applying `V3_ADDITIONS_DDL` and updating `schema_version` to `'3'`. Rolls back cleanly on any failure.
- **Idempotency**: Repeated initialization on an existing V3 database is a verified no-op.
- **Fail-Closed Future Version Rejection**: Databases reporting `schema_version > 3` are rejected immediately with `IncompatibleSchemaVersionError`.

### 4. Event Model & Identity Taxonomy

Each event record encapsulates clear, decoupled identity boundaries:
- `sequence_number`: Monotonically increasing 64-bit integer (`AUTOINCREMENT`). Guarantees unambiguous chronological ordering across restarts, immune to wall-clock skew.
- `event_id`: Unique UUID representing the distinct event occurrence. Enforced by SQLite `UNIQUE(event_id)` constraint to guarantee idempotency.
- `event_type`: Dot-notated event discriminator (e.g. `task.created`, `execution.failed`).
- `aggregate_type`: Categorical discriminator (`task`, `execution`, `agent`, `operation`).
- `aggregate_id`: Target aggregate root identifier (`taskId`, `executionId`, `agentId`).
- `trace_id`: Distributed trace identifier correlating actions across the entire call tree.
- `correlation_id`: Logical business workflow correlation identifier.
- `causation_id`: Identifier of the parent event or command that directly caused this event.
- `occurred_at`: ISO 8601 UTC timestamp.
- `payload`: Frozen JSON object, defensively validated and checked for unsafe constructs.
- `schema_version`: Payload schema version for future payload format migrations.

### 5. Append-Only Invariant

The durable event store strictly prohibits `UPDATE` and `DELETE` operations during operational runtime:
- No update or delete methods exist on `DurableEventStore` or `SqliteEventStore`.
- Any retention policies or archival mechanisms are strictly out of scope for standard operations and deferred to explicit future administrative utilities.

### 6. Architectural Layers & Port Definitions

Adhering to Hexagonal Architecture:
```text
Domain Layer (DomainEvent, EventPublisher, Aggregates)
       ▲
Application Layer (CoreRuntime, RestartRecoveryService)
       ▲
Ports (DurableEventStore, DurableEventQueryPort, TransactionRunner)
       ▲
Infrastructure Layer (SqliteEventStore, SqliteTransactionRunner, SqliteDatabase)
```

- **`DurableEventStore`**: Port for appending events (`append`, `appendBatch`).
- **`DurableEventQueryPort`**: Semantic query port providing filtered historical access:
  - `getEventsByTask(taskId)`
  - `getEventsByExecution(executionId)`
  - `getEventsByAgent(agentId)`
  - `getEventsByTrace(traceId)`
  - `getEventsByCorrelation(correlationId)`
  - `getEventsByType(eventType)`
  - `getAllEvents()`
- **`SqliteEventStore`**: Infrastructure adapter implementing both `DurableEventStore` and `DurableEventQueryPort` using prepared statements on `DatabaseSync`.

### 7. Recovery Integration

When `RestartRecoveryService` (v0.13) reconciles non-terminal tasks and executions upon process restart:
- It records `task.cancelled`, `task.failed`, `execution.cancelled`, and `execution.failed` directly into `DurableEventStore`.
- This ensures that recovery actions and diagnostic error codes (`CRASH_RECOVERY`, `ORPHAN_EXECUTION`, `ORPHAN_TASK`) are permanently recorded in the durable audit log and survive all subsequent restarts.

### 8. Payload Safety & Fail-Closed Deserialization

- Serialized payloads are strictly sanitized against functions, circular references, and non-serializable objects.
- Deserialization runs through try-catch parsing. Any corrupted payload row raises `SqlitePersistenceError` fail-closed.

## Alternatives Considered

1. **Transactional Outbox with Background Worker**: Rejected for v0.14. A background polling worker adds process complexity, thread coordination, and asynchronous latency. In a single-node SQLite architecture, writing directly to the `events` table in the same transaction provides immediate, synchronous consistency with zero background daemon overhead.
2. **External Message Broker (Kafka / RabbitMQ / Redis)**: Rejected. Introduces heavy external runtime dependencies, violates the zero-dependency constraint, and introduces distributed two-phase commit (2PC) failure modes.
3. **Event Sourcing (Reconstructing Aggregates from Events)**: Rejected. Reconstructing aggregates from events requires complete event versioning, snapshotting, and projection rebuilding. Relational aggregate state storage with append-only audit logging provides superior simplicity, type safety, and query performance.

## Consequences

- **Positive**: Zero data loss for audit and operational events across process restarts.
- **Positive**: Absolute atomicity between persisted aggregate state and durable events.
- **Positive**: Monotonically ordered, queryable audit trail with correlation and causation tracking.
- **Positive**: Zero production runtime dependencies added.
- **Positive**: Full integration with crash recovery and existing query ports.
- **Neutral**: Schema Version upgraded from 2 to 3 via atomic non-destructive migration.
