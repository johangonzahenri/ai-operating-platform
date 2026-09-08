# 0015. Durable Persistence Architecture & Contract Baseline

- **Date:** 2026-09-08
- **Status:** Approved (v0.10 Architectural Contract Baseline)
- **Author:** Staff/Principal Software Architect + DDD Engineer + Distributed Systems Engineer
- **Corpus / Milestone:** v0.10 — Durable Persistence (Increment #1)

---

## 1. Context

In milestone **v0.9 Bounded Autonomous Operations**, the platform established an operational runtime combining:
- `AutonomyBudget` and `AutonomyConsumption` Value Objects enforcing step, duration, tool call, and token limits.
- `AutonomousOperation` Entity modeling the multi-step lifecycle finite state machine (`SUBMITTED -> RUNNING -> COMPLETED | FAILED | CANCELLED | BUDGET_EXHAUSTED`).
- Domain contracts for `Plan`, `PlanStep`, `Observation`, `Decision`, `ObjectiveEvaluation`.
- `AutonomousOrchestrator` driving execution through `CoreRuntime` with mandatory, fail-closed `PolicyGateway` governance.
- `AutonomousOperationService` orchestrating operations, managing cooperative cancellation tokens, and persisting state through `OperationRepositoryPort` and `OperationQueryPort`.
- Platform REST API (`/api/v1/operations*`) and browser-based Web Platform Control Plane.

In v0.9, persistence is served exclusively by `InMemoryOperationRepository`. State is stored in volatile memory (`Map<string, OperationRecord>`), protected defensively by `Object.freeze()`.

---

## 2. Problem

Because the current repository is purely in-memory:
1. **Process Volatility**: When the Node.js process terminates or restarts (e.g., node crash, container redeployment, system reboot), all operational history, active operations, plans, observations, and decisions are permanently lost.
2. **Post-Restart Inconsistency**: An operation marked `RUNNING` in memory is aborted silently upon process death; upon restart, callers receive `404 Not Found` rather than an auditable record of abnormal process interruption.
3. **Auditability Gap**: Enterprise compliance requires historical persistence of autonomous agent decisions, tool invocations, and policy evaluations across arbitrary time horizons.
4. **Lack of Concurrency Guardrails**: In-memory single-node persistence hides distributed write conflicts, lost updates, and schema version evolution risks.

---

## 3. Goals

- Define a rigorous, technology-agnostic architectural foundation for durable persistence in v0.10.
- Ensure state survives process death and restarts once persistence is acknowledged.
- Preserve 100% domain purity: the domain layer must remain completely unaware of databases, drivers, SQL dialects, or storage engines.
- Establish clean architectural boundaries between Domain Aggregate Roots, Application Services, Repository Ports, Infrastructure Adapters, and Storage Engines.
- Define explicit strategies for Aggregate Root ownership, Snapshot vs. Event Sourcing, schema versioning, idempotency, optimistic concurrency control, atomicity boundaries, crash recovery, and security.
- Design and implement a reusable Contract Test Suite (`OperationRepositoryContract`) that runs identical behavioral tests against both `InMemoryOperationRepository` and future durable adapters (SQLite, PostgreSQL).
- Maintain zero external runtime dependencies (`npm ls --omit=dev` remains empty).

---

## 4. Non-goals

- **No immediate database implementation**: This increment does NOT introduce SQLite, PostgreSQL, MySQL, Redis, MongoDB, Prisma, TypeORM, Drizzle, Sequelize, Knex, or any concrete database driver.
- **No SQL schemas or migrations**: Concrete tables, DDL migrations, connection pools, and dialect-specific serializations belong strictly to future increments (Increment #2+).
- **No background workers or job queues**: The platform does NOT introduce BullMQ, Celery, Redis queues, RabbitMQ, Kafka, or unmonitored background polling loops.
- **No distributed consensus**: Distributed transactions (2PC), multi-node Raft/Paxos consensus, and distributed locks are out of scope for v0.10.
- **No replacement of CoreRuntime**: `CoreRuntime` remains the sole, sovereign execution engine for all task and tool execution.

---

## 5. Current Limitation

The current repository implementation (`InMemoryOperationRepository`) presents several architectural limitations that must be addressed when transitioning to durable persistence:
1. **Synchronous Signatures**: `OperationRepositoryPort.save()` is synchronous (`void`), whereas network and disk I/O are inherently asynchronous (`Promise<void>`).
2. **Lack of Optimistic Locking**: `AutonomousOperation` lacks a `version` or `revision` integer, creating a vulnerability to lost updates in multi-client concurrent environments.
3. **Omission of Schema Versioning**: Persisted records do not contain a `schemaVersion` tag, preventing deterministic up-migration of serialized payloads across platform releases.
4. **Missing Stored Metadata**: While `CreateOperationRequest` accepts an optional `metadata` record, `AutonomousOperation` does not persist or project this metadata.
5. **No Crash Recovery Protocol**: Active operations stranded in `RUNNING` when a process dies cannot be reconciled upon startup.

---

## 6. Persistence Boundary

The platform enforces strict Clean / Hexagonal Architecture layers with unidirectional dependencies pointing inward:

```text
┌─────────────────────────────────────────────────────────────┐
│                      Presentation                           │
│              (HTTP Router, Web Control Plane)               │
└──────────────────────────────┬──────────────────────────────┘
                               │ calls
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Application                           │
│       (AutonomousOperationService, PlatformService)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ depends on
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Persistence Ports                        │
│         OperationRepositoryPort, OperationQueryPort         │
└──────────────────────────────▲──────────────────────────────┘
                               │ implemented by
                               │
┌──────────────────────────────┴──────────────────────────────┐
│                     Infrastructure                          │
│        InMemory Adapter, SQLite Adapter*, Postgres Adapter* │
└──────────────────────────────┬──────────────────────────────┘
                               │ reads/writes
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Durable Storage                        │
│                 Filesystem, SQLite*, PostgreSQL*            │
└─────────────────────────────────────────────────────────────┘
* Future increments
```

**Domain Purity Rule**:
- The domain layer (`src/domain/`) must NEVER import database drivers, file system modules (`node:fs`), SQL builders, or ORMs.
- Persistence concerns belong exclusively to the Infrastructure layer (`src/infrastructure/persistence/`).

---

## 7. Aggregate Strategy

### AutonomousOperation as the Sole Aggregate Root

In Domain-Driven Design (DDD), an **Aggregate Root** is the single entry point through which all state mutations and invariants for an aggregate are enforced.

**Decision**: `AutonomousOperation` is the Aggregate Root.
- An autonomous operation encapsulates its lifecycle status, `AutonomyBudget`, `AutonomyConsumption`, and its execution history.
- `Plan` (and its ordered `PlanStep`s), `Observation`s, and `Decision`s are child entities / value objects owned exclusively by the `AutonomousOperation`.
- A `PlanStep`, `Observation`, or `Decision` has zero independent domain meaning outside the context of its parent `AutonomousOperation`.
- Therefore, transactional consistency is enforced at the `AutonomousOperation` boundary. External callers never mutate or persist an observation or decision independently.

```text
┌────────────────────────────────────────────────────────────┐
│              AutonomousOperation (Aggregate Root)          │
│                                                            │
│  - id: string               - status: Status               │
│  - agentId: string          - budget: AutonomyBudget       │
│  - objective: string        - consumption: Consumption     │
│  - version: number          - schemaVersion: number        │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Plan                                                 │  │
│  │   - id: string                                       │  │
│  │   - steps: PlanStep[]                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Observations: readonly Observation[]                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Decisions: readonly Decision[]                       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 8. Snapshot vs Event Sourcing Analysis

Three persistence architectures were evaluated:

| Dimension | Option A: Pure State Snapshot | Option B: Pure Event Sourcing | Option C: Hybrid Snapshot + Historical Log |
| :--- | :--- | :--- | :--- |
| **Description** | Overwrites the entire aggregate state in a single row/document on each change. | Stores domain events as immutable stream; reconstructs aggregate via `replay()`. | Stores aggregate state snapshot alongside sequential, immutable child arrays of Plan, Observations, and Decisions. |
| **Complexity** | Minimal | Very High (requires event versioning, snapshots, rehydration) | Low to Moderate |
| **Auditability** | Poor (overwrites previous state; intermediate steps lost unless logged elsewhere). | Exceptional (complete immutable event log). | Excellent (full history of steps, observations, and decisions preserved). |
| **Query Performance** | Fast direct key/index lookups. | Slow aggregate rehydration without snapshotting cache. | Fast direct lookups; zero replay overhead. |
| **Domain Impact** | None | High (requires event-sourced aggregate refactor). | None (aligns 100% with current `OperationRecord`). |
| **Suitability for v0.10** | Insufficient for audit trail | Over-engineering for bounded operations ($\le 25$ steps) | **Selected Strategy** |

### Selected Strategy: Hybrid Snapshot + Structured Historical Log
The repository stores:
1. The **Operation State Snapshot** (id, objective, agentId, status, budget, consumption, timestamps, terminationReason, failureError, resultOutput).
2. The **Plan Document** (plan ID, ordered steps with input payloads).
3. The **Ordered Historical Logs** (`observations` and `decisions` appended sequentially).

This provides full regulatory auditability and deterministic replay without the architectural bloat of an event-sourcing rehydration engine.

---

## 9. Versioning Strategy

To support zero-downtime rolling upgrades and forward/backward data schema compatibility, all persisted operation records must include a top-level schema metadata attribute:

```typescript
export interface PersistedOperationEnvelope {
  readonly schemaVersion: number; // e.g. 1
  readonly aggregateId: string;
  readonly payload: OperationRecordSnapshot;
  readonly persistedAt: string; // ISO 8601 UTC
}
```

### Migration Rules:
1. **Schema Version Tag**: Every persisted record carries `schemaVersion: 1`.
2. **Additive Evolution**: Future schema changes in v0.10+ must be additive (optional fields with defaults).
3. **Up-Migration on Read**: When a durable adapter reads a record where `schemaVersion < CURRENT_SCHEMA_VERSION`, it executes an in-memory upgrader function before mapping to domain entities.
4. **No In-Place Downgrades**: Downgrading binary versions across major schema versions is unsupported; database migrations must preserve backward-read capability.

---

## 10. Idempotency Strategy

In distributed systems and HTTP REST APIs, network dropouts or client retries can cause duplicate `POST /api/v1/operations` submissions.

### Strategy:
1. **Client-Assigned Operation IDs**:
   - The platform supports caller-supplied `id` in `CreateOperationRequest`.
   - The repository enforces unique identity constraint on `operation.id`.
   - If a caller retries a request with an existing `id`:
     - If the existing operation has identical parameters: return the existing operation (Idempotent OK).
     - If the existing operation has different parameters or is already executing: reject with `OperationConflictError` (HTTP `409 Conflict`).
2. **Idempotency Key (Future REST Enhancement)**:
   - For auto-generated IDs, clients may supply an `Idempotency-Key` HTTP header.
   - An idempotency registry maps `Idempotency-Key -> OperationId` with a TTL to deduplicate requests within a 24-hour window.

---

## 11. Concurrency Strategy

To prevent lost updates when two execution contexts attempt to mutate the same operation concurrently:

### Optimistic Concurrency Control (OCC)
1. Every `AutonomousOperation` record maintains an integer `version` (starting at `1`).
2. Every mutation increments the version (`version + 1`).
3. When saving an update, the repository verifies:
   ```sql
   UPDATE operations SET status = :status, version = :nextVersion ...
   WHERE id = :id AND version = :expectedVersion;
   ```
4. If zero rows are updated, the repository throws `PersistenceConflictError` (or `OperationConflictError`).
5. Application services do NOT perform silent overwrites.

In the in-memory adapter, OCC is simulated by comparing stored `version` against current `version`.

---

## 12. Atomicity Strategy

An autonomous operation execution produces multi-part state updates:
- Operation status transition (e.g. `RUNNING -> COMPLETED`).
- Autonomy consumption increment (steps, duration, tool calls).
- New observation recorded.
- New decision evaluated.

### Transaction Boundary:
- All four components belong to the same Aggregate Root (`AutonomousOperation`).
- Persistence MUST be atomic:
  - **All-or-Nothing**: Either the operation status, consumption, observation, and decision are committed together, or none of them are.
  - Partial persistence (e.g., observation committed but status update aborted) is strictly forbidden as it violates aggregate integrity.
- In durable adapters (SQLite/PostgreSQL), commits must execute inside a database transaction (`BEGIN TRANSACTION ... COMMIT`).
- In `InMemoryOperationRepository`, atomicity is guaranteed by synchronous in-memory JavaScript event loop execution and atomic `Map.set()`.

---

## 13. Recovery Strategy (Post-Crash Recovery)

If the platform process crashes (OOM, SIGKILL, host power outage, unhandled exception) while one or more operations are in `RUNNING` status:

### Crash State Dilemma
- In-memory storage: All state is lost.
- Durable storage: The database still contains rows with `status = "RUNNING"`, but the operating system process executing them has died.

### Recovery Protocol:
1. **No Automatic Unsupervised Resume**: Resuming execution automatically upon process restart is unsafe because external tools or actions executed prior to the crash may have had non-idempotent side effects.
2. **Startup Reconciliation Scan**:
   - On application startup, `AutonomousOperationService.reconcileStrandedOperations()` scans for operations in `RUNNING` status.
   - Any stranded operation whose execution thread is non-existent is transitioned to `FAILED`:
     - `terminationReason = "PROCESS_TERMINATED_ABRUPTLY"`
     - `failureError = { code: "PROCESS_CRASH_RECOVERY", message: "Process terminated unexpectedly while operation was running" }`
   - A correlated event `autonomous_operation.recovered_from_crash` is emitted.
3. **Explicit Operator Action**: If an operation needs re-execution, an operator or client must submit a new operation.

---

## 14. Exactly-Once vs. At-Least-Once Analysis

| Model | Feasibility in AI Operating Platform | Analysis |
| :--- | :--- | :--- |
| **Exactly-Once Execution** | **Impossible** | `CoreRuntime` invokes external language models and real-world tools (e.g., file writes, HTTP requests). If a crash occurs after tool execution but before state persistence, re-execution causes duplicate tool side effects. Exactly-once physical execution cannot be achieved across non-transactional external systems. |
| **At-Least-Once Execution** | **Dangerous** | Replaying autonomous cycles unconditionally risks repeating non-idempotent tool actions (e.g., duplicate financial charges, duplicate data mutations). |
| **At-Most-Once Execution** | **Selected Operational Guarantee** | Once an autonomous step is initiated, if execution fails or crashes, the platform marks the step/operation failed rather than guessing whether external side effects occurred. The operator maintains sovereign control over whether to retry. |

**Architectural Principle**: Durable persistence guarantees **durable auditable state**, NOT magic exactly-once distributed execution.

---

## 15. Repository Contract Strategy

The domain repository port must remain lean, use-case driven, and persistence-agnostic.

### Repository Port (`OperationRepositoryPort`)
```typescript
export interface OperationRecord {
  readonly operation: AutonomousOperation;
  readonly plan?: Plan | undefined;
  readonly observations: readonly Observation[];
  readonly decisions: readonly Decision[];
}

export interface OperationRepositoryPort {
  save(
    operation: AutonomousOperation,
    details?: {
      readonly plan?: Plan | undefined;
      readonly observations?: readonly Observation[] | undefined;
      readonly decisions?: readonly Decision[] | undefined;
    }
  ): void | Promise<void>;

  findById(id: string): AutonomousOperation | undefined | Promise<AutonomousOperation | undefined>;
  findRecordById(id: string): OperationRecord | undefined | Promise<OperationRecord | undefined>;
  list(): readonly AutonomousOperation[] | Promise<readonly AutonomousOperation[]>;
  listRecords(): readonly OperationRecord[] | Promise<readonly OperationRecord[]>;
}
```

### Future Evolution of the Port:
In Increment #2+, when asynchronous durable adapters are introduced, application services will uniformly `await` repository operations. Supporting `void | Promise<void>` maintains 100% backward compatibility with existing synchronous in-memory tests while paving the way for async I/O.

---

## 16. Query Strategy (CQRS)

Mutations (`OperationRepositoryPort`) and Queries (`OperationQueryPort`) are strictly separated:

1. **Read Projections**:
   - `OperationProjection`: Lightweight summary (id, agentId, status, budget, consumption, timestamps).
   - `OperationDetailProjection`: Deep graph (includes Plan, steps, observations, decisions).
2. **Defensive Isolation**:
   - Projections contain plain data transfer objects (DTOs) with immutable arrays and defensive object copies.
   - Projections never expose references to live domain aggregate instances.
3. **Index Optimization (Durable Storage)**:
   - Durable schemas must index: `id` (PK), `agentId` (secondary index), `status` (filtering), `createdAt` (chronological ordering).

---

## 17. Security Considerations

When durable persistence is connected in future increments, the following attack vectors must be mitigated at the architectural boundary:

1. **SQL Injection Prevention**:
   - Zero raw string concatenation in queries.
   - Mandatory parameterized queries (`$1, $2` in Postgres; `?` in SQLite).
2. **Credential Isolation**:
   - Connection strings and database credentials must NEVER be checked into Git, hardcoded in ADRs, logged in events, or exposed via the REST API / Web UI.
   - Credentials must be supplied via environment variables (`DATABASE_URL`).
3. **Payload Sanitization & Size Limits**:
   - Stored outputs, inputs, and metadata must adhere to the 1 MB HTTP payload limit established in v0.9.
   - Stored objects must be checked against prototype pollution (`__proto__`, `constructor`, `prototype`).
4. **Data Isolation**:
   - Memory partitions and agent boundaries (`memoryScope`) must be preserved across storage boundaries.

---

## 18. Testing Strategy

Persistence testing in v0.10 is divided into four distinct test categories:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Unit Tests (Domain Contracts)                            │
│    - AutonomousOperation, Plan, Observation, Decision       │
├─────────────────────────────────────────────────────────────┤
│ 2. Reusable Contract Test Suite                             │
│    - tests/contract/operation-repository.contract.test.ts   │
│    - Runs identically on InMemory & Durable Adapters        │
├─────────────────────────────────────────────────────────────┤
│ 3. Integration Tests (Future Increment #2+)                 │
│    - Real database engine (SQLite / PostgreSQL)             │
│    - Transaction rollback and connection lifecycle          │
├─────────────────────────────────────────────────────────────┤
│ 4. Crash Recovery & Idempotency Tests (Future Increment #3+)│
│    - Process kill / restart simulation                      │
│    - Reconciliation of stranded RUNNING operations          │
└─────────────────────────────────────────────────────────────┘
```

The reusable Contract Test Suite (`runOperationRepositoryContractTests`) guarantees that any new adapter satisfies identical behavioral invariants before it can be merged.

---

## 19. Alternatives Considered

1. **Prisma / TypeORM / Drizzle**:
   - *Rejected*: Violates the zero external runtime dependencies constraint (`npm ls --omit=dev` must remain empty). ORMs also bleed annotations and relational coupling into domain models.
2. **Pure File-per-Operation JSON Persistence**:
   - *Rejected*: Writing flat JSON files per operation lacks atomic multi-file updates, lacks transactional indexing, and suffers from concurrency race conditions.
3. **Distributed Event Store (e.g. EventStoreDB, Kafka)**:
   - *Rejected*: Massive operational overhead, violates single-process autonomy invariants, unnecessary for bounded workloads.
4. **In-Memory-Only (Status Quo)**:
   - *Rejected*: Unacceptable for enterprise deployment due to data loss on process restart.

---

## 20. Decision

1. **Adopt Hybrid State Snapshot + Structured Historical Log** as the official persistence model for `AutonomousOperation`.
2. **Confirm `AutonomousOperation` as the sole Aggregate Root** owning Plan, Observations, and Decisions.
3. **Establish `schemaVersion: 1`** as mandatory envelope metadata for all future serialized records.
4. **Enforce Optimistic Concurrency Control (OCC)** using aggregate `version` tracking.
5. **Designate At-Most-Once execution** as the platform's honest guarantee for crash recovery, with startup reconciliation transitioning stranded operations to `FAILED`.
6. **Implement Reusable Contract Test Suite** (`tests/contract/operation-repository.contract.test.ts`) to enforce contract parity across all current and future repository implementations.

---

## 21. Consequences

### Positive:
- Clean, robust path to SQLite and PostgreSQL persistence without domain pollution.
- Reusable contract test suite guarantees zero behavioral drift between in-memory testing and production storage.
- Crash recovery and concurrency failure modes are mathematically bounded and predictable.
- Zero runtime dependencies constraint is strictly maintained.

### Trade-offs:
- Future async repository operations will require `AutonomousOperationService` methods to be `async` where they are currently synchronous.
- `AutonomousOperation` will need an optional `version` and `metadata` property in future increments to fully support OCC in durable engines.

---

## 22. Future Evolution

- **v0.10 Increment #2**: SQLite Durable Adapter (Embedded zero-dependency persistence utilizing Node.js 22+ native `node:sqlite` or compliant native driver).
- **v0.10 Increment #3**: PostgreSQL Durable Adapter for enterprise multi-instance deployments.
- **v0.10 Increment #4**: Startup Crash Recovery & Reconciliation Engine.
- **v0.10 Increment #5**: Production Hardening & Persistence Release Freeze.
