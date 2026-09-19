# Changelog

All notable changes to the AI Operating Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] - 2026-09-19 (Autonomous Operations Runtime, Control Plane & Continuous Governance)

### Added
- **Autonomous Operations Runtime & Continuous Business Governance**:
  - `AutonomousOperationsRuntime` daemon orchestrator with state transitions (`STOPPED`, `RUNNING`, `PAUSED`, `SAFETY_HALTED`).
  - `AutonomousTrigger` domain aggregate with multi-modal trigger policies (`SCHEDULED`, `EVENT_DRIVEN`, `THRESHOLD`, `MANUAL`).
  - `RuntimeLease` concurrency lease mechanism with Optimistic Concurrency Control (OCC) and heartbeat expiration.
  - Continuous business safety engine with `SafetyBreakerTrip` circuit breaker and instant emergency stop.
- **Web Control Plane Integration (`#tab-operations`)**:
  - Full autonomous runtime dashboard with live daemon state badges, trigger table, and execution controls.
  - Interactive 6-stage autonomous execution chain visualizer ($\text{Trigger} \to \text{Decision} \to \text{Plan} \to \text{Execution} \to \text{Verification} \to \text{Governance}$).
  - Safety Operations Hub with circuit breaker logs and emergency stop buttons.
  - Cycle inspection modal with full immutable payload view.
  - Strict DOM generation across all components with **0 `.innerHTML`**.
  - Bilingual localization (`es-419` and `en`).
- **Enterprise Capabilities Integration**:
  - Enterprise Workflow Orchestration (DAG validation), Verification (Segregation of Duties), and Human Oversight escalation.
  - Quantitative Agent Lifecycle & Evaluation and declarative AI Solution Factory.
  - AI Enterprise OS with closed-loop executive feedback.
- **Test Baseline**: 1354 deterministic tests passing across 57 suites (0 failures, 100% success rate).

---

## [1.1.0] - 2026-09-17 (v1.1.0 Baseline Auditada & Extended Ecosystem)

### Added
- **Real AI Model Providers**: `OpenAIModelGateway`, `AnthropicModelGateway`, and `OllamaModelGateway` with streaming, structured JSON output, retry policies, and `ProviderFactory` with deterministic fallback router.
- **Business Devices & Printing**: `BrotherPrinterAdapter` for Brother DCP-1600 series on local port `USB001`, `PrintJob` management, and spooler health monitoring.
- **Bilingual Web Control Plane**: Single-Page Application native interface with dynamic internationalization supporting Spanish Latin America (`es-419`, default) and English (`en`), 0 `innerHTML`, and real-time telemetry.
- **Application Ecosystem**: `TentacionesPlatformAdapter` with AR Virtual Fitting Room and size calculation, plus `Vehicle Parts Platform` reference application with automotive mechanical compatibility engine.
- **Operational Diagnostics & Hardening**: `RuntimeDiagnosticsService`, `/api/v1/diagnostics` forensic endpoints, and rate limiting per tenant/principal.
- **Test Baseline**: Verification of 966 deterministic tests passing (0 failures, 11 test suites).

### Changed
- **Official Documentation Re-synchronization**: Updated `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` to v2.0 reflecting actual v1.1.0 architecture, updated ADR traceability matrix, and established `docs/SOURCE_OF_TRUTH.md`.

---

## [1.0.0] - 2026-09-12 (v1.0.0 Baseline Release)

### Added
- **Platform API Layer**: Native Node.js HTTP server (`src/platform/server.ts`, `src/platform/api/http-router.ts`) exposing REST contracts under `/api/v1/*` and `/api/platform/v1/*`.
- **Platform Client SDK (`@ai-platform/client`)**: Typed TypeScript SDK for decoupled external consumers with automatic fallback and schema validation.
- **Tentaciones AI Commerce Integration**: Production-ready platform adapter for AI-assisted product discovery and recommendation.
- **Security Context & RBAC**: Default-deny security governance, tenant isolation boundaries, and role-based access control.

---

## [0.13.0] - 2026-09-10 (Crash Recovery & Reconciliation)

### Added
- **Crash Recovery Service (`RestartRecoveryService`)**: Atomic startup reconciliation of stranded active tasks, executions, and autonomous operations into terminal states.
- **Durable Event Store (`SqliteEventStore`)**: Append-only SQLite event log with correlation indexing by `traceId`, `taskId`, and `executionId`.
- **Architectural Decision Records**: ADR 0020 (Crash Recovery and Restart Reconciliation), ADR 0021 (Durable Events and Audit Infrastructure), and ADR 0022 (Observability Audit Query and Runtime Diagnostics).

