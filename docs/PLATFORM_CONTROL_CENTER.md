# Platform Control Center & Visual Blueprint

## 1. Overview

The **Platform Control Center** is the unified administrative and operational visual console of the **AI Operating Platform**. Built in Phase 16 (Prompts 56–60), it provides real-time telemetry, model gateway inspection, external application catalog management, and interactive architectural blueprint visualization.

---

## 2. Core Surfaces & Truth Taxonomy

All views in the Platform Control Center adhere to the strict **Architectural Truth Model**:
- **Implementation Status**: `IMPLEMENTED`, `PARTIAL`, `DESIGNED`, `PLANNED`
- **Runtime Status**: `HEALTHY`, `AVAILABLE`, `ENFORCED`, `WAL_ACTIVE`, `OPERATIONAL`, `NOT_CONNECTED`, `PLANNED`
- **Source of Truth**: `Platform API`, `SQLite WAL`, `Model Gateway`, `Tool Registry`, `External Application Contract`, `Architectural Specification`

### 2.1 Operational Dashboard (`/platform-operations`, `/dashboard`)
- Real-time engine health, uptime, and SQLite WAL metrics directly queried from `/api/v1/health` and `/api/v1/status`.
- Correlated durable event streams with monotonic sequence numbers.
- Live execution launcher with tool call timeline and budget consumption gauges.
- Crash recovery diagnostics ledger.

### 2.2 First-Class Agent Management (`/agents`, `/agents/:id`)
- Registration, activation, deactivation, and declarative prompt management via `GET /api/v1/agents` and `POST /api/v1/agents`.
- **Hierarchical Capability Tree**: Visualizes the deterministic hierarchy of an agent:
  $$\text{Agent} \longrightarrow \text{Model Gateway} \longrightarrow \text{Authorized Tools} \longrightarrow \text{Memory Partition} \longrightarrow \text{Policy Guardrail}$$
- Tool authorization matrix cross-referencing all platform capabilities against agent whitelists.
- Recent tasks history and direct execution dispatch modal.

### 2.3 Provider Models Console (`/models`, `/models/:id`)
- Catalog of all registered Model Gateways (`stub-model`, etc.) retrieved dynamically from `GET /api/v1/models`.
- Filtering by provider and status.
- Table view and interactive card grid.
- Model detail inspector showing latency tier, context window, capabilities, and list of all assigned agents (`agent.model === id`).

### 2.4 Dynamic Tools Console (`/tools`, `/tools/:id`)
- Registered capabilities with JSON schema input/output parameters from `GET /api/v1/tools`.
- Filtering by risk level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and execution mode (`READ_ONLY`, `IDEMPOTENT`, `SIDE_EFFECTING`, `DESTRUCTIVE`).
- Human approval gate indicators and fail-closed audit logs.

### 2.5 External Applications Console (`/applications`, `/applications/:id`)
- External consumer hub documenting integration contracts (zero internal engine domain coupling).
- **Tentaciones AI Commerce** (`DESIGNED` · `NOT_CONNECTED`): External consumer designed to consume public Platform API (`POST /api/v1/orchestrate`, `POST /api/v1/tasks`).
- **Vehicle Parts Platform** (`DESIGNED` · `PLANNED`): Automotive diagnostics and warehouse stock allocation.
- **Enterprise Support Assistant** (`DESIGNED` · `PLANNED`): Tier-1 automated support and policy-governed triage.
- Interactive simulation runner explicitly labeled as **Orchestration Contract Test (Simulation via Platform API)**.

### 2.6 Interactive Architecture Blueprint (`/blueprints`)
- 5 Canonical Tiers with clickable, keyboard-navigable interactive nodes (`data-nav-target`).
- Platform Subsystems Architectural & Operational Truth Matrix Table.
- Full-resolution infographic switcher for official system engineering diagrams.

---

## 3. Strict Architectural Compliance

1. **Isolation Invariant**:
   The web platform runs purely as a client against the HTTP REST API. It never imports internal domain classes, database drivers, or execution runtimes directly ($\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$).
2. **DOM Security Standards**:
   All UI elements are constructed using strictly typed DOM methods (`document.createElement`, `textContent`, `appendChild`).
   There are strictly **zero** instances of `innerHTML`, `outerHTML`, `eval()`, or `document.write()`.
3. **Fail-Closed Governance**:
   Every model inference, tool execution, and task dispatch carries a correlation `traceId` and is verified under strict autonomy budgets.
