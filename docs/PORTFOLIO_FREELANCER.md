# Freelancer Project Portfolio &mdash; AI Operating Platform (v1.1.0)

## Project Summary
- **Title:** AI Operating Platform &mdash; Governed Multi-Agent AI Orchestration Engine & SaaS Control Plane
- **Role:** Lead AI Systems Architect & Full-Stack Core Engineer
- **Type:** Production-Grade AI Engineering & Enterprise Architecture Portfolio
- **Key Technologies:** TypeScript, Node.js (zero runtime npm dependencies in core), Hexagonal Architecture, SQLite WAL v3, PostgreSQL Adapter, Docker, REST API v1, Multi-Agent Systems, Governed LLM Routing, AR/3D Sizing Engine, OpenTelemetry, RBAC Security.

---

## Business Problem Statement
Modern enterprise applications integrating Large Language Models and AI agents face critical architectural risks:
1. **Tight Coupling & Vendor Lock-In:** Proprietary LLM APIs and prompt chains entangle core business logic.
2. **Hallucination & Reliability Risks:** Models invent non-existent products, incorrect pricing, or unvetted tool arguments.
3. **Security, Auth & Compliance Gaps:** Inadequate tenant isolation, unvetted code/tool execution, and missing audit trails.
4. **Fragile State Management:** Loss of autonomous execution context during server restarts or transient network failures.

---

## The Solution
An enterprise-grade **AI Operating Platform (v1.1.0)** built on the strict architectural invariant:
$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{EXTERNAL SERVICES}$$

- **Hexagonal Architecture:** Domain core is strictly decoupled from transport protocols, database engines, and concrete AI inference providers.
- **Default-Deny Policy Engine:** Model proposals are rigorously evaluated against registered schemas, caller tenant boundaries, and RBAC policies before tool execution.
- **Durable Event Store (SQLite WAL v3):** Append-only monotonic sequence numbering with causation trees and automatic crash recovery (`RestartRecoveryService`).
- **SaaS Control Plane & AI Application Factory:** Multi-tenant quota governance, application manifest validator (`application.json`), and capability grants.
- **Reference Application (Tentaciones AI Commerce):** Independent e-commerce store with natural language search, explainable recommendations, 3D/AR virtual try-on, size recommendation engine, and shopping cart assistance.
- **Runtime Integration Truth:** Live dual-state tracking across 10 core integrations (OpenAI, Anthropic, Ollama, PostgreSQL, Docker, OpenTelemetry, n8n, AR Provider, WebXR, Cloud).

---

## Technical Skills Demonstrated

| Skill Category | Technologies & Patterns Implemented |
| :--- | :--- |
| **Backend & Runtime** | Node.js native runtime, TypeScript strict mode, REST API design, HTTP router, zero runtime core dependencies. |
| **Software Architecture** | Hexagonal Architecture (Ports & Adapters), DDD, Event Sourcing, Append-Only Event Store, FSM State Machines. |
| **AI Orchestration** | Multi-agent DAGs, LLM Planner, Structured Output Parsing, Provider-Neutral Routing, Fallback chains. |
| **Security & Governance** | RBAC, Default-Deny, Multi-Tenant Isolation, API Key Authentication, DOM Purity (0 innerHTML, 0 eval). |
| **Data & Durability** | SQLite WAL mode, monotonic sequence numbering, PostgreSQL transactional adapter, state rehydration. |
| **Testing & Quality** | +890 automated unit, contract, and integration tests with 0 failures and strict type-checking. |
| **E-Commerce & 3D/AR** | Semantic discovery, explainable ranking, AR asset URN governance, deterministic sizing rules, Webpay demo. |

---

## Verified Results
- **+890 Passing Tests** with 0 failures and 0 regressions.
- **100% Deterministic Verification** across all core execution paths and security boundaries.
- **Complete End-to-End Traceability** from natural language prompt to durable audit log and Web Console telemetry.
