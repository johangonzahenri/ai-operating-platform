# Threat Model v0.1 — AI Operating Platform

## 1. Scope & Methodology

This threat model identifies realistic threats to the AI Operating Platform across its execution lifecycle, runtime core, agents, tools, models, memory, and persistence layers. It applies STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) tailored to autonomous and multi-agent AI systems.

---

## 2. Threat Catalog

### TM-01: Identity Spoofing
- **Description**: An untrusted caller or sub-component assumes the identity of a privileged Agent or System Principal.
- **Affected Boundaries**: Boundary A (Client $\rightarrow$ API), Boundary C (Planner $\rightarrow$ Agents).
- **Mitigation**: Strict `Principal` validation in `SecurityContext`, SHA-256 API key verification with constant-time buffer comparison (`crypto.timingSafeEqual`), `BearerTokenVerifier` adapter abstraction, explicit blocking of external SYSTEM identities.
- **Verification**: `tests/unit/authentication-service.test.ts`

### TM-02: Privilege Escalation
- **Description**: An agent with LOW-risk permissions attempts to invoke a HIGH/CRITICAL-risk tool or execute administrative tasks.
- **Affected Boundaries**: Boundary D (Agent $\rightarrow$ Tool), Boundary E (Agent $\rightarrow$ Model).
- **Mitigation**: `PolicyGateway` evaluates fine-grained RBAC permissions per invocation before execution. Agents cannot grant permissions, modify roles, or alter definitions.
- **Verification**: `tests/unit/authorization-rbac.test.ts`, `tests/unit/security-boundaries.test.ts`

### TM-03: Tool Abuse & Unauthorized Tool Call
- **Description**: An agent invokes a tool outside its declared capabilities or passes malicious parameters.
- **Affected Boundaries**: Boundary D (Agent $\rightarrow$ Tool).
- **Mitigation**: Registered capability matching, input schema validation in `ToolRegistry`, pre-execution policy evaluation via `enforceToolBoundary`.
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-04: Prompt Injection (Direct & Indirect)
- **Description**: Malicious user input or external web/document content attempts to override system instructions or agent roles.
- **Affected Boundaries**: Boundary A (Client $\rightarrow$ API), Boundary H (External Provider $\rightarrow$ Platform).
- **Mitigation**: Strict separation between system instructions and user inputs; prompt isolation in `TaskContext`; Policy Gateway decisions execute independently of LLM reasoning.
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-05: Tool Injection & Malicious Output
- **Description**: A tool output contains adversarial instructions crafted to mislead downstream decision or execution agents.
- **Affected Boundaries**: Boundary D (Tool $\rightarrow$ Runtime), Boundary F (Handoffs).
- **Mitigation**: Bounded, sanitized tool output payloads (`enforceToolOutput`); deep freezing to prevent in-flight context mutation.
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-06: Data Exfiltration
- **Description**: An agent attempts to send internal database state, environment variables, or other tenant data to an external provider.
- **Affected Boundaries**: Boundary E (Agent $\rightarrow$ Model), Boundary H (Platform $\rightarrow$ External).
- **Mitigation**: `BoundedDataLimits` sanitization, pattern-based secret redaction, strict tenant and scope boundary checks.
- **Verification**: `tests/unit/authentication-service.test.ts`, `tests/unit/authorization-rbac.test.ts`

### TM-07: Cross-Agent Memory & Context Leakage
- **Description**: Agent B reads private memory or conversational history belonging to Agent A.
- **Affected Boundaries**: Boundary F (Agent $\rightarrow$ Memory).
- **Mitigation**: Dedicated scope isolation (`agent-${id}`), pre-retrieval ownership validation in `enforceMemoryBoundary`, zero shared unverified memory buses.
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-08: Unauthorized Model / Provider Access
- **Description**: An agent routes requests to an unapproved or cost-prohibitive model provider.
- **Affected Boundaries**: Boundary E (Agent $\rightarrow$ Model).
- **Mitigation**: Model and provider allowlists (`ModelProviderAllowlist`), pre-execution model authorization.
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-09: Replay Attacks & Duplicate Execution
- **Description**: An attacker or recovering process repeats an operation request to cause double execution or duplicate side effects.
- **Affected Boundaries**: Boundary A (API), Boundary B (Runtime), Boundary G (Persistence).
- **Mitigation**: Deterministic `correlationId`, `operationId`, and `traceId` idempotency checks; optimistic concurrency (OCC) versions in storage.
- **Verification**: `tests/unit/sqlite-persistence.test.ts`

