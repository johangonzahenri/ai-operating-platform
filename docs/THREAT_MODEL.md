# Threat Model v0.1 — AI Operating Platform

## 1. Scope & Methodology

This threat model identifies realistic threats to the AI Operating Platform across its execution lifecycle, runtime core, agents, tools, models, memory, and persistence layers. It applies STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) tailored to autonomous and multi-agent AI systems.

---

## 2. Threat Catalog

### TM-01: Identity Spoofing
- **Description**: An untrusted caller or sub-component assumes the identity of a privileged Agent or System Principal.
- **Affected Boundaries**: Boundary A (Client $\rightarrow$ API), Boundary C (Planner $\rightarrow$ Agents).
- **Mitigation**: Strict `Principal` validation in `SecurityContext`, cryptographic verification in auth layer (Prompt 46), immutability of context identities.

### TM-02: Privilege Escalation
- **Description**: An agent with LOW-risk permissions attempts to invoke a HIGH/CRITICAL-risk tool or execute administrative tasks.
- **Affected Boundaries**: Boundary D (Agent $\rightarrow$ Tool), Boundary E (Agent $\rightarrow$ Model).
- **Mitigation**: `PolicyGateway` evaluates permissions per invocation before dispatcher execution. Agents cannot grant permissions or alter definitions.

### TM-03: Tool Abuse & Unauthorized Tool Call
- **Description**: An agent invokes a tool outside its declared capabilities or passes malicious parameters.
- **Affected Boundaries**: Boundary D (Agent $\rightarrow$ Tool).
- **Mitigation**: Registered capability check in `AgentDefinition`, input schema validation in `ToolRegistry`, pre-execution policy check.

### TM-04: Prompt Injection (Direct & Indirect)
- **Description**: Malicious user input or external web/document content attempts to override system instructions or agent roles.
- **Affected Boundaries**: Boundary A (Client $\rightarrow$ API), Boundary H (External Provider $\rightarrow$ Platform).
- **Mitigation**: Strict separation between system instructions and user inputs; prompt isolation; deterministic post-execution verification (Multi-Agent Verification step).

### TM-05: Tool Injection & Malicious Output
- **Description**: A tool output contains adversarial instructions crafted to mislead downstream decision or execution agents.
- **Affected Boundaries**: Boundary D (Tool $\rightarrow$ Runtime), Boundary F (Handoffs).
- **Mitigation**: Bounded, sanitized `AgentHandoff` payloads; independent `VerificationAgent` evaluating evidence instead of trusting LLM assertions.

### TM-06: Data Exfiltration
- **Description**: An agent attempts to send internal database state, environment variables, or other tenant data to an external provider.
- **Affected Boundaries**: Boundary E (Agent $\rightarrow$ Model), Boundary H (Platform $\rightarrow$ External).
- **Mitigation**: `BoundedDataLimits` sanitization, secret redaction, external egress policy controls.

### TM-07: Cross-Agent Memory & Context Leakage
- **Description**: Agent B reads private memory or conversational history belonging to Agent A.
- **Affected Boundaries**: Boundary F (Agent $\rightarrow$ Memory).
- **Mitigation**: Scoped isolation (`memoryScope`), ephemeral handoff payload boundaries, zero shared mutable memory bus.

### TM-08: Unauthorized Model / Provider Access
- **Description**: An agent routes requests to an unapproved or cost-prohibitive model provider.
- **Affected Boundaries**: Boundary E (Agent $\rightarrow$ Model).
- **Mitigation**: `ModelGateway` provider allowlist validation, token/budget limits per task execution.

### TM-09: Replay Attacks & Duplicate Execution
- **Description**: An attacker or recovering process repeats an operation request to cause double execution or duplicate side effects.
- **Affected Boundaries**: Boundary A (API), Boundary B (Runtime), Boundary G (Persistence).
- **Mitigation**: Deterministic `correlationId`, `operationId`, and `traceId` idempotency checks; OCC versions in storage.

