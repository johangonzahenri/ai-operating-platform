# Platform API and Web UI Architecture (v0.7)

## Overview

Milestone v0.7 establishes the **Product Boundary** for the AI Operating Platform. It introduces a decoupled **Platform API** layer and a native **Web Platform UI** (Control Plane) that allows operators, developers, and users to monitor, inspect, and trigger Core Engine capabilities through stable contracts without directly depending on domain aggregates or in-memory repositories.

```
┌──────────────────────────────────────────────────────────────┐
│                    Web Platform UI (SPA)                     │
│  Overview │ Execution Explorer │ Governance │ Playground     │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP / JSON REST
┌──────────────────────────────▼───────────────────────────────┐
│                        Platform API                          │
│  PlatformDTOs │ PlatformService │ HttpRouter │ HttpServer    │
└──────────────────────────────┬───────────────────────────────┘
                               │ Application Facade
┌──────────────────────────────▼───────────────────────────────┐
│                     Core Engine (v0.1-v0.6)                  │
│  CompositionRoot │ CoreRuntime │ SequentialOrchestrator      │
│  PolicyGateway │ AuditLog │ MetricsCollector │ ToolGateway   │
└──────────────────────────────────────────────────────────────┘
```

## Architectural Principles

1. **Strict Product Boundary Separation:**
   - The Web Platform never imports or mutates Core Engine internals directly.
   - All interactions go through `PlatformService` using typed `PlatformDTOs`.
2. **Zero External Runtime Dependencies:**
   - Implemented entirely using native Node.js standard modules (`node:http`, `node:fs`, `node:path`, `node:url`, `node:crypto`).
   - Ensures high reliability, fast startup, and complete resilience to institutional proxy or TLS certificate restrictions.
3. **Audit & Observability Parity:**
   - Every action triggered from the Platform API publishes correlated domain events with identical correlation metadata (`traceId`, `executionId`, `taskId`, `operationId`).
   - The UI provides deep drill-down into correlated execution timelines directly from the `AuditLog`.
4. **Governance Transparency:**
   - Policy evaluations (both allowed and denied) are exposed to operators via `/api/audit` and `/api/metrics`, ensuring verifiable, fail-closed enforcement.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web Platform Control Plane (SPA) |
| `GET` | `/api/status` | System health, engine version, and aggregated counters |
| `GET` | `/api/tools` | Registered capabilities and input schemas |
| `GET` | `/api/tasks` | Durable task aggregates |
| `POST` | `/api/tasks` | Submit new task for execution via CoreRuntime |
| `GET` | `/api/tasks/:id` | Task aggregate by ID |
| `GET` | `/api/executions` | Persisted execution records |
| `GET` | `/api/executions/:id` | Execution details and metadata |
| `GET` | `/api/executions/:id/timeline` | Correlated event timeline for execution |
| `POST` | `/api/orchestrate` | Dispatch multi-operation sequence with model/tools |
| `GET` | `/api/metrics` | Real-time counters and dimensions |
| `GET` | `/api/audit` | Structured observation stream |
