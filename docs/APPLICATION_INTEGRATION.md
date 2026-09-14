# External Application Integration Foundation — AI Operating Platform

## 1. Architectural Principles & Boundary Separation

The **AI Operating Platform** strictly adheres to the fundamental principle:

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS}$$

External applications are independent consumer systems that utilize the AI Operating Platform exclusively via the public **Platform API** (`/api/v1/*`) or the official TypeScript/JavaScript SDK (`@ai-platform/client`).

```
┌──────────────────────────────────────────────────────────────────┐
│                      EXTERNAL APPLICATIONS                       │
│  ┌──────────────────────┐             ┌──────────────────────┐   │
│  │ Tentaciones Commerce │ (PLANNED)   │ Vehicle Parts Adapter│   │
│  └──────────┬───────────┘             └──────────┬───────────┘   │
└─────────────┼────────────────────────────────────┼───────────────┘
              │ (HTTP REST / JSON)                 │
              ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                      PLATFORM PRODUCT / API                      │
│  • Public REST Endpoints: /api/v1/{tasks, orchestrate, ...}       │
│  • Authentication (API Key / Bearer) & Application Context       │
│  • Capability Authorization (Default-Deny Scopes)                │
│  • Tenant Isolation & Trace ID Propagation                       │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                           CORE ENGINE                            │
│  • Task State Machine, Agent Runtime, Dynamic Tool Registry       │
│  • Durable SQLite WAL Event Store & Real-time Audit Trail        │
└──────────────────────────────────────────────────────────────────┘
```

### Core Invariants

1. **Zero Direct Imports**:
   External applications MUST NOT import domain models, engine internals, or repository layers directly. All interaction happens across the network boundary via standard HTTP/JSON or SDK abstractions.
2. **Dedicated Application Identity**:
   External applications authenticate using standard platform credentials (`API Key` or `Bearer Token`) associated with a `SERVICE` principal identity, carrying explicit tenant metadata and bounded capabilities.
3. **Default-Deny Capability Scopes**:
   Each registered application has an explicit set of `allowedCapabilities` (e.g., `tasks.create`, `tasks.read`, `orchestrate`). Any attempt to invoke an endpoint or action outside these scopes is immediately rejected fail-closed (`HTTP 403 Forbidden`).
4. **Tenant Isolation**:
   External application requests operate under enforced tenant scoping (`callerTenantId`). Requests cannot read, modify, or cancel tasks belonging to different tenants.
5. **Observability & Traceability**:
   Every external request propagates an end-to-end `traceId` and receives a unique `X-Request-Id` response header. All actions are immutably logged to the platform audit ledger.

---

## 2. External Application Registry & Entity Model

The `ExternalApplication` domain entity defines the configuration, capability boundaries, and lifecycle status for integrated consumer systems.

### Status Taxonomy

- **Implementation Status**:
  - `IMPLEMENTED`: Full application client integration exists.
  - `PARTIAL`: In progress or staged in development environment.
  - `DESIGNED` / `PLANNED`: Architecturally specified and verified via contract test doubles.
- **Runtime Status**:
  - `HEALTHY` / `ONLINE`: Actively communicating with the platform.
  - `DEGRADED`: Operating with limited capabilities or retries.
  - `OFFLINE`: Unreachable or paused.
  - `NOT_CONNECTED`: Registered external consumer that is not currently running a live connection.

### Seeded Applications in Foundation

1. **Tentaciones AI Commerce** (`tentaciones-commerce`):
   - **Role**: `External Consumer`
   - **Implementation Status**: `DESIGNED`
   - **Runtime Status**: `NOT_CONNECTED`
   - **Capabilities**: `tasks.create`, `tasks.read`, `tasks.cancel`, `orchestrate`, `agents.read`, `tools.read`, `models.read`
   - **Authentication Mode**: `API_KEY`
2. **Vehicle Parts Diagnostics Platform** (`vehicle-parts-platform`):
   - **Role**: `External Consumer`
   - **Implementation Status**: `PLANNED`
   - **Runtime Status**: `NOT_CONNECTED`
   - **Capabilities**: `tasks.create`, `tasks.read`, `orchestrate`
   - **Authentication Mode**: `API_KEY`
3. **Enterprise Support & Knowledge Assistant** (`enterprise-support-agent`):
   - **Role**: `External Consumer`
   - **Implementation Status**: `PLANNED`
   - **Runtime Status**: `NOT_CONNECTED`
   - **Capabilities**: `tasks.create`, `tasks.read`
   - **Authentication Mode**: `BEARER_TOKEN`

---

## 3. Platform API Integration Endpoints

External applications interact with the platform through the following authenticated endpoints:

| Endpoint | Method | Required Scope / Capability | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/applications` | `GET` | Public / Read | List registered external applications and their integration specs. |
| `/api/v1/applications/:id` | `GET` | Public / Read | Retrieve detailed metadata for a registered application. |
| `/api/v1/tasks` | `POST` | `tasks.create` | Asynchronously submit a new agent task with tenant & trace metadata. |
| `/api/v1/tasks/:id` | `GET` | `tasks.read` | Retrieve task status and execution outcome with tenant isolation. |
| `/api/v1/tasks/:id/cancel` | `POST` | `tasks.cancel` | Cancel an ongoing task with an optional reason. |
| `/api/v1/tasks/:id/events` | `GET` | `events.read` | Inspect correlated lifecycle events for a task. |
| `/api/v1/orchestrate` | `POST` | `orchestrate` | Execute deterministic multi-operation pipelines (Model + Tool DAG). |
| `/api/v1/health` | `GET` | `health.check` | Check platform engine availability and durable persistence state. |

---

## 4. Client SDK Usage Example

External applications consume the platform via `@ai-platform/client` or typed HTTP requests:

```typescript
import { createPlatformClient } from "@ai-platform/client";

const client = createPlatformClient({
  baseUrl: "http://127.0.0.1:3000",
  apiKey: "platform-secret-key-tentaciones",
  defaultHeaders: {
    "X-Tenant-ID": "tenant-tentaciones",
  },
});

// 1. Check Platform Health
const health = await client.health();
console.log("Platform Health:", health.status);

// 2. Dispatch Task
const task = await client.tasks.create({
  agentId: "agent-shopping-assistant",
  input: {
    query: "Find running sneakers with high cushioning under $120",
    customerId: "cust-98124",
  },
  traceId: "trace-tentaciones-001",
});

// 3. Multi-Operation Orchestration Pipeline
const result = await client.orchestrate({
  operations: [
    {
      kind: "TOOL",
      id: "calc-discounts",
      toolId: "calculator",
      input: { left: 120, right: 15 },
    },
    {
      kind: "MODEL",
      id: "gen-summary",
      model: "stub-model",
      input: { prompt: "Generate order confirmation invoice" },
      bindings: [
        { targetKey: "finalPrice", operationId: "calc-discounts", sourceKey: "value" }
      ],
    }
  ],
  traceId: "trace-tentaciones-cart-99",
});
```

---

## 5. Security & Verification Checklist

- [x] Application entity and registry implemented with immutable domain validation.
- [x] Application request context correctly derives caller identity, tenant, and allowed capabilities.
- [x] Default-deny capability scope checks enforced fail-closed.
- [x] Dedicated application endpoints exposed via `GET /api/v1/applications` and `GET /api/v1/applications/:id`.
- [x] PlatformClient updated with typed application discovery and orchestration methods.
- [x] Web Console updated with dynamic application loading from Platform API.
- [x] Tentaciones correctly classified as `DESIGNED` / `NOT_CONNECTED` awaiting Phase 18 runtime activation.
