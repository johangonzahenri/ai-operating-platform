# Security Architecture v0.1 — AI Operating Platform

## 1. Executive Summary & Security Goals

The AI Operating Platform manages autonomous and multi-agent workloads executing privileged model calls, data mutations, and tool invocations. The core security goal is:

> **Never trust an agent, tool, model, request, or external provider merely because it exists inside the platform.**

Security is not an external wrapper or superficial middleware; it is a **transversal property of the Core Engine**, governed by fail-closed policy enforcement, explicit principal identity, bounded contexts, and immutable audit logs.

```text
                EXTERNAL REQUEST
                       │
                       ▼
                SECURITY BOUNDARY
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        Authentication      Request Context
             │                   │
             └─────────┬─────────┘
                       ▼
                 Authorization
                       │
                       ▼
                 PolicyGateway
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
        Agents        Tools       Models
          │            │            │
          └────────────┼────────────┘
                       ▼
                 Core Runtime
                       │
                       ▼
                 Persistence
                       │
                       ▼
                 Audit / Events
```

---

## 2. Trust Boundaries

The platform establishes eight explicit trust boundaries:

| Boundary | Origin $\rightarrow$ Destination | Trusted Entity | Untrusted Input / Entity | Validation & Authorization Requirement |
|---|---|---|---|---|
| **Boundary A** | External Client $\rightarrow$ Platform API | Platform API Gateway | External network, client headers, raw payloads | Authentication, rate limiting, request validation, tenant isolation |
| **Boundary B** | Platform API $\rightarrow$ Core Runtime | Core Engine Runtime | API payload parameters, user input | Parameter bounds validation, SecurityContext propagation |
| **Boundary C** | Planner $\rightarrow$ Agents | Core Planner | Generated LLM plans, proposed agent targets | Plan schema validation, agent allowlist, role validation, active status check |
| **Boundary D** | Agent $\rightarrow$ Tool | Dispatcher / PolicyGateway | Agent-generated tool arguments, execution requests | PolicyGateway evaluation, tool permission check, schema validation |
| **Boundary E** | Agent $\rightarrow$ Model | ModelGateway | Agent prompt/message inputs, external provider responses | Provider allowlist, model authorization, token budget limits |
| **Boundary F** | Agent $\rightarrow$ Memory | MemoryService / Policy | Agent write/read requests | Scope ownership (`memoryScope`), bounded payload sanitization |
| **Boundary G** | Core Runtime $\rightarrow$ Persistence | TransactionRunner / SQLite | In-flight mutations | Optimistic concurrency (OCC), schema constraint verification |
| **Boundary H** | Platform $\rightarrow$ External Provider | Model Adapters | Third-party LLM APIs, external tools | Secret isolation, response sanitization, timeout enforcement |

---

## 3. Principal & Identity Model

Every operation within the platform executes under an explicit `Principal`:

```typescript
export type PrincipalType = "HUMAN" | "SERVICE" | "AGENT" | "TOOL" | "SYSTEM";

export interface Principal {
  readonly id: string;
  readonly type: PrincipalType;
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly tenantId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}
```

### Identity Types:
1. **HUMAN**: End-user or operator interacting via UI or API.
2. **SERVICE**: External service or background automation client.
3. **AGENT**: Autonomous or specialized agent executing within a designated scope.
4. **TOOL**: Internal or registered executable capability.
5. **SYSTEM**: Core platform runtime executing maintenance, reconciliation, or bootstrap tasks.

---

## 4. Authentication vs Authorization vs Policy

The platform strictly decouples identity verification from permission checking and contextual rules:

```text
Authentication
    ↓ "Who are you?" (Verifies credentials, issues SecurityContext)
Authorization
    ↓ "What are you allowed to do?" (Checks roles & permissions)
Policy
    ↓ "Under which specific conditions?" (Evaluates dynamic context, risk, agent role, source/target bounds)
```

**Fundamental Invariant**: `authenticated !== authorized`. An authenticated principal possesses zero implicit permissions.

---

## 5. Security Invariants

The platform enforces 15 architectural security invariants:

1. **No Unauthenticated Access**: No unauthenticated principal may access protected platform operations.
2. **AuthN $\neq$ AuthZ**: Authentication does not imply authorization.
3. **Explicit Authorization**: Every privileged operation requires explicit authorization.
4. **No Self-Privilege Escalation**: Agents cannot elevate their own privileges or modify their permissions.
5. **No Arbitrary Agent Spawning**: Agents cannot arbitrarily spawn or coordinate privileged agents.
6. **Tool Authorization**: Tools require explicit authorization and capability matching before invocation.
7. **Model Authorization**: Models and providers require explicit authorization.
8. **Memory Ownership**: Memory access must respect ownership and designated `memoryScope`.
9. **Explicit Context Transfer**: Cross-agent context must be explicitly transferred via bounded handoffs.
10. **Observable Security**: All security decisions (allow and deny) must be observable via Domain Events.
11. **Fail-Closed**: Security failures and evaluation errors must fail closed (deny access).
12. **Zero Secret Leakage**: Security events and audit logs must never expose secret material or credentials.
13. **Bounded Metadata**: Security metadata must not become an uncontrolled data exfiltration channel.
14. **Pre-Execution Authorization**: Authorization must happen before execution, never after.
15. **Untrusted Agent Behavior**: Security enforcement must not depend on an agent behaving honestly.

---

