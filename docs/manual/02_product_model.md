# Chapter 2: The Product Model

## 1. Domain Entities & Aggregates

The platform domain is structured around well-defined domain aggregates:

### 1.1 Task
- Represents a durable unit of business intent requested by an actor or agent.
- Attributes: `id`, `traceId`, `request` (`agentId`, `input`), `status`, `createdAt`, `result` (`output`), `error` (`code`, `message`).
- Lifecycle: `QUEUED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`.
- Invariant: A Task cannot hold both a durable `result` and an `error`.

### 1.2 Execution
- Represents a single operational attempt to fulfill a Task.
- Attributes: `id`, `taskId`, `traceId`, `status`, `startedAt`, `completedAt`, `resultMetadata`, `error`.
- Lifecycle: `CREATED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`.
- Invariant: Terminal transitions are strictly monotonic and irreversible.

### 1.3 Execution Context
- The isolated execution scope holding runtime values, bound operation inputs, and correlation IDs.
- Attributes: `executionId`, `taskId`, `traceId`, immutable `initialInput`, and mutable key-value state updated across operation steps.

## 2. Projections & Port Decoupling

To prevent leaking mutable domain aggregates into external presentation layers, the platform uses **Read Projections**:
- `TaskProjection`: Read-only view of task state without mutating methods.
- `ExecutionProjection`: Read-only view of execution state and metadata.
- `AuditObservationProjection`: Immutable operational log entry.
- `ToolProjection`: Capability descriptor.
- `ModelProjection`: AI model provider descriptor.

Read query ports (`TaskQueryPort`, `ExecutionQueryPort`, `AuditQueryPort`, `MetricsQueryPort`, `ToolQueryPort`, `ModelQueryPort`) allow the Platform layer to query state cleanly without accessing persistence internals directly.
