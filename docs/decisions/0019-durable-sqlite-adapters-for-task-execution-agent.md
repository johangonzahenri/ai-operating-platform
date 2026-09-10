# 0019. Durable SQLite Adapters for Task, Execution, and Agent

## Status

Accepted

## Context

In milestones v0.10 and v0.11, the AI Operating Platform established durable relational persistence for `AutonomousOperation` aggregates and formalized fail-closed rehydration boundaries (`rehydrate(props)`) across all core domain aggregates: `AutonomousOperation` (ADR 0016), `Task` and `Execution` (ADR 0017), and `Agent` (ADR 0018).

However, `Task`, `Execution`, and `Agent` repositories remained backed exclusively by in-memory volatile implementations (`InMemoryTaskRepository`, `InMemoryExecutionRepository`, `InMemoryAgentRegistry`). Consequently:
1. Operational traces, tasks, executions, and agent configurations were lost upon process termination.
2. Production environments running with durable storage enabled had a persistence mismatch: operations were durable, but their underlying tasks, executions, and registered agents were transient.
3. Node.js process restarts could not restore the state of ongoing or completed tasks.

The project requires extending durable SQLite persistence across `Task`, `Execution`, and `Agent` aggregates while adhering strictly to Hexagonal Architecture, pure Domain boundaries, zero external runtime dependencies, and fail-closed rehydration.

## Decision

We implement Schema Version 2 and provide production-ready durable SQLite repository adapters for `Task`, `Execution`, and `Agent`.

### 1. Schema Evolution (Version 1 to Version 2)

We increment `CURRENT_SCHEMA_VERSION` from 1 to 2 in `src/infrastructure/persistence/sqlite/sqlite-schema.ts`.

Migration is atomic, transactional, and non-destructive:
- **Fresh Database**: Automatically initializes both V1 core tables (`schema_metadata`, `operations`, `plans`, `plan_steps`, `observations`, `decisions`) and V2 additions (`agents`, `tasks`, `executions`) in a single `BEGIN IMMEDIATE ... COMMIT` block, setting `schema_version = '2'`.
- **Existing V1 Database**: Detects `schema_version = 1`, creates the V2 tables and indexes, and updates `schema_version = '2'` atomically inside a transaction. If any step fails, an automatic rollback occurs, leaving existing V1 data and metadata uncorrupted.
- **Idempotent Verification**: If `schema_version = 2`, verifies table structures with zero duplicate mutations.
- **Fail-Closed on Future Versions**: If `schema_version > 2`, fails closed with `IncompatibleSchemaVersionError`.

### 2. Physical Schema Definitions

#### `agents` Table
```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  tools TEXT NOT NULL DEFAULT '[]',
  memory_scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);
```

