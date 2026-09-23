# Strategic Product Vision (v1.4.0)

## 1. What is the AI Operating Platform?

The **AI Operating Platform** is fundamental operating infrastructure for running, orchestrating, persisting, governing, observing, and exposing artificial intelligence capabilities across enterprise systems. It is an **engineering platform**, not a chatbot, a prompt playground, or a simple LLM provider wrapper.

```text
★ AI OPERATING PLATFORM (Plataforma Estrella) ★
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
[ Core Engine & Runtime ]       [ Platform Product ]
  • Task & Execution Lifecycles   • REST Platform API v1
  • Multi-Model Gateways          • PlatformClient SDK (TS)
  • Secure Tool Registry          • Web Control Plane SPA
  • Autonomous Operations Loop    • Application Factory 2.0
  • SQLite WAL Persistence        • JWT / RBAC Authentication
  • Crash Recovery Daemon         • Real-time Telemetry / SSE
       │                                 │
       └────────────────┬────────────────┘
                        ▼
       [ Satellite Applications Ecosystem ]
         • 01. Tentaciones AI Commerce (PROJ-01-TENTACIONES)
         • 02. Spare Parts Store (PROJ-02-PARTS)
         • 03. Fleet Management (PROJ-03-FLEET)
         • 04. Customer Portal (PROJ-04-PORTAL)
         • 05. Analytics AI (PROJ-05-ANALYTICS)
```

---

## 2. Core Architectural Tenets

1. **Strict Hexagonal Separation:** The domain core imports zero infrastructure dependencies, zero vendor SDKs, and zero database drivers. All external capabilities are consumed via typed domain ports.
2. **Provider Independence:** Interchangeable adapters for OpenAI, Anthropic, Google Gemini, and local Ollama daemons, backed by a deterministic fallback router (`StubModelGateway`).
3. **Fail-Closed Governance (*Default-Deny*):** Every tool invocation and model call requires explicit positive authorization; violations halt execution before resource consumption.
4. **Durable Relational Persistence & Crash Recovery:** Atomic SQLite Write-Ahead Logging (`node:sqlite`), optimistic concurrency control (`version`), immutable aggregate rehydration (`Object.freeze`), and automated startup reconciliation via `RestartRecoveryService`.
5. **Decoupled Application Topology (Architecture A):** Independent business applications (such as *Tentaciones AI Commerce*) live in their own standalone repositories and consume platform intelligence strictly via authenticated HTTP/SSE contracts and the `PlatformClient` SDK.
6. **Multi-Enterprise Governance & Virtual Organizations:** Hierarchical organizations, functional areas, dedicated teams, resource budget quotas (tokens, duration, tool calls, steps), and DAG workflow orchestration with segregation of duties (Executor $\neq$ Verifier $\neq$ Approver).
