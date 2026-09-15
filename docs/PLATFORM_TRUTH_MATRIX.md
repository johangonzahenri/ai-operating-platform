# Platform Truth Matrix — AI Operating Platform

## 1. Executive Summary & Verification Standard

The **AI Operating Platform** is built upon a fundamental architectural separation:

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{EXTERNAL SERVICES}$$

To maintain absolute engineering integrity and transparency, every piece of data, status badge, metric, and entity displayed in the Platform Web Console must reflect its **authentic source of truth**.

### State Taxonomy

1. **Implementation Status**:
   - `IMPLEMENTED`: Fully developed and backed by production code in the repository.
   - `PARTIAL`: Partially developed or functioning via test doubles / in-memory adapters.
   - `PLANNED` / `DESIGNED`: Designed in architecture specifications and roadmap, but not yet connected to live cloud endpoints.
   - `NOT_IMPLEMENTED`: Not present in current release.

2. **Runtime Status**:
   - `HEALTHY` / `ONLINE`: Actively responding and operational at runtime via public API.
   - `AVAILABLE`: Registered in runtime registry and available for invocation.
   - `NOT_CONFIGURED`: Adapter implemented in codebase but external API key/endpoint is absent from environment.
   - `CONFIGURED_OFFLINE`: API key configured, but remote external endpoint is unreachable or returning error.
   - `OPERATIONAL`: Actively verified and successfully communicating with remote or local backend.
   - `NOT_CONNECTED`: External consumer or planned integration that is not currently running as an active client.

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
| **Tools Console** | Dynamic Tool Catalog | `GET /api/v1/tools` | Tool Registry Port | `IMPLEMENTED` | `AVAILABLE` | **LIVE** | Tools registered with JSON schema parameters. |
| **Models: OpenAI** | `OpenAIModelGateway` | Model Gateway Port | Runtime Env & Fetch | `IMPLEMENTED` | `NOT_CONFIGURED` | **ADAPTER READY** | Connects to `/v1/chat/completions` when `OPENAI_API_KEY` exists. |
| **Models: Anthropic** | `AnthropicModelGateway`| Model Gateway Port | Runtime Env & Fetch | `IMPLEMENTED` | `NOT_CONFIGURED` | **ADAPTER READY** | Connects to `/v1/messages` when `ANTHROPIC_API_KEY` exists. |
| **Models: Ollama** | `OllamaModelGateway` | Localhost Daemon | Local HTTP Probe | `IMPLEMENTED` | `NOT_CONFIGURED` | **LOCAL PRIVACY** | Connects to local `localhost:11434` daemon when online. |
| **Models: Stub** | `StubModelGateway` | In-Memory Core Engine | Deterministic Engine | `IMPLEMENTED` | `OPERATIONAL` | **DETERMINISTIC** | In-process test and offline execution gateway. |
| **Model Router** | `GovernedModelRouter` | Router & Guardrails | Fail-Closed Fallback | `IMPLEMENTED` | `OPERATIONAL` | **GOVERNED** | Enforces prompt safety, length checks and failover chain. |
| **AR Media Registry** | `ArAssetRegistry` | In-Memory Registry | URN & SemVer checks | `IMPLEMENTED` | `OPERATIONAL` | **LIVE AR ASSETS** | Validates URNs, bounding boxes, LODs and SHA-256 hashes. |
| **AR Try-On Fitting** | `VirtualTryonEngine` | Fitting Analysis Engine| Mathematical Geometry| `IMPLEMENTED` | `OPERATIONAL` | **REAL SIZING** | Analyzes parametric body presets (Nova, Sora, Mateo). |
| **Automation: Webhooks**| `WebhookDispatcher` | Cryptographic HMAC | SHA-256 Signature | `IMPLEMENTED` | `OPERATIONAL` | **CRYPTO SIGNED** | Dispatches events with retry backoff and signature headers. |
| **Automation: Scheduler**| `SchedulerService` | 5-Field Cron Engine | Real-time evaluation | `IMPLEMENTED` | `OPERATIONAL` | **LIVE SCHEDULER** | Schedules autonomous periodic tasks and logs history. |
| **Automation: n8n** | `N8nPlatformAdapter` | Community Node Contract| JSON Manifest Export | `IMPLEMENTED` | `DESIGNED` | **MANIFEST EXPORT** | Node definitions for n8n trigger and action integration. |
| **SaaS: Multi-Tenancy** | `Tenant` & Isolation | Domain Entities | Plan Boundary Gates | `IMPLEMENTED` | `OPERATIONAL` | **SAAS MULTI-TENANT**| Free, Pro, Business, Enterprise plan isolation. |
| **SaaS: Quotas** | `QuotaService` | Consumption Metering | Monthly Window Tracker| `IMPLEMENTED` | `OPERATIONAL` | **QUOTA ENFORCEMENT**| Enforces tasks, executions, and storage caps fail-closed. |
| **SaaS: Feature Flags** | `FeatureFlagService` | Tenant Entitlements | Policy Gating | `IMPLEMENTED` | `OPERATIONAL` | **FEATURE FLAGS** | Grants or denies platform capabilities per tenant tier. |
| **Cloud: Dockerfile** | Multi-stage Container | Container Engine | Docker Build Specs | `IMPLEMENTED` | `DEPLOYABLE` | **CONTAINERIZED** | Alpine 22 runner, non-root user `nodejs`, healthcheck. |
| **Cloud: PostgreSQL** | `PostgresTaskRepository`| SQL Persistence Port | Portable Schema | `IMPLEMENTED` | `ADAPTER READY` | **PORTABLE DB** | Schema mapping and fallback memory engine. |
| **Applications Console** | Tentaciones AI Commerce | `GET /api/v1/applications/tentaciones-commerce` | Platform API & Adapter | `IMPLEMENTED` | `HEALTHY` | **LIVE APPLICATION** | Live integrated consumer with authenticated product discovery. |
| **Applications Console** | Vehicle Parts Platform | External Application Contract | Architectural Contract | `PLANNED` | `NOT_CONNECTED`| **PLANNED INTEGRATION** | Future industrial automotive consumer. |
| **Governance Control Plane**| Active Security Policies & Rules | `GET /api/v1/governance/policies` | Governance Service | `IMPLEMENTED` | `ACTIVE` | **LIVE GOVERNANCE** | Risk-tiered rules with human oversight triggers. |

---

## 3. Hardening Guidelines & Rules of Engagement

1. **No Fake Connections**: Never show `CONNECTED` or `ONLINE` for external cloud services unless verified live.
2. **Clear Source Badges**: Display authoritative source badges across all platform surfaces.
3. **Preservation of DOM Security**: Zero innerHTML, outerHTML, eval, or document.write across the web console.
