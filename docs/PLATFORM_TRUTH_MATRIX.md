# Platform Truth Matrix — AI Operating Platform

## 1. Executive Summary & Verification Standard

The **AI Operating Platform** is built upon a fundamental architectural separation:

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

To maintain absolute engineering integrity and transparency, every piece of data, status badge, metric, and entity displayed in the Platform Web Console must reflect its **authentic source of truth**.

### State Taxonomy

1. **Implementation Status**:
   - `IMPLEMENTED`: Fully developed and backed by production code in the repository.
   - `PARTIAL`: Partially developed or functioning via test doubles / in-memory adapters.
   - `PLANNED`: Designed in architecture specifications and roadmap, but not yet implemented.
   - `NOT_IMPLEMENTED`: Not present in current release.

2. **Runtime Status**:
   - `HEALTHY` / `ONLINE`: Actively responding and operational at runtime via public API.
   - `AVAILABLE`: Registered in runtime registry and available for invocation.
   - `DEGRADED`: Running with partial capability loss or transient errors.
   - `OFFLINE`: Unreachable or stopped.
   - `NOT_CONNECTED`: External consumer or planned integration that is not currently running as an active client.
   - `PLANNED`: Runtime entity designed for future deployment.

3. **Source of Truth**:
   - `Platform API`: Live HTTP REST endpoint (`/api/v1/*`).
   - `SQLite WAL`: Persistent durable event ledger and transaction database on disk.
   - `Model Gateway`: In-memory model registry and adapter runtime.
   - `Dynamic Tool Registry`: Verified runtime tool catalog with schema enforcement.
   - `Architectural Specification`: Engineering documentation, blueprints, and interface contracts.
   - `External Application Contract`: Integration protocol defined for third-party consumers.

---

## 2. Platform Surface-by-Surface Truth Matrix

