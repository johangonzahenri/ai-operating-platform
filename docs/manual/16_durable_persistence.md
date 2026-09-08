# Chapter 16: Durable Persistence Architecture

> **Architecture Status**: **v0.10 INCREMENT #1 COMPLETED** (Persistence Architecture & Contract Baseline). This chapter documents the architectural contracts, boundaries, and design invariants for durable persistence in the AI Operating Platform.

---

## 1. Executive Overview

In **v0.9 Bounded Autonomous Operations**, the platform established an in-memory repository architecture (`InMemoryOperationRepository`) satisfying `OperationRepositoryPort` and `OperationQueryPort`. While suitable for testing and single-lifecycle runs, in-memory storage loses all operational data upon process termination.

**Milestone v0.10 Durable Persistence** bridges volatile execution and enterprise durability. Its goal is to allow autonomous operations, plans, observations, and decisions to survive process restarts, host failures, and redeployments—without polluting domain entities with database or SQL concerns.

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
│                     Future Increments                       │
│           Concrete Adapters (SQLite / PostgreSQL)           │
│        Zero-dependency, production-grade durable storage    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. The Persistence Boundary

The platform strictly adheres to Hexagonal Architecture (Ports and Adapters). Storage engines and drivers are treated as external infrastructure plugins:

```text
Domain / Application Layer (Pure TypeScript)
   ├── OperationRepositoryPort (Write/Mutation Interface)
   └── OperationQueryPort (Read/Projection Interface)
             ▲
             │ implements
Infrastructure Layer (Adapters)
   ├── InMemoryOperationRepository (Testing & Local Determinism)
   └── DurableOperationRepository* (Future SQLite / PostgreSQL)
             │
             ▼
Physical Storage Layer
   └── Disk / Embedded Engine / Network RDBMS
```

### Core Invariant: Domain Purity
- Domain files (`src/domain/`) NEVER import database drivers, SQL builders, connection pools, or file system modules.
- Domain aggregates (`AutonomousOperation`, `Plan`, `Observation`, `Decision`) are persistence-unaware plain TypeScript objects with immutable snapshots.

---

## 3. The Aggregate Root: AutonomousOperation

In Domain-Driven Design, persistence transactions must operate on consistency boundaries defined by Aggregate Roots.

- **`AutonomousOperation` is the Aggregate Root**: It governs its lifecycle state machine, `AutonomyBudget`, and `AutonomyConsumption`.
- **Child Entities**: `Plan` (with `PlanStep`s), `Observation`s, and `Decision`s are owned by their parent operation. They are never saved, updated, or deleted independently.
- **Atomicity**: Any persistence operation updating an autonomous operation must commit the operation state and its newly appended observations and decisions in a single atomic transaction. Partial saves are strictly forbidden.

---

## 4. Snapshot vs. Event Sourcing

The platform adopts a **Hybrid State Snapshot + Structured Historical Log** architecture:
1. **Aggregate State Snapshot**: Captures the current operation status, budget, consumption, timestamps, termination reasons, failure errors, and final outputs.
2. **Structured Historical Log**: Preserves the complete, ordered sequence of all plan steps, observations, and decisions executed throughout the operation's lifecycle.

This model provides full regulatory and audit traceability without the operational complexity and rehydration overhead of a pure Event Sourcing engine.

---

## 5. Architectural Guardrails for Durability

### 5.1 Schema Versioning
All persisted payloads are enveloped with an explicit `schemaVersion: 1`. Future schema evolutions must be additive and support on-the-fly up-migration during repository reads.

### 5.2 Optimistic Concurrency Control (OCC)
To prevent lost updates across concurrent callers, persisted records maintain a monotonic `version` integer. Updates must assert matching versions; conflicts reject with `OperationConflictError` rather than silently overwriting state.

### 5.3 Crash Recovery Protocol
If the Node.js process crashes while operations are in `RUNNING` status:
- **No Automatic Unsupervised Resumption**: The platform avoids replaying operations automatically because external tools and actions may have non-idempotent real-world side effects.
- **Startup Reconciliation**: On startup, stranded `RUNNING` operations are marked `FAILED` with error code `PROCESS_CRASH_RECOVERY` and reason `PROCESS_TERMINATED_ABRUPTLY`.
- **Guarantee**: The platform guarantees **At-Most-Once Execution** across process failures.

---

## 6. Reusable Contract Test Suite

To guarantee that in-memory repositories and future durable adapters behave with 100% fidelity, the platform provides a reusable Contract Test Suite in `tests/contract/operation-repository.contract.test.ts`:

```typescript
import { runOperationRepositoryContractTests } from "./operation-repository.contract.test.js";
import { InMemoryOperationRepository } from "../../src/infrastructure/persistence/in-memory-operation-repository.js";

// Validates compliance across 8 core contract test cases
runOperationRepositoryContractTests(
  "InMemoryOperationRepository",
  () => new InMemoryOperationRepository()
);
```

Every future database adapter (e.g., `SqliteOperationRepository` or `PostgresOperationRepository`) must pass this identical test suite before being eligible for merge.

---

## 7. Current vs. Future Implementation Status

| Feature / Capability | v0.9 (Current Baseline) | v0.10 Inc #1 (This Increment) | Future Increments |
| :--- | :--- | :--- | :--- |
| **InMemory Adapter** | ✅ Implemented | ✅ Maintained & Contract Tested | ✅ Retained for tests |
| **Contract Test Suite** | ❌ None | ✅ Reusable Suite Implemented | ✅ Mandatory for all adapters |
| **Persistence ADR** | ❌ None | ✅ ADR 0015 Approved | ✅ Architectural source of truth |
| **SQLite Adapter** | ❌ Not implemented | ❌ Not implemented (Planned) | ⏳ v0.10 Increment #2 |
| **PostgreSQL Adapter** | ❌ Not implemented | ❌ Not implemented (Planned) | ⏳ v0.10 Increment #3 |
| **Crash Recovery Engine** | ❌ None | ❌ Architecture defined | ⏳ v0.10 Increment #4 |
| **Runtime Dependencies** | 0 external packages | 0 external packages | 0 external packages (Native APIs) |