### TM-10: Event & Audit Log Tampering
- **Description**: An entity attempts to alter or delete recorded operational and coordination events.
- **Affected Boundaries**: Boundary G (Runtime $\rightarrow$ Persistence).
- **Mitigation**: Append-only `SqliteEventStore`, immutable domain event schemas, sequence numbers.

### TM-11: Resource Exhaustion & Denial of Service
- **Description**: A request triggers infinite recursion, massive payload sizes, or runaway agent spawning.
- **Affected Boundaries**: Boundary B (Runtime), Boundary C (Planner).
- **Mitigation**: Runtime limits: `maxAgents=4`, `maxHandoffs=3`, `maxDepth=1`, bounded payload sizes ($2048$ chars, $4$ levels depth), execution timeouts.

### TM-12: SSRF & External Network Abuse
- **Description**: A network tool is manipulated to probe internal private network endpoints or cloud metadata services.
- **Affected Boundaries**: Boundary D (Tool $\rightarrow$ Network).
- **Mitigation**: Tool risk classification (`HIGH`/`CRITICAL`), network allowlisting, policy authorization for network capabilities.

### TM-13: Malicious Tool Implementation
- **Description**: A registered tool contains flawed logic or side effects that violate security invariants.
- **Affected Boundaries**: Boundary D (Agent $\rightarrow$ Tool).
- **Mitigation**: Tool registry authorization, isolated sandbox execution boundaries, risk-based human confirmation for CRITICAL tools.

### TM-14: Compromised Model Provider Response
- **Description**: An external LLM provider returns invalid, malformed, or hallucinated structural responses.
- **Affected Boundaries**: Boundary E (Model $\rightarrow$ Runtime).
- **Mitigation**: Structural schema validation (Zod / JSON schema), fail-closed handling in planners, verification agent validation.

---

## 3. Threat Mitigation Matrix

| Threat ID | Threat Name | Severity | Primary Mitigation Layer | Enforcing Component |
|---|---|---|---|---|
| TM-01 | Identity Spoofing | HIGH | SecurityContext & AuthN | `SecurityContext`, `Principal` |
| TM-02 | Privilege Escalation | CRITICAL | Policy Enforcement | `PolicyGateway` |
| TM-03 | Tool Abuse | HIGH | Capability Matching & Policy | `AgentExecutionStrategy`, `ToolRegistry` |
| TM-04 | Prompt Injection | HIGH | Prompt Isolation & Verification | `MultiAgentCoordinator` (Verification step) |
| TM-05 | Tool Injection | MEDIUM | Bounded Handoffs | `BoundedDataLimits`, `AgentHandoff` |
| TM-06 | Data Exfiltration | HIGH | Secret Redaction & Scoping | `sanitizeBoundedValue` |
| TM-07 | Cross-Agent Leakage | HIGH | Memory Scope Isolation | `MemoryService`, `AgentHandoff` |
| TM-08 | Unauthorized Model | MEDIUM | Provider Registry & Policy | `ModelGateway`, `ModelProviderConfig` |
| TM-09 | Replay Attacks | MEDIUM | Idempotency & OCC | `SqliteTransactionRunner`, `CoreRuntime` |
| TM-10 | Event Tampering | HIGH | Append-Only EventStore | `SqliteEventStore` |
| TM-11 | Resource Exhaustion | HIGH | Coordination Limits & Timeouts | `CoordinationRequest`, `MultiAgentCoordinator` |
| TM-12 | SSRF Abuse | HIGH | Risk Tiering & Policy | `PolicyGateway`, `ToolRegistry` |
| TM-13 | Malicious Tool | CRITICAL | Risk Classification | `PolicyGateway`, `ToolRegistry` |
| TM-14 | Compromised Model | MEDIUM | Schema Validation & Verifier | `evaluateVerificationOutput`, `LLMPlanner` |
