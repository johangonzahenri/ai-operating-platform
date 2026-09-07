# Chapter 3: Core Engine Architecture

## 1. CoreRuntime & Execution Strategies

The `CoreRuntime` acts as the execution engine for all workloads. It orchestrates the lifecycle transitions of Tasks and Executions:

1. Creates and persists an initial `Execution` (`CREATED`).
2. Publishes correlated lifecycle events (`context.created`, `task.created`, `execution.created`).
3. Transitions state to `RUNNING` and starts execution via a pluggable `ExecutionStrategy`.
4. Evaluates governance policies (`PolicyGateway.evaluate()`).
5. Handles successful outcomes or operational failures, persisting terminal states and publishing final events (`execution.completed`, `task.completed`, or `execution.failed`, `task.failed`).

### Execution Strategies
- **`ModelExecutionStrategy`**: Dispatches task input directly to a configured `ModelGateway` after policy verification.
- **`OrchestratedExecutionStrategy`**: Dispatches a multi-operation pipeline to the `SequentialOrchestrator`, coordinating output bindings between models and tools.

## 2. Capability Gateways

- **`ModelGateway`**: Vendor-neutral interface for model inference (`generate()`). Includes request validation, deterministic stubs, and provider error classification.
- **`ToolGateway`**: Capability execution engine. Validates input schemas, checks registry membership, evaluates policy permissions, executes registered `Tool` implementations, and records telemetry.

## 3. Observability & Governance Subsystems

- **`EventPublisher`**: Publishes asynchronous domain events across all operational steps.
- **`InMemoryAuditLog`**: Stores ordered, immutable audit records queryable by trace ID or execution ID.
- **`InMemoryMetricsCollector`**: Aggregates dimensional metrics and counters (`policy.allowed`, `operation.completed`, `task.duration_ms`).
- **`PolicyGateway`**: Gatekeeper evaluating authorization rules with strict fail-closed behavior on policy denial or runtime exceptions.
