# Phase 13 — Security: Authorization & RBAC Architecture

## 1. Core Principles & Separation of Concerns

The AI Operating Platform strictly decouples identity verification from access control:

- **Authentication answers**: *"Who are you, and is your identity valid and active?"*
- **Authorization answers**: *"What operations are you permitted to execute on what resources within what scope?"*

An authenticated principal (`authenticated: true`) **does not** imply administrator status, wildcard permissions (`"*"`), or unrestricted execution. All privileged actions require explicit, deterministic authorization.

```text
CREDENTIALS (API Key / Bearer Token)
                ↓
      AUTHENTICATION SERVICE
                ↓
         VERIFIED PRINCIPAL
                ↓
          SECURITY CONTEXT
                ↓
    RBAC AUTHORIZATION EVALUATOR
                ↓
          POLICY GATEWAY
                ↓
       ALLOW / DENY DECISION
                ↓
         PROTECTED EXECUTION
```

---

## 2. RBAC Model & Domain Entities

### 2.1 Permission (`Permission`)
A `Permission` represents a discrete operational capability mapped to a resource domain and action:
- **Format**: `${resource}.${action}` (e.g. `tool.invoke`, `model.read`, `task.create`, `memory.write`, `handoff.transfer`).
- **Wildcards**:
  - Domain-scoped wildcard: `task.*`, `agent.*`, `tool.*` (matches all actions within the domain).
  - Universal wildcard: `*` (reserved strictly for internal system supervision).

### 2.2 Role (`Role`)
A `Role` is an immutable aggregation of explicit permissions:
- **Standard Roles**:
  - `anonymous`: `["public.read", "health.check"]` (for unauthenticated callers).
  - `user`: `["public.read", "health.check", "task.read", "task.create", "agent.read", "model.read", "tool.read"]`.
  - `operator`: `["public.read", "health.check", "task.*", "agent.*", "model.*", "tool.*", "memory.read", "coordination.*"]`.
  - `agent`: `["tool.invoke", "tool.read", "model.invoke", "model.read", "memory.read", "memory.write", "handoff.transfer"]`.
  - `service`: `["task.create", "task.read", "task.execute", "agent.read", "tool.read"]`.
  - `system-admin`: `["*"]` (internal runtime only).

### 2.3 Role Repository (`RoleRepository` / `InMemoryRoleRepository`)
Provides an abstraction for resolving role assignments for authenticated principals, decoupling the authorization evaluator from underlying persistence (e.g. SQLite, IAM, directory services).

---

## 3. Evaluation Pipeline & Policy Precedence

The `RbacAuthorizationEvaluator` enforces a strict, deterministic, fail-closed evaluation pipeline:

```text
1. Malformed Request / Missing Context → DENY (fail-closed)
2. Unauthenticated caller accessing non-public operation → DENY
3. External caller claiming SYSTEM principal type → DENY
4. Agent attempting security self-escalation (role/permission modification) → DENY
5. Agent attempting cross-agent access without handoff → DENY
6. Tenant isolation mismatch without cross-tenant authorization → DENY
7. Scope isolation mismatch → DENY
8. Explicit DENY policy match → DENY
9. Explicit ALLOW policy match → ALLOW
10. Matching Role Permission in assigned roles → ALLOW
11. Default fallback → DENY (Default Deny)
12. Any evaluator/repository runtime exception → DENY (fail-closed)
```

### Precedence Rule:
$$\text{Explicit DENY} > \text{Explicit ALLOW} > \text{RBAC Role Match} > \text{Default DENY}$$

---

## 4. PolicyGateway Integration

The `RbacPolicyGateway` adapts the standard platform `PolicyGateway` interface (`evaluate(PolicyContext): Promise<PolicyDecision>`) to the RBAC authorization evaluator:
- Bridges operational contexts from Agent, Tool, Model, and Orchestration dispatchers.
- Enforces authorization **strictly before execution** across all dispatchers.

---

## 5. Security Boundaries & Invariants

| ID | Invariant | Description |
|---|---|---|
| **A01** | **Default Deny** | Any request without an explicit allow rule resolves to `DENY`. |
| **A02** | **Authenticated Access** | Protected resources require an authenticated `Principal` in the `SecurityContext`. |
| **A03** | **Separation of AuthN/AuthZ** | Authentication establishes identity only; no implicit wildcard permissions are granted. |
| **A04** | **No Agent Self-Escalation** | Agents cannot assign roles, grant permissions, or spawn privileged principals. |
| **A05** | **Authorization Before Execution** | Access evaluation must precede execution at all trust boundaries. |
| **A06** | **Fail-Closed Semantics** | Internal exceptions or repository unavailability result in immediate `DENY`. |
| **A07** | **Tenant Isolation** | Requests across tenant boundaries without explicit permission are rejected. |
| **A08** | **Restricted Anonymous** | Unauthenticated callers are restricted to public read and health check operations. |
| **A09** | **SYSTEM Protection** | External credentials and roles cannot assume the internal `SYSTEM` identity. |
| **A10** | **Observable Auditability** | Decisions emit `authorization.allowed` and `authorization.denied` events with zero secret leakage. |

---

## 6. Observability & Event Auditing

Authorization evaluation emits structured domain events:
- `authorization.allowed`: Emitted when an operation is permitted with matched roles and policies.
- `authorization.denied`: Emitted when an operation is rejected with deterministic reason codes (`SECURITY_UNAUTHENTICATED`, `SECURITY_DEFAULT_DENY`, `SECURITY_TENANT_ISOLATION_VIOLATION`, etc.).
- **Secret Redaction**: Credentials, tokens, private keys, and Authorization headers are stripped and never included in event payloads.
