# Changelog

All notable changes to the AI Operating Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.10.0] - 2026-09-08 (v0.10 Increment #2 — SQLite Durable Adapter & Storage Engine)

### Added
- **Native SQLite Storage Engine**: Implementation of `SqliteDatabase` utilizing Node.js 22 native `node:sqlite` (`DatabaseSync`) with WAL journal mode, busy timeout, and foreign key enforcement.
- **Relational Schema (Version 1)**: Bootstrap for tables `schema_metadata`, `operations`, `plans`, `plan_steps`, `observations`, and `decisions` with relational integrity, cascading deletes, and optimized query indexes.
- **Durable Operation Repository**: `SqliteOperationRepository` implementing both `OperationRepositoryPort` and `OperationQueryPort` with parameterized queries and prepared statements.
- **Transactional Atomicity**: Atomic mutation boundary ensuring operation aggregates, deliberate plans, observations, and decisions commit together or roll back cleanly on failure.
- **Optimistic Concurrency Control (OCC)**: Monotonic `version` tracking rejecting stale concurrent writes with `OptimisticConcurrencyError`.
- **Idempotency & Rehydration**: Child record idempotency preventing duplicate history on re-save, and aggregate rehydration preserving class invariants, frozen snapshots, and CQRS projections.
- **Composition Root Integration**: Configured `createPlatform` and production server bootstrap to support durable SQLite storage (`data/app.db`) while retaining `InMemoryOperationRepository` for fast, isolated unit testing.
- **Contract & Integration Test Suites**: Parity contract verification across both in-memory and SQLite repositories, unit test coverage of durability, transactions, OCC, and schema versioning, and end-to-end HTTP REST API integration tests.

### Architecture
- **Strict Domain Purity**: Zero SQLite or SQL imports in `src/domain` and `src/application`.
- **Zero Runtime Dependencies**: Engine operates exclusively on Node.js standard library APIs (`npm ls --omit=dev` empty).

---

## [0.9.0] - 2026-09-07 (Release Candidate)

### Added
- **Autonomy Budgeting**: Value Object `AutonomyBudget` with positive validation for `maxSteps`, `maxDurationMs`, `maxToolCalls`, and optional `maxTokens`.
- **Autonomy Consumption**: Value Object `AutonomyConsumption` providing copy-on-write tracking of steps, wall-clock time, tool calls, and tokens used.
- **Autonomous Operation Aggregate**: Domain entity `AutonomousOperation` with finite state machine (`SUBMITTED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `BUDGET_EXHAUSTED`) and deterministic budget checks.
- **Planning Contracts**: Domain objects `PlanningRequest`, `Plan`, and `PlanStep` with strict immutability, unique step IDs, sequential order, and rejection of executable functions.
- **Decision Contracts**: Domain entity `Decision` with explicit types (`EXECUTE_STEP`, `COMPLETE`, `STOP`, `FAIL`).
- **Observation Pipeline**: Value Object `Observation` capturing step duration, output, normalized errors, and tool count.
- **Objective Evaluation**: Value Object `ObjectiveEvaluation` decoupling technical execution success from goal satisfaction (`ACHIEVED`, `NOT_ACHIEVED`, `UNKNOWN`).
- **Pure Decision Evaluator**: Domain service `DeterministicDecisionEvaluator` implementing 7 pure rules for state derivation.
- **Bounded Orchestrator**: Application service `AutonomousOrchestrator` coordinating multi-step cycles strictly through `CoreRuntime` with mandatory per-step fail-closed `PolicyGateway` governance.
- **Autonomous Operation Service**: Application service `AutonomousOperationService` mediating between HTTP/API and orchestrator with active cooperative cancellation tracking.
- **Operation Repositories & Projections**: Domain port `OperationRepositoryPort`, query port `OperationQueryPort`, and zero-dependency adapter `InMemoryOperationRepository`.
- **Platform REST Endpoints**: Canonical `/api/v1/operations*` and backward-compatible `/api/operations*` endpoints for listing, inspecting, creating, and cancelling autonomous operations.
- **Web Control Plane Operations View**: Dedicated SPA navigation tab, operation creation form, reactive operations table with badges/metrics, and deep operation inspector.
- **Architecture Documentation**: ADR 0013 (Bounded Autonomous Operations Architecture) and ADR 0014 (Autonomous Operations API Integration).

### Changed
- **PlatformService**: Integrated `operationService` and added operation count to system status telemetry.
- **HttpRouter**: Added operation routes, 1MB body limit enforcement, path traversal protection, CORS origin restrictions, and structured HTTP error responses.
- **Web UI Client**: Extended `api-client.js` and `app.js` with DOM-based operation rendering (strictly zero `innerHTML`).
- **Documentation**: Updated Manual Chapter 15 to reflect full v0.9 implementation.

### Security
- **Strict DOM Construction**: 100% pure DOM APIs across the entire Web UI, eliminating `innerHTML` usage.
- **Fail-Closed Policy Enforcement**: Verified that policy denial or policy evaluation exceptions halt execution immediately without calling `CoreRuntime`.
- **Path Traversal Shield**: Encoded and raw URL traversal attempts (`..`) blocked with HTTP 403.
- **CORS Restriction**: Headers restricted strictly to local origins (`localhost`, `127.0.0.1`, `[::1]`).
- **Input Sanitization**: Alphanumeric ID regex filtering and 1MB maximum payload ceiling.

### Architecture
- **Preserved CoreRuntime Invariant**: CoreRuntime remains the single owner of execution; no secondary autonomous runtimes introduced.
- **Zero Runtime Dependencies**: Engine and platform operate strictly on Node.js standard library (`npm ls --omit=dev` empty).

### Known Limitations
- In-memory persistence only; state is non-durable across process restarts (durable persistence scheduled for v0.10).
- Synchronous request-response execution over HTTP bounded by `maxDurationMs`.
- Cancellation is inter-step; in-flight model socket preemption is an open design (OAD-001).

---

## [0.8.0] - 2026-09-07

### Added
- First-class `Agent` domain aggregate with model binding, behavioral instructions, tool authorization whitelists, and lifecycle status.
- `AgentRegistry` domain port and `InMemoryAgentRegistry` adapter.
- `AgentExecutionStrategy` integrating Agent execution under `CoreRuntime`.
- `AgentService` application service.
- REST endpoints `/api/v1/agents*` for agent management and execution dispatch.
- Web Control Plane SPA dedicated Agents management panel.
- Architecture Decision Record ADR 0011 (Agent Architecture).

---

## [0.7.0] - 2026-09-06

### Added
- Native HTTP REST API (`/api/v1/` and `/api/` compat).
- Web Control Plane Single-Page Application (HTML5 / Vanilla JS).
- Execution timeline forensic audit endpoints.
