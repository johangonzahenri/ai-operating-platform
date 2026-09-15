# AI OPERATING PLATFORM (v1.1.0)

> **Governed multi-agent orchestration platform for real external AI applications.**
>
> *Orchestration · Agents · Model Routing · Tools · Security · Memory · Durable Execution · Observability · Platform API · SaaS Control Plane · AI Application Factory*

---

## 1. What is this?

The **AI Operating Platform** is an enterprise-grade software foundation engineered to govern, orchestrate, persist, and observe autonomous multi-agent AI systems executing tasks for external business applications.

### Fundamental Architectural Invariant
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{EXTERNAL SERVICES}$$

- **Core Engine:** Owns task lifecycles, autonomous loops (FSM), deterministic planning, model routing, tool dispatching, and fail-closed security enforcement with **zero external runtime npm dependencies**.
- **Platform Layer & SaaS Control Plane:** Exposes typed REST endpoints (`/api/v1/*`), client SDK (`@ai-platform/client`), multi-tenant quota meters, capability catalogues, and operational telemetry.
- **AI Application Factory:** Standardized application manifest contract (`application.json`), capability gating, and identity isolation.
- **External Consumer Applications:** Independent applications (such as *Tentaciones AI Commerce*) that retain complete domain ownership of their catalog, inventory, and cart state, consuming platform capabilities strictly via authenticated APIs.

---

## 2. Why does it matter?

1. **Eliminates Vendor Lock-In & Domain Entanglement:** AI prompts and provider SDKs never invade domain models or shopping cart state machines.
2. **Defeats Model Hallucinations:** Strict validation contracts guarantee AI discovery and recommendations only surface authentic catalog entities.
3. **Enterprise Defense-in-Depth:** Default-Deny RBAC, prompt injection filters, prototype pollution guards, and multi-tenant isolation.
4. **Crash Resilient Durability:** Every state mutation and domain observation is written to an append-only SQLite WAL ledger with automatic restart recovery.
5. **Truth-First Engineering:** Honest dual-state reporting across all 10 external integrations (OpenAI, Anthropic, Ollama, PostgreSQL, Docker, OpenTelemetry, n8n, AR Provider, WebXR, Cloud).

---

## 3. Architecture Overview

```mermaid
graph TD
    subgraph External Applications Layer
        Tentaciones[Tentaciones AI Commerce]
        AutoDiagnostics[Industrial Automotive - Planned]
        EnterpriseSupport[Enterprise Support - Planned]
    end

    subgraph SaaS Platform & API Layer
        PlatformAPI[Platform REST API v1]
        ControlPlane[SaaS Control Plane & Quotas]
        AppFactory[AI Application Factory]
        WebConsole[Operational Web Console]
        SDK[@ai-platform/client SDK]
    end

    subgraph Core Engine Layer
        Orchestrator[AutonomousOrchestrator]
        Planner[LLM & Deterministic Planner]
        ModelRouter[GovernedModelRouter]
        ToolRegistry[Dynamic Tool Registry & Security]
        PolicyGateway[Default-Deny RBAC & Autonomy Budget]
    end

    subgraph Persistence & Durability Layer
        EventStore[(SQLite WAL Event Store v3)]
        TaskRepo[(SQLite Task Repository)]
        PostgresRepo[(PostgreSQL Adapter)]
    end

    subgraph External Providers Layer
        OpenAI[OpenAI API]
        Anthropic[Anthropic API]
        Ollama[Ollama Local 127.0.0.1:11434]
        OTel[OpenTelemetry Collector]
        n8n[n8n Webhook Engine]
    end

    Tentaciones -->|API Key + Tenant ID| PlatformAPI
    WebConsole --> PlatformAPI
    PlatformAPI --> Orchestrator
    Orchestrator --> PolicyGateway
    Orchestrator --> Planner
    Orchestrator --> ModelRouter
    Orchestrator --> ToolRegistry
    Orchestrator --> EventStore
    Orchestrator --> TaskRepo
    ModelRouter --> OpenAI
    ModelRouter --> Anthropic
    ModelRouter --> Ollama
    EventStore -.-> OTel
```

---

## 4. Demonstration Modes

The platform supports three reproducible execution modes (*Truth Mode*):

| Mode | LLM Ingestion | AR / 3D | Persistence | Network | Target Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`DEMO MODE`** | `StubModelGateway` | `Local AR Engine` | SQLite WAL / Memory | Fully Offline | Portfolio review, offline testing |
| **`LOCAL MODE`** | Ollama (`127.0.0.1:11434`) | `Local AR Engine` | SQLite WAL | Localhost | Private local LLMs (Llama 3.2, Mistral) |
| **`LIVE MODE`** | OpenAI / Anthropic API | Remote / Local AR | SQLite WAL / PostgreSQL | HTTPS Cloud | Production deployments |

---

## 5. Reference Application: Tentaciones AI Commerce

Tentaciones demonstrates a production-grade external consumer integration:
* **Rich Catalog:** Footwear (Pro Carbon Racer, Trail Blazer GTX), Apparel (StormShield Jacket, Silk Evening Dress), Accessories (Merino Socks) with sizes, SKUs, and real stock counts.
* **AI Product Discovery:** Natural language search in Spanish (*"zapatillas negras para correr"*, *"vestido elegante para una cena"*).
* **3D / AR Virtual Fitting Room:** Asset URN validation (`urn:tentaciones:ar:...`), anthropometric avatar sizing (*Nova*, *Sora*, *Mateo*), and 3D preview links.
* **AI Cart Assistance & Stock Integrity:** Evaluates cart questions (*"¿Cuánto me falta para despacho gratis?"*), checks stock before mutation, and completes checkout via Webpay Demo.

