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

## v0.1 domains

| Domain | Responsibility | Boundary |
| --- | --- | --- |
| Task System | Task lifecycle, result and failure | No models, tools, transport or persistence knowledge |
| Task Execution Use Case | Executes a task with an agent | Calls Model Gateway through a port; no standalone runtime component exists in v0.1 |
| Agent | Declarative agent identity and capability | No embedded provider implementation |
| Model Gateway | Uniform model invocation contract | Providers live in infrastructure |
| Events | Immutable execution facts and publishing port | Subscribers are decoupled |
| Policy | Extension point for authorization decisions | No IAM implementation in v0.1 |
| Observability | Structured logs with trace correlation | Event subscriber, not domain behavior |

Tool Registry, Tool Execution, Context, Memory and Orchestration are reserved extension boundaries in this release; they are not prematurely implemented.

## Execution flow

`ExecuteTask` is the v0.1 task-execution use case: it validates a task transition, publishes lifecycle events, invokes an agent through the `ModelGateway` port, and records the result. `StructuredEventLogger` subscribes to the event publisher and emits JSON logs carrying the same `traceId`.