| Surface / View | Data Item / Component | Source of Truth | Verification Method | Implementation Status | Runtime Status | Truth Classification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | Engine Health & Uptime | `GET /api/v1/health` | HTTP API polling | `IMPLEMENTED` | `HEALTHY` | **LIVE** | Real platform version and uptime from memory. |
| **Dashboard** | SQLite DB Persistence | `GET /api/v1/health` | Component health check | `IMPLEMENTED` | `ONLINE` | **LIVE** | WAL mode verified on disk. |
| **Dashboard** | Event Count & Persisted | `GET /api/v1/health` | Event store stats | `IMPLEMENTED` | `HEALTHY` | **LIVE** | Monotonic queryable events in SQLite. |
| **Platform Operations** | Durable Event Stream | `GET /api/v1/events` | SQLite WAL EventStore | `IMPLEMENTED` | `HEALTHY` | **LIVE** | Real append-only event stream with sequence numbers. |
| **Platform Operations** | Audit Observations | `GET /api/v1/audit` | Audit observation log | `IMPLEMENTED` | `HEALTHY` | **LIVE** | Security and task dispatch audit observations. |
| **Platform Operations** | Crash Recovery Ledger | `GET /api/v1/health` | Recovery diagnostics | `IMPLEMENTED` | `HEALTHY` | **LIVE** | SQLite WAL recovery rehydration history. |
| **Agents Console** | Agent Catalog | `GET /api/v1/agents` | Agent Service & SQLite | `IMPLEMENTED` | `ACTIVE` | **LIVE** | Registered AI agents with versioning & OCC. |
| **Agent Detail** | Hierarchy Tree (Agent -> Model -> Tools -> Memory) | `GET /api/v1/agents/:id` | Agent entity projection | `IMPLEMENTED` | `DERIVED` | **LIVE PROJECTION** | Reconstructed dynamically from agent declaration. |
| **Tools Console** | Dynamic Tool Catalog | `GET /api/v1/tools` | Tool Registry Port | `IMPLEMENTED` | `AVAILABLE` | **LIVE** | Tools registered with JSON schema parameters. |
| **Tool Detail** | Input/Output Schema & Risk Level | `GET /api/v1/tools/:id` | Tool Definition DTO | `IMPLEMENTED` | `AVAILABLE` | **LIVE** | Validated parameters, risk levels & approval gates. |
| **Models Console** | Registered Model Gateways | `GET /api/v1/models` | Model Query Port | `IMPLEMENTED` | `AVAILABLE` | **LIVE** | `stub-model` registered in `InMemoryModelRegistry`. |
| **Model Detail** | Provider, Latency & Capabilities | `GET /api/v1/models/:id` | Model Definition DTO | `IMPLEMENTED` | `AVAILABLE` | **LIVE** | Gateway capabilities and assigned agents list. |
| **Autonomous Operations**| Operations Ledger & Budget | `GET /api/v1/operations` | AutonomousOperationService | `IMPLEMENTED` | `HEALTHY` | **LIVE** | Budget-bounded autonomous execution loops. |
| **Applications Console** | Tentaciones AI Commerce | `GET /api/v1/applications/tentaciones-commerce` | Platform API & Adapter | `IMPLEMENTED` | `HEALTHY` | **LIVE APPLICATION** | Live integrated consumer with authenticated product discovery. |
| **Applications Console** | Vehicle Parts Platform | External Application Contract | Architectural Contract | `PLANNED` | `NOT_CONNECTED`| **PLANNED INTEGRATION** | Future industrial automotive consumer. |
| **Applications Console** | Enterprise Support Agent | External Application Contract | Architectural Contract | `PLANNED` | `NOT_CONNECTED`| **PLANNED INTEGRATION** | Future customer service consumer. |
| **Applications Simulation**| Order Calculation Simulation | `POST /api/v1/orchestrate`| Public Platform API | `IMPLEMENTED` | `SIMULATED` | **ORCHESTRATION TEST** | Live test of orchestration API simulating ecommerce cart. |
| **Governance Control Plane**| Active Security Policies & Rules | `GET /api/v1/governance/policies` | Governance Service | `IMPLEMENTED` | `ACTIVE` | **LIVE GOVERNANCE** | Risk-tiered rules with human oversight triggers. |
| **Governance Applications** | Application Lifecycle States | `GET /api/v1/governance/applications` | Governance Registry | `IMPLEMENTED` | `ACTIVE` | **LIVE GOVERNANCE** | Onboarding and capability sandbox status. |
| **Governance Audit** | Risk Decision Audit Trail | `GET /api/v1/governance/audit` | Governance Audit Log | `IMPLEMENTED` | `OPERATIONAL` | **LIVE AUDIT** | Immutable trail of policy evaluation decisions. |
| **Production Health** | Liveness & Readiness Probes | `GET /api/v1/health/liveness`, `readiness` | Platform Service | `IMPLEMENTED` | `HEALTHY` | **LIVE PROBE** | Kubernetes-ready health checks. |
| **Worker Queue** | Task Claim, Heartbeat & DLQ | `WorkerQueuePort` | `InMemoryWorkerQueue` | `IMPLEMENTED` | `AVAILABLE` | **LOCAL WORKER** | Distributed backend (Redis/RabbitMQ) is `DESIGNED`. |
| **Resilience Engine** | Rate Limiter, Circuit Breaker & Retry | Resilience Services | Local Runtime | `IMPLEMENTED` | `OPERATIONAL` | **RESILIENCE ENGINE** | Sliding window & backpressure bounds. |
| **Interactive Blueprint**| 7-Tier System Topology | Architecture Docs | Code & Design Specs | `IMPLEMENTED` | `ARCHITECTURAL`| **SYSTEM BLUEPRINT** | Interactive navigation across all platform tiers. |
| **Interactive Blueprint**| Subsystem Status Table | System Verification | Test suite & Build | `IMPLEMENTED` | `DUAL STATE` | **AUDITED STATUS** | Separates Implementation from Runtime status. |
| **Blueprint Infographics**| Technical Diagrams | `src/platform/web/assets/` | Static JPG/PNG Assets | `IMPLEMENTED` | `STATIC ASSET` | **DOCUMENTATION** | Official high-resolution engineering blueprints. |

---

## 3. Hardening Guidelines & Rules of Engagement

1. **No Fake Connections**:
   Never show `CONNECTED` or `ONLINE` for external applications (such as Tentaciones or Vehicle Parts) unless there is an active, verified HTTP or WebSocket client session.
2. **Clear Source Badges**:
   Every visual card and inspector must display its authoritative source (`Source: Platform API`, `Source: Architectural Contract`, etc.).
3. **Honest Simulation Naming**:
   Interactive testing features must explicitly state `Integration Test (Orchestration Simulation via Platform API)` rather than implying that a third-party backend is executing live.
4. **Preservation of DOM Security**:
   All UI rendering must remain 100% compliant with zero-injection rules (0 `innerHTML`, 0 `outerHTML`, 0 `eval`, 0 `document.write`).
