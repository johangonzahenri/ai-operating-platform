# 0020. Crash Recovery and Restart Reconciliation

## Status

Accepted

## Context

In milestone v0.12, the AI Operating Platform implemented durable SQLite persistence (Schema Version 2) across the core aggregates: `Task`, `Execution`, and `Agent` (ADR 0019). While aggregates are persisted safely during standard runtime operations, abrupt process terminations (such as node crashes, unhandled panics, out-of-memory kills, or host power outages) present a critical consistency challenge.

When `CoreRuntime` executes a task, state transitions are committed across multiple sequential milestones:
1. `Execution` is created (`CREATED`) and persisted.
2. `Task` transitions to `QUEUED` and is persisted.
3. `Execution` transitions to `RUNNING` (`startedAt` set) and is persisted.
4. `Task` transitions to `RUNNING` and is persisted.
5. The execution strategy runs (invoking models, tools, or sub-operations).
6. `Execution` transitions to `COMPLETED`, `FAILED`, or `CANCELLED` and is persisted.
7. `Task` transitions to `COMPLETED`, `FAILED`, or `CANCELLED` and is persisted.

If the hosting Node.js process terminates abruptly at any point during steps 1 through 5:
- Entities remain persisted in non-terminal states (`CREATED`, `QUEUED`, `RUNNING`, `WAITING`).
- Upon restart, the runtime cannot distinguish between actively running processes and stranded "zombie" processes left behind by the terminated instance.
- If left unmanaged, stranded tasks create ambiguity, false active metrics, and potential race conditions.
- If blindly re-executed, non-idempotent operations (such as side-effecting tool calls or external model mutations) would be executed multiple times, violating at-most-once execution guarantees. Moreover, tasks that caused an engine crash (poison pills) would cause infinite restart-crash loops.

The platform requires a deterministic, idempotent, fail-closed, and auditable restart reconciliation mechanism for a single persistent runtime.

## Decision

We establish an explicit Crash Recovery and Restart Reconciliation policy and implement an application-layer `RestartRecoveryService`.

### 1. Fundamental Principles

The restart recovery process is governed by four strict properties:
1. **Deterministic**: Given any database state, recovery executes a known, predictable sequence of evaluations and transitions.
2. **Idempotent**: Executing recovery repeatedly on the same state yields identical results:
   $$\text{recover}(\text{recover}(\text{state})) = \text{recover}(\text{state})$$
   A second recovery pass produces zero mutations and touches no timestamps.
3. **Fail-Closed**: If unrecoverable data corruption or invalid state transitions occur, the process fails closed by throwing a typed infrastructure/application error and aborting startup. It never silently ignores or suppresses unknown errors.
4. **Auditable & Observable**: All reconciled entities record explicit error codes (`CRASH_RECOVERY` or `ORPHAN_EXECUTION`/`ORPHAN_TASK`) and detailed diagnostic messages. Structured events are published to the event bus and audit log.

### 2. Entity State Taxonomy

#### Terminal States (Immutable, Ignored by Recovery)
- **`Task`**: `COMPLETED`, `FAILED`, `CANCELLED`.
- **`Execution`**: `COMPLETED`, `FAILED`, `CANCELLED`.

In accordance with domain invariants, terminal entities can never undergo further state transitions. Recovery leaves all terminal entities completely untouched.

#### In-Flight / Stale States (Reconciled by Recovery)
- **`Task`**: `CREATED`, `QUEUED`, `RUNNING`, `WAITING`.
- **`Execution`**: `CREATED`, `RUNNING`.

### 3. Reconciliation Matrix & Lifecycle Scenarios

When `RestartRecoveryService` executes upon startup:

