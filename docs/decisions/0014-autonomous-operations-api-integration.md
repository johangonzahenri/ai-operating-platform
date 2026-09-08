# 0014. Autonomous Operations API & Web Control Plane Integration

- **Date:** 2026-09-07
- **Status:** Approved (v0.9 Architectural Contract)
- **Author:** Senior Software Architect + API Architect + Security Engineer

---

## 1. Context

In milestone **v0.9 Increments #1 through #5**, the platform developed the domain and orchestration architecture for Bounded Autonomous Operations:
- `AutonomyBudget` and `AutonomyConsumption` Value Objects enforcing strict, immutable bounds.
- `AutonomousOperation` Entity modeling the lifecycle finite state machine.
- `PlanningRequest`, `PlanStep`, `Plan`, `Decision`, `Observation` domain contracts.
- `DeterministicDecisionEvaluator` pure evaluation engine.
- `AutonomousOrchestrator` application service executing bounded cycles via `CoreRuntime` with mandatory, fail-closed `PolicyGateway` governance.

However, these autonomous capabilities were accessible only programmatically within internal application services. To make autonomous operations operational within the enterprise platform, they must be exposed through:
1. The **Platform HTTP REST API** (`/api/v1/operations` and backward-compatible `/api/operations`).
2. The **Web Platform Control Plane** (browser-based operator dashboard).

The challenge is to expose synchronous bounded autonomy over HTTP and Web UI without violating foundational platform invariants:
- Zero runtime dependencies (`npm ls --omit=dev` must remain strictly empty).
- Single execution ownership: `AutonomousOrchestrator -> Task -> CoreRuntime -> Execution`.
- Zero background daemons, worker threads, async queues, or polling loops.
- Strict fail-closed policy enforcement and input validation.
- Zero `innerHTML` usage in the Web UI to prevent Cross-Site Scripting (XSS).

---

## 2. Decision

We establish the following architectural decisions and contractual boundaries for **v0.9 Increment #6**:

### 2.1 Synchronous Request-Response Lifecycle
- Autonomous operation execution triggered via `POST /api/v1/operations` is executed synchronously within the request lifecycle.
- The HTTP handler delegates to `PlatformService.createOperation()`, which invokes `AutonomousOperationService.runOperation()`.
- `AutonomousOperationService` orchestrates the bounded loop through `AutonomousOrchestrator`, persisting the operation snapshot in `OperationRepositoryPort`.
- The response returns HTTP `201 Created` with the complete, frozen `OperationDetailDTO` (including final status, consumption, plan steps, observations, and decisions).
- There are **no background threads, daemons, unmonitored async workers, or persistent polling loops**.

### 2.2 DDD Separation of Read and Write Models
- **Domain Repository Port (`OperationRepositoryPort`)**: Defines persistence for aggregate roots (`AutonomousOperation`, `Plan`, `Observation[]`, `Decision[]`).
- **Application Query Port (`OperationQueryPort`)**: Decouples read projections (`OperationProjection`, `OperationDetailProjection`) from domain internals.
- **In-Memory Adapter (`InMemoryOperationRepository`)**: Implements both ports in `src/infrastructure/persistence/in-memory-operation-repository.ts`.
  - Enforces copy-on-write and `Object.freeze()` on all stored snapshots and returned projections.
  - Implements defensive copying to ensure external mutations cannot corrupt repository state.

### 2.3 Application Service Boundary (`AutonomousOperationService`)
- Sits between the Platform API layer and `AutonomousOrchestrator`.
- Validates the target `Agent` existence and active lifecycle state.
- Instantiates deterministic `AutonomyBudget` and `AutonomousOperation` entities.
- Manages cooperative cancellation via in-memory active `CancellationToken` tracking.
- Provides standard `evaluateObjective` callbacks to evaluate goal satisfaction upon plan step completion.

### 2.4 REST API Contract & Route Compatibility
All endpoints are available under both versioned (`/api/v1/...`) and legacy/compatibility (`/api/...`) paths:
- `GET /api/v1/operations`: Returns array of `OperationSummaryDTO` listing all operations.
- `GET /api/v1/operations/:id`: Returns `OperationDetailDTO` with full execution history, observations, and decisions. Returns `404 Not Found` if the operation does not exist.
- `POST /api/v1/operations`: Validates request body and executes a bounded autonomous operation. Returns `201 Created`. Rejects invalid parameters with `400 Bad Request` and unknown agents with `404 Not Found`.
- `POST /api/v1/operations/:id/cancel`: Cancels an active or submitted operation. Returns `200 OK` with updated `OperationDetailDTO`. Returns `409 Conflict` if the operation is already in a terminal state.

### 2.5 Security & Input Sanitization
- **Strict ID Normalization**: All IDs are validated against `/^[a-zA-Z0-9_-]{1,128}$/`.
- **Path Traversal Protection**: Raw and URI-decoded paths containing `..` are immediately blocked with HTTP `403 Forbidden`.
- **CORS Restriction**: Access-Control headers are restricted to `localhost`, `127.0.0.1`, and `[::1]`.
- **Security Headers**: `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` on all responses.
- **Payload Limits**: Request bodies are capped at 1 MB to prevent denial-of-service memory exhaustion.

### 2.6 Web Platform Control Plane (SPA)
- Added dedicated **Autonomous Operations** navigation tab and overview metric cards.
- Integrated creation form with configurable budget bounds (`maxSteps`, `maxDurationMs`, `maxToolCalls`, `maxTokens`).
- Reactive operations table displaying ID, agent, objective, status badge, steps used, duration, tool calls, and action buttons (Cancel / Inspect).
- Detailed Operation Inspector displaying:
  - Budget vs. Consumption comparison.
  - Plan step timeline.
  - Real-time observation logs with raw result inspection.
  - Decision audit trail with evaluation rationales.
- **Strict UI Invariant**: 100% pure DOM APIs (`document.createElement`, `textContent`, `setAttribute`). **Zero `innerHTML`** across the entire UI codebase.

---

## 3. Consequences

### Positive
- Unified platform control plane where human operators can create, monitor, inspect, and cancel bounded autonomous operations.
- Zero runtime dependencies maintained: built purely on Node.js standard library and native DOM APIs.
- Full architectural continuity: `AutonomousOrchestrator` remains the single bounded coordinator, and `CoreRuntime` remains the single execution engine.
- Complete auditability: every decision, observation, and budget metric is captured and inspectable via REST API and Web UI.

### Negative / Trade-offs
- Synchronous execution over HTTP means the client connection remains open while steps execute (bounded by `maxDurationMs`). This is an intentional architectural choice for v0.9 to avoid premature distributed queuing complexity before multi-node execution is introduced in v1.0.
