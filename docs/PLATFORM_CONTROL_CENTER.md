# Platform Control Center & Visual Blueprint

## 1. Overview

The **Platform Control Center** is the unified administrative and operational visual console of the **AI Operating Platform**. Built in Phase 16 (Prompts 56–59), it provides real-time telemetry, model gateway inspection, external application catalog management, and interactive architectural blueprint visualization.

---

## 2. Core Surfaces

### 2.1 Operational Dashboard (`/platform-operations`, `/dashboard`)
- Real-time engine health, uptime, and SQLite WAL metrics.
- Correlated durable event streams with monotonic sequence numbers.
- Live execution launcher with tool call timeline and budget consumption gauges.
- Crash recovery diagnostics ledger.

### 2.2 First-Class Agent Management (`/agents`, `/agents/:id`)
- Registration, activation, deactivation, and declarative prompt management.
- **Hierarchical Capability Tree**: Visualizes the deterministic hierarchy of an agent:
  $$\text{Agent} \longrightarrow \text{Model Gateway} \longrightarrow \text{Authorized Tools} \longrightarrow \text{Memory Partition} \longrightarrow \text{Policy Guardrail}$$
- Tool authorization matrix cross-referencing all platform capabilities against agent whitelists.
- Recent tasks history and direct execution dispatch modal.

### 2.3 Provider Models Console (`/models`, `/models/:id`)
- Catalog of all registered Model Gateways (`stub-model`, `gemini-1.5-pro`, `anthropic`, `openai`).
- Filtering by provider and status.
- Table view and interactive card grid.
- Model detail inspector showing latency tier, context window, capabilities, and list of all assigned agents (`agent.model === id`).

### 2.4 Dynamic Tools Console (`/tools`, `/tools/:id`)
- Registered capabilities with JSON schema input/output parameters.
- Filtering by risk level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and execution mode (`READ_ONLY`, `READ_WRITE`, `NETWORK`, `SYSTEM`).
- Human approval gate indicators and fail-closed audit logs.

### 2.5 External Applications Console (`/applications`, `/applications/:id`)
- External consumer hub documenting integration contracts.
- **Tentaciones AI Commerce** (`CONNECTED`): E-Commerce fashion, cart orchestrator, virtual fitting room.
- **Vehicle Parts Platform** (`PLANNED`): Automotive diagnostics and warehouse stock allocation.
- **Enterprise Support Assistant** (`PLANNED`): Tier-1 automated support and policy-governed triage.
- Interactive simulation runner demonstrating zero-coupling REST API orchestration.

### 2.6 Interactive Architecture Blueprint (`/blueprints`)
- 7 Canonical Tiers with clickable, keyboard-navigable interactive nodes (`data-nav-target`).
- Platform Subsystems Operational Build Status Table.
- Full-resolution infographic switcher for official system engineering diagrams.

---

## 3. Strict Architectural Compliance

1. **Isolation Invariant**:
   The web platform runs purely as a client against the HTTP REST API. It never imports internal domain classes, database drivers, or execution runtimes directly.
2. **DOM Security Standards**:
   All UI elements are constructed using strictly typed DOM methods (`document.createElement`, `textContent`, `appendChild`).
   There are strictly **zero** instances of `innerHTML`, `outerHTML`, `eval()`, or `document.write()`.
3. **Fail-Closed Governance**:
   Every model inference, tool execution, and task dispatch carries a correlation `traceId` and is verified under strict autonomy budgets.
