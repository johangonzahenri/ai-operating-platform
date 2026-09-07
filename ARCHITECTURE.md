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

The existing layers are the **Core Engine**. The **Platform API** is the formal product boundary invoking application use case services and exposing stable, platform-facing contracts (`PlatformDTOs`). The **Web Platform Control Plane** (SPA) and external applications (including AI Commerce) consume that HTTP API; neither imports domain entities, repositories, runtime implementations, or infrastructure adapters.

## v0.8 domains

| Domain | Responsibility | Boundary |
| --- | --- | --- |
| Task System | Task lifecycle, result and failure | No models, tools, transport or persistence knowledge |
| Execution | A concrete attempt to run a Task | Own lifecycle, correlation IDs, result metadata and error |
| Execution Context | Small immutable operational context | Carries task, execution and trace identifiers only |
| Core Runtime | Creates execution/context and coordinates lifecycle | Application service; delegates work through an Execution Strategy |
| Agent | First-class capability configuration & identity | Model binding, instructions, tool whitelisting, memory scoping, lifecycle status |
| Agent Registry | Repository port for Agent entities | Domain port; in-memory adapter in infrastructure |
| Model Gateway | Uniform model invocation contract | Providers live in infrastructure |
| Tool Gateway | Explicit execution capability for a named tool | Validates then delegates to a registry-resolved adapter |
| Tool Registry | Resolves safe, local tool adapters | In-memory only; no remote discovery or plugins |
| Orchestration Use Case | Dispatches declared sequences through CoreRuntime | Standard operational lifecycle (`task`, `execution`, `agent`) |
| Orchestrator | Coordinates a declared sequence within an Execution | Sequential only; no planning, retries or parallelism |
| Context | Immutable execution-scoped input and transient state | No global mutable state or implicit tool access |
| Memory Gateway | Stores and retrieves scoped persistent values | Exact lookup only; adapters own storage technology |
| Audit / Metrics | Records what happened | Event subscribers isolated from execution success |
| Policy Gateway | Decides whether an operation is allowed | Centralized fail-closed enforcement on models, tools, and agents |
| Events | Immutable execution facts and publishing port | Subscribers are decoupled |
| Observability | Structured logs with trace correlation | Event subscriber, not domain behavior |
| Platform API | HTTP facade serving DTOs and managing static UI | Decoupled; receives application use cases via dependency injection |
| Web Platform | Single-Page Application (Control Plane) | Native zero-dependency DOM rendering, XSS-hardened |

Orchestration coordinates declared capabilities; it does not implement an agent loop or autonomous intelligence. Memory is explicitly read/written through its gateway and is not a retrieval or RAG system.

## Execution flow

`ExecuteTask` delegates to `CoreRuntime`. The runtime creates one Execution and ExecutionContext per invocation, coordinates Task and Execution transitions, and persists both through ports. `ModelExecutionStrategy` enforces policy through `PolicyGateway` before invoking the Model Gateway port. Events and structured logs carry the common `traceId`, `taskId`, and `executionId`.

`ExecuteOrchestration` is an application use case that routes orchestration requests through `CoreRuntime` using `OrchestratedExecutionStrategy`. Orchestration therefore traverses the exact same operational lifecycle (`task.created`, `task.started`, `execution.created`, `execution.started`, `execution.completed`, `task.completed`) as standard task executions.

`AgentService.executeAgent()` dispatches agent executions through `SubmitTask` and `CoreRuntime` using `AgentExecutionStrategy`. The strategy emits `agent.started`, evaluates fail-closed `PolicyGateway`, binds memory strictly to `agent.memoryScope`, validates tool invocations against `agent.tools` whitelist, and emits `agent.completed` or `agent.failed`.

`RegistryToolGateway` resolves a Tool Definition, validates a small provider-independent schema, invokes the tool adapter, and emits tool lifecycle events.

`SequentialOrchestrator` executes declared Model and Tool operations in order. Bindings can copy a named output from a prior operation into a later input. It stops on the first failure and emits orchestration/operation events with the same execution correlation identifiers.

`EventObservabilitySubscriber` records correlated audit observations and basic metrics without owning execution. `PolicyGateway` is evaluated immediately before each model generation, orchestration operation, and agent execution; deny and evaluation-unavailable are execution failures with distinct semantics (fail-closed).