### TM-10: Event & Audit Log Tampering
- **Description**: An entity attempts to alter or delete recorded operational and coordination events.
- **Affected Boundaries**: Boundary G (Runtime $\rightarrow$ Persistence).
- **Mitigation**: Append-only `SqliteEventStore`, immutable domain event schemas, monotonic sequence numbers.
- **Verification**: `tests/unit/sqlite-event-store.test.ts`

### TM-11: Resource Exhaustion & Denial of Service
- **Description**: A request triggers infinite recursion, massive payload sizes, or runaway agent spawning.
- **Affected Boundaries**: Boundary B (Runtime), Boundary C (Planner).
- **Mitigation**: Runtime limits: `maxAgents=4`, `maxHandoffs=3`, `maxDepth=1` delegation bounding, bounded payload sizes ($2048$ chars, $4$ levels depth), execution timeouts.
- **Verification**: `tests/unit/security-boundaries.test.ts`, `tests/unit/multi-agent-coordinator.test.ts`

### TM-12: SSRF & External Network Abuse
- **Description**: A network tool is manipulated to probe internal private network endpoints or cloud metadata services.
- **Affected Boundaries**: Boundary D (Tool $\rightarrow$ Network).
- **Mitigation**: Tool risk classification (`HIGH`/`CRITICAL`), pre-execution policy authorization for network capabilities. (Hardware/network egress firewall proxy is planned future infrastructure).
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-13: Malicious Tool Implementation
- **Description**: A registered tool contains flawed logic or side effects that violate security invariants.
- **Affected Boundaries**: Boundary D (Agent $\rightarrow$ Tool).
- **Mitigation**: Tool registry authorization, pre-execution tool boundary evaluation, tool escape prevention.
- **Verification**: `tests/unit/security-boundaries.test.ts`

### TM-14: Compromised Model Provider Response
- **Description**: An external LLM provider returns invalid, malformed, or hallucinated structural responses.
- **Affected Boundaries**: Boundary E (Model $\rightarrow$ Runtime).
- **Mitigation**: Structural schema validation (JSON schema / types), fail-closed handling in planners and executors, verification agent output evaluation.
- **Verification**: `tests/unit/task-context.test.ts`

---

## 3. Threat Mitigation Matrix

| Threat ID | Threat Name | Severity | Primary Mitigation Layer | Enforcing Component | Status |
|---|---|---|---|---|---|
| **TM-01** | Identity Spoofing | HIGH | SecurityContext & AuthN | `AuthenticationService`, `Principal` | **MITIGATED** |
| **TM-02** | Privilege Escalation | CRITICAL | Policy Enforcement | `PolicyGateway`, `RbacAuthorizationEvaluator` | **MITIGATED** |
| **TM-03** | Tool Abuse | HIGH | Capability Matching & Policy | `SecurityBoundaryEnforcer`, `ToolRegistry` | **MITIGATED** |
| **TM-04** | Prompt Injection | HIGH | Prompt Isolation & Verification | `TaskContext`, `SecurityBoundaryEnforcer` | **MITIGATED** |
| **TM-05** | Tool Injection | MEDIUM | Bounded Handoffs & Tool Output | `enforceToolOutput`, `BoundedDataLimits` | **MITIGATED** |
| **TM-06** | Data Exfiltration | HIGH | Secret Redaction & Scoping | `sanitizeBoundedValue`, `RbacAuthorizationEvaluator` | **MITIGATED** |
| **TM-07** | Cross-Agent Leakage | HIGH | Memory Scope Isolation | `enforceMemoryBoundary`, `MemoryService` | **MITIGATED** |
| **TM-08** | Unauthorized Model | MEDIUM | Provider Registry & Policy | `enforceModelBoundary`, `ModelGateway` | **MITIGATED** |
| **TM-09** | Replay Attacks | MEDIUM | Idempotency & OCC | `SqliteTransactionRunner`, `CoreRuntime` | **MITIGATED** |
| **TM-10** | Event Tampering | HIGH | Append-Only EventStore | `SqliteEventStore` | **MITIGATED** |
| **TM-11** | Resource Exhaustion | HIGH | Coordination Limits & Timeouts | `CoordinationRequest`, `SecurityBoundaryEnforcer` | **MITIGATED** |
| **TM-12** | SSRF Abuse | HIGH | Risk Tiering & Policy | `deriveTrustedRiskLevel`, `PolicyGateway` | **MITIGATED (App Level)** |
| **TM-13** | Malicious Tool | CRITICAL | Risk Classification & Escape Prevention | `SecurityBoundaryEnforcer` | **MITIGATED** |
| **TM-14** | Compromised Model | MEDIUM | Schema Validation & Verifier | `evaluateVerificationOutput`, `TaskContext` | **MITIGATED** |
