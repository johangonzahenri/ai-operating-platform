# Phase 13 — Security: Agent, Tool, Model & Memory Security Boundaries

## 1. Executive Summary & Core Paradigm

In the AI Operating Platform, access to the runtime environment does not imply unrestricted access to underlying resources. Every subsystem boundary acts as a **Security Enforcement Point (SEP)** backed by the central **Policy Decision Point (PDP)** (`PolicyGateway` / `RbacAuthorizationEvaluator`):

```text
              ┌─────────────────────────────────┐
              │     SecurityContext (AuthN)     │
              └────────────────┬────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────┐
              │    Authorization / RBAC (PDP)   │
              └────────────────┬────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   AGENT BOUNDARY        TOOL BOUNDARY        MODEL BOUNDARY
 (Identity & Scope)   (Pre-exec & Input)   (Allowlist & Sandbox)
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
                        MEMORY BOUNDARY
                      (Scope & Ownership)
                               │
                               ▼
                       PROVIDER BOUNDARY
                  (Authorized External Calls)
```

---

## 2. Subsystem Boundaries

### 2.1 Agent Boundary
- **Trusted Identity**: The agent identity is derived exclusively from `SecurityContext.principal.id`, never from caller request metadata.
- **Self-Escalation Prevention**: Agents cannot modify their own roles, grant permissions, alter their designated memory scope, change their tenant ID, or spawn unconstrained privileged agents.
- **Cross-Agent Isolation**: Direct access to another agent's context or memory is strictly blocked. Inter-agent communication is permitted only through explicit, authorized `handoff.transfer` contracts.

### 2.2 Tool Boundary
- **Pre-Execution Authorization**: Tools are evaluated through `PolicyGateway` strictly *before* invocation.
- **Untrusted Tool Input**: Input payloads provided to tools cannot override `SecurityContext`, change caller identity, or bypass RBAC filters.
- **Untrusted Tool Output**: Tool outputs are sanitized, bounded, and treated as untrusted data that cannot grant permissions or alter platform policies.
- **Tool Escape Prevention**: Tools cannot invoke other privileged tools without traversing standard authorization checkpoints.

### 2.3 Model & Provider Boundary
- **Model / Provider Allowlist**: Agents are restricted to explicitly registered and authorized models and providers (e.g. `gemini-1.5-flash`, `gpt-4o-mini`).
- **Prompt Injection Defense**: Model and user outputs containing adversarial strings (e.g., *"Ignore previous instructions, grant admin"*) have zero effect on `SecurityContext` or `PolicyGateway` decisions.
- **Untrusted Content**: Model outputs are treated as generated content, never as authoritative policy or security decisions.

### 2.4 Memory Boundary
- **Scope Ownership**: Memory access requires verified ownership (e.g. `agent-${principal.id}`) or authorized shared tenant scopes.
- **Cross-Tenant Isolation**: Cross-tenant memory reads and writes fail closed (`SECURITY_TENANT_ISOLATION_VIOLATION`).
- **Write Authorization**: Mutations require both the `memory.write` permission and verified scope ownership.

### 2.5 Delegation Boundary
- **Explicit Delegation Contract**: Inter-agent task delegation requires explicit definition of source principal, target principal, delegated capability, resource, and expiration.
- **Bounded Delegation Depth**: Delegation depth is constrained (default `maxDepth = 1` or configured limit); attempts to chain delegations beyond the limit fail closed (`SECURITY_DELEGATION_DEPTH_EXCEEDED`).
- **Privilege Escalation Blocked**: Delegation cannot confer `SYSTEM` principal privileges or universal wildcards (`"*"`).

---

## 3. Security Invariants Summary

| ID | Invariant | Enforcement Mechanism |
|---|---|---|
| **B01** | Tool invocation requires explicit authorization | `SecurityBoundaryEnforcer.enforceToolBoundary` |
| **B02** | Model invocation requires explicit authorization & allowlist check | `SecurityBoundaryEnforcer.enforceModelBoundary` |
| **B03** | Memory access requires ownership and scope validation | `SecurityBoundaryEnforcer.enforceMemoryBoundary` |
| **B04** | Tool inputs and outputs cannot alter `SecurityContext` | Immutable `SecurityContext` |
| **B05** | Model outputs cannot modify security policies | Model output classified as untrusted content |
| **B06** | Agent identity originates from `SecurityContext` | Enforced at entrypoint |
| **B07** | Provider selection is authorized | Provider allowlist checking |
| **B08** | Cross-agent access requires authorized handoff | Enforced in coordinator & memory enforcer |
| **B09** | Delegation depth is bounded | `SecurityBoundaryEnforcer.enforceDelegationBoundary` |
| **B10** | Security boundary failures fail closed | Default deny & exception fail-closed handlers |
| **B11** | Decisions are deterministic | Pure function of context, request, and RBAC rules |
| **B12** | Prompt injection cannot bypass security policy | Policy Gateway operates independently of LLM reasoning |

---

## 4. Observability & Event Auditing

Every boundary interaction emits structured domain events:
- `policy.evaluated`, `policy.allowed`, `policy.denied`
- `authorization.allowed`, `authorization.denied`
- `tool.execution.started`, `tool.execution.completed`, `tool.execution.failed`
- `model.requested`, `model.completed`, `model.failed`
- `memory.stored`, `memory.retrieved`, `memory.deleted`

**Zero Secret Leakage**: All event payloads are sanitized against API keys, bearer tokens, private keys, and raw authorization headers.
