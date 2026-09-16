# Operational Console Manual & Architecture

The **Operational Console** provides enterprise operators, platform engineers, and developers with real-time operational observability, interactive task execution, diagnostic probing, and policy governance across the **AI Operating Platform**.

---

## 1. Access & Interaction

- **URL**: `http://127.0.0.1:3000/`
- **Protocol**: HTTP/1.1 REST over Platform API v1 (`/api/v1/*` and `/api/platform/v1/*`)
- **Rendering Model**: Zero-dependency vanilla ES6 modules with strict DOM API manipulation (`document.createElement`, `textContent`).

---

## 2. Interactive Operational Workflows

### A. Real-Time Task Execution
1. Navigate to **Platform Operations** or **Tasks**.
2. Provide an operational objective (e.g. *"Quiero unas zapatillas negras para correr"*).
3. Click **Execute Task**. The console invokes `POST /api/platform/v1/tasks` and `POST /api/platform/v1/tasks/:id/execute`.
4. Observe the live execution lifecycle:
   - Status transitions: `CREATED` $\rightarrow$ `RUNNING` $\rightarrow$ `COMPLETED`
   - Model requests and completion tokens
   - Tool calls and policy evaluations
   - Correlated trace timeline with monotonic sequence events.

### B. Durable Event Stream Inspection
1. Navigate to **Events** (`#tab-events`).
2. Filter events by `eventType` (e.g. `task.completed`, `model.tool.executed`) or `traceId`.
3. Click **Inspect Payload** to view the full redacted JSON payload in the interactive payload inspector.

### C. System Diagnostics Center
1. Navigate to **Diagnostics** (`#tab-diagnostics`).
2. Click **Run Diagnostics Probe**.
3. Inspect probe results across:
   - **Platform API Connectivity**
   - **SQLite WAL Persistence Engine**
   - **Durable Event Store & Sequencer**
   - **Model Gateway & Router**
   - **Tool Execution Layer & Contracts**
   - **Security Boundaries & Default Deny**
   - **Reconciliation & Crash Recovery**

### D. Application Ecosystem & Trust Management
1. Navigate to **Ecosystem** (`#tab-ecosystem`).
2. Filter by category (`Commerce`, `Automotive`, `Support`, `Analytics`).
3. Click **Manage & Trust Detail** to inspect the application's manifest, assigned tenant, telemetry metrics, and lifecycle actions (`Connect`, `Suspend`, `Retire`).

---

## 3. DOM & Memory Hygiene

The Operational Console is audited against injection and prototype pollution vulnerabilities:
- **0 `innerHTML` / `outerHTML` calls**
- **0 `eval()` or dynamic script execution**
- **0 Secret Leakage in telemetry views**