---

## 6. Security & Governance Standards

* **Default-Deny Access Control:** Unauthenticated calls fail closed (HTTP 401). Unscoped operations fail closed (HTTP 403).
* **Multi-Tenant Boundary:** Strict tenant isolation (`tenant-tentaciones`, `tenant-automotive`, `tenant-support`) preventing cross-tenant access.
* **Autonomy Budget Governance:** Upper bounds on `maxSteps`, `maxDurationMs`, and `maxToolCalls`.
* **Zero DOM Insecurities:** `0 innerHTML`, `0 outerHTML`, `0 eval`, `0 document.write` across all frontend scripts.
* **Zero Secret Leakage:** Authorization headers, payment keys, and API tokens are sanitized before logging or event persistence.

---

## 7. AI Model Gateway & Governed Routing

The `GovernedModelRouter` applies prompt injection detection, input length bounds, and dynamic fallback chains:
$$\text{Primary Gateway (OpenAI/Anthropic)} \longrightarrow \text{Local Inference (Ollama)} \longrightarrow \text{Deterministic Stub}$$
*All security violations fail closed immediately without fallback.*

---

## 8. AR & Virtual Try-On Capabilities

* **URN Asset Registry:** Validates `urn:<app>:ar:<category>:<slug>` with SemVer compatibility.
* **Biometric Sizing Engine:** Converts foot length (cm) and chest measurements into recommended apparel/footwear sizes with explainability.
* **WebXR Client Sensor Probe:** Detects browser WebXR capabilities and camera permissions.

---

## 9. Automation & Scheduling

* **Webhook Dispatcher:** Cryptographically signed payloads (HMAC-SHA256) with exponential backoff and jitter.
* **Scheduler Engine:** Standard 5-field cron expression parser for periodic autonomous execution.
* **n8n Community Connector:** Standardized trigger and action node manifests.

---

## 10. SaaS Control Plane

* **Tenant Plan Limits:** Tiered limits for `FREE`, `PRO`, `BUSINESS`, and `ENTERPRISE`.
* **Quota Metering:** Real-time monthly tracking of tasks, executions, tokens, and storage with `QuotaExceededError` enforcement.
* **Live Telemetry:** Global usage dashboards querying durable ledger events.

---

## 11. Deployment & Production Operations

* **Docker Multi-Stage Build:** Hardened container using `node:20-alpine` with non-root user execution (`nodejs:10001`).
* **PostgreSQL Persistence Adapter:** Portable relational schema with atomic transaction rollback support.
* **Health Probes:** Kubernetes-ready `/api/v1/health/liveness` and `/api/v1/health/readiness`.
* **Graceful Shutdown:** Deterministic teardown on `SIGTERM` and `SIGINT` completing active transactions before exit.

---

## 12. Quick Start & Reproducibility

```text
Suite: 911 passing tests | 0 failing | 0 regressions
Quality Gate: npm run check (TypeScript build + test suite) PASS
```

### Running Tests Locally
```bash
# Clone repository
git clone https://github.com/johangonzahenri/ai-operating-platform.git
cd ai-operating-platform

# Install dependencies (zero runtime core dependencies)
npm install

# Run TypeScript build and complete test suite
npm run check

# Start Platform Server & Web Console
npm start
```
Console is accessible at `http://127.0.0.1:3000`.

---

## 13. Known Limitations

1. **Token Accounting:** Exact token metrics require live LLM tokenizers; local runs report honest `"NOT_AVAILABLE"`.
2. **Disk Storage Metering:** Storage usage is calculated via tenant quota allocations.

---

## 14. Roadmap

- [x] Hexagonal Core Engine & Ports/Adapters
- [x] SQLite WAL v3 Durable Event Store & Crash Recovery
- [x] Governed Model Router with Dynamic Fallback
- [x] Default-Deny RBAC & Tenant Isolation
- [x] SaaS Control Plane & Multi-Tenant Quotas
- [x] AI Application Factory & Manifest Validator
- [x] Tentaciones AI Commerce Reference Application
- [x] 3D / AR Virtual Fitting Room & Sizing Engine
- [x] Integration Truth Engine (10 Providers)
- [ ] Real-time Multi-Agent Collaborative Swarms
- [ ] Direct WebGPU Local In-Browser Model Inference

---

## 15. Documentation Index

- [Official Platform Manual](docs/MANUAL_OFICIAL.md)
- [Public Demo Guide](docs/PUBLIC_DEMO_GUIDE.md)
- [Portfolio Release Summary](docs/PORTFOLIO_RELEASE.md)
- [Technical Architecture Overview](docs/TECHNICAL_OVERVIEW.md)
- [Interview & Demo Scripts](docs/DEMO_SCRIPT.md)
- [Freelancer Portfolio Overview](docs/PORTFOLIO_FREELANCER.md)
- [Tentaciones AI Commerce Case Study](docs/case-study-tentaciones.md)
- [Platform Truth Matrix](docs/PLATFORM_TRUTH_MATRIX.md)
- [Security Policy](SECURITY.md)

---

## License
MIT License.
