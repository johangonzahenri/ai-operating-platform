# Chapter 16: Durable Persistence Architecture

> **Architecture Status**: **v0.10 INCREMENT #2 COMPLETED** (SQLite Durable Adapter & Storage Engine). This chapter documents the durable persistence architecture, native SQLite storage engine, schema design, transactional integrity, and design invariants for the AI Operating Platform.

---

## 1. Executive Overview

In **v0.9 Bounded Autonomous Operations**, the platform established an in-memory repository architecture (`InMemoryOperationRepository`) satisfying `OperationRepositoryPort` and `OperationQueryPort`. While suitable for fast isolated testing and single-lifecycle runs, in-memory storage loses all operational state upon process termination.

**Milestone v0.10 Durable Persistence** delivers production-grade, crash-resilient persistence. It guarantees that autonomous operations, plans, observations, and decisions survive process restarts, host failures, and redeployments—while maintaining strict domain purity and zero external runtime dependencies.

```text
┌─────────────────────────────────────────────────────────────┐
│                            v0.9                             │
│                     Volatile In-Memory                      │
│                  Process restart -> Data lost               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     v0.10 Increment #1                      │
│              Durable Persistence Architecture               │
│          Contracts, Aggregates, OCC, Recovery, ADR          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     v0.10 Increment #2                      │
│           SQLite Durable Adapter & Storage Engine           │
│        Zero-dependency, native node:sqlite (DatabaseSync)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Persistence Boundary & Hexagonal Architecture

The platform strictly adheres to Hexagonal Architecture (Ports and Adapters). Storage engines and drivers are external infrastructure plugins completely decoupled from the domain:

```text
Domain / Application Layer (Pure TypeScript)
   ├── OperationRepositoryPort (Write / Mutation Interface)
   └── OperationQueryPort (Read / CQRS Projection Interface)
             ▲
             │ implements
Infrastructure Layer (Adapters)
   ├── InMemoryOperationRepository (Unit Tests & In-Memory Isolation)
   └── SqliteOperationRepository (Durable Production Storage Engine)
             │
             ▼
Physical Storage Layer
   └── Node.js 22 Native node:sqlite (DatabaseSync) -> data/app.db (WAL)