## 6. Subsystem Security Models

### 6.1 Agent Security
- Agents are declared in the `AgentRegistry` with fixed capabilities and `memoryScope`.
- Agents cannot dynamically register tools or expand their allowed models.
- Step execution in multi-agent coordination requires Policy evaluation before every transition.

### 6.2 Tool Security & Risk Classification
Tools are classified by risk tier:
- **LOW**: Read-only, deterministic operations without side effects (e.g., calculator, date parser).
- **MEDIUM**: Persistent state mutations within platform storage (e.g., memory write, task status update).
- **HIGH**: External network calls, filesystem operations, code execution, or financial/administrative actions.
- **CRITICAL**: Destructive system operations, schema modifications, or key rotations requiring explicit human approval.

### 6.3 Model & Provider Security
- `ModelGateway` routes requests only to registered and authorized providers (`openai`, `anthropic`, `ollama`).
- Payloads are bounded via `BoundedDataLimits`.
- API keys are injected via environment/adapters and never exposed to agents or stored in task contexts.

### 6.4 Memory & Context Security
- `MemoryService` isolates records by `memoryScope` (`agent-${id}` or `tenant-${id}`).
- Memory is strictly retained state, never an uncontrolled inter-agent communication channel.
- Cross-agent transfers require explicit, immutable, bounded `AgentHandoff` payloads.

---

## 7. Secret Management & Sanitization

The platform implements automated pattern-based secret redaction in `BoundedDataLimits` (`sanitizeBoundedValue`):
- Keys matching `/authorization|api[_-]?key|token|secret|password|cookie|credential|header|env|private[_-]?key/i` are automatically redacted to `"[redacted]"`.
- Sensitive data is sanitized before entering:
  - Domain Events / EventStore
  - TaskContext
  - AgentHandoff payloads
  - Diagnostic traces
  - Error messages and failure payloads

---

## 8. Fail-Closed Decision Engine

All security evaluations follow deterministic fail-closed rules:
```text
Missing Request / Payload       ──► DENY (SECURITY_INVALID_REQUEST)
Missing SecurityContext         ──► DENY (SECURITY_CONTEXT_MISSING)
Unauthenticated Principal       ──► DENY (SECURITY_UNAUTHENTICATED)
Missing Required Permission     ──► DENY (SECURITY_PERMISSION_DENIED)
Invalid Permission String       ──► DENY (SECURITY_PERMISSION_UNKNOWN)
Cross-Agent Scope Violation     ──► DENY (SECURITY_CROSS_AGENT_VIOLATION)
Evaluator Exception / Error     ──► DENY (POLICY_EVALUATION_FAILED)
```

---

## 9. Implementation Status & Roadmap

| Capability | Status |
|---|---|
| Domain Security Types & Contracts (`Principal`, `SecurityContext`, `TrustBoundary`) | **IMPLEMENTED** |
| 15 Security Invariants Formalized | **IMPLEMENTED** |
| Fail-Closed Authorization Engine (`evaluateFailClosedAuthorization`) | **IMPLEMENTED** |
| PolicyGateway Centralized Decision Point | **IMPLEMENTED** |
| Secret Sanitization & Bounded Contexts | **IMPLEMENTED** |
| Identity & Authentication Service (API Key, Scaffolding Bearer JWT) | **IMPLEMENTED** |
| Fine-Grained Role-Based Access Control (RBAC) & Authorization Evaluator | **IMPLEMENTED** |
| Subsystem Security Boundaries (Agent / Tool / Model / Memory / Delegation) | **IMPLEMENTED** |
| Security Control & Threat Mitigation Verification | **IMPLEMENTED** |
| Hardware Network Egress Firewall & TEE/TPM Attestation | **FUTURE INFRASTRUCTURE** |
## 10. Platform API Security Boundary & Production Integration (Phase 14)

The `/api/v1` HTTP surface establishes the production-ready boundary between external applications (e.g. Tentaciones platform adapter, web frontends, integration scripts) and the AI Operating Platform Core.

```text
HTTP Request (Headers: Authorization / X-API-Key / Idempotency-Key)
    │
    ▼
[Boundary A: HTTP Layer]
  1. Method, URL, Path-Traversal & Content-Type Validation
  2. AuthenticationService: Resolves verified Principal (API Key / Bearer)
  3. SecurityContext Construction: Bounds Principal, Roles, and Tenant
    │
    ▼
[RBAC Authorization Middleware]
  4. Evaluates required action (public.read, agent.read, task.create, task.read, task.cancel)
  5. Denies missing or insufficient roles fail-closed
    │
    ▼
[Boundary B: Core Platform Execution]
  6. Automatic Identity Binding: Caller identity and tenant derived strictly from SecurityContext
  7. Tenant Isolation: Multi-tenant filtering on Task queries and mutations
  8. Sanitized Output: Platform projections hide internal instructions and credentials
```

### Key Production Guarantees:
- **Tenant Isolation**: Tasks and events cannot be accessed across tenant boundaries; unauthenticated or foreign tenant queries return safe `404 Not Found` responses to prevent ID enumeration.
- **Identity Integrity**: `callerId` and `tenantId` in task payloads are stamped directly by the server from the verified security context; client spoofing in payload JSON is ignored.
- **Fail-Closed Protection**: Inactive, expired, revoked, or malformed API keys/tokens are rejected with standard `401 Unauthorized` / `403 Forbidden` responses.
