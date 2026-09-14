# AI Operating Platform — Production Runtime & Platform Integration

## 1. Executive Summary & Runtime Architecture

The **AI Operating Platform Runtime** is a deterministic, fail-closed execution environment that bridges incoming client requests (such as Tentaciones E-Commerce) to autonomous agents, model gateways, and tools while strictly enforcing architectural boundaries:

```text
               EXTERNAL APPLICATIONS (e.g. Tentaciones)
                                  │
                                  ▼
                 ┌────────────────────────────────┐
                 │       PlatformClient SDK       │
                 └────────────────┬───────────────┘
                                  │ HTTP / TLS (Idempotency-Key, Auth)
                                  ▼
                 ┌────────────────────────────────┐
                 │      /api/v1 HTTP Router       │
                 └────────────────┬───────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
         AuthenticationService         RbacAuthorizationEvaluator
         (API Key / OIDC Adapter)      (Strict Role & Tenant Bounds)
                   │                             │
                   └──────────────┬──────────────┘
                                  ▼
                 ┌────────────────────────────────┐
                 │        PlatformService         │
                 │  (Idempotency & Orchestration) │
                 └────────────────┬───────────────┘
                                  │
                                  ▼
                 ┌────────────────────────────────┐
                 │          Core Runtime          │
                 │   (Task Execution Lifecycle)   │
                 └───────┬────────────────┬───────┘
                         │                │
                         ▼                ▼
                    Persistence       EventStore
                 (SQLite Durable)   (Durable Audit)
```

### Architectural Axiom:
`CORE ENGINE ≠ PLATFORM PRODUCT ≠ APPLICATIONS`
- External applications (like Tentaciones) **never** import or invoke the Core Engine or domain internals directly.
- The HTTP Router **never** calls the `CoreRuntime` directly; all interactions proceed through `PlatformService` and authenticated use cases.
- Domain entities have **zero** dependencies on HTTP, network, or framework-specific modules.

---

## 2. Task Execution Lifecycle

Every task transitions through an immutable, deterministic state machine:

```text
    ┌───────────┐
    │  CREATED  │
    └─────┬─────┘
          │ (Queued for execution)
          ▼
    ┌───────────┐
    │  QUEUED   │
    └─────┬─────┘
          │ (Runtime begins execution)
          ▼
    ┌───────────┐
    │  RUNNING  │ ──► (Cancellation requested) ──► CANCELLED [Terminal]
    └─────┬─────┘
          │
          ├──► (Execution succeeded) ──────────► COMPLETED [Terminal]
          │
          └──► (Execution failed / crashed) ───► FAILED    [Terminal]
```

### Invariants:
1. **Terminal Immutability**: Tasks in `COMPLETED`, `FAILED`, or `CANCELLED` can never transition to `RUNNING` or any other state. Any attempt throws `InvalidTaskTransitionError` (HTTP 409 Conflict).
2. **Crash Reconciliation**: Upon startup, `RestartRecoveryService` reconciles in-flight tasks in `RUNNING` to `FAILED` with code `CRASH_RECOVERY`, and tasks in `QUEUED`/`CREATED` to `CANCELLED`.

---

## 3. Idempotency Management

The platform implements strict idempotency via `IdempotencyStore`:
- **Key Scope**: `(tenantId, principalId, idempotencyKey)` ensures cross-tenant isolation and prevents key collisions between distinct tenants or callers.
- **Payload Matching**: Computes a canonical SHA-256 hash of `{ agentId, input }`.
  - **Identical Retry**: Returns the cached response with identical status code and payload without re-executing.
  - **Payload Mismatch**: Rejects with `409 Conflict` (`IDEMPOTENCY_PAYLOAD_MISMATCH`).
  - **Concurrent In-Flight**: Rejects with `409 Conflict` (`IDEMPOTENCY_CONCURRENT_EXECUTION`).

---

## 4. Task Ownership & Caller Identity Integrity

Caller identity is established exclusively via the authenticated `SecurityContext`:
- `body.callerId`, `query.callerId`, and `header.callerId` are **strictly ignored and overwritten** with `SecurityContext.principal.id` and `SecurityContext.tenantId`.
- **Tenant Isolation**: Tasks are associated with `callerTenantId`. Any attempt by Tenant B to query (`GET /tasks/:id`) or cancel (`POST /tasks/:id/cancel`) a task belonging to Tenant A returns `404 Not Found` to prevent ID enumeration.

---

## 5. Cancellation Semantics

- **Cancellation Requested vs Runtime Halt**:
  - `POST /api/v1/tasks/:id/cancel` sets the persistent task state to `CANCELLED` and emits a durable `task.cancelled` event containing the caller identity, tenant, and reason.
  - Tasks that have already reached `COMPLETED` or `FAILED` cannot be cancelled and return `409 Conflict`.
  - In-flight execution loops inspect task cancellation flags before advancing between operation steps.

---

## 6. Service Principal Model

External applications (like Tentaciones) authenticate as a `SERVICE` principal:
- `SERVICE ≠ SYSTEM`: A service principal receives only explicit operational permissions:
  - `task.create`
  - `task.read`
  - `task.cancel`
  - `task.execute`
  - `agent.read`
  - `public.read`
- Service principals **cannot** access administrative endpoints, grant roles, override tenants, or escalate privileges to `SYSTEM`.

---

## 7. Authentication Adapter & OIDC Roadmap

- **Bearer Token Adapter**: `BearerTokenAuthenticationProvider` delegates to an injected `BearerTokenVerifier`.
- **Development Scaffolding**: `DevScaffoldTokenVerifier` is explicitly delimited for dev/test environments.
- **Production Fail-Closed**: In production environments, unconfigured token verifiers return `UNTRUSTED_BEARER_PROVIDER`, requiring an enterprise OIDC/JWKS adapter without mutating the RBAC or core authorization engine.

---

## 8. Health & Readiness Probes

`GET /api/v1/health` provides separated health semantics:
- **Liveness (`UP`)**: Confirms the HTTP process is responsive.
- **Readiness (`READY` | `NOT_READY`)**: Verifies that SQLite durable persistence (WAL mode) and the Durable EventStore are operational and ready to accept transactions.
- **Zero Leakage**: Internal file paths, environment secrets, and connection credentials are never exposed in health payloads.