---

## [0.12.0] - 2026-09-09 (Durable Execution Persistence)

### Added
- **SQLite Task Repository (`SqliteTaskRepository`)**: Durable implementation of `TaskRepository` and `TaskQueryPort` over native SQLite WAL.
- **SQLite Execution Repository (`SqliteExecutionRepository`)**: Durable implementation of `ExecutionRepository` and `ExecutionQueryPort`.
- **SQLite Agent Repository (`SqliteAgentRepository`)**: Durable storage and OCC versioning for Agent aggregates.
- **Architectural Decision Record**: ADR 0019 (Durable SQLite Adapters for Task, Execution, and Agent).

---

## [0.11.0] - 2026-09-08 (v0.11 Increment #3 — Agent Domain Rehydration Boundary)

### Added
- **Agent Domain Rehydration Boundary (`Agent.rehydrate`)**: Static factory method on `Agent` accompanied by `AgentRehydrateProps` boundary interface, enabling persistent storage adapters to restore Agent aggregates across all lifecycle states without reflection.
- **Fail-Closed State Invariant Validation**: Comprehensive domain validation enforcing status constraints (`ACTIVE` / `INACTIVE`), OCC version integrity (`version >= 1`), identifier validation via canonical `validateAgentId()`, non-empty name and model, and chronological timestamp consistency (`createdAt <= updatedAt`).
- **Runtime Immutability & Defensive Copying**: Constructor-level `Object.freeze(this)` on `Agent`, tool capability deduplication and freezing (`Object.freeze([...new Set(...)])`), and timestamp defensive cloning.
- **Dedicated Agent Rehydration Unit Suite**: Added 11 new targeted assertions to `tests/unit/agent.test.ts` verifying full configuration rehydration, minimal configuration rehydration, prototype preservation (`instanceof Agent`), mutation resistance, fail-closed validation, and lifecycle continuation (`update`, `activate`, `deactivate`, `toDefinition`).
- **Architectural Decision Record (ADR 0018)**: Formal decision document defining Agent domain rehydration boundaries, encapsulation principles, and persistence adapter integration rules.

---

## [0.11.0] - 2026-09-08 (v0.11 Increment #2 — Core Execution Domain Rehydration Boundary)

### Added
- **Core Execution Rehydration Boundaries (`Task.rehydrate`, `Execution.rehydrate`)**: Static factory methods on `Task` and `Execution` accompanied by `TaskRehydrateProps` and `ExecutionRehydrateProps` boundary interfaces, allowing persistent storage adapters to reconstitute core execution entities across all lifecycle states without reflection.
- **Fail-Closed State Invariant Validation**: Comprehensive domain validation enforcing status-specific constraints, result and error mutual exclusivity, and chronological timestamp ordering (`createdAt <= startedAt <= completedAt`).
- **Runtime Immutability & Defensive Copying**: Constructor-level `Object.freeze(this)` on `Task`, `Execution`, and `TaskError`, with deep defensive copying of payload dictionaries (`request.input`, `result.output`, `resultMetadata`).
- **Dedicated Rehydration Test Suites**: Extended `tests/unit/task.test.ts` and `tests/unit/execution.test.ts` with 21 new targeted assertions covering valid rehydrations, fail-closed invalid inputs, prototype preservation (`instanceof`), and runtime mutation resistance.
- **Architectural Decision Record (ADR 0017)**: Formal decision document defining Core Execution domain rehydration boundaries, encapsulation principles, and persistence adapter integration rules.

---

## [0.11.0] - 2026-09-08 (v0.11 Increment #1 — Formal Domain Rehydration Boundary)

### Added
- **Formal Rehydration Boundary (`AutonomousOperation.rehydrate`)**: Static factory method on `AutonomousOperation` and `AutonomousOperationRehydrateProps` interface enabling persistence adapters to reconstruct aggregates while strictly enforcing domain invariants.
- **Dedicated Rehydration Unit Tests**: Comprehensive test suite verifying aggregate rehydration across all statuses, value object prototype validation, defensive immutability checks, and fail-closed validation on invalid input.
- **Architectural Decision Record (ADR 0016)**: Documented rationale for formal domain rehydration boundary and elimination of reflection in infrastructure adapters.

### Changed
- **Eliminated `Reflect.construct` in Persistence**: `sqlite-mapper.ts` now delegates rehydration directly to `AutonomousOperation.rehydrate()`, removing technical debt and reflection across all infrastructure persistence mappers.

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
