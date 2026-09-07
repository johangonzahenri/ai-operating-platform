# Platform API Architecture (v0.7)

## Overview

Milestone v0.7 establishes the **Product Boundary** for the AI Operating Platform. It introduces a decoupled **Platform API** layer (`/api/v1`) and a native **Web Platform UI** (Control Plane) that allows operators, developers, and applications to monitor, inspect, and trigger Core Engine capabilities through stable HTTP REST contracts without directly depending on domain aggregates, application services, or in-memory repositories.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Web Platform UI (SPA Control Plane)                      │
│ Dashboard │ Agents (Preview) │ Models │ Tools │ Executions │ Detail │ etc.   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / JSON REST (/api/v1)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                              Platform API                                   │
│  PlatformDTOs │ PlatformService │ HttpRouter │ HttpServer                   │
│  Read Query Ports: TaskQueryPort, ExecutionQueryPort, ModelQueryPort, etc.  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Application Use Cases
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            Application Layer                                │
│  SubmitTask │ ExecuteOrchestration │ ExecuteTask                            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Runtime Ports
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                           Core Engine (v0.1-v0.6)                           │
│  CoreRuntime │ OrchestratedExecutionStrategy                                │
│  SequentialOrchestrator │ PolicyGateway.evaluate()                          │
│  AuditLog │ MetricsCollector │ ToolGateway │ ModelGateway                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architectural Principles

1. **Strict Product Boundary Separation & Hexagonal Decoupling:**
   - The Web Platform never imports or mutates Core Engine internals directly. It consumes the Platform API via `api-client.js`.
   - `PlatformService` does not construct infrastructure adapters, core repositories, or mutable domain entities. It receives read query ports (`TaskQueryPort`, `ExecutionQueryPort`, `AuditQueryPort`, `MetricsQueryPort`, `ToolQueryPort`, `ModelQueryPort`) and application use cases (`SubmitTask`, `ExecuteOrchestration`) via typed `PlatformDependencies` dependency injection.
   - Read projections (`TaskProjection`, `ExecutionProjection`, `AuditObservationProjection`, `MetricSampleProjection`, `ToolProjection`, `ModelProjection`) isolate read queries from domain mutation methods (`transition`, `complete`, `fail`).
   - Task submission delegates entirely to the `SubmitTask` application use case rather than instantiating `Task.create()` in the platform layer.

2. **Unified CoreRuntime Orchestration:**
   - Orchestration requests (`POST /api/v1/orchestrate`) invoke `ExecuteOrchestration`, an application use case executing through `CoreRuntime` with an `OrchestratedExecutionStrategy`.
   - Orchestrations traverse the identical operational lifecycle as atomic tasks (`context.created`, `task.created`, `task.started`, `execution.created`, `execution.started`, `policy.evaluated`, `execution.completed`, `task.completed`, etc.) and are fully persisted.
   - There is no parallel unmanaged execution path.

3. **Operation Output Granularity:**
   - Responses from `POST /api/v1/orchestrate` report the full array of executed operations, each containing `{ operationId, kind, status, output, error }`.
   - If an operation fails, subsequent operations are systematically marked `CANCELLED`.
   - Root output reflects the final operation output and is purged of internal operational bookkeeping fields.

4. **Zero External Runtime Dependencies:**
   - Implemented entirely using native Node.js standard modules (`node:http`, `node:fs`, `node:path`, `node:url`, `node:crypto`).
   - Built and checked with the official TypeScript compiler (`tsc`).

5. **Mandatory Centralized Fail-Closed Governance:**
   - Model executions and orchestration operations pass through `PolicyGateway.evaluate()`.
   - `PolicyGateway` is mandatory in both `ModelExecutionStrategy` and `SequentialOrchestrator`.
   - If a policy decision is denied or the evaluation engine errors out, execution fails closed with `PolicyEvaluationError` / `PolicyDeniedError` and publishes correlated audit events.

6. **HTTP Security & Request Normalization:**
   - **Loopback-Only Binding:** Server binds strictly to `127.0.0.1`.
   - **Strict CORS:** Restricted to loopback origins (`localhost`, `127.0.0.1`, `[::1]`).
   - **ID Normalization:** `normalizeId()` trims leading/trailing whitespace and validates against `^[a-zA-Z0-9_-]{1,128}$` across route parameters, agent IDs, trace IDs, and operation IDs.
   - **Payload Validation:** Non-empty object requirement for `input` (returns HTTP 400 instead of domain 500), payload size capped at 1MB (HTTP 413), and strict media type enforcement (`application/json`, HTTP 415).
   - **Path Traversal Protection:** Relative resolution within `WEB_DIR` blocks `..` traversal attempts with HTTP 403.
   - **XSS Defense:** The SPA Control Plane uses explicit DOM construction APIs (`createElement`, `textContent`) with zero `innerHTML` usage.

## API Specification (/api/v1)

All endpoints are primarily hosted under `/api/v1/` with backward-compatible aliases under `/api/`.

| Method | Path | Description | Status Codes |
|---|---|---|---|
| `GET` | `/` | Web Platform Control Plane (SPA) | 200, 404 |
| `GET` | `/api/v1/status` | System health, version, uptime, tool/model counts | 200 |
| `GET` | `/api/v1/models` | List registered AI models and capabilities | 200 |
| `GET` | `/api/v1/models/:id` | Get details of a registered AI model | 200, 400, 404 |
| `GET` | `/api/v1/tools` | Registered capabilities and tool schemas | 200 |
| `GET` | `/api/v1/tools/:id` | Get details of a registered tool | 200, 400, 404 |
| `GET` | `/api/v1/executions` | Persisted execution projections list | 200 |
| `POST` | `/api/v1/executions` | Submit new task & execution via `SubmitTask` use case | 201, 400, 413, 415 |
| `GET` | `/api/v1/executions/:id` | Execution projection details | 200, 400, 404 |
| `GET` | `/api/v1/executions/:id/timeline` | Correlated audit observations for execution | 200, 400 |
| `POST` | `/api/v1/orchestrate` | Dispatch multi-operation sequence via `ExecuteOrchestration` | 200, 400, 413, 415 |
| `GET` | `/api/v1/metrics` | Real-time counters and recorded samples | 200 |
| `GET` | `/api/v1/audit` | Full structured observation stream | 200 |
| `GET` | `/api/v1/tasks` | Durable task projections list | 200 |
| `GET` | `/api/v1/tasks/:id` | Task projection by ID | 200, 400, 404 |
