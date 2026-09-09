# 0017. Core Execution Domain Rehydration Boundary

- **Date:** 2026-09-08
- **Status:** Approved
- **Author:** Staff/Principal Software Architect + DDD Engineer + Persistence Engineer
- **Corpus / Milestone:** v0.11 — Domain Architecture & Rehydration (Increment #2)

---

## 1. Context

In milestone **v0.11 Increment #1 (ADR 0016)**, the platform established a formal domain rehydration boundary on `AutonomousOperation` (`AutonomousOperation.rehydrate()`), eradicating reflection (`Reflect.construct`) across persistence adapters and enforcing aggregate invariants, value object reconstitution, and runtime immutability.

However, the platform's underlying Core Execution Engine—comprising `Task` (`src/domain/task/task.ts`) and `Execution` (`src/domain/execution/execution.ts`) coordinated by `CoreRuntime`—suffered from an identical encapsulation gap:
1. **Private Constructor Without Rehydration Factory**: Both `Task` and `Execution` declared private constructors and only exposed factory methods (`Task.create()`, `Execution.create()`) that hardcoded the initial `CREATED` status.
2. **Persistence Impossibility Without Reflection**: Any infrastructure persistence adapter attempting to restore tasks or executions from persistent storage in intermediate or terminal states (`QUEUED`, `RUNNING`, `WAITING`, `COMPLETED`, `FAILED`, `CANCELLED`) was physically unable to do so without either bypassing the constructor via reflection or making constructors public and mutable.
3. **Runtime Mutability**: While properties were marked `readonly` at the TypeScript level, neither `Task` nor `Execution` invoked `Object.freeze(this)`, leaving instances vulnerable to runtime property alteration.
4. **Missing Invariant Verification**: No domain-level invariant validator existed to guarantee that restored states satisfied business rules (e.g. `COMPLETED` tasks must retain valid outputs; `FAILED` executions must retain errors; timestamps must obey chronological order).

---

## 2. Problem

Without formal domain rehydration boundaries on `Task` and `Execution`:
1. Future durable persistence adapters (such as `SqliteTaskRepository` and `SqliteExecutionRepository` planned for v0.12) would be forced to resort to `Reflect.construct`, repeating the exact architectural debt eliminated in Increment #1.
2. Corrupted or partially persisted records could produce invalid in-memory aggregates, compromising execution safety.
3. Domain encapsulation would remain compromised across the core execution layer.

---

## 3. Decision

We establish **formal, explicit rehydration boundaries** within the Domain layer for both `Task` and `Execution`.

### 3.1 Static Factory Methods & Props Interfaces

Both entities now expose dedicated rehydration contracts:

```typescript
export interface TaskRehydrateProps {
  readonly id: string;
  readonly traceId: string;
  readonly request: TaskRequest;
  readonly status: TaskStatus;
  readonly createdAt: Date;
  readonly result?: TaskResult | undefined;
  readonly error?: TaskError | { readonly code: string; readonly message: string } | undefined;
}

export class Task {
  // ...
  static rehydrate(props: TaskRehydrateProps): Task;
}
```

```typescript
export interface ExecutionRehydrateProps {
  readonly id: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: ExecutionStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly resultMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: TaskError | { readonly code: string; readonly message: string } | undefined;
}

export class Execution {
  // ...
  static rehydrate(props: ExecutionRehydrateProps): Execution;
}
```

### 3.2 Strict Invariant Validation

The `rehydrate` factories enforce complete domain validation fail-closed:
- **Identifier Validation**: Non-empty strings for `id`, `taskId`, `traceId`, and `agentId`.
- **Status Validation**: Rejection of unknown statuses.
- **Timestamp Consistency**:
  - `createdAt` must be a valid `Date`.
  - For `Execution`: `startedAt >= createdAt`, `completedAt >= createdAt`, and `completedAt >= startedAt`.
  - For `Task`: `result.completedAt >= createdAt`.
- **Status-Specific State Invariants**:
  - `Task`:
    * `COMPLETED`: Requires `result` (`output`, `completedAt`); strictly forbids `error`.
    * `FAILED`: Requires `error` (`code`, `message`); strictly forbids `result`.
    * `CREATED`, `QUEUED`, `RUNNING`, `WAITING`, `CANCELLED`: Strictly forbid both `result` and `error`.
  - `Execution`:
    * `CREATED`: Forbids `startedAt`, `completedAt`, `resultMetadata`, and `error`.
    * `RUNNING`: Requires `startedAt`; forbids `completedAt`, `resultMetadata`, and `error`.
    * `COMPLETED`: Requires `completedAt` and `resultMetadata`; strictly forbids `error`.
    * `FAILED`: Requires `completedAt` and `error`; strictly forbids `resultMetadata`.
    * `CANCELLED`: Requires `completedAt`; strictly forbids `resultMetadata` and `error`.

### 3.3 Runtime Immutability & Defensive Copying

- **Instance Freezing**: Both constructors execute `Object.freeze(this)`.
- **Payload Freezing**: Deep defensive copying is performed:
  - `Task`: Freezes `request`, `request.input`, `result`, `result.output`, and `error`.
  - `Execution`: Freezes `resultMetadata` and `error`.
- **Timestamp Cloning**: All `Date` instances are cloned to prevent external temporal mutation.

### 3.4 Authentic Prototype Preservation

Rehydration produces authentic domain instances satisfying:
```typescript
rehydratedTask instanceof Task === true;
Object.getPrototypeOf(rehydratedTask) === Task.prototype;

rehydratedExecution instanceof Execution === true;
Object.getPrototypeOf(rehydratedExecution) === Execution.prototype;
```

---

## 4. Consequences

### Positive:
- **Reflection Eliminated**: Zero use of `Reflect.construct`, `constructor.call`, or `Object.create` in aggregate reconstruction.
- **Encapsulation Preserved**: Constructors remain private; invalid entities cannot be instantiated.
- **Fail-Closed Protection**: Inconsistent or corrupted persisted data is rejected immediately at domain boundary.
- **Foundation for Durable Adapters**: Enables `SqliteTaskRepository` and `SqliteExecutionRepository` in v0.12 with clean, type-safe mapping.
- **100% Backward Compatible**: Existing creation, transition, and execution workflows remain untouched.

### Neutral:
- Two new domain interfaces exported: `TaskRehydrateProps` and `ExecutionRehydrateProps`.

---

## 5. Alternatives Rejected

1. **Public Mutable Constructors**:
   - *Rejected*: Violates Domain-Driven Design; permits callers to bypass invariant checks and mutate state unpredictably.
2. **Reflection via `Reflect.construct`**:
   - *Rejected*: Fragile, unvalidated, tightly coupled to positional constructor parameters.
3. **Replaying Transitions from `CREATED`**:
   - *Rejected*: Inefficient, produces spurious domain events, and fails for states with missing intermediate transition data.
