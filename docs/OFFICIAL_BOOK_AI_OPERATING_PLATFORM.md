# OFFICIAL ARCHITECTURE & OPERATIONS BOOK
## AI OPERATING PLATFORM
### *Software Engineering Foundations for Multiplatform AI Enablement*

---

**Document:** AI Operating Platform — Official Architecture Book
**Document Version:** 2.5 (v1.3.0 Budget Governance Closure & No-Bypass Hardening Consolidation)
**Repository Status:** v1.3.0 Baseline (1064 tests PASS, 0 FAIL — 100% determinism)
**Document Status:** Official / Synchronized with Source of Truth
**Verification Date:** September 2026
**Technical Source of Truth:** Source code (`src/`) + Automated tests (`tests/`) + ADRs (`docs/decisions/`)
**Canonical Document Source:** `LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md` (with mirror in `docs/LIBRO_OFICIAL_AI_OPERATING_PLATFORM.md`)

---

## Document Version Control

| Version | Date | Repository Status | Change Summary |
| :--- | :--- | :--- | :--- |
| **1.0** | September 2026 | v0.8 Baseline | Initial document generation post-v0.8 (Agents and Control Plane). |
| **1.1** | September 2026 | v0.9 Increment #5 | Comprehensive architectural audit and formal incorporation of v0.9 Increments #1 to #5. |
| **1.2** | September 2026 | v0.9 Release Candidate | Complete consolidation of v0.9 Bounded Autonomous Operations (Increments #6 and #7, 268 tests). |
| **2.0** | September 2026 | v1.1.0 Audited Baseline | **Canonical Source of Truth Audit and Comprehensive Synchronization:**<br>• Incorporation of durable SQLite WAL persistence (`SqliteDatabase`, task, execution, agent, and operation repositories).<br>• Formalization of domain rehydration boundaries (v0.11) and post-crash reconciliation service (`RestartRecoveryService`, v0.13).<br>• Integration of real AI model adapters (OpenAI, Anthropic, Ollama) and fallback router to deterministic Stub.<br>• Integration of governed satellite applications (*Tentaciones AI Commerce* and *Vehicle Parts Reference App*).<br>• Incorporation of the enterprise physical device adapter (Brother DCP-1600 series on USB001).<br>• Bilingual support in the Web Control Plane (`es-419` default / `en`) with 0 `innerHTML`.<br>• Exhaustive traceability of ADRs (ADR 0001 to 0022 and ADR-001 to ADR-010).<br>• Canonical baseline verified in **966 tests PASS** (0 FAIL, 11 suites). |
| **2.1** | September 2026 | v1.1.0 Cloud Foundation | **Cloud Foundation Expansion and Real Models (Phase 55 / Prompt 101):**<br>• Official adapter for Google Gemini / Vertex AI (`GeminiModelGateway`, ADR 0023).<br>• Durable contextual memory gateway in SQLite WAL (`SqliteMemoryGateway`, ADR 0024).<br>• Asymmetric JWT verification (RS256/ES256) with key rotation (`JwtTokenVerifier`, ADR 0025).<br>• Perimeter network topology and production TLS manifests Nginx/Caddy (ADR 0026).<br>• REST `/api/v1/*` convergence with RFC 8594 deprecation headers in `/api/platform/v1/*`.<br>• Canonical baseline verified in **985 tests PASS** (0 FAIL, 11 suites). |
| **2.2** | September 2026 | v1.2.0 Virtual Org | **Virtual Organization Foundation (Phase 56 / Prompt 102):**<br>• Formal organizational hierarchy: `Organization` (active/inactive/archived lifecycle), functional `Area` and working `Team`.<br>• Governed agent membership (`AgentMembership`) with operational roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`).<br>• Durable relational repository `SqliteOrganizationRepository` with composite indexes and OCC.<br>• Canonical REST endpoints under `/api/v1/*` and interactive view in the Web Control Plane (0 `innerHTML`).<br>• Canonical baseline verified in **1019 tests PASS** (0 FAIL, 11 suites). |
| **2.3** | September 2026 | v1.3.0 Team Resource Governance | **Team Resource Governance & Budget Control (Phase 57 / Prompt 103):**<br>• `TeamResourceBudget` aggregate with multidimensional quotas (`maxExecutions`, `maxModelCalls`, `maxToolCalls`, `maxAutonomousSteps`, `maxDurationMs`, `maxTokens`), `consumed` counters, optimistic concurrency control (`version`), and states (`ACTIVE`, `EXHAUSTED`, `SUSPENDED`).<br>• Strict decoupling invariants: `Membership ≠ Permission`, `Membership ≠ Budget`, `Budget ≠ Authorization` (ADR 0028).<br>• Fail-closed semantics (`NO BUDGET = DENY`).<br>• Relational persistence `SqliteTeamResourceBudgetRepository` with `BEGIN IMMEDIATE` atomic isolation for last-unit race condition prevention.<br>• Canonical REST endpoints `/api/v1/teams/:id/budget*` and governance dashboard in Web Control Plane (0 `innerHTML`).<br>• Canonical baseline verified in **1043 tests PASS** (0 FAIL, 11 suites). |
| **2.4** | September 2026 | v1.3.0 Budget Enforcement | **Team Resource Budget Enforcement & Execution Integration (Phase 57.1 / Prompt 104):**<br>• Fail-closed integration and end-to-end verification of budget quotas in the execution runtime (`AgentExecutionStrategy`, `ToolInvocationRuntime`, `AutonomousOrchestrator`).<br>• Runtime binding: team resolution by agent membership and pre-execution evaluation (`executions: 1`), model call (`modelCalls: 1`), tool invocation (`toolCalls: 1`), autonomous step (`autonomousSteps: 1`), and duration (`durationMs`) and tokens (`tokens`) accounting.<br>• Strict bypass blocking for agents assigned to suspended or exhausted teams.<br>• Canonical baseline verified in **1057 tests PASS** (0 FAIL, 11 suites). |
| **2.5** | September 2026 | v1.3.0 Consolidated | **Comprehensive Documentation Audit and Canonical Synchronization (Phase 58 / Prompt 105):**<br>• Capability Matrix (Section 2.2) update to v1.3.0 baseline with 1064 tests.<br>• Platform version synchronization to 1.3.0 in `version.ts`, `package.json` and `README.md`.<br>• Incorporation of 8 stable undocumented modules (Multi-Agent Coordination, n8n Automation, Billing/Quotas, Circuit Breaker, PostgreSQL, Virtual Try-On, Worker Queue, Feature Flags).<br>• REST API catalog expansion (Chapter 10) with 30+ endpoints of Organization, Area, Team, Budget, Devices, Diagnostics, Applications, Tenants and Integrations.<br>• Completion of invariants INV-15 to INV-18 and 7 missing ADRs in the Traceability Matrix.<br>• Correction of i18n file references and OAD-001 update to v1.3.0.<br>• Production of official English edition.<br>• Canonical baseline verified in **1064 tests PASS** (0 FAIL, 11 suites). |

---

## Preface: AI Operating Platform for Multiplatform Enablement

The purpose of the **AI Operating Platform** is not to constitute an "isolated factory" or an independent monolithic chatbot. Its strategic role is to act as the **Artificial Intelligence operational infrastructure and governance platform** designed to connect with and provide cognitive capabilities to multiple existing and future business platforms.

Among its main integration cases are e-commerce applications (such as clothing and omnichannel retail platforms), inventory and order management systems, SaaS platforms, and automated customer service. Instead of dispersing chaotic calls to language model (LLM) APIs within the code of each satellite application, this platform centralizes:
1. **The deterministic and auditable orchestration of tasks and executions.**
2. **The profiling of Agents with a strict tool whitelist and memory isolation.**
3. **Fail-Closed governance through policies prior to each model or tool invocation.**
4. **The supervision of Bounded Autonomous Operations with strict budgets for time, steps, and tool calls.**
5. **Immutable and forensic correlated observability without external library dependencies at runtime.**
6. **Durable relational persistence in SQLite in WAL mode and automatic crash recovery.**

### Explicit Distinction: Strategic Vision vs. Implemented Capabilities

To guarantee operational honesty and avoid false expectations, this book formally distinguishes between the product vision and what has actually been built:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│ STRATEGIC VISION (Future / Formal Backlog)                                     │
│ • Multi-region distributed ecosystem with clustering and active-active failover.│
│ • Formal certification of exit criteria for massive production (AOP-EXIT).      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ IMPLEMENTED & VERIFIED CAPABILITIES (Real Baseline v1.3.0 — 1064 PASS)          │
│ • Deterministic hexagonal engine with zero runtime dependencies (npm ls empty). │
│ • Relational durable persistence SQLite WAL (`SqliteDatabase`, `data/app.db`).  │
│ • Durable contextual memory in SQLite WAL (`SqliteMemoryGateway`, ADR 0024).   │
│ • Atomic post-crash reconciliation service (`RestartRecoveryService`).          │
│ • Model Gateways for OpenAI, Anthropic, Ollama, Gemini and deterministic Stub.  │
│ • Asymmetric JWT verifier RS256/ES256 with key rotation (ADR 0025).             │
│ • Perimeter network topology with TLS Nginx/Caddy manifests (ADR 0026).         │
│ • Canonical REST convergence on /api/v1/* with RFC 8594 headers (Deprecation).  │
│ • Virtual Organization Foundation: Organization, Areas, Teams and Agents (ADR 0027).│
│ • Team Resource Governance & Budget Control: Quotas per team, fail-closed (ADR 0028).│
│ • Runtime Budget Enforcement & Hardening: Comprehensive fail-closed and anti-bypass.│
│ • Integration of Tentaciones AI Commerce with AR virtual try-on and fallback.   │
│ • Automotive reference application Vehicle Parts Platform with compatibility.   │
│ • Brother DCP-1600 series hardware adapter (USB001, honestly offline).          │
│ • Bilingual native Web Control Plane (es-419 / en) with 0 innerHTML.            │
│ • 1064 automated tests passed (0 failures, 11 test suites).                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## General Index

1. [Chapter 1: Strategic Vision, Principles & Dependencies Model](#chapter-1-strategic-vision-principles--dependencies-model)
2. [Chapter 2: Architecture at a Glance & State Matrix](#chapter-2-architecture-at-a-glance--state-matrix)
3. [Chapter 3: Master Architecture Infographics and System Map](#chapter-3-master-architecture-infographics-and-system-map)
   * 3.1 [Master Blueprint: Complete System Map & Multiplatform Enablement](#31-master-blueprint-complete-system-map--multiplatform-enablement)
   * 3.2 [Blueprint 1: Hexagonal Topology and Ports & Adapters in 5 Layers](#32-blueprint-1-hexagonal-topology-and-ports--adapters-in-5-layers)
   * 3.3 [Blueprint 2: End-to-End Execution Flow & Operational Lifecycle](#33-blueprint-2-end-to-end-execution-flow--operational-lifecycle)
   * 3.4 [Blueprint 3: First-Class Agent Architecture and Cognitive Capabilities](#34-blueprint-3-first-class-agent-architecture-and-cognitive-capabilities)
   * 3.5 [Blueprint 4: Fail-Closed Governance & Immutable Observability](#35-blueprint-4-fail-closed-governance--immutable-observability)
4. [Chapter 4: Exhaustive Specification of Layers and Components](#chapter-4-exhaustive-specification-of-layers-and-components)
5. [Chapter 5: First-Class Agents Architecture (v0.8)](#chapter-5-first-class-agents-architecture-v08)
6. [Chapter 6: Bounded Autonomous Operations (v0.9 Increments #1 to #5)](#chapter-6-bounded-autonomous-operations-v09-increments-1-to-5)
7. [Chapter 7: Components Responsibilities Matrix](#chapter-7-components-responsibilities-matrix)
8. [Chapter 8: Fail-Closed Governance, Security & Invariants Catalog](#chapter-8-fail-closed-governance-security--invariants-catalog)
9. [Chapter 9: Cancellation Semantics & Open Architectural Decisions](#chapter-9-cancellation-semantics--open-architectural-decisions)
10. [Chapter 10: Services Catalog & REST API Audit](#chapter-10-services-catalog--rest-api-audit)
11. [Chapter 11: Architectural Traceability Matrix](#chapter-11-architectural-traceability-matrix)
12. [Chapter 12: Official Roadmap (Synchronized Roadmap)](#chapter-12-official-roadmap-synchronized-roadmap)
13. [Glossary of Architectural Terms](#glossary-of-architectural-terms)

---

# Chapter 1: Strategic Vision, Principles & Dependencies Model

### 1.1 The Platform's Role in a Multiplatform Ecosystem
The platform operates as the **AI execution and control engine** for client business systems. When a clothing e-commerce platform requires:
* Processing a complex catalog request,
* Classifying orders or generating personalized recommendations,
* Or executing an autonomous inventory reconciliation operation with local tools,

this client platform interacts with the **AI Operating Platform** through stable REST contracts. The client platform does not manage the inference context, does not directly interact with model SDKs, nor does it implement the governance logic: it delegates the task to a platform-governed `Agent` or `AutonomousOperation`.

### 1.2 Non-Negotiable Engineering Principles
1. **Hexagonal Architecture (Ports and Adapters):** Domain rules (`src/domain/`) and use cases (`src/application/`) define abstract contracts and never import infrastructure details (network adapters, databases, or AI provider SDKs).
2. **Zero Runtime Dependencies:** The `package.json` file does not contain any packages in the `dependencies` section. All runtime code relies exclusively on native Node.js APIs (`node:http`, `node:fs`, `node:crypto`, `node:path`, `node:url`, `node:sqlite`).
3. **Strict Distinction of Development Dependencies:** The environment uses support tools (`devDependencies`) limited to compilation and test execution: `typescript` (v5.7.2), `tsx` (v4.19.2) and `@types/node` (v22.10.2). Technical documentation accurately distinguishes *"zero runtime dependencies"* from *"development tools"*.
4. **Synchronous and Deterministic In-Process Execution:** The platform does not implement background workers, Redis queues, hidden daemons, or independent threads. Each API or orchestrator engine call executes a finite sequence within the Node.js process.
5. **Unidirectional Dependency Direction:**
   $$\text{Presentation (SPA)} \longrightarrow \text{Platform API} \longrightarrow \text{Application} \longrightarrow \text{Domain} \longleftarrow \text{Infrastructure (Adapters)}$$

---

# Chapter 2: Architecture at a Glance & State Matrix

### 2.1 Global Structure of Real Components
The following topology strictly reflects the existing packages and components in `src/`:

```text
AI Operating Platform
│
├── Presentation Layer (src/platform/web/)
│   ├── Native Single-Page Application (HTML5, pure Vanilla JS DOM, CSS)
│   ├── Decoupled API Client (api-client.js)
│   └── Internationalization Core (i18n/locale-es-419.js, i18n/locale-en.js)
│
├── Platform API Layer (src/platform/api/)
│   ├── Native HTTP Server (node:http bound to 127.0.0.1:3000)
│   ├── HttpRouter (Regex ID normalization, 1MB limit, application/json)
│   ├── PlatformService (Facade injected with QueryPorts and Use Cases)
│   ├── PlatformDTOs (Immutable transfer contracts)
│   └── RateLimiter (Traffic control per tenant and principal)
│
├── Platform Client SDK (src/platform-client/)
│   └── Typed PlatformClient (tasks, executions, agents, health, diagnostics)
│
├── Interfaces Layer (src/interfaces/)
│   └── Composition Root (composition.ts — Manual DI, ADR 0003)
│
├── Application Layer (src/application/)
│   ├── CoreRuntime (Sole owner of Task/Execution execution)
│   ├── SubmitTask & ExecuteTask (Queuing and dispatch use cases)
│   ├── AgentService (Agent management and dispatch)
│   ├── AutonomousOrchestrator (v0.9 bounded loop coordinator)
│   ├── AutonomousOperationService (Autonomous operations management)
│   ├── RestartRecoveryService (Atomic post-crash reconciliation v0.13)
│   ├── RuntimeDiagnosticsService (Forensic timelines per traceId)
│   ├── MemoryService (Partitioned persistence service)
│   ├── OrganizationService (Organization, area and team management)
│   ├── TeamResourceBudgetService (Team budget quota management)
│   ├── MultiAgentCoordinator (Coordinated multi-agent orchestration)
│   ├── Automation Services (n8n Adapter, Webhook Dispatcher, Scheduler, Reporting)
│   ├── Resilience Services (CircuitBreaker, RetryPolicy, RateLimiter)
│   ├── Billing & Quota Services (QuotaService for financial/operational management)
│   ├── Tenant & Feature Flag Services (FeatureFlagService per tenant)
│   └── Application Adapters (TentacionesPlatformAdapter, ApplicationFactory)
│
├── Domain Core Layer (src/domain/)
│   ├── Task & Execution (Deterministic aggregates with rehydrate() factories)
│   ├── Agent (First-class aggregate with model binding, tools and memoryScope)
│   ├── AutonomousOperation & AutonomyBudget & AutonomyConsumption (Autonomy domain)
│   ├── Organization, Area, Team & AgentMembership (Virtual organizational hierarchy)
│   ├── TeamResourceBudget (Multidimensional quotas with OCC and states)
│   ├── Coordination (Multi-agent coordination contracts)
│   ├── Billing & Quota (Financial/operational quota entities)
│   ├── Tenant (Tenant and feature flags entities)
│   ├── PlannerPort, PlanningRequest, Plan, PlanStep, Decision (Planning contracts)
│   ├── Observation, ObjectiveEvaluation, DecisionEvaluatorPort (Evaluation contracts)
│   ├── BusinessDevice & PrintJob (Enterprise device entities)
│   └── Domain Ports (PolicyGateway, ModelGateway, ToolGateway, MemoryGateway, EventPublisher, TaskRepository, ExecutionRepository)
│
└── Infrastructure Layer (src/infrastructure/)
    ├── SQLite Durable Storage (SqliteDatabase, SqliteTaskRepository, SqliteExecutionRepository, SqliteAgentRepository, SqliteOperationRepository, SqliteEventStore, SqliteOrganizationRepository, SqliteTeamResourceBudgetRepository, SqliteMemoryGateway)
    ├── PostgreSQL Adapter (postgres-schema.sql, PostgresTaskRepository)
    ├── InMemory Repositories (Decoupled fallback for isolated unit tests)
    ├── AI Model Providers (OpenAIModelGateway, AnthropicModelGateway, OllamaModelGateway, GeminiModelGateway, StubModelGateway, ProviderFactory)
    ├── Tool Registry & Gateway (CalculatorTool, InMemoryToolRegistry, RegistryToolGateway)
    ├── Hardware Adapters (BrotherPrinterAdapter on USB001 port)
    ├── Media Adapters (VirtualTryOnProvider for AR virtual try-on)
    ├── Queue Infrastructure (InMemoryWorkerQueue)
    ├── Security & RBAC (InMemoryRoleRepository, InMemoryApiKeyRepository, RbacAuthorizationEvaluator, JwtTokenVerifier RS256/ES256)
    └── Observability & Audit (EventObservabilitySubscriber, InMemoryAuditLog, InMemoryMetricsCollector, StructuredEventLogger)
```

### 2.2 Official Capability State Matrix

| Capability / Component | Architecture | Code | Tests | Documentation | Official Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CoreRuntime & Task Lifecycle (v0.1-v0.2)** | Designed | Implemented | 184 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Agent Aggregate (v0.8)** | Designed | Implemented | 22 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Bounded Autonomous Operations (v0.9)** | Designed | Implemented | 46 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **SQLite WAL Persistence (v0.10/v0.12)** | Designed | Implemented | 148 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Domain Rehydration Boundary (v0.11)** | Designed | Implemented | 42 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Post-Crash Reconciliation Service (v0.13)** | Designed | Implemented | 42 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **SQLite Durable Event Store (v0.13)** | Designed | Implemented | 12 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **OpenAI Model Gateway** | Designed | Implemented | 10 tests | Documented | **IMPLEMENTED (Requires API Key)** |
| **Anthropic Model Gateway** | Designed | Implemented | 10 tests | Documented | **IMPLEMENTED (Requires API Key)** |
| **Ollama Local Model Gateway** | Designed | Implemented | 10 tests | Documented | **IMPLEMENTED (Requires Daemon)** |
| **Google Gemini / Vertex AI Gateway** | Designed | Implemented | 8 tests | Documented | **IMPLEMENTED (Requires API Key)** |
| **Deterministic Stub Gateway** | Designed | Implemented | 26 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **SQLite Durable Memory Gateway** | Designed | Implemented | 10 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **JWT Asymmetric Verifier (RS256/ES256)** | Designed | Implemented | 10 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Tentaciones AI Commerce Adapter** | Designed | Implemented | 48 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Vehicle Parts Reference App** | Designed | Implemented | 16 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Brother DCP-1600 Adapter (USB001)** | Designed | Implemented | 14 tests | Documented | **IMPLEMENTED (Hardware Offline)** |
| **Fail-Closed Governance & RBAC** | Designed | Implemented | 118 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Web Control Plane SPA (es-419 / en)** | Designed | Implemented | 86 tests (0 innerHTML) | Documented | **IMPLEMENTED / VERIFIED** |
| **Virtual Organization Foundation** | Designed | Implemented | 34 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Team Resource Budget Governance** | Designed | Implemented | 38 tests | Documented | **IMPLEMENTED / VERIFIED** |
| **Multi-Agent Coordination** | Designed | Implemented | Verified | Documented | **IMPLEMENTED / VERIFIED** |
| **Automation (n8n, Webhooks, Scheduler)** | Designed | Implemented | Verified | Documented | **IMPLEMENTED / VERIFIED** |
| **Resilience (Circuit Breaker, Retry, Rate Limit)** | Designed | Implemented | Verified | Documented | **IMPLEMENTED / VERIFIED** |
| **Total Verified Baseline** | **Convergent**| **100% Compiled**| **1064 PASS (0 FAIL)** | **Canonical** | **BASELINE v1.3.0 VERIFIED** |

---

# Chapter 3: Master Architecture Infographics and System Map

Master infographics visually represent the operational guarantees, the integration ecosystem and the platform topology in accessible, rigorous and professional language.

## 3.1 Master Blueprint: Complete System Map & Multiplatform Enablement
![Blueprint Maestro: Mapa Completo del Sistema](docs/images/00_mapa_completo_sistema.jpg)

**Integral Ecosystem Description:**
* **Connected Business Platforms (Top and Perimeter):** Represents real client systems such as the **Clothing E-Commerce Platform**, web/mobile applications and ERP/logistics platforms. These external applications do not execute AI models internally nor do they couple to proprietary libraries; they communicate via standard **API REST / HTTP requests in JSON format**.
* **AI Operating Platform (Central Core):**
  1. **Platform and HTTP Server Layer:** Provides the native router, rigorous DTO validation, payload limits (1MB) and REST endpoints for tasks and operations.
  2. **Application and Orchestration Layer:** Contains the `AutonomousOrchestrator`, `DecisionEvaluator` and `CoreRuntime` that coordinate controlled execution.
  3. **Domain and Governance Layer:** Defines the `AutonomyBudget` (step limits, USD cost, and max time), the finite state machine, and the cognitive agent profiles.
  4. **Infrastructure and Adapters Layer:** Manages tool ports (inventory queries, external gateways), LLM connectors, and in-memory and durable SQLite repositories.

## 3.2 Blueprint 1: Hexagonal Topology and Ports & Adapters in 5 Layers
![Blueprint 1: Topología Hexagonal en 5 Capas](docs/images/01_mapa_arquitectura_hexagonal.jpg)

Represents the strict separation of architectural boundaries:
* **Pure Domain Core (Center):** Pure business rules, immutable budgets, state machines, and event emission. It has no external dependencies.
* **Application & Ports Layer (Middle Ring):** Orchestration use cases, abstract input and output ports.
* **Infrastructure & Platform (Outer Ring):** HTTP adapters, LLM adapters, external tools, and SQLite WAL repository.
* **Dependency Rule:** Dependencies point exclusively inwards. The domain core does not know the database, the network, or the model providers.

## 3.3 Blueprint 2: End-to-End Execution Flow & Operational Lifecycle
![Blueprint 2: Flujo de Ejecución End-to-End](docs/images/02_mapa_flujo_ejecucion.jpg)

Shows the 6-phase sequence of the bounded operational cycle:
1. **Request Reception (HTTP DTO):** Validated entry through the perimeter boundary.
2. **Budget Validation:** Formal check of `AutonomyBudget` (max steps, USD budget, max time).
3. **Initial Planning:** Dispatch to `PlannerPort` to generate an ordered and deterministic `Plan`.
4. **Bounded Execution Loop:** Iterative cycle `for (let i = 0; i < maxSteps; i++)` that executes each step, obtains an immutable `Observation` and evaluates a `Decision`.
5. **Transition to Terminal State:** Rigorous classification into `COMPLETED`, `BUDGET_EXHAUSTED` or `CANCELLED`.
6. **Event Emission and Immutable Audit:** Correlated logging of all facts in the durable operational bus.

## 3.4 Blueprint 3: First-Class Agent Architecture and Cognitive Capabilities
![Blueprint 3: Arquitectura de Agentes](docs/images/03_mapa_arquitectura_agentes.jpg)

Confirms the fundamental invariant: **"The Agent DOES NOT replace the Execution"**:
* An agent defines a declarative configuration of capabilities (role profile, bound model, strict tool whitelist `ToolGateway`, and partitioned memory scope).
* Every dispatch of an agent is compulsorily executed under the policies and budgets of the `CoreRuntime`, preventing unauthorized access to tools outside its profile.

## 3.5 Blueprint 4: Fail-Closed Governance & Immutable Observability
![Blueprint 4: Gobernanza Fail-Closed y Observabilidad](docs/images/04_mapa_gobernanza_observabilidad.jpg)

Visualizes the continuous cybersecurity and observability mechanism:
* **Fail-Closed Governance (Secure by Default):** Any failure in policy evaluation, timeout, or attempt to inject executable functions into metadata produces the immediate halt of the operation.
* **Operational Event Bus:** Decoupled broadcasting of typed domain events and append-only storage in `SqliteEventStore`.
* **Immutable Observability:** Generation of frozen snapshots with `Object.freeze()`, immutable audit timeline and comprehensive traceability `{ traceId, taskId, executionId }`.

---

# Chapter 4: Exhaustive Specification of Layers and Components

### 4.1 Layer 1: Presentation & External Consumers
* **Web Platform Control Plane (`src/platform/web/`):** Native Single-Page Application (SPA) built with HTML5, Vanilla JavaScript and pure CSS. Designed without framework dependencies (no React, Vue, or Angular) to maximize long-term maintainability. Uses direct DOM node construction (`document.createElement`, `textContent`) eliminating the use of `innerHTML` as an active measure against Cross-Site Scripting (XSS). It has a dynamic internationalization core (`src/platform/web/i18n/`) that operates in Latin American Spanish (`es-419`) by default and allows switching to English (`en`).
* **External Consumers:** Satellite applications that communicate with the platform via HTTP/JSON using stable API DTOs or through the typed SDK `@ai-platform/client`.

### 4.2 Layer 2: Product Boundary (Platform API)
* **Native HTTP Server (`src/platform/server.ts`):** Restrictive binding to local loop `127.0.0.1:3000`. Rejects requests directed to unauthorized public network interfaces.
* **Router (`src/platform/api/http-router.ts`):**
  * Normalization of identifiers with the regular expression `^[a-zA-Z0-9_-]{1,128}$`.
  * Saturation protection: strict payload body limit to 1MB (HTTP 413) and MIME type validation `application/json` (HTTP 415).
  * Configurable enterprise Rate Limiting per tenant and principal (HTTP 429).
  * Path Traversal prevention in the static file service.
* **Read Projections (CQRS):** Located in `src/application/ports/query-ports.ts`. Strictly separates state querying (`ExecutionProjection`, `TaskProjection`, `AgentProjection`, `OperationProjection`) from domain mutation and transition methods.

### 4.3 Layer 3: Application & Operational Engines
* **`CoreRuntime` (`src/application/runtime/core-runtime.ts`):** Unique and centralized owner of atomic execution. Coordinates the `Task` and `Execution` state machine, emits lifecycle events, and delegates real work to an `ExecutionStrategy`.
* **`SubmitTask` (`src/application/submit-task.ts`):** Canonical use case for initial task registration and queuing in `QUEUED` state.
* **`AgentService` (`src/application/agent/agent-service.ts`):** Service that manages the agent lifecycle and dispatches executions via `SubmitTask`.
* **`AutonomousOrchestrator` (`src/application/autonomy/autonomous-orchestrator.ts`):** Application service that coordinates the autonomous supervision cycle in bounded steps, evaluating policies and delegating execution to `CoreRuntime`.
* **`RestartRecoveryService` (`src/application/recovery/restart-recovery-service.ts`):** Resilience service that detects unscheduled process crashes and atomically transitions active tasks and operations to safe terminal states.
* **`SequentialOrchestrator` (`src/application/orchestration/sequential-orchestrator.ts`):** Executes predefined linear sequences with parameter binding between consecutive operations.
* **`OrganizationService` (`src/application/organization/organization-service.ts`):** Service for managing the lifecycle of organizations, areas and teams with tenant boundary validation.
* **`TeamResourceBudgetService` (`src/application/organization/team-resource-budget-service.ts`):** Service for managing budget quotas per team with fail-closed evaluation and atomic consumption accounting.
* **`MultiAgentCoordinator` (`src/application/coordination/multi-agent-coordinator.ts`):** Coordinated multi-agent orchestration service for parallel and dependent executions.
* **`AutomationServices` (`src/application/automation/`):** Suite of automation services including n8n adapter (`n8n-adapter.ts`), webhook dispatcher (`webhook-dispatcher.ts`), task scheduler (`scheduler-service.ts`) and reporting service (`reporting-service.ts`).
* **`ResilienceServices` (`src/application/resilience/`):** Operational resilience services including circuit breaker (`circuit-breaker.ts`), retry policy (`retry-policy.ts`) and rate limiter (`rate-limiter.ts`).
* **`QuotaService` (`src/application/billing/quota-service.ts`):** Service for financial and operational quota management.
* **`FeatureFlagService` (`src/application/tenant/feature-flag-service.ts`):** Service for conditional feature flags per tenant.

### 4.4 Layer 4: Pure Domain Core
* **Main Aggregates:**
  * `Task`: Durable unit of work (`CREATED` ➔ `QUEUED` ➔ `RUNNING` ➔ `COMPLETED` / `FAILED`).
  * `Execution`: Concrete and dated computational attempt within an immutable context.
  * `Agent`: Profile of authorized capabilities.
  * `AutonomousOperation`: Bounded supervision with budget and consumption tracking.
  * `Organization, Area, Team & AgentMembership`: Virtual organizational hierarchy with soft lifecycle (`ACTIVE`, `INACTIVE`, `ARCHIVED`), functional areas, working teams and governed membership with operational roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`).
  * `TeamResourceBudget`: Multidimensional quota aggregate (`maxExecutions`, `maxModelCalls`, `maxToolCalls`, `maxAutonomousSteps`, `maxDurationMs`, `maxTokens`) with `consumed` counters, optimistic concurrency control (`version`) and states (`ACTIVE`, `EXHAUSTED`, `SUSPENDED`).
  * `Coordination`: Multi-agent coordination contracts for parallel executions and dependent flows.
  * `Billing & Quota`: Value Objects and financial and operational quota entities.
  * `Tenant`: Multi-tenant boundary entities and conditional feature flags.
* **Rehydration Factories:** Formal `rehydrate()` methods in each aggregate that restore the persisted state guaranteeing all domain invariants without resorting to reflection.
* **Abstract Ports:** `PolicyGateway`, `ModelGateway`, `ToolGateway`, `MemoryGateway`, `EventPublisher`, `PlannerPort`, `DecisionEvaluatorPort`, `TaskRepository`, `ExecutionRepository`, `OperationRepositoryPort`. None possesses external dependencies nor transport code.

### 4.5 Layer 5: Infrastructure & Concrete Adapters
* **Durable Relational Persistence (SQLite WAL):** `SqliteDatabase` with Node.js 22+ `node:sqlite`, `SqliteTaskRepository`, `SqliteExecutionRepository`, `SqliteAgentRepository`, `SqliteOperationRepository`, `SqliteEventStore`, `SqliteOrganizationRepository`, `SqliteTeamResourceBudgetRepository` and `SqliteMemoryGateway`. Constitutes the default server storage in production.
* **PostgreSQL Adapter (Scalable Production):** `PostgresTaskRepository` with relational schema (`postgres-schema.sql`) for deployments requiring horizontal scalability.
* **In-Memory Persistence (Testing):** `InMemoryTaskRepository`, `InMemoryExecutionRepository`, `InMemoryAgentRegistry`, `InMemoryOperationRepository`.
* **AI Model Adapters:** `OpenAIModelGateway`, `AnthropicModelGateway`, `OllamaModelGateway`, `GeminiModelGateway`, `StubModelGateway` and `ProviderFactory` with dynamic selection by environment variables.
* **Enterprise Device Adapter:** `BrotherPrinterAdapter` implementing local print management over port `USB001` for Brother DCP-1600 series.
* **Media Adapters:** `VirtualTryOnProvider` implementing AR virtual try-on for e-commerce.
* **Worker Queue:** `InMemoryWorkerQueue` as a queue abstraction for asynchronous processing.
* **Tools:** `InMemoryToolRegistry` with `CalculatorTool` and JSON schema validation.
* **Governance & Security:** `RbacAuthorizationEvaluator`, `InMemoryRoleRepository`, `InMemoryApiKeyRepository` and `JwtTokenVerifier` with RS256/ES256 asymmetric cryptographic verification and key rotation.
* **Telemetry and Diagnostics:** `EventObservabilitySubscriber`, `InMemoryAuditLog`, `InMemoryMetricsCollector`, `StructuredEventLogger` and `RuntimeDiagnosticsService`.

---

# Chapter 5: First-Class Agents Architecture (v0.8)

In version **v0.8**, the concept of Agent was formalized as a first-class domain aggregate.

### 5.1 The Five Pillars of the Agent Aggregate
1. **Identity & Name:** Normalized immutable identifier and descriptive name.
2. **Model Binding:** Formal binding to a registered model in the catalog (`ModelQueryPort`).
3. **Behavioral Instructions:** Operational directives that determine the expected role and behavior.
4. **Tool Authorization Whitelist (`agent.tools`):** Strict whitelist. If the model or process requests to invoke a tool not present in this list, execution is halted instantly.
5. **Partitioned Memory Scope (`agent.memoryScope`):** Isolated key-value storage space per agent, guaranteeing that an agent can never access data persisted by another.
6. **Binary Lifecycle State (`status`):** `ACTIVE` (enabled to execute) and `INACTIVE` (blocked for new executions).

### 5.2 Core Invariant: `Agent ≠ Execution`
The agent does not replace the execution engine. There are no "agent threads" or agent-specific execution loops. To execute an agent:
```text
POST /api/v1/agents/:id/executions
       ↓
AgentService.executeAgent()
       ↓
SubmitTask Use Case (creates Task in QUEUED state)
       ↓
CoreRuntime.execute()
       ↓
AgentExecutionStrategy (applies PolicyGateway, tools whitelist and memoryScope)
```

---

# Chapter 6: Bounded Autonomous Operations (v0.9 Increments #1 to #5)

Milestone **v0.9** introduces the capability to work towards a goal over multiple interactive and discrete steps.

### 6.1 The Danger of Unbounded Autonomy
Unbounded autonomy poses unacceptable risks in corporate environments: infinite loops, unpredictable costs due to uncontrolled token consumption, unaudited hallucinations, and lack of determinism.

For this reason, the architecture adopts the principle of **Bounded Autonomy**:

```text
AutonomousOperation
        │
        ▼
   PlannerPort.plan() ──► Produces Plan (Finite and frozen sequence of PlanSteps)
        │
        ▼
  Derivation of Decision (EXECUTE_STEP)
        │
   ┌────┴───────────────────────────────────────────────────────┐
   │ Finite Loop (for iteration < budget.maxSteps)              │
   │                                                            │
   │ 1. Pre-check for Cancellation                              │
   │ 2. Pre-check for Budget (checkBudget)                      │
   │ 3. PolicyGateway.evaluate() [FAIL-CLOSED]                  │
   │ 4. Submit Task ➔ CoreRuntime.execute()                     │
   │ 5. Task Output/Error ➔ Mapping to Observation              │
   │ 6. AutonomousOperation.recordStep(delta)                   │
   │ 7. DecisionEvaluatorPort.evaluate(context)                 │
   │ 8. Branching according to Decision:                        │
   │    • COMPLETE     ➔ Operation.complete() [TERMINAL]        │
   │    • FAIL         ➔ Operation.fail()     [TERMINAL]        │
   │    • STOP         ➔ Operation.cancel()   [TERMINAL]        │
   │    • EXECUTE_STEP ➔ Next step in Plan    [ITERATE]         │
   └────────────────────────────────────────────────────────────┘
```

### 6.2 The Autonomy Budget (`AutonomyBudget`)
Every start of an autonomous operation requires the definition of an immutable budget:
* `maxSteps`: Strict limit on the number of loop iterations (positive integer, e.g., 1 to 25).
* `maxDurationMs`: Wall-clock time limit in milliseconds.
* `maxToolCalls`: Cumulative limit of tool invocations.
* `maxTokens` *(optional)*: Ceiling of tokens consumed when measurable without coupling to providers.

### 6.3 The `AutonomousOperation` State Machine
```text
               [ SUBMITTED ]
                     │
                     ▼
                [ RUNNING ]
                     │
    ┌────────────────┼────────────────┬────────────────┐
    │                │                │                │
    ▼                ▼                ▼                ▼
[ COMPLETED ]   [ FAILED ]     [ CANCELLED ]   [ BUDGET_EXHAUSTED ]
```

* **`SUBMITTED ➔ RUNNING`:** When starting the loop in `AutonomousOrchestrator.run()`.
* **`RUNNING ➔ COMPLETED`:** When the `DecisionEvaluator` confirms that the goal was achieved (`Decision.type === "COMPLETE"`).
* **`RUNNING ➔ FAILED`:** When an unrecoverable planning error, terminal failure of a step, or policy denial (`PolicyDeniedError`) occurs.
* **`RUNNING ➔ CANCELLED`:** Exclusively upon an explicit cancellation signal from the operator or supervisor.
* **`RUNNING ➔ BUDGET_EXHAUSTED`:** Upon reaching any of the budget limits (`STEPS_EXHAUSTED`, `DURATION_EXCEEDED`, `TOOLS_EXHAUSTED`, `TOKENS_EXHAUSTED`).

---

# Chapter 7: Components Responsibilities Matrix

To prevent the erosion of architectural boundaries, each component possesses strictly delimited responsibilities:

| Component | Primary Responsibility | What it DOES NOT do (Strict Boundary) |
| :--- | :--- | :--- |
| **Agent** | Identity, directives, bound model, allowed tools, and memory scope aggregate. | DOES NOT execute code, DOES NOT contain loops, DOES NOT schedule autonomous tasks. |
| **Planner (`PlannerPort`)** | Decomposing a goal into a structured and finite `Plan` of steps (`PlanStep`). | DOES NOT execute tools, DOES NOT invoke models directly, DOES NOT evaluate policies. |
| **DecisionEvaluator** | Pure function that analyzes the `Observation` of a step to derive the next `Decision`. | DOES NOT execute tasks, DOES NOT call the runtime, DOES NOT have mutable side effects. |
| **PolicyGateway** | Evaluating and deciding if an action on a resource is authorized (`ALLOW` or `DENY`). | DOES NOT execute the action, DOES NOT plan, DOES NOT alter the task context. |
| **AutonomousOrchestrator**| Coordinating the bounded iterative cycle between Planner, Evaluator and CoreRuntime. | IS NOT an independent runtime, DOES NOT have background threads, DOES NOT replace `CoreRuntime`. |
| **CoreRuntime** | Executing canonical tasks atomically and governing `Task` and `Execution` transitions. | DOES NOT plan, DOES NOT decide goals, DOES NOT contain autonomy heuristics. |
| **Execution** | Representing a concrete and correlated computation attempt in the platform. | DOES NOT decide when to end autonomy, DOES NOT orchestrate future steps. |
| **Observation** | Describing the immutable and serializable result observed after executing a step. | DOES NOT execute code, DOES NOT contain callbacks, DOES NOT invoke tools. |
| **RestartRecoveryService**| Reconciling interrupted entities after process crashes to terminal states. | DOES NOT re-execute failed tasks, DOES NOT restart interrupted inferences. |
| **EventPublisher** | Broadcasting immutable domain facts to decoupled subscribers. | DOES NOT control the execution flow, DOES NOT intercept or block tasks. |

---

# Chapter 8: Fail-Closed Governance, Security & Invariants Catalog

### 8.1 Verified Invariants vs. Design Invariants

The architecture formally distinguishes between what has been verified through automated tests and what constitutes a contractual design constraint:

| ID | Invariant | Classification | Evidence / Verification Mechanism |
| :--- | :--- | :--- | :--- |
| **INV-01** | **Agent ≠ Execution** | `VERIFIED INVARIANT` | `AgentService.executeAgent()` dispatches exclusively through `SubmitTask` and `CoreRuntime`. |
| **INV-02** | **CoreRuntime as Unique Owner** | `VERIFIED INVARIANT` | There is no `AutonomousRuntime` or secondary engine. `AutonomousOrchestrator` delegates 100% to `CoreRuntime`. |
| **INV-03** | **Fail-Closed Governance** | `VERIFIED INVARIANT` | Every proposed action is evaluated by `PolicyGateway`. If it returns `DENY` or throws an exception, execution fails instantly. |
| **INV-04** | **Strict Tool Whitelist** | `VERIFIED INVARIANT` | `AgentExecutionStrategy` verifies that the requested tool is present in the `agent.tools` array. |
| **INV-05** | **Strict Memory Isolation** | `VERIFIED INVARIANT` | `MemoryGateway` and `MemoryService` isolate keys under the `agent.memoryScope` namespace. |
| **INV-06** | **Strictly Bounded Autonomy** | `VERIFIED INVARIANT` | The `AutonomousOrchestrator` loop is a finite `for` loop indexed by `budget.maxSteps`. |
| **INV-07** | **Timeout vs. Cancellation** | `VERIFIED INVARIANT` | Exceeding `maxDurationMs` results in `BUDGET_EXHAUSTED` (`DURATION_EXCEEDED`). Explicit cancellation results in `CANCELLED`. |
| **INV-08** | **Planner ≠ Executor** | `VERIFIED INVARIANT` | `PlannerPort` generates declarative plans without the capability to invoke infrastructure. |
| **INV-09** | **DecisionEvaluator ≠ Executor** | `VERIFIED INVARIANT` | `DeterministicDecisionEvaluator` is a pure function with no side effects. |
| **INV-10** | **Prohibition of Infinite Loops** | `VERIFIED INVARIANT` | Zero `while(true)` or `for(;;)` constructs across the entire codebase. |
| **INV-11** | **Provider Decoupling in Domain** | `VERIFIED INVARIANT` | Zero imports of third-party SDKs in `src/domain/`. |
| **INV-12** | **Zero Runtime Dependencies** | `VERIFIED INVARIANT` | Empty `dependencies` section in `package.json`. |
| **INV-13** | **XSS Immunity in Front-End** | `VERIFIED INVARIANT` | Zero `innerHTML` in the Web Control Plane (`app.js`, `index.html`). |
| **INV-14** | **Post-Crash Atomic Transactionality** | `VERIFIED INVARIANT` | `RestartRecoveryService` operates within atomic SQLite transactions. |
| **INV-15** | **Membership, Permission and Budget Decoupling** | `VERIFIED INVARIANT` | `Membership ≠ Permission`, `Membership ≠ Budget`, `Budget ≠ Authorization`. Organization and budget tests verify strict isolation. |
| **INV-16** | **Fail-Closed Budget Semantics** | `VERIFIED INVARIANT` | `NO BUDGET = DENY`. `TeamResourceBudgetService` denies execution when no assigned budget exists. |
| **INV-17** | **Atomic Last-Unit Concurrency Protection** | `VERIFIED INVARIANT` | `SqliteTeamResourceBudgetRepository` uses `BEGIN IMMEDIATE` to serialize transactions and prevent last-unit quota race conditions. |
| **INV-18** | **Multi-Tenant Boundary Isolation** | `VERIFIED INVARIANT` | Tenant boundaries are strictly enforced throughout the organizational hierarchy. `CrossTenantOrganizationError` emitted upon `tenantId` discrepancies. |

### 8.2 Canonical Resource Dimensions Matrix

| Resource Dimension | Measurement Origin | Preflight Gate | Enforcement Type | Accounting Phase | State Transition at Limit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`executions`** | Task dispatch in `AgentExecutionStrategy` | `canConsume({ executions: 1 })` | **ENFORCED (Hard Gate)** | Pre-execution (1 unit) | `ACTIVE` ➔ `EXHAUSTED` (Blocks subsequent executions) |
| **`modelCalls`** | LLM dispatch in `AgentExecutionStrategy` | `canConsume({ modelCalls: 1 })` | **ENFORCED (Hard Gate)** | Pre-model call (1 unit) | `ACTIVE` ➔ `EXHAUSTED` (Blocks model calls) |
| **`toolCalls`** | Invocation in `ToolInvocationRuntime` and `Strategy` | `canConsume({ toolCalls: 1 })` | **ENFORCED (Hard Gate)** | Pre-tool call (1 unit) | `ACTIVE` ➔ `EXHAUSTED` (Blocks tools) |
| **`autonomousSteps`** | Loop iteration in `AutonomousOrchestrator` | `canConsume({ autonomousSteps: 1 })` | **ENFORCED (Hard Gate)** | Pre-autonomous step (1 unit) | `ACTIVE` ➔ `EXHAUSTED` (Fails with `STEPS_EXHAUSTED`) |
| **`durationMs`** | Wall-clock time measured in `AgentExecutionStrategy` | N/A (Measured post-execution) | **ACCOUNTED (Post-Facto)** | Post-execution (real milliseconds) | `ACTIVE` ➔ `EXHAUSTED` when `consumed.durationMs >= limit` |
| **`tokens`** | Count reported by provider (`totalTokens`) | N/A (Reported post-inference) | **ACCOUNTED (Post-Facto)** | Post-call (real tokens) | `ACTIVE` ➔ `EXHAUSTED` when `consumed.tokens >= limit` |
| **`cost`** | Financial cost attribution | Not measured / Unavailable | **NOT MEASURED / UNAVAILABLE** | N/A | N/A |

---

# Chapter 9: Cancellation Semantics & Open Architectural Decisions

### 9.1 Current Cancellation Semantics
1. **Pre-Planning Cancellation:** If the `CancellationToken` contains `isCancelled: true` before initiating planning, the operation immediately transitions to `CANCELLED` and terminates without emitting tasks.
2. **Inter-Step Cancellation:** Before executing each step within the bounded loop, the `CancellationToken` is evaluated. If triggered, the operation is canceled in an orderly manner and does not dispatch the next step to `CoreRuntime`.
3. **In-Flight Task Execution Cancellation:** Once a step has been transferred to `CoreRuntime.execute()` and is invoking an external model or tool, the current token does not transmit an asynchronous interrupt signal (such as an `AbortSignal`) to the underlying network adapters.

### 9.2 Open Architectural Decision Record

```text
OPEN ARCHITECTURAL DECISION: OAD-001 — In-Flight Task Preemption & Asynchronous AbortSignals

Problem:
The current CancellationToken is evaluated synchronously before each step.
If a step is executing, waiting for a slow inference response, there is no
shared signaling channel that forces the immediate abort of the underlying HTTP socket.

Current Impact:
Cancellation takes effect upon conclusion of the in-flight step and before starting the next.
It does not compromise domain integrity but may consume latency of the active step.

Technical Recommendation for Future Increment:
Incorporate native standard AbortSignal support in CoreRuntime and in the contracts of
ModelGateway and ToolGateway, allowing external cancellations to propagate to network hardware.
Status: OPEN (Does not block v1.3.0 architecture).
```

---

# Chapter 10: Services Catalog & REST API Audit

### 10.1 Endpoints Audit

All implemented endpoints reside in `src/platform/api/http-router.ts` and are exposed under the unified prefix `/api/v1/` (with backward-compatible aliases under `/api/platform/v1/*` and `/api/*`):

| Method | Endpoint | Implementation Status | Technical Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | **IMPLEMENTED** | Serves the Single-Page Application (Bilingual Web Control Plane). |
| `GET` | `/api/v1/status` | **IMPLEMENTED** | Health status, uptime and entity count. |
| `GET` | `/api/v1/health` | **IMPLEMENTED** | Overall system health status. |
| `GET` | `/api/v1/health/live` | **IMPLEMENTED** | Liveness probe for container orchestrators. |
| `GET` | `/api/v1/health/ready` | **IMPLEMENTED** | Readiness probe with persistence verification. |
| `GET` | `/api/v1/diagnostics` | **IMPLEMENTED** | Comprehensive forensic report of diagnostics and component status. |
| `GET` | `/api/v1/diagnostics/traces/:id`| **IMPLEMENTED** | Trace reconstruction and correlated events by traceId. |
| `GET` | `/api/v1/models` | **IMPLEMENTED** | List of registered models and their capabilities. |
| `GET` | `/api/v1/models/:id` | **IMPLEMENTED** | Detail of a specific model. |
| `GET` | `/api/v1/tools` | **IMPLEMENTED** | List of tools and parameter schemas. |
| `GET` | `/api/v1/tools/:id` | **IMPLEMENTED** | Detail and validation schema of a tool. |
| `GET` | `/api/v1/agents` | **IMPLEMENTED** | Listing of registered agents. |
| `POST` | `/api/v1/agents` | **IMPLEMENTED** | Registration of a new agent (HTTP 201). |
| `GET` | `/api/v1/agents/:id` | **IMPLEMENTED** | Query of agent profile and configuration. |
| `PUT` | `/api/v1/agents/:id` | **IMPLEMENTED** | Update of agent configuration. |
| `POST` | `/api/v1/agents/:id/activate` | **IMPLEMENTED** | Transition of agent to `ACTIVE` state. |
| `POST` | `/api/v1/agents/:id/deactivate` | **IMPLEMENTED** | Transition of agent to `INACTIVE` state. |
| `POST` | `/api/v1/agents/:id/executions`| **IMPLEMENTED** | Governed execution through `CoreRuntime`. |
| `GET` | `/api/v1/tasks` | **IMPLEMENTED** | Listing of durable task projections. |
| `POST` | `/api/v1/tasks` | **IMPLEMENTED** | Canonical queuing via `SubmitTask`. |
| `GET` | `/api/v1/tasks/:id` | **IMPLEMENTED** | Task query by identifier. |
| `GET` | `/api/v1/executions` | **IMPLEMENTED** | Listing of execution projections. |
| `POST` | `/api/v1/executions` | **IMPLEMENTED** | Task dispatch and direct execution. |
| `GET` | `/api/v1/executions/:id` | **IMPLEMENTED** | Execution query by identifier. |
| `GET` | `/api/v1/executions/:id/timeline` | **IMPLEMENTED** | Forensic timeline correlated by `traceId`. |
| `POST` | `/api/v1/orchestrate` | **IMPLEMENTED** | Multi-operation linear orchestration. |
| `GET` | `/api/v1/metrics` | **IMPLEMENTED** | Metrics and operational telemetry samples. |
| `GET` | `/api/v1/audit` | **IMPLEMENTED** | Complete stream of forensic audit. |
| `GET` | `/api/v1/operations` | **IMPLEMENTED** | Listing of bounded autonomous operations. |
| `POST` | `/api/v1/operations` | **IMPLEMENTED** | Creation and synchronous in-process dispatch of a bounded operation. |
| `GET` | `/api/v1/operations/:id` | **IMPLEMENTED** | Detailed operation query with steps, observations, and decisions. |
| `POST` | `/api/v1/operations/:id/cancel` | **IMPLEMENTED** | Explicit operation cancellation signal. |
| `GET` | `/api/v1/devices` | **IMPLEMENTED** | Listing of registered enterprise physical devices. |
| `GET` | `/api/v1/devices/:id` | **IMPLEMENTED** | Detail and health of enterprise device. |
| `POST` | `/api/v1/devices/:id/print` | **IMPLEMENTED** | Dispatch of commercial print job. |
| | | | **— Virtual Organization Endpoints —** |
| `GET` | `/api/v1/organizations` | **IMPLEMENTED** | Listing of tenant organizations. |
| `POST` | `/api/v1/organizations` | **IMPLEMENTED** | Creation of a new organization. |
| `GET` | `/api/v1/organizations/:id` | **IMPLEMENTED** | Organization detail by identifier. |
| `PUT` | `/api/v1/organizations/:id` | **IMPLEMENTED** | Organization data update. |
| `GET` | `/api/v1/organizations/:id/hierarchy` | **IMPLEMENTED** | Complete hierarchical tree (organization → areas → teams). |
| `GET` | `/api/v1/organizations/:id/areas` | **IMPLEMENTED** | Listing of functional areas of the organization. |
| `POST` | `/api/v1/organizations/:id/areas` | **IMPLEMENTED** | Creation of a new functional area. |
| `GET` | `/api/v1/areas/:id` | **IMPLEMENTED** | Functional area detail by identifier. |
| `PUT` | `/api/v1/areas/:id` | **IMPLEMENTED** | Area data update. |
| `GET` | `/api/v1/areas/:id/teams` | **IMPLEMENTED** | Listing of teams in the area. |
| `POST` | `/api/v1/areas/:id/teams` | **IMPLEMENTED** | Creation of a new working team. |
| `GET` | `/api/v1/teams/:id` | **IMPLEMENTED** | Team detail by identifier. |
| `PUT` | `/api/v1/teams/:id` | **IMPLEMENTED** | Team data update. |
| `GET` | `/api/v1/teams/:id/agents` | **IMPLEMENTED** | Listing of agent members of the team with roles. |
| `POST` | `/api/v1/teams/:id/agents` | **IMPLEMENTED** | Agent assignment to the team with operational role. |
| `DELETE` | `/api/v1/teams/:id/agents/:agentId` | **IMPLEMENTED** | Revocation of agent membership in a team. |
| | | | **— Team Resource Budget Endpoints —** |
| `GET` | `/api/v1/teams/:id/budget` | **IMPLEMENTED** | Query of team resource budget with quotas and consumption. |
| `POST` | `/api/v1/teams/:id/budget` | **IMPLEMENTED** | Creation or update of the team budget. |
| `PUT` | `/api/v1/teams/:id/budget` | **IMPLEMENTED** | Update of quotas of the existing budget. |
| `POST` | `/api/v1/teams/:id/budget/authorize` | **IMPLEMENTED** | Fail-closed evaluation of consumption authorization against quota. |
| `POST` | `/api/v1/teams/:id/budget/consume` | **IMPLEMENTED** | Atomic accounting of resource consumption against budget. |
| | | | **— Additional Device Endpoints —** |
| `GET` | `/api/v1/devices/:id/health` | **IMPLEMENTED** | Health status of the enterprise device. |
| `GET` | `/api/v1/devices/:id/capabilities` | **IMPLEMENTED** | Capabilities and functionalities of the device. |
| `GET` | `/api/v1/devices/:id/status` | **IMPLEMENTED** | Current operational status of the device. |
| `GET` | `/api/v1/devices/:id/consumables` | **IMPLEMENTED** | Consumable levels (toner, paper, drum). |
| `GET` | `/api/v1/devices/:id/print-jobs` | **IMPLEMENTED** | Listing of print jobs of the device. |
| `GET` | `/api/v1/devices/:id/print-jobs/:jobId` | **IMPLEMENTED** | Detail of specific print job. |
| `POST` | `/api/v1/devices/:id/print-jobs/:jobId/cancel` | **IMPLEMENTED** | Cancellation of print job in queue. |
| `PATCH` | `/api/v1/devices/:id` | **IMPLEMENTED** | Partial configuration update of the device. |
| | | | **— Extended Diagnostics Endpoints —** |
| `GET` | `/api/v1/diagnostics/tasks/:id/timeline` | **IMPLEMENTED** | Forensic timeline of task by identifier. |
| `GET` | `/api/v1/diagnostics/executions/:id/forensics` | **IMPLEMENTED** | Detailed forensic analysis of execution. |
| | | | **— Tenant Endpoints —** |
| `GET` | `/api/v1/tenants` | **IMPLEMENTED** | Listing of registered tenants. |
| `GET` | `/api/v1/tenants/:id` | **IMPLEMENTED** | Tenant detail by identifier. |
| `GET` | `/api/v1/tenants/:id/dashboard` | **IMPLEMENTED** | Operational metrics dashboard of the tenant. |
| | | | **— Governed Applications Endpoints —** |
| `GET` | `/api/v1/applications` | **IMPLEMENTED** | Listing of registered satellite applications. |
| `GET` | `/api/v1/applications/:id` | **IMPLEMENTED** | Detail of satellite application. |
| `GET` | `/api/v1/applications/:id/analytics` | **IMPLEMENTED** | Analytics of application usage. |
| `POST` | `/api/v1/applications/:id/lifecycle` | **IMPLEMENTED** | Lifecycle transition of the application. |
| | | | **— Integrations Endpoints —** |
| `GET` | `/api/v1/integrations` | **IMPLEMENTED** | Listing of configured external integrations. |
| `GET` | `/api/v1/integrations/:id` | **IMPLEMENTED** | Detail of integration by identifier. |
| `POST` | `/api/v1/integrations/:id/verify` | **IMPLEMENTED** | Verification of integration connectivity. |
| | | | **— Events Endpoints —** |
| `GET` | `/api/v1/events` | **IMPLEMENTED** | Stream of domain events. |
| `GET` | `/api/v1/events/:id` | **IMPLEMENTED** | Detail of specific event by identifier. |

---

# Chapter 11: Architectural Traceability Matrix

This matrix links each approved architectural decision with its ADR document, its source code, its verification tests, and its documentation:

| Architectural Decision | ADR | Source Code | Verification Tests | Documentation |
| :--- | :--- | :--- | :--- | :--- |
| **TypeScript & Zero Runtime Dependencies** | ADR 0001 | `package.json`<br>`src/platform/server.ts` | `scripts/test.js`<br>`npm ls --omit=dev` | `README.md`<br>`docs/ARCHITECTURE.md` |
| **Domain Events & Immutable Observability** | ADR 0002 | `src/domain/events/events.ts`<br>`src/infrastructure/events/` | `tests/contract/event-publisher.contract.test.ts` | `docs/decisions/0002-domain-events-and-observability.md` |
| **Manual Composition Root** | ADR 0003 | `src/interfaces/composition.ts` | `tests/integration/core-runtime.test.ts` | `docs/decisions/0003-manual-composition.md` |
| **Core Runtime Execution Model** | ADR 0004 | `src/application/runtime/core-runtime.ts` | `tests/unit/execution.test.ts` | `docs/decisions/0004-core-runtime-execution-model.md` |
| **Tools as Explicit Capabilities** | ADR 0005 | `src/application/tools/tool-gateway.ts` | `tests/unit/tool-gateway.test.ts` | `docs/decisions/0005-tools-as-explicit-capabilities.md` |
| **Engine / Platform / Application Boundary** | ADR 0006 | `src/domain/`<br>`src/platform/`<br>`src/application/` | `tests/unit/architecture-isolation.test.ts` | `docs/decisions/0006-engine-platform-application-boundary.md` |
| **Sequential Orchestration** | ADR 0007 | `src/application/orchestration/` | `tests/unit/sequential-orchestrator.test.ts` | `docs/decisions/0007-sequential-orchestration.md` |
| **Context & Scoped Memory Boundaries** | ADR 0008 | `src/domain/context/task-context.ts`<br>`src/domain/memory/` | `tests/unit/task-context.test.ts` | `docs/decisions/0008-context-and-memory-boundaries.md` |
| **Fail-Closed Policy Governance** | ADR 0009 | `src/domain/policy/policy.ts`<br>`src/infrastructure/policy/` | `tests/unit/observability-and-policy.test.ts` | `docs/decisions/0009-observability-and-governance-boundaries.md` |
| **Platform API & Native Web UI** | ADR 0010 | `src/platform/api/http-router.ts`<br>`src/platform/web/` | `tests/platform/api.test.ts`<br>`tests/platform/operational-ui-frontend.test.ts` | `docs/decisions/0010-platform-api-and-web-ui.md` |
| **First-Class Agent Aggregate** | ADR 0011 | `src/domain/agent/agent.ts`<br>`src/application/agent/agent-service.ts` | `tests/unit/agent.test.ts`<br>`tests/integration/agent-runtime.test.ts` | `docs/decisions/0011-agent-architecture.md` |
| **Autonomous Operations Foundation** | ADR 0012 | `src/domain/autonomy/autonomous-operation.ts` | `tests/unit/autonomous-operation.test.ts` | `docs/decisions/0012-autonomous-operations.md` |
| **Autonomy Budget & Bounded Loop** | ADR 0013 | `src/domain/autonomy/autonomy-budget.ts`<br>`src/application/autonomy/autonomous-orchestrator.ts` | `tests/unit/autonomy-budget.test.ts`<br>`tests/unit/autonomous-orchestrator.test.ts` | `docs/decisions/0013-bounded-autonomous-operations.md` |
| **Autonomous Operations API & UI** | ADR 0014 | `src/platform/api/http-router.ts`<br>`src/platform/web/app.js` | `tests/platform/operations-api.test.ts` | `docs/decisions/0014-autonomous-operations-api-integration.md` |
| **Durable Persistence Architecture (SQLite WAL)** | ADR 0015 | `src/infrastructure/persistence/sqlite/sqlite-database.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-operation-repository.ts` | `tests/unit/sqlite-persistence.test.ts` | `docs/decisions/0015-durable-persistence-architecture.md` |
| **Formal Domain Rehydration Boundary** | ADR 0016 | `src/domain/autonomy/autonomous-operation.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-mapper.ts` | `tests/unit/autonomous-operation.test.ts` | `docs/decisions/0016-formal-domain-rehydration-boundary.md` |
| **Core Execution Rehydration Boundary** | ADR 0017 | `src/domain/task/task.ts`<br>`src/domain/execution/execution.ts` | `tests/unit/task.test.ts`<br>`tests/unit/execution.test.ts` | `docs/decisions/0017-core-execution-domain-rehydration-boundary.md` |
| **Agent Domain Rehydration Boundary** | ADR 0018 | `src/domain/agent/agent.ts` | `tests/unit/agent.test.ts` | `docs/decisions/0018-agent-domain-rehydration-boundary.md` |
| **Durable SQLite Adapters for Core Entities** | ADR 0019 | `src/infrastructure/persistence/sqlite/sqlite-task-repository.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-execution-repository.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-agent-repository.ts` | `tests/contract/task-repository.contract.test.ts`<br>`tests/contract/execution-repository.contract.test.ts`<br>`tests/contract/agent-registry.contract.test.ts` | `docs/decisions/0019-durable-sqlite-adapters-for-task-execution-agent.md` |
| **Crash Recovery & Restart Reconciliation** | ADR 0020 | `src/application/recovery/restart-recovery-service.ts` | `tests/unit/restart-recovery-service.test.ts`<br>`tests/integration/sqlite-crash-recovery.integration.test.ts` | `docs/decisions/0020-crash-recovery-and-restart-reconciliation.md` |
| **Durable Events & Audit Infrastructure** | ADR 0021 | `src/infrastructure/persistence/sqlite/sqlite-event-store.ts` | `tests/contract/durable-event-store.contract.test.ts`<br>`tests/integration/sqlite-durable-events.integration.test.ts` | `docs/decisions/0021-durable-events-and-audit-infrastructure.md` |
| **Observability Audit Query & Diagnostics** | ADR 0022 | `src/application/diagnostics/runtime-diagnostics.ts`<br>`src/platform/api/http-router.ts` | `tests/platform/diagnostics-api.test.ts` | `docs/decisions/0022-observability-audit-query-and-runtime-diagnostics.md` |
| **Google Gemini Model Gateway** | ADR 0023 | `src/infrastructure/model/gemini/gemini-model-gateway.ts` | `tests/unit/gemini-model-gateway.test.ts` | `docs/decisions/0023-google-gemini-model-gateway.md` |
| **SQLite Durable Memory Gateway** | ADR 0024 | `src/infrastructure/memory/sqlite-memory-gateway.ts` | `tests/unit/sqlite-memory-gateway.test.ts`<br>`tests/contract/memory-gateway.contract.test.ts` | `docs/decisions/0024-sqlite-durable-memory-gateway.md` |
| **Asymmetric JWT & Key Rotation** | ADR 0025 | `src/infrastructure/security/jwt-token-verifier.ts` | `tests/unit/jwt-authentication.test.ts` | `docs/decisions/0025-asymmetric-jwt-and-key-rotation.md` |
| **Production Reverse Proxy & TLS** | ADR 0026 | `deploy/nginx/nginx.conf`<br>`deploy/caddy/Caddyfile`<br>`deploy/docker-compose.prod.yml` | Deployment of manifests and configuration | `docs/decisions/0026-production-reverse-proxy-and-tls.md` |
| **Virtual Organization Foundation** | ADR 0027 | `src/domain/organization/`<br>`src/infrastructure/organization/` | `tests/unit/organization-domain.test.ts`<br>`tests/platform/organization-api.test.ts` | `docs/decisions/0027-virtual-organization-foundation.md` |
| **Team Resource Budget Governance** | ADR 0028 | `src/domain/organization/team-resource-budget.ts`<br>`src/application/organization/team-resource-budget-service.ts`<br>`src/infrastructure/persistence/sqlite/sqlite-team-resource-budget-repository.ts` | `tests/unit/team-resource-budget.test.ts` | `docs/decisions/0028-team-resource-budget-governance.md` |
| **Security Context & Multi-Tenant Boundary** | ADR-003 | `src/domain/security/boundaries.ts` | `tests/unit/security-boundaries.test.ts` | `docs/decisions/ADR-003-security-context.md` |
| **Tentaciones Platform Integration & Fallback** | ADR-008 | `src/application/platform/tentaciones-platform-adapter.ts` | `tests/platform/tentaciones-platform-adapter.test.ts` | `docs/decisions/ADR-008-tentaciones-integration.md` |
| **Platform Truth Model** | ADR-010 | `docs/SOURCE_OF_TRUTH.md` | `tests/platform/runtime-integration-hardening.test.ts` | `docs/decisions/ADR-010-platform-truth-model.md` |
| **Core Platform Separation** | ADR-001 | `src/domain/`<br>`src/platform/`<br>`src/application/` | `tests/unit/architecture-isolation.test.ts` | `docs/decisions/ADR-001-core-platform-separation.md` |
| **Hexagonal Architecture** | ADR-002 | `src/domain/`<br>`src/infrastructure/` | `tests/unit/architecture-isolation.test.ts` | `docs/decisions/ADR-002-hexagonal-architecture.md` |
| **Default Deny Policy** | ADR-004 | `src/domain/policy/policy.ts`<br>`src/infrastructure/policy/` | `tests/unit/observability-and-policy.test.ts` | `docs/decisions/ADR-004-default-deny.md` |
| **Durable Events Foundation** | ADR-005 | `src/domain/events/events.ts`<br>`src/infrastructure/events/` | `tests/contract/event-publisher.contract.test.ts` | `docs/decisions/ADR-005-durable-events.md` |
| **Platform API Boundary** | ADR-006 | `src/platform/api/http-router.ts` | `tests/platform/api.test.ts` | `docs/decisions/ADR-006-platform-api.md` |
| **External Application Boundary** | ADR-007 | `src/application/platform/`<br>`src/application/factory/` | `tests/platform/tentaciones-platform-adapter.test.ts` | `docs/decisions/ADR-007-external-application-boundary.md` |
| **AR Governance & Virtual Try-On** | ADR-009 | `src/infrastructure/media/virtual-tryon-provider.ts` | `tests/unit/tentaciones-ar-commerce.test.ts` | `docs/decisions/ADR-009-ar-governance.md` |

---

# Chapter 12: Official Roadmap (Synchronized Roadmap)

The technical roadmap is structured exclusively on facts demonstrated in the code and future projections duly delimited:

```text
COMPLETED & VERIFIED (v1.3.0 CANONICAL BASELINE — 1064 TESTS PASS)
──────────────────────────────────────────────────────────────────────────
• v0.1 to v0.6: Core Engine Primitives (Runtime, Context, Memory, Tools, Models, Policy)
• v0.7: Platform API Gateway & Web Control Plane SPA (Zero Runtime Dependencies)
• v0.8: First-Class Agents Capability (Agent Aggregate, Whitelisting, Scoping)
• v0.9: Bounded Autonomous Operations (AutonomyBudget, AutonomousOrchestrator, DecisionEvaluator)
• v0.10: Durable Persistence Architecture (Native SqliteDatabase, SqliteOperationRepository WAL)
• v0.11: Formal Domain Rehydration Boundaries (Task, Execution, Agent, AutonomousOperation)
• v0.12: Durable Execution Persistence (SqliteTaskRepository, SqliteExecutionRepository, SqliteAgentRepository)
• v0.13: Crash Recovery & Reconciliation (Atomic RestartRecoveryService, SqliteEventStore)
• v1.0.0: AI Operating Platform Foundation (Platform API, PlatformClient SDK, Tentaciones AI Commerce)
• v1.1.0: Extended Ecosystem & Operational Maturity:
  - Real AI Providers: OpenAI, Anthropic, Ollama adapters and ProviderFactory.
  - Business Devices: Brother DCP-1600 series adapter on USB001 and print spooler.
  - Reference Applications: Vehicle Parts Platform and Application Factory 2.0.
  - Bilingual Interface: Native web console in Latin American Spanish (es-419) and English (en).
• v1.2.0 (Phase 55 / Prompt 101): Enterprise Cloud Foundation & Real Model Expansion:
  - Google Gemini / Vertex AI: Native GeminiModelGateway adapter with streaming and tool calling (AOP-MODEL-GEMINI).
  - Durable Memory Gateway: Relational durable gateway SqliteMemoryGateway in SQLite WAL (AOP-MEMORY).
  - Asymmetric JWT & OIDC: Cryptographic verifier JwtTokenVerifier with RS256/ES256 and key rotation (AOP-AUTH).
  - Perimeter Network Topology: Production Nginx/Caddy manifests with TLS, HSTS and Docker Compose (AOP-NETWORK).
  - REST API Surface Convergence: RFC 8594 (Deprecation/Sunset) headers in alias /api/platform/v1/* (AOP-API-SURFACES).
• v1.2.0 (Phase 56 / Prompt 102): Virtual Organization Foundation:
  - Organization Aggregate: Enterprise aggregate with soft lifecycle (ACTIVE, INACTIVE, ARCHIVED).
  - Functional Areas & Working Teams: Area and Team entities associated with the organization within tenantId.
  - Governed Agent Membership: Explicit binding of agents to teams with operational roles (LEAD, SPECIALIST, OPERATOR, REVIEWER).
  - Durable Persistence: SqliteOrganizationRepository in SQLite WAL with OCC and composite indexes.
  - RESTful API & UI: Canonical endpoints /api/v1/* and interactive bilingual SPA dashboard (0 innerHTML).
• v1.3.0 (Phase 57 / Prompt 103): Team Resource Governance & Budget Control:
  - TeamResourceBudget Aggregate: Multidimensional quotas (executions, modelCalls, toolCalls, autonomousSteps, durationMs, tokens), consumed counters, OCC version and states (ACTIVE, EXHAUSTED, SUSPENDED).
  - Strict Decoupling Invariants: Membership ≠ Permission, Membership ≠ Budget, Budget ≠ Authorization. Fail-closed (NO BUDGET = DENY).
  - Durable Persistence: SqliteTeamResourceBudgetRepository with atomic BEGIN IMMEDIATE transactions against last-unit races.
  - RESTful API & UI: Canonical endpoints /api/v1/teams/:id/budget* and consumption metrics dashboard in Web Control Plane.
• v1.3.0 (Phase 57.1 / Prompt 104): Team Resource Budget Enforcement & Execution Integration:
  - Runtime Fail-Closed Integration: Active connection of team quotas in `AgentExecutionStrategy`, `ToolInvocationRuntime` and `AutonomousOrchestrator`.
  - Quota Evaluation Points: Fail-closed check and consumption per execution, model calls, tool calls, autonomous steps, duration and tokens.
  - Anti-Bypass & Isolation: Guaranteed blocking without bypass upon EXHAUSTED and SUSPENDED states and tenantId discrepancies.
• v1.3.0 (Phase 57.2 / Prompt 105): Budget Governance Closure & No-Bypass Hardening:
  - Audit gaps closure: strict denial for agents without an assigned team (`unassigned-agent-no-team`) unless explicitly authorized by system policy.
  - Strict fail-closed denial upon non-existent team budgets (`team-resource-budget-missing`).
  - Formal resource dimension semantics: Hard Gates pre-execution vs Post-facto accounting with overshoot (`durationMs`, `tokens`) transitioning to `EXHAUSTED`.
  - Test Baseline: 1064 deterministic passing tests (0 fail, 11 suites).

FUTURE ROADMAP (FORMAL BACKLOG v1.4 — DESIGNED / NOT IMPLEMENTED)
──────────────────────────────────────────────────────────────────────────
• AOP-V1-EXIT: Final certification of exit criteria for massive production.
```

---

# Glossary of Architectural Terms

* **Agent:** Declarative domain aggregate encapsulating identity, behavioral instructions, bound AI model, strict tool whitelist, and partitioned memory scope.
* **AutonomousOperation:** Supervisory entity that coordinates the execution of a multi-step bounded objective by a strict budget.
* **AutonomyBudget:** Immutable Value Object imposing unbreakable ceilings on steps (`maxSteps`), wall-clock duration (`maxDurationMs`), and tool invocations (`maxToolCalls`).
* **CoreRuntime:** Central and exclusive engine for executing canonical tasks on the platform. Sole owner of the `Task` and `Execution` lifecycle.
* **Decision:** Discrete domain object representing the determination made after evaluating a step's observation (`COMPLETE`, `FAIL`, `STOP`, `EXECUTE_STEP`).
* **Fail-Closed:** Security design principle under which any failure, exception, timeout, or authorization uncertainty produces the denial and immediate halt of the operation.
* **Observation:** Serializable and immutable Value Object that records the technical and factual result of a step executed in the central engine.
* **RestartRecoveryService:** Application service guaranteeing the idempotent atomic reconciliation of tasks and operations interrupted after a system crash.
* **TraceId:** Unique cross-sectional correlation identifier accompanying every request from the HTTP client to the database and audit events.
* **Zero Runtime Dependencies:** System characteristic by which the production code operates exclusively with native Node.js APIs, without packages in the `dependencies` section of `package.json`.
* **Organization:** Enterprise domain aggregate with a soft lifecycle (`ACTIVE`, `INACTIVE`, `ARCHIVED`) that groups functional areas and teams within a tenant.
* **TeamResourceBudget:** Multidimensional quota aggregate imposing team ceilings on executions, model calls, tool invocations, autonomous steps, duration, and tokens.
* **MultiAgentCoordinator:** Application service that orchestrates coordinated executions among multiple agents with dependencies and controlled parallelism.
* **CircuitBreaker:** Resilience pattern that detects repeated failures in an external service and opens the circuit to prevent error cascades, closing it gradually upon detecting recovery.
* **FeatureFlag:** Conditional mechanism per tenant that allows enabling or disabling platform functionalities without redeployment.
