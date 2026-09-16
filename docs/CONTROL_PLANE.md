# Enterprise Control Plane & Operational Console

The **Enterprise Control Plane** is the central operational and governance interface of the **AI Operating Platform**, establishing a single pane of glass across runtimes, agents, execution graphs, durable event ledgers, security policies, multi-tenant isolation, and the application ecosystem.

---

## 1. Architectural Invariant

$$\text{CORE ENGINE} \neq \text{PLATFORM PRODUCT} \neq \text{APPLICATIONS} \neq \text{EXTERNAL SERVICES}$$

The Control Plane strictly respects this separation:
- **Zero Internal Imports**: Built purely via standard Web APIs (`fetch`, typed REST client), never importing Core Engine internals, domain entities, or filesystem paths directly.
- **Fail-Closed & Default-Deny**: Every operation, tool call, model invocation, and task execution must be explicitly permitted by security policies.
- **Truth Mode (Zero Fabrication)**: Telemetry and statuses represent genuine backend states. Missing or unconfigured components report `NOT_AVAILABLE` or `UNCONFIGURED` without mock masking.
- **Zero DOM Injection Surface**: Strict ban on `innerHTML`, `outerHTML`, `eval()`, and `document.write()`. All DOM rendering is constructed via programmatic DOM manipulation (`createElement`, `textContent`).

---

## 2. Control Plane Capabilities & Views

| View ID | Section | Purpose & Data Sources |
| :--- | :--- | :--- |
| `platform-operations` | Platform Operations | Real-time system health, SQLite WAL status, queryable events count, and governance audit trail. |
| `tasks` | Tasks Explorer | Lifecycle tracking of all submitted tasks across applications with status filters and execution bindings. |
| `executions` | Execution Explorer | Detailed inspection of orchestrated execution timelines, model rounds, tool call observations, and trace IDs. |
| `events` | Durable Event Stream | Append-only SQLite WAL durable event store queryable by sequence number, event type, aggregate, and correlation trace. |
| `agents` | Agent Management | Declaration, configuration, activation, memory partition allocation, and authorized tool matrices for first-class agents. |
| `models` | Model Gateway | Model registry, routing strategies, fallback chains, latency benchmarks, and provider availability. |
| `tools` | Tool Registry | Governed tool definitions, parameter schemas, execution modes (`READ_ONLY`, `MUTATING`), and risk tiers. |
| `tenants` | Tenants & Quotas | Multi-tenant plan capacities, working bounds, real-time consumption quotas, and isolation verification. |
| `security` | Security Posture | Default-deny enforcement, RBAC policy audit trails, secret redaction, and boundary breach prevention. |
| `factory` | AI Application Factory | Manifest validation, capability entitlement verification, SDK generation, and contract compliance. |
| `ecosystem` | Ecosystem & Marketplace | Directory of certified enterprise reference applications (`Tentaciones Commerce`, `Vehicle Parts Platform`, `Support Agent`). |
| `diagnostics` | System Diagnostics | Live probes for API connectivity, SQLite WAL persistence, event ledger, model gateway, tools, and reconciliation. |

---

## 3. Application Lifecycle Governance

Applications operating on the platform transition through a governed lifecycle state machine:

```text
[ DRAFT / SPEC ] ──> [ VALIDATED ] ──> [ REGISTERED ] ──> [ CONNECTED / OPERATIONAL ]
                                                                  │
                                                       ┌──────────┴──────────┐
                                                       ▼                     ▼
                                                 [ SUSPENDED ]          [ RETIRED ]
```

- **VALIDATED**: Passed static schema validation and minimum platform version compatibility.
- **REGISTERED**: Bound to a licensed tenant with verified capability entitlements.
- **CONNECTED**: Actively exchanging authenticated REST requests via Platform API v1.
- **SUSPENDED**: Temporarily revoked from capability dispatching during maintenance.
- **RETIRED**: Decommissioned; all API keys and capability authorizations irreversibly revoked.

---

## 4. Verification & Security Standards

- **Cross-Tenant Boundary**: All tasks and executions are tenant-scoped; attempts to invoke or inspect cross-tenant resources return `HTTP 403 Forbidden` and log to the governance audit trail.
- **Durable Ledger Persistence**: All state transitions produce immutable, cryptographically correlated events stored in SQLite WAL mode with monotonic sequence ordering.
- **Secret Redaction**: Passwords, API tokens, bearer tokens, and private keys are scrubbed prior to event logging or API responses.