#### `tasks` Table
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'CREATED', 'QUEUED', 'RUNNING', 'WAITING',
      'COMPLETED', 'FAILED', 'CANCELLED'
    )
  ),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  output TEXT,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_trace_id ON tasks(trace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
```

#### `executions` Table
```sql
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('CREATED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')
  ),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  result_metadata TEXT,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_trace_id ON executions(trace_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
```

### 3. Deliberate Absence of Physical Foreign Key `executions.task_id -> tasks.id`

Forensic architectural audit of `CoreRuntime.execute()` (`src/application/runtime/core-runtime.ts`) demonstrated that:
1. When execution begins, `Execution.create(...)` is instantiated and immediately persisted to `ExecutionRepository` (`saveExecution`) with status `CREATED`.
2. Only subsequently is `Task.transition("QUEUED")` instantiated and persisted to `TaskRepository` (`saveTask`).
3. Furthermore, contract tests (`tests/contract/execution-repository.contract.test.ts`) test execution repository isolation by saving an `Execution` independently of any `Task`.

Enforcing a physical SQLite constraint `FOREIGN KEY (task_id) REFERENCES tasks(id)` under `PRAGMA foreign_keys = ON` would crash `CoreRuntime.execute()` at step 1 with a foreign key constraint violation.

Therefore, the omission of a physical foreign key constraint from `executions.task_id` to `tasks.id` is a **deliberate architectural decision**. Logical relational integrity is enforced by identity reference and indexed via `idx_executions_task_id`. In accordance with DDD principles, aggregate roots reference each other by identity rather than hard database cascades.

### 4. Repository Implementations

- **`SqliteTaskRepository`**: Implements `TaskRepository` and `TaskQueryPort`. Uses atomic upsert via `ON CONFLICT(id) DO UPDATE SET`. Rehydrates domain entities strictly through `Task.rehydrate()`.
- **`SqliteExecutionRepository`**: Implements `ExecutionRepository` and `ExecutionQueryPort`. Uses atomic upsert. Rehydrates domain entities strictly through `Execution.rehydrate()`.
- **`SqliteAgentRepository`**: Implements `AgentRegistry` and `AgentQueryPort`. Implements `register`, `findById`, `list`, `update`, `delete`.
- **`AgentRepository` Type Alias**: We export `export type AgentRepository = AgentRegistry;` in `src/domain/agent/agent-registry.ts` to provide semantic symmetry across repositories without breaking existing consumers.

### 5. Optimistic Concurrency Control (OCC) for Agent

`Agent` aggregate tracks `version: number`. Updates are guarded by:
```sql
UPDATE agents SET
  name = ?, description = ?, model = ?, instructions = ?, tools = ?,
  memory_scope = ?, status = ?, version = ?, updated_at = ?
WHERE id = ? AND version = ?;
```
If a caller submits an update with a version that does not match the current database version, or if `changes === 0`, `SqliteAgentRepository` throws `OptimisticConcurrencyError`.
For version-preserving transitions (such as `activate()` and `deactivate()`), the atomic update condition verifies that the current version in the database has not changed, preventing lost updates.

### 6. Single Shared `SqliteDatabase` Instance

Composition root (`src/interfaces/composition.ts`) creates exactly one `SqliteDatabase` instance when durable persistence is enabled (`useDurablePersistence` or `dbPath`). All repositories (`SqliteTaskRepository`, `SqliteExecutionRepository`, `SqliteAgentRepository`, `SqliteOperationRepository`) receive and share this single manager. This prevents WAL locking conflicts and enables unified lifecycle management and graceful shutdown.

### 7. Fail-Closed Rehydration & Serialization Boundaries

- Rehydration strictly uses explicit domain factory methods (`Task.rehydrate`, `Execution.rehydrate`, `Agent.rehydrate`).
- JSON payloads (`input`, `output`, `result_metadata`, `tools`) are validated during deserialization. Malformed JSON, non-object types, corrupted statuses, or invalid timestamps immediately raise `SqlitePersistenceError`.
- Caller objects and rehydrated objects are defensively frozen (`Object.freeze`), guaranteeing runtime immutability.

## Alternatives Considered

1. **Foreign Key `executions(task_id) REFERENCES tasks(id)`**: Rejected because `CoreRuntime.execute()` persists `Execution` before `Task`. Enforcing it would cause runtime crashes and break aggregate decoupling.
2. **Multiple Database Connections**: Rejected. Opening separate `DatabaseSync` connections for each repository produces unnecessary file locks and complicates transactions in WAL mode.
3. **ORM / External Persistence Libraries**: Rejected. Native `node:sqlite` (`DatabaseSync`) satisfies all durability requirements with zero runtime dependencies and predictable synchronous semantics.
4. **Bypassing Rehydration via `Object.create` or Reflection**: Rejected. Domain aggregates enforce business invariants; rehydration boundaries ensure stored data is thoroughly validated upon read.

## Consequences

- **Positive**: Complete process-restart durability for tasks, executions, and agents.
- **Positive**: Zero external runtime dependencies added.
- **Positive**: Strict OCC protection against lost updates in multi-client scenarios.
- **Positive**: 100% backwards-compatible with existing in-memory test suites and contract test suites.
- **Neutral**: `executions.task_id` is indexed and logically referenced rather than physically constrained by SQLite FK.
