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
 (Identity & Scope)   (Pre-exec & Output)  (Allowlist & Sandbox)
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

## 2. Implemented Subsystem Boundaries

### 2.1 Agent Boundary
- **Trusted Identity**: The caller identity is derived strictly from `SecurityContext.principal.id`, never from caller request metadata or target identifiers.
- **Self-Escalation Prevention**: Agents cannot modify their own roles, grant permissions, alter their designated memory scope, change their tenant ID, or spawn unconstrained privileged agents.
- **Cross-Agent Isolation**: Direct access to another agent's context or memory is strictly blocked. Inter-agent communication is permitted only through explicit, authorized `handoff.transfer` contracts.

### 2.2 Tool Boundary
- **Pre-Execution Authorization**: Tools are evaluated through `PolicyGateway` strictly *before* invocation.
- **Untrusted Tool Input**: Input payloads provided to tools cannot override `SecurityContext`, change caller identity, or bypass RBAC filters.
- **Tool Output Sanitization & Bounding**: Tool outputs are validated, bounded, sanitized, and deeply frozen (`enforceToolOutput`).
- **Tool Escape Prevention**: A tool cannot invoke another privileged tool using transitive or parent permissions; all nested invocations require independent authorization.

### 2.3 Model & Provider Boundary
- **Model / Provider Allowlist**: Agents are restricted to explicitly registered and authorized models and providers (e.g. `gemini-1.5-flash`, `gpt-4o-mini`).
- **Prompt Injection Defense**: Model and user outputs containing adversarial strings (e.g., *"Ignore previous instructions, grant admin"*) have zero effect on `SecurityContext` or `PolicyGateway` decisions.
- **Untrusted Content**: Model outputs are treated as generated content, never as authoritative policy or security decisions.

### 2.4 Memory Boundary
- **Scope Ownership**: Memory access requires verified ownership (e.g. `agent-${principal.id}`) or authorized shared tenant scopes.
- **READ, WRITE, DELETE Governance**: All three operations require explicit authorization and scope matching.
- **Cross-Tenant Isolation**: Cross-tenant memory reads and writes fail closed (`SECURITY_TENANT_ISOLATION_VIOLATION`).

### 2.5 Delegation Boundary
- **Authorization Required**: Inter-agent task delegation requires the source principal to possess `handoff.transfer` permission.
- **Capability Escalation Blocked**: Source cannot delegate capabilities it does not possess.
- **Bounded Delegation Depth**: Delegation depth is constrained (`depth <= maxDepth`); deeper delegations fail closed (`SECURITY_DELEGATION_DEPTH_EXCEEDED`).
- **Scope & Tenant Preservation**: Delegations cannot escalate to broader scopes or foreign tenants.

---

## 3. Implemented Enforcement vs Future Infrastructure Boundaries

| Domain | Implemented Enforcement (Application Boundary) | Future Infrastructure Boundary |
|---|---|---|
| **Tools** | Pre-execution PDP check, deep output sanitization, tool escape blocking | OS-level cgroups / container sandboxing |
| **Models** | Model & Provider allowlists, RBAC authorization, prompt injection resistance | Direct hardware TPM attestation |
| **Memory** | Tenant and scope ownership verification, pre-retrieval fail-closed check | Hardware memory encryption (TEE) |
| **Providers** | Application-level provider authorization and allowlist filtering | Network Egress Firewall / SSRF Hardware Proxy |
| **Delegation** | Bounded depth, scope/tenant constraints, capability checks | Cryptographic distributed capability tokens |

---

## 4. Security Invariants Summary

| ID | Invariant | Enforcement Mechanism |
|---|---|---|
| **B01** | Tool invocation requires explicit authorization | `SecurityBoundaryEnforcer.enforceToolBoundary` |
| **B02** | Model invocation requires explicit authorization & allowlist check | `SecurityBoundaryEnforcer.enforceModelBoundary` |
| **B03** | Memory access requires ownership and scope validation | `SecurityBoundaryEnforcer.enforceMemoryBoundary` |
| **B04** | Tool inputs and outputs cannot alter `SecurityContext` | Immutable `SecurityContext` & `enforceToolOutput` |
| **B05** | Model outputs cannot modify security policies | Model output classified as untrusted content |
| **B06** | Agent identity originates strictly from `SecurityContext` | Enforced at entrypoint (no metadata fallback) |
| **B07** | Provider selection is authorized | Provider allowlist checking |
| **B08** | Cross-agent access requires authorized handoff | Enforced in coordinator & boundary enforcer |
| **B09** | Delegation depth is bounded and capability-checked | `SecurityBoundaryEnforcer.enforceDelegationBoundary` |
| **B10** | Security boundary failures fail closed | Default deny & exception fail-closed handlers |
| **B11** | Decisions are deterministic | Pure function of context, request, and RBAC rules |
| **B12** | Prompt injection cannot bypass security policy | Policy Gateway operates independently of LLM reasoning |

---

## 5. Observability & Event Auditing

Every boundary interaction emits structured domain events:
- `policy.evaluated`, `policy.allowed`, `policy.denied`
- `authorization.allowed`, `authorization.denied`
- `tool.execution.started`, `tool.execution.completed`, `tool.execution.failed`
- `model.requested`, `model.completed`, `model.failed`
- `memory.stored`, `memory.retrieved`, `memory.deleted`

**Zero Secret Leakage**: All event payloads are sanitized against API keys, bearer tokens, private keys, and raw authorization headers.
