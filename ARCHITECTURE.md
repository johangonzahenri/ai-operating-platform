# Architecture

## Layers and dependency direction

```
Interfaces (future API / CLI)
        ↓
Application (use cases)
        ↓
Domain (entities, policies, ports, events)
        ↑
Infrastructure (adapters implementing domain ports)
```

The arrow toward the domain is intentional: application and infrastructure depend on domain contracts, never the reverse.

## Product boundaries

The existing layers are the **Core Engine**. A future Platform API will invoke application services and expose stable platform-facing contracts. The future Web Platform and external applications (including AI Commerce) consume that API; neither imports domain entities, repositories, runtime implementations, or infrastructure adapters.

## v0.6 domains

| Domain | Responsibility | Boundary |
| --- | --- | --- |
| Task System | Task lifecycle, result and failure | No models, tools, transport or persistence knowledge |
| Execution | A concrete attempt to run a Task | Own lifecycle, correlation IDs, result metadata and error |
| Execution Context | Small immutable operational context | Carries task, execution and trace identifiers only |
| Core Runtime | Creates execution/context and coordinates lifecycle | Application service; delegates work through an Execution Strategy |
| Agent | Declarative agent identity and capability | No embedded provider implementation |
| Model Gateway | Uniform model invocation contract | Providers live in infrastructure |
| Tool Gateway | Explicit execution capability for a named tool | Validates then delegates to a registry-resolved adapter |
| Tool Registry | Resolves safe, local tool adapters | In-memory only; no remote discovery or plugins |
| Orchestrator | Coordinates a declared sequence within an Execution | Sequential only; no planning, retries or parallelism |
| Context | Immutable execution-scoped input and transient state | No global mutable state or implicit tool access |
| Memory Gateway | Stores and retrieves scoped persistent values | Exact lookup only; adapters own storage technology |
| Audit / Metrics | Records what happened | Event subscribers isolated from execution success |
| Policy Gateway | Decides whether an operation is allowed | Enforced before model/tool invocation; evaluation fails closed |
| Events | Immutable execution facts and publishing port | Subscribers are decoupled |
| Policy | Extension point for authorization decisions | No IAM implementation in v0.1 |
| Observability | Structured logs with trace correlation | Event subscriber, not domain behavior |

Orchestration coordinates declared capabilities; it does not implement an agent loop or autonomous intelligence. Memory is explicitly read/written through its gateway and is not a retrieval or RAG system.

Future Agent Runtime will compose agent definition, model selection, tool selection, context and memory around an Execution. This does not require redefining Task or Execution.

## Execution flow

`ExecuteTask` delegates to `CoreRuntime`. The runtime creates one Execution and ExecutionContext per invocation, coordinates Task and Execution transitions, and persists both through ports. `ModelExecutionStrategy` invokes the Model Gateway port. Events and structured logs carry the common `traceId`, `taskId`, and `executionId` when available.

`RegistryToolGateway` resolves a Tool Definition, validates a small provider-independent schema, invokes the tool adapter, and emits tool lifecycle events. Tools receive only `ExecutionContext` and input: filesystem, shell, network, environment access and policy enforcement are deliberately out of scope until v0.6.

`SequentialOrchestrator` executes declared Model and Tool operations in order. Bindings can copy a named output from a prior operation into a later input. It stops on the first failure and emits orchestration/operation events with the same execution correlation identifiers.

`EventObservabilitySubscriber` records correlated audit observations and basic metrics without owning execution. `PolicyGateway` is evaluated by the orchestrator immediately before each declared operation; deny and evaluation-unavailable are execution failures with distinct semantics.