```

### Core Invariants
- **Domain Purity**: Domain files (`src/domain/`) NEVER import SQLite, SQL syntax, file paths, or OS modules.
- **Application Decoupling**: Application use cases and services communicate exclusively via domain ports (`OperationRepositoryPort`) and application query ports (`OperationQueryPort`).
- **Zero Runtime Dependencies**: The durable adapter uses Node.js 22's built-in `node:sqlite` (`DatabaseSync`). No external C++ bindings, `better-sqlite3`, `sqlite3`, or ORMs are installed (`npm ls --omit=dev` is strictly empty).

---

## 3. Database Lifecycle & Engine Configuration

The database connection and lifecycle are managed by `SqliteDatabase` (`src/infrastructure/persistence/sqlite/sqlite-database.ts`):

- **Default Location**: `data/app.db` in the repository root (or in-memory `:memory:` for isolated tests).
- **Directory Resolution**: Safe resolution relative to `process.cwd()`; parent directory `data/` is created automatically with recursive directory permissions.
- **Pragmas**:
  - `PRAGMA foreign_keys = ON;`: Enforces relational integrity across parent operations and child plans, steps, observations, and decisions.
  - `PRAGMA busy_timeout = 5000;`: Prevents database locking failures under concurrent read/write operations.
  - `PRAGMA journal_mode = WAL;`: Write-Ahead Logging delivers concurrent readers/writer performance and crash durability on disk.
  - `PRAGMA synchronous = NORMAL;`: Optimizes disk flush latency while ensuring WAL durability.
- **Atomic Transactions**: Managed via `sqliteDatabase.transaction<T>(fn)`. Wraps mutations in `BEGIN IMMEDIATE;` ... `COMMIT;` and guarantees immediate `ROLLBACK;` on error.

---

## 4. Durable Relational Schema (Version 1)

The storage engine uses non-destructive schema initialization (`src/infrastructure/persistence/sqlite/sqlite-schema.ts`). It executes `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` without dropping existing data.

### Schema Tables

| Table | Purpose | Key Constraints | Indexes |
| :--- | :--- | :--- | :--- |
| `schema_metadata` | Tracks persistent schema versioning | `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at TEXT NOT NULL` | Primary Key (`key`) |
| `operations` | Aggregate root storage for `AutonomousOperation` | `id TEXT PRIMARY KEY`, `version INTEGER NOT NULL CHECK (version >= 1)`, `status TEXT NOT NULL CHECK (status IN (...))` | `idx_operations_status`, `idx_operations_agent_id`, `idx_operations_created_at` |
| `plans` | Persists the operation's deliberate execution plan | `id TEXT PRIMARY KEY`, `operation_id TEXT NOT NULL UNIQUE REFERENCES operations(id) ON DELETE CASCADE` | `idx_plans_operation_id` |
| `plan_steps` | Ordered plan steps within an operation's plan | `PRIMARY KEY (plan_id, id)`, `UNIQUE (plan_id, step_order)`, `FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE`, `FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE` | `idx_plan_steps_plan_order`, `idx_plan_steps_operation_id` |
| `observations` | Structured step execution outcomes | `observation_id TEXT PRIMARY KEY`, `FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE` | `idx_observations_operation_id`, `idx_observations_step_id` |
| `decisions` | Evaluator decisions deriving aggregate state transitions | `id INTEGER PRIMARY KEY AUTOINCREMENT`, `FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE` | `idx_decisions_operation_id` |

---

## 5. Domain Mapping & Rehydration

Domain aggregates and SQLite records are mapped bidirectionally by `sqlite-mapper.ts`:

- **Domain -> SQLite**: Deconstructs `AutonomousOperation`, `Plan`, `Observation`, and `Decision` into strongly typed flat SQL column rows with JSON serialization for complex payloads (e.g. step inputs, tool results, metadata).
- **SQLite -> Domain**: Rehydrates domain objects preserving class constructors, internal validations, and `Object.freeze()` immutability.
- **Aggregate Integrity**: `AutonomousOperation` is reconstructed with its original `id`, `traceId`, `agentId`, `objective`, validated `AutonomyBudget`, accumulated `AutonomyConsumption`, terminal timestamps, and status.
- **CQRS Projections**: Maps rows directly to `OperationProjection` and `OperationDetailProjection` for high-performance read queries without aggregate instantiation overhead.

---

## 6. Optimistic Concurrency Control (OCC)

To prevent lost updates across concurrent threads or asynchronous workflows:
1. Every operation row includes a monotonic `version` integer (starting at `1`).
2. When saving an existing operation, the update query executes:
   ```sql
   UPDATE operations SET status = ?, version = version + 1, ...
   WHERE id = ? AND version = ?
   ```
3. If another process mutated the operation concurrently, the row count is `0`.
4. The repository immediately aborts the transaction and throws `OptimisticConcurrencyError(operationId, currentVersion)`.

---

## 7. Idempotency & Transactional Atomicity

- **Atomic Boundary**: Saving an operation and its associated plan, plan steps, observations, and decisions occurs entirely within a single `transaction()` block. If any insert or constraint fails, the entire transaction rolls back cleanly, leaving zero orphaned records.
- **Idempotent Child Persistence**: Re-saving an operation with already persisted observations or decisions uses `INSERT OR IGNORE` based on unique child IDs (`id` or `(operation_id, step_id)`), preventing duplicate history entries or unique constraint crashes.

---

## 8. Restart Durability & Lifecycle

The storage engine guarantees disk durability across process restarts:
1. `save()` commits all data to `data/app.db` via WAL.
2. The database connection is closed cleanly on process shutdown.
3. Upon process startup or restart, a new `SqliteOperationRepository` opens `data/app.db`, validates `schema_version = 1`, and rehydrates the exact operation state.

---

## 9. Comprehensive Testing Matrix

The persistence implementation is verified by three test suites:

1. **Contract Parity Suite** (`tests/contract/operation-repository.contract.test.ts`):
   - 18 tests verifying identical contract compliance between `InMemoryOperationRepository` and `SqliteOperationRepository`.
2. **Infrastructure Unit Suite** (`tests/unit/sqlite-persistence.test.ts`):
   - Schema versioning & monotonic checks.
   - Non-destructive bootstrap verification.
   - Rejection of incompatible schema versions.
   - Disk restart durability & deep aggregate equality.
   - Multi-table transaction rollback on exception.
   - Optimistic concurrency conflicts & version incrementing.
   - Child record save idempotency.
   - Type safety and optional/undefined parameter binding.
3. **Platform Integration Suite** (`tests/platform/operations-sqlite.integration.test.ts`):
   - End-to-end HTTP REST API execution (`POST /api/v1/operations`).
   - Disk persistence verification.
   - Server restart and rehydration across isolated HTTP server instances.

---

## 10. Summary Matrix

| Feature / Capability | v0.9 Baseline | v0.10 Inc #1 (Baseline) | v0.10 Inc #2 (This Increment) |
| :--- | :--- | :--- | :--- |
| **InMemory Adapter** | ✅ Implemented | ✅ Contract Tested | ✅ Retained for test isolation |
| **Contract Test Suite** | ❌ None | ✅ Contract tests created | ✅ Dual execution (Memory + SQLite) |
| **Durable Adapter** | ❌ None | ❌ Planned | ✅ `SqliteOperationRepository` |
| **Native Storage Engine**| ❌ None | ❌ Planned | ✅ Node 22 `node:sqlite` (`DatabaseSync`)|
| **OCC Concurrency** | ❌ None | ❌ Architectural spec | ✅ Monotonic `version` tracking |
| **Atomic Transactions** | ❌ None | ❌ Architectural spec | ✅ `BEGIN IMMEDIATE` / `COMMIT` |
| **Restart Durability** | ❌ None | ❌ Architectural spec | ✅ Verified on disk database |
| **Platform API Integration**| In-memory only | In-memory only | ✅ Full HTTP REST SQLite integration |
| **Runtime Dependencies**| 0 external packages | 0 external packages | 0 external packages (Strict zero-dependency) |