| Scenario | Persisted State | Crash Window | Recovery Action |
| :--- | :--- | :--- | :--- |
| **Case A** | `Task = QUEUED`<br>`Execution = CREATED` | Interrupted before execution start. | `Execution.cancel(now)` $\rightarrow$ `CANCELLED`<br>`Task.transition("CANCELLED")` $\rightarrow$ `CANCELLED` |
| **Case B** | `Task = QUEUED`<br>`Execution = RUNNING` | Crashed between `execution.start()` and `task.transition("RUNNING")`. | `Execution.fail(CRASH_RECOVERY, now)` $\rightarrow$ `FAILED`<br>`Task.transition("CANCELLED")` $\rightarrow$ `CANCELLED` |
| **Case C** | `Task = RUNNING`<br>`Execution = RUNNING` | Crashed while strategy/agent was executing. | `Execution.fail(CRASH_RECOVERY, now)` $\rightarrow$ `FAILED`<br>`Task.fail(CRASH_RECOVERY)` $\rightarrow$ `FAILED` |
| **Case D** | `Task = COMPLETED`<br>`Execution = COMPLETED` | Both completed prior to termination. | **No action** (Terminal). |
| **Case E** | `Task = FAILED`<br>`Execution = FAILED` | Both failed prior to termination. | **No action** (Terminal). |
| **Case F** | `Task` non-terminal<br>No `Execution` | Task submitted or enqueued without execution. | If `CREATED`, `QUEUED`, `WAITING` $\rightarrow$ `CANCELLED`<br>If `RUNNING` $\rightarrow$ `FAILED` (`ORPHAN_TASK`). |
| **Case G** | `Execution` non-terminal<br>No `Task` | Crashed between `Execution.create()` and `Task` save (valid window due to decoupled aggregates without physical FK). | If `CREATED` $\rightarrow$ `CANCELLED`<br>If `RUNNING` $\rightarrow$ `FAILED` (`ORPHAN_EXECUTION`). |

### 4. Double Execution Protection

To guarantee that previous aborted executions are never accidentally picked up or executed twice:
1. All in-flight entities are transitioned to terminal states (`FAILED` or `CANCELLED`).
2. Domain invariants prohibit terminal tasks or executions from being restarted or transitioned.
3. Resuming work requires an explicit operator or client action to submit a new task with a distinct task ID and trace ID.

### 5. Architectural Separation & Ports

Recovery orchestration is placed in the Application layer, preserving Hexagonal Architecture:
```text
Domain Layer (Task, Execution, Agent aggregates - untouched)
       ▲
Application Layer (RestartRecoveryService, RecoveryResult)
       ▲
Ports (RecoveryPort, TransactionRunner)
       ▲
Infrastructure Layer (SqliteDatabase, SqliteTaskRepository, SqliteExecutionRepository)
```

- **`RestartRecoveryService`**: Application service that scans repositories for non-terminal entities, pairs executions with tasks, and executes domain transitions within an atomic transaction.
- **`RecoveryPort`**: Application port exposing the reconciliation operation.
- **`TransactionRunner`**: Port abstracting the atomic transaction boundary (`run<T>(fn: () => T): T`) implemented by `SqliteDatabase.transaction()`.

### 6. Atomic SQLite Transaction & Rollback

Recovery of all affected tasks and executions is executed inside a single `BEGIN IMMEDIATE ... COMMIT` block.
If any unexpected database error occurs during the reconciliation batch, SQLite performs an automatic `ROLLBACK`, leaving the stored records unchanged and throwing a typed error to halt initialization.

### 7. Schema Version Compatibility

This architecture requires **zero schema changes**. Schema Version 2 contains all necessary columns (`status`, `completed_at`, `error_code`, `error_message`) to store reconciled states. Schema Version remains strictly `2`.

## Alternatives Considered

1. **Automatic Re-enqueuing of Interrupted Tasks**: Rejected. In-flight tasks may have executed irreversible real-world side effects (e.g. database updates, API webhooks, file creation). Automatically re-enqueuing them without human or policy oversight risks data corruption, duplicate charges, or poison-pill crash loops.
2. **Physical Foreign Key `executions.task_id -> tasks.id`**: Rejected in ADR 0019 and reaffirmed here. Case G illustrates that during crash recovery, an orphan `Execution` in `CREATED` state is cleanly detected and cancelled without relational database deadlocks.
3. **Recovery Logic Embedded Inside SQLite Repositories**: Rejected. Cross-aggregate coordination between `Task` and `Execution` belongs in the Application layer, not inside individual persistence adapters.

## Consequences

- **Positive**: Complete crash safety and clean startup reconciliation for a single persistent node.
- **Positive**: Strict prevention of double-execution and zombie task proliferation.
- **Positive**: Zero modifications required in Domain aggregate models.
- **Positive**: 100% idempotent and transactionally consistent.
- **Positive**: Full observability through structured events and recovery summaries.
- **Neutral**: Re-executing interrupted tasks requires manual resubmission or a future higher-level workflow retry orchestrator (deferred to future distributed milestones).
