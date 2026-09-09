# 0018. Agent Domain Rehydration Boundary

- **Date:** 2026-09-08
- **Status:** Approved
- **Author:** Staff/Principal Software Architect + DDD Engineer + Persistence Engineer
- **Corpus / Milestone:** v0.11 — Domain Architecture & Rehydration (Increment #3)

---

## 1. Context

In milestones **v0.11 Increment #1 (ADR 0016)** and **v0.11 Increment #2 (ADR 0017)**, the platform established formal domain rehydration boundaries for:
- `AutonomousOperation` (`AutonomousOperation.rehydrate()`)
- `Task` (`Task.rehydrate()`)
- `Execution` (`Execution.rehydrate()`)

These boundaries eradicated reflection (`Reflect.construct`, `Object.create`, `constructor.call`) from persistence reconstruction, enforced fail-closed domain state invariants, instituted runtime immutability (`Object.freeze`), and preserved authentic prototypes.

However, the platform's third foundational aggregate—the `Agent` aggregate (`src/domain/agent/agent.ts`) governing AI model persona, tool permissions, instructions, memory scope, and execution eligibility—retained a similar encapsulation gap:
1. **Private Constructor Without Rehydration Factory**: `Agent` declared a private constructor accessible only via `Agent.create()`, which initialized default creation parameters (such as `version = 1` and status defaulted to `ACTIVE`).
2. **Persistence Impossibility Without Reflection**: Any persistent storage adapter (such as the upcoming `SqliteAgentRegistry` planned for v0.12) attempting to restore persisted agents in historical states (e.g. `INACTIVE`, incremented OCC `version > 1`, custom `createdAt` and `updatedAt` timestamps) would be forced to resort to reflection or public mutable constructors.
3. **Runtime Mutability**: While instance properties were declared `readonly` in TypeScript, instances were not frozen at runtime, leaving them susceptible to external mutation.
4. **Missing Rehydration Invariants**: Invariants such as OCC version (`version >= 1`), chronological timestamp consistency (`createdAt <= updatedAt`), and clean tool deduplication without function injection needed formal domain enforcement.

---

## 2. Problem

Without a formal domain rehydration boundary on `Agent`:
1. Future durable persistence adapters in v0.12 (`SqliteAgentRegistry`) would be forced to use reflection or compromise private constructors.
2. Incomplete or corrupted persisted records could reconstitute invalid agent aggregates, introducing integrity flaws into runtime governance.
3. The platform's aggregate rehydration architecture across v0.11 would remain incomplete.

---

## 3. Decision

We establish a **formal, explicit rehydration boundary** within the Domain layer for `Agent`.

### 3.1 Static Factory Method & Props Interface

The `Agent` class now exposes a dedicated rehydration contract:

```typescript
export interface AgentRehydrateProps {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly model: string;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
  readonly status: AgentStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Agent {
  // ...
  static rehydrate(props: AgentRehydrateProps): Agent;
}
```

### 3.2 Strict Invariant Validation

`Agent.rehydrate` enforces fail-closed domain validation:
- **Identifier**: Validated strictly via `validateAgentId(props.id)` (alphanumeric, dashes, underscores, 1–128 characters).
- **Name & Model**: Must be non-empty trimmed strings; whitespace-only or empty strings are rejected with `AgentValidationError`.
- **Status**: Must be strictly `"ACTIVE"` or `"INACTIVE"`; unexpected statuses or malformed values are rejected.
- **OCC Version**: Must be an integer `>= 1`. Floats, non-integers, zero, negative numbers, and `NaN`/`Infinity` are rejected.
- **Timestamps & Chronology**:
  - `createdAt` and `updatedAt` must be valid `Date` objects (`!Number.isNaN(time)`).
  - Chronological ordering is enforced: `updatedAt >= createdAt`.
- **Tools**: If defined, must be an array of non-empty strings. Functions and non-string elements are rejected. Duplicate tools are deduplicated.
- **Memory Scope**: If defined, must be a non-empty trimmed string; if omitted, defaults to canonical `agent-${id}`.

### 3.3 Runtime Immutability & Defensive Copying

- **Instance Freezing**: The private constructor executes `Object.freeze(this)`.
- **Tools Freezing**: Tools are deduplicated and frozen via `Object.freeze([...new Set(...)])`.
- **Timestamp Cloning**: `createdAt` and `updatedAt` are cloned via `new Date(...)` to prevent temporal tampering from outside references.

### 3.4 Authentic Prototype Preservation

Rehydration instantiates entities directly via `new Agent(...)` inside the domain aggregate class:
```typescript
rehydratedAgent instanceof Agent === true;
Object.getPrototypeOf(rehydratedAgent) === Agent.prototype;
```

### 3.5 Persistence Independence

`Agent.rehydrate` is a pure in-memory domain function. It has zero knowledge of SQLite, SQL, databases, filesystem, or HTTP.

---

## 4. Consequences

### Positive:
- **Unified Rehydration Across Domain**: Completes milestone v0.11 rehydration boundaries for all platform entities (`AutonomousOperation`, `Task`, `Execution`, `Agent`).
- **Zero Reflection**: Eliminates all requirements for `Reflect.construct`, `Object.create`, or `constructor.call` across persistence adapters.
- **Fail-Closed Governance**: Prevents invalid or corrupted agent definitions from entering the platform runtime.
- **Enables v0.12 Durable Storage**: Directly unblocks the implementation of `SqliteAgentRegistry` in v0.12.
- **100% Backward Compatible**: Existing `Agent.create()` behavior and lifecycle transitions (`update`, `activate`, `deactivate`, `toDefinition`) remain completely intact.

### Neutral:
- `AgentRehydrateProps` is exported from `src/domain/agent/agent.ts`.

---

## 5. Alternatives Rejected

1. **Public Mutable Constructors**:
   - *Rejected*: Violates encapsulation and allows unauthorized external state mutation.
2. **Reflection via `Reflect.construct`**:
   - *Rejected*: Fragile, unvalidated, and violates DDD principles.
3. **Generic `RehydratableEntity` Base Class**:
   - *Rejected*: Aggregate roots have unique lifecycle semantics, distinct state machines, and specialized invariants. A generic abstraction would introduce unnecessary framework coupling or type erasure.

---

## 6. Relation to Prior Work

- **ADR 0016**: Formalized `AutonomousOperation.rehydrate` (v0.11 Increment #1).
- **ADR 0017**: Formalized `Task.rehydrate` and `Execution.rehydrate` (v0.11 Increment #2).
- **ADR 0018**: Formalizes `Agent.rehydrate` (v0.11 Increment #3), completing milestone v0.11.
- **Foundation for v0.12**: Prepares the platform for unified SQLite durable repositories for operations, tasks, executions, and agents.
