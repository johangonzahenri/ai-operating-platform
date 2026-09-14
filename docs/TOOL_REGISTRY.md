# Dynamic Tool Registry & Tool Invocation Runtime

## 1. Overview & Architectural Principle

In the AI Operating Platform, the relationship between AI models and execution is governed by the core invariant:

\\\	ext
The Model PROPOSES ──► The Validator VERIFIES ──► The Policy AUTHORIZES ──► The Runtime EXECUTES
\\\

Models never execute tools directly. Tool execution is handled by the deterministic, boundary-enforced \ToolInvocationRuntime\ operating over an isolated, versioned \ToolRegistry\.

\\\mermaid
flowchart TD
    LLM["LLM / Planner (Proposes Step)"] -->|"PlanStep"| PEE["PlanExecutionEngine (DAG Scheduler)"]
    PEE -->|"SecureToolInvocationRequest"| TIR["ToolInvocationRuntime"]
    TIR -->|"1. Resolve Tool & Version"| TR["ToolRegistry (Dynamic / Versioned)"]
    TIR -->|"2. Pre-execution Security Check"| SBE["SecurityBoundaryEnforcer (RBAC & Tenant)"]
    TIR -->|"3. Policy Check"| PG["PolicyGateway (Preflight Validation)"]
    TIR -->|"4. Human Approval Hook"| HA{"Critical Risk / Approval Required?"}
    HA -->|"No Approval Token"| REJ["Reject (ToolApprovalRequiredError)"]
    HA -->|"Verified Token"| VAL["5. Input Schema & Prototype Check"]
    VAL -->|"6. Timed Execution & Cancellation"| EXEC["Tool Execution Handler (Sandboxed)"]
    EXEC -->|"7. Output Schema & Sanitization"| SAN["Enforce Bounded Data & Redact Secrets"]
    SAN -->|"8. ToolExecutionResult"| PEE
    SAN -->|"Audit Event"| ES["Durable EventStore"]
\\\

---

## 2. Dynamic Tool Registry (\ToolRegistry\)

The \InMemoryToolRegistry\ provides dynamic, versioned registration and safe discovery of platform tools.

### Key Capabilities:
- **Semantic Versioning**: Supports multiple versions per \	oolId\ (e.g., \calculator@1.0.0\, \calculator@2.0.0\). Querying without a version resolves to the latest registered version.
- **Duplicate Protection**: Re-registering the same \(toolId, version)\ tuple throws \ToolAlreadyExistsError\.
- **Dynamic Unregistration**: \unregister(toolId, version?)\ removes specific versions or all versions of a tool.
- **Safe Public Discovery**: \discoverSafeDefinitions(securityContext)\ strips all sensitive metadata (\piKey\, \endpoint\, \secrets\, \credentials\) and filters definitions based on caller permissions and tenant isolation.
- **Schema Validation**: Validates inputs against JSON schema definitions and rejects extra or mismatched fields fail-closed.

---

## 3. Tool Invocation Runtime (\ToolInvocationRuntime\)

Every tool invocation executes through an 8-stage secure pipeline:

1. **Resolution**: Looks up the tool in \ToolRegistry\ by \	oolId\ and optional \ersion\. Throws \ToolNotFoundError\ or \ToolVersionNotFoundError\ if missing.
2. **Authorization**: Evaluates caller identity strictly from \SecurityContext\ via \SecurityBoundaryEnforcer.enforceToolBoundary\ (or fallback RBAC).
3. **Policy Gateway Preflight**: Runs policy evaluation against tenant constraints, operation limits, and risk levels.
4. **Human-in-the-Loop Approval**: Tools with \iskLevel: "CRITICAL"\ or \equiresApproval: true\ require a valid, non-empty \pprovalToken\. Missing tokens trigger \ToolApprovalRequiredError\ and emit \	ool.approval_required\.
5. **Input Validation & Security Guard**:
   - Deep-checks inputs against prototype pollution (\__proto__\, \constructor\, \prototype\).
   - Rejects unpermitted schema properties and type mismatches.
   - Enforces \MAX_TOOL_INPUT_SIZE\ (64KB).
6. **Bounded Execution & Cancellation**:
   - Enforces per-tool execution timeouts (default 30s, max 300s).
   - Listens to \CancellationToken\ before invocation and during execution.
7. **Output Validation & Sanitization**:
   - Validates outputs against declared \outputSchema\.
   - Truncates oversized payloads (\MAX_TOOL_OUTPUT_SIZE = 1MB\).
   - Deep freezes output and recursively redacts credentials and tokens.
8. **Audit Trail**: Emits structured domain events (\	ool.invocation.requested\, \	ool.authorized\, \	ool.rejected\, \	ool.execution.timed_out\, \	ool.execution.cancelled\).

---

## 4. Plan Execution Engine (\PlanExecutionEngine\)

The \PlanExecutionEngine\ takes a DAG-validated \Plan\ and coordinates sequential and concurrent step execution.

### Execution Guarantees:
- **Topological Traversal**: Steps run only after all declared \dependencies\ have completed successfully (\COMPLETED\).
- **Output Dependency Propagation**: Step inputs can reference prior outputs via standard expressions (e.g. \_dep_step1.value\), which are automatically resolved from predecessor outputs.
- **Failure Cascading**: When a step fails with \llowPartialBranchFailure: false\, subsequent dependent steps are marked \SKIPPED\ and the execution transitions to \FAILED\.
- **Cancellation Propagation**: When a \CancellationToken\ is cancelled, running steps are aborted and pending steps are marked \CANCELLED\.
