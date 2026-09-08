# 0016. Formal Domain Rehydration Boundary

- **Date:** 2026-09-08
- **Status:** Approved
- **Author:** Staff/Principal Software Architect + DDD Engineer + Persistence Engineer
- **Corpus / Milestone:** v0.11 — Domain Architecture & Rehydration (Increment #1)

---

## 1. Context

In milestone **v0.10 Durable Persistence (Increment #2)**, the platform introduced its first native SQLite storage engine and `SqliteOperationRepository`. To restore `AutonomousOperation` aggregate roots from relational SQLite rows without exposing a public mutable constructor, the infrastructure mapper (`sqlite-mapper.ts`) utilized JavaScript reflection:

```typescript
return Reflect.construct(AutonomousOperation, [
  row.id,
  row.objective,
  row.agent_id,
  budget,
  consumption,
  row.status,
  new Date(row.created_at),
  row.started_at ? new Date(row.started_at) : undefined,
  row.completed_at ? new Date(row.completed_at) : undefined,
  row.termination_reason ?? undefined,
  failureError,
  resultOutput,
]);
```

While functional and compliant with basic hexagonal isolation, relying on `Reflect.construct` introduced architectural debt:
1. **Implicit Coupling**: The infrastructure mapper relied on positional constructor arguments of a private constructor.
2. **Bypassed Invariant Checking**: Aggregate instantiation via reflection bypassed domain-level state verification.
3. **Fragility**: Refactoring constructor parameter ordering could silently break persistence rehydration without compiler warnings.

---

## 2. Decision

We establish an **explicit, formal rehydration boundary** within the Domain layer.

### 2.1 Static Domain Factory: `AutonomousOperation.rehydrate`

The aggregate root `AutonomousOperation` now publishes a dedicated rehydration factory method and accompanying props interface:

```typescript
export interface AutonomousOperationRehydrateProps {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudget;
  readonly consumption: AutonomyConsumption;
  readonly status: AutonomousOperationStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly terminationReason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;
}

export class AutonomousOperation {
  // ...
  static rehydrate(props: AutonomousOperationRehydrateProps): AutonomousOperation;
}
```

### 2.2 Boundary Invariants

The `rehydrate` factory strictly validates all domain invariants:
- **Identity & Agent ID**: Enforces alphanumeric/dash/underscore format (`1-128` characters).
- **Objective**: Enforces non-empty string with a maximum length of 4096 characters.
- **Value Objects**: Strictly validates that `budget` is an instance of `AutonomyBudget` and `consumption` is an instance of `AutonomyConsumption`.
- **Status Validity**: Validates that `status` belongs to `AutonomousOperationStatus`.
- **Terminal State Consistency**: Requires a valid `failureError` (non-empty code and message) when `status` is `"FAILED"`.
- **Immutability**: Freezes `failureError`, `resultOutput`, and the constructed aggregate root instance (`Object.freeze(this)`).
- **Prototype Preservation**: Produces authentic `AutonomousOperation` instances satisfying `instanceof AutonomousOperation`.

### 2.3 Decoupled Infrastructure Mapper

The SQLite mapper delegates rehydration to the domain factory:

```typescript
return AutonomousOperation.rehydrate({
  id: row.id,
  objective: row.objective,
  agentId: row.agent_id,
  budget,
  consumption,
  status: row.status as AutonomousOperationStatus,
  createdAt: new Date(row.created_at),
  startedAt: row.started_at ? new Date(row.started_at) : undefined,
  completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  terminationReason: row.termination_reason ?? undefined,
  failureError,
  resultOutput,
});
```

`Reflect.construct` is completely eliminated from infrastructure persistence mappers.

---

## 3. Consequences

### Positive
- **Zero Reflection**: Aggregate reconstruction is type-safe, explicit, and checked at compile time.
- **Strict Invariant Enforcement**: Corrupted or inconsistent database rows fail closed with `AutonomousOperationValidationError`.
- **Encapsulation Preserved**: The `private constructor` remains private, preventing callers from bypassing business rules when instantiating new operations.
- **Domain Purity**: The Domain layer remains 100% agnostic of databases, SQL, drivers, and file systems.
- **Multi-Adapter Reusability**: Future persistence adapters (e.g. PostgreSQL, Redis) utilize the exact same rehydration boundary.

### Neutral
- An additional export `AutonomousOperationRehydrateProps` is exposed in the domain autonomy module.
