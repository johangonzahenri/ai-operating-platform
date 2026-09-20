# Enterprise Capability Authorization & Scope Evaluation (`AOP-AUTH-02`)

## 1. Overview & Scope Hierarchy

Authorization in the **AI Operating Platform (AOP)** enforces fine-grained capability checks at every layer of request execution. A credential or token does not grant universal access; it is restricted by explicit capability scopes.

```text
                               AUTHORIZATION MODEL
                               
               ┌─────────────────────────────────────────────────┐
               │             ApiCredential / Principal           │
               │   Scopes: ["tasks.create", "devices.print"]     │
               └────────────────────────┬────────────────────────┘
                                        │
                                        ▼
               ┌─────────────────────────────────────────────────┐
               │       Scope Evaluator & Wildcard Matcher        │
               │   - Exact: "tasks.create" == "tasks.create"     │
               │   - Wildcard domain: "tasks.*"                  │
               │   - Global root: "*"                            │
               └────────────────────────┬────────────────────────┘
                                        │
                                        ▼
               ┌─────────────────────────────────────────────────┐
               │            Multi-Tier RBAC Evaluator            │
               │   - Tenant isolation & subscription bounds      │
               │   - Resource role mapping (SERVICE, OPERATOR)   │
               └────────────────────────┬────────────────────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                 [200 / 201 OK]               [403 INSUFFICIENT_SCOPE]
```

---

## 2. Standard Platform Scopes Catalog

| Scope | Category | Description | Permitted Endpoints |
| :--- | :--- | :--- | :--- |
| `tasks.read` | Tasks | Query and inspect task state and progress | `GET /api/v1/tasks`, `GET /api/v1/tasks/:id` |
| `tasks.create` | Tasks | Dispatch new task executions | `POST /api/v1/tasks`, `POST /api/v1/tasks/:id/execute` |
| `tasks.cancel` | Tasks | Cancel active task runs | `POST /api/v1/tasks/:id/cancel` |
| `executions.read` | Telemetry | Inspect execution records and timelines | `GET /api/v1/executions`, `GET /api/v1/executions/:id` |
| `events.read` | Observability | Query durable event log and trace streams | `GET /api/v1/events`, `GET /api/v1/events/:id` |
| `devices.read` | Hardware | Inspect registered business hardware | `GET /api/v1/devices`, `GET /api/v1/devices/:id` |
| `devices.print` | Hardware | Dispatch physical print jobs | `POST /api/v1/devices/:id/print`, `POST /api/v1/printing/jobs` |
| `autonomous.operations.execute` | Autonomy | Trigger or execute autonomous cycles | `POST /api/v1/operations`, `POST /api/v1/autonomous/*` |
| `credentials.read` | Security | Inspect non-sensitive credential metadata | `GET /api/v1/credentials`, `GET /api/v1/credentials/:id` |
| `credentials.manage` | Security | Generate, rotate, revoke, or delete keys | `POST /api/v1/credentials`, `POST /api/v1/credentials/:id/*` |
| `workflows.read` | Orchestration | Read workflow definitions & instances | `GET /api/v1/workflows/*` |
| `workflows.create` | Orchestration | Define and run structured workflows | `POST /api/v1/workflows/*` |
| `solutions.read` | Solutions | Read blueprints and solution instances | `GET /api/v1/solutions/*` |
| `solutions.manage` | Solutions | Publish, instantiate, or archive solutions | `POST /api/v1/solutions/*` |
| `*` | Superuser | Unrestricted scope for administrative keys | All platform endpoints |

---

## 3. Wildcard Scope Evaluation Rules

Scopes support hierarchical wildcard matching:
1. `*`: Grants authority across all actions and resources.
2. `<domain>.*`: (e.g. `tasks.*`) Grants all actions under the `tasks` domain (`tasks.read`, `tasks.create`, `tasks.cancel`).
3. `<domain>.<subdomain>.*`: (e.g. `autonomous.operations.*`) Grants authority across sub-operations.
4. Exact match: (e.g. `devices.print`) Grants strictly the declared capability.

---

## 4. Multi-Tenant Isolation & Default-Deny

- Every evaluation executes under **Default-Deny**: if no policy or explicit scope permits the action, the gateway returns `403 FORBIDDEN` (`INSUFFICIENT_SCOPE` or `ACCESS_DENIED`).
- Cross-tenant capability consumption is strictly prevented. A credential issued for `tenant-tentaciones` cannot invoke capabilities or query resources residing in `tenant-automotive`.
