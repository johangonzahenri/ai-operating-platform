# AI OPERATING PLATFORM

> **Governed multi-agent orchestration platform for real external AI applications.**
>
> *Orchestration · Agents · Model Routing · Tools · Security · Memory · Durable Execution · Observability · Platform API*

---

## Project Overview

The **AI Operating Platform** is an enterprise-inspired software system designed to govern, orchestrate, and observe multi-agent AI execution across external applications.

### Fundamental Invariant
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

- **Core Engine:** Owns task lifecycles, planning, model routing, tool dispatching, and security policy enforcement.
- **Platform API & Web Console:** Exposes typed contracts, REST endpoints (`/api/v1/*`), SDK clients, and operational inspection surfaces.
- **External Applications:** Independent consumer applications (e.g., *Tentaciones AI Commerce*) that retain complete domain ownership of catalog, pricing, and cart state, consuming the platform exclusively via authenticated APIs.

---

## Verified Project Metrics

| Metric | Verified Value | Source of Truth |
| :--- | :--- | :--- |
| **Automated Tests** | **848 passing** | Node.js native test runner (`npm test`) |
| **Test Failures** | **0** | Continuous test verification |
| **Regressions** | **0** | Full test suite verification |
| **Build Status** | **PASS** | Official TypeScript compiler (`tsc`) |
| **Platform API Endpoints** | **22+ canonical routes** | HTTP Router (`/api/v1/*`, `/api/platform/v1/*`) |
| **Security & Governance** | **Default-Deny + RBAC + Risk Tiering + Tenant Isolation** | `SecurityContext` & `EnterpriseGovernanceService` |
| **Persistence Engine** | **SQLite WAL Mode (V3 Schema)** | `SqliteEventStore` & `SqliteTaskRepository` |
| **Resilience & Scalability** | **Worker Queues + Rate Limiting + Circuit Breaker** | `InMemoryWorkerQueue` & `RetryPolicy` |
| **External Consumer** | **Tentaciones AI Commerce** | `TentacionesPlatformAdapter` |
| **AR Fitting Room Governance** | **URNs + SemVer + 3 Avatars + Size Engine** | `ar-fitting-room.ts` |
| **DOM Purity** | **0 `innerHTML` / 0 `eval`** | Web Console (`src/platform/web/`) |

---

## Key Capabilities

1. **Governed Multi-Agent Runtime:** Task decomposition, step planning, and tool execution under strict execution budgets (`maxSteps`, `maxDurationMs`, `maxToolCalls`).
2. **Enterprise Governance & Control Plane:** 4-tier risk classification (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), human-in-the-loop oversight rules, application onboarding/offboarding lifecycle, and immutable policy versioning.
3. **Scalability & Resilience Engine:** Bounded worker queue with heartbeat leases, exponential retry policy with full jitter, sliding window rate limiters, backpressure controls, and circuit breakers.
4. **Hardened Production Architecture:** Multi-stage Docker containerization, structured JSON logging with automatic secret scrubbing, differentiated health probes (`/health/liveness`, `/health/readiness`), and deterministic graceful shutdown (`SIGTERM`/`SIGINT`).
5. **Provider-Neutral Model Routing:** Decoupled gateways supporting Stub, OpenAI, Anthropic, and Ollama providers without domain coupling.
6. **Default-Deny Tool Layer:** Strict JSON schema validation, risk classification, approval gates, and cancellation tokens.
7. **Durable SQLite WAL Event Store:** Append-only sequence numbers and deterministic `traceId` correlation across all operations.
8. **Typed Platform API & SDK:** Versioned REST endpoints with typed SDK client (`@ai-platform/client`).
9. **Operational Web Console:** Live dashboard, execution inspector, system blueprint, truth badges, enterprise showcase mode, and governance control plane.
10. **AI Commerce & AR Virtual Fitting:** Real-world demonstration with Tentaciones AI Commerce (catalog discovery, recommendations, product comparison, cart assistance, and 3D virtual fitting room sizing).

---

## Quick Start & Reproducibility

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Installation & Verification
```bash
# 1. Clone the repository
git clone https://github.com/johangonzahenri/ai-operating-platform.git
cd ai-operating-platform

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run build

# 4. Execute all automated tests
npm test

# 5. Run full verification (build + tests)
npm run check
```

### Starting the Platform Server
```bash
npm start
```
The server starts at `http://127.0.0.1:3000`:
- **Web Console & Showcase:** `http://127.0.0.1:3000/`
- **Platform Health Endpoint:** `http://127.0.0.1:3000/api/v1/health`
- **Applications Registry:** `http://127.0.0.1:3000/api/v1/applications`

---

## Platform Architecture

```mermaid
graph TD
    subgraph External Applications
        Tentaciones[Tentaciones AI Commerce]
        Diagnostics[Vehicle Diagnostics - Planned]
        Support[Support Assistant - Planned]
    end

    subgraph Platform Layer
        API[Platform API v1 / REST]
        Console[Operational Web Console]
        ClientSDK[@ai-platform/client]
    end

    subgraph Core Engine
        Runtime[CoreRuntime & Orchestrator]
        Planner[LLM Planner]
        Gateway[Model Gateway]
        Tools[Tool Registry & Dispatcher]
        Policy[Security & Policy Gateway]
    end

    subgraph Persistence & Durability
        EventStore[(SQLite WAL Event Store)]
        TaskRepo[(SQLite Task Repository)]
    end

    Tentaciones -->|API Key + Tenant ID| API
    Console --> API
    API --> Runtime
    Runtime --> Planner
    Runtime --> Gateway
    Runtime --> Tools
    Runtime --> Policy
    Runtime --> EventStore
    Runtime --> TaskRepo
```

---

## Truth Model & Known Limitations

The project adheres to a strict **Truth-First** policy:
- **Stub Model Gateway:** Development environment uses deterministic `StubModelGateway` for fast, reproducible tests without external API dependencies. Remote provider integrations are designed.
- **In-Memory Registries:** Application registry and API key repositories operate in-memory during local development; tasks and event streams are durably persisted in SQLite WAL mode.
- **Synthetic Catalog:** Tentaciones uses verified synthetic product data to validate integration contracts without coupling to proprietary e-commerce databases.

---

## Documentation

- [Official Platform Manual](docs/MANUAL_OFICIAL.md)
- [Architectural Decision Records (ADRs)](docs/decisions/)
- [Freelancer Project Portfolio Package](docs/PORTFOLIO_FREELANCER.md)
- [Tentaciones AI Commerce Case Study](docs/case-study-tentaciones.md)
- [Platform Truth Matrix](docs/PLATFORM_TRUTH_MATRIX.md)
- [Documentation Index](docs/README.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Developer Guide](DEVELOPMENT.md)
- [Security Policy](SECURITY.md)

---

## License
MIT License.
