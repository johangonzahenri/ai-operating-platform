# ADR 0010: Platform API and Web UI (v0.7 Product Boundary)

## Status
Accepted

## Context
Milestones v0.1 through v0.6 established the domain, application, and infrastructure layers of the Core Engine (Runtime, Models, Tools, Sequential Orchestration, Context/Memory, and Observability/Governance).

However, the engine remained an embedded TypeScript library without an external interface or presentation layer. In order to fulfill the product vision defined in `docs/product/PRODUCT_MODEL.md`, the platform requires:
1. An external boundary exposing Core Engine capabilities through stable, typed DTO contracts and read query projections.
2. A visual Control Plane (Web UI) allowing operators to inspect executions, monitor policy governance in real-time, and trigger coordinated workflows.
3. Full operational independence from external runtime npm dependencies to remain completely functional in constrained network environments.
4. Clean architectural boundaries without parallel execution bypasses or domain aggregate leakage.

## Decision
1. **Facade-Driven Platform Service with Query Ports:** We introduced `PlatformService` as the official boundary facade. `PlatformService` does not depend on concrete infrastructure classes or mutable domain aggregates. Instead, it receives typed query ports (`TaskQueryPort`, `ExecutionQueryPort`, `AuditQueryPort`, `MetricsQueryPort`, `ToolQueryPort`) that expose read-only projections (`TaskProjection`, `ExecutionProjection`, etc.), preventing presentation/API code from invoking internal lifecycle transition methods.
2. **Dedicated Task Submission Use Case:** `PlatformService.submitTask()` delegates to `SubmitTask`, an application use case that handles `Task.create()` and `AgentDefinition` construction, keeping domain aggregate instantiation out of the platform API layer.
3. **Unified CoreRuntime Orchestration:** Removed any unmanaged parallel execution paths in `/api/orchestrate`. Orchestration requests dispatch `ExecuteOrchestration`, an application use case executing through `CoreRuntime` with `OrchestratedExecutionStrategy`. Orchestrations traverse the complete operational lifecycle (`task`, `execution`, `agent`, and `policy` events and persistence).
4. **Detailed Operation Output Propagation:** The response from `POST /api/orchestrate` returns an array of executed operations containing `{ operationId, kind, status, output, error }`, faithfully propagating individual operation results. Subsequent operations in a failed sequence report `CANCELLED`.
5. **Mandatory Centralized Policy Governance:** All model executions and orchestration operations require a `PolicyGateway` injected at construction time and evaluate policies via `PolicyGateway.evaluate()`, failing closed with `PolicyEvaluationError` / `PolicyDeniedError` if denied or unreachable.
6. **Hardened Native Node.js HTTP Server & Strict Validation:** The REST API and static asset server are implemented using Node.js built-in modules (`node:http`, `node:fs`, `node:path`, `node:url`, `node:crypto`) with zero external runtime npm dependencies. It enforces strict payload limits (1MB, HTTP 413), media type validation (`application/json`, HTTP 415), ID normalization with whitespace trimming (`normalizeId()`), non-empty payload validation (HTTP 400), safe path-traversal prevention (HTTP 403), sanitized error responses (HTTP 500), and loopback-only CORS (`127.0.0.1`/`localhost`).
7. **Single-Page Application Control Plane:** A lightweight, dark-mode SPA (`index.html`, `styles.css`, `app.js`) served directly from the embedded HTTP server provides an interactive dashboard with Overview metrics, an Execution Explorer with correlated timeline reconstruction, a Governance audit viewer, and an interactive execution Playground. All rendering uses secure DOM node creation (`createElement`, `textContent`) to eliminate XSS risks.
8. **Official TypeScript Build:** Project builds and type-checks with standard `tsc` (`npm run build`, `npm run check`) under strict compiler settings.

## Consequences
### Positive
- Zero external runtime dependencies: instant startup with `node dist/src/platform/server.js`, resilient to network/TLS download restrictions.
- Strict architecture boundary: the Web UI and Platform API have no direct coupling to mutable domain entities or in-memory repositories.
- Complete operational lifecycle parity: orchestration is governed, observed, and persisted identically to atomic task executions.
- Granular operational feedback: operators and API consumers see per-step orchestration status and outputs.
- Fail-closed security posture across all execution paths.

### Negative / Trade-offs
- In-memory persistence resets upon server restart (durable disk/database persistence is scheduled for future milestones).
