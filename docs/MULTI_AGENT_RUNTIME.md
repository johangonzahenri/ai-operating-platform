# Multi-Agent Coordination Runtime v0.1

## 1. Overview

The platform provides a bounded, deterministic coordination application service for the canonical operations diagnostic use case:

```text
Diagnostic Agent -> Decision Agent -> Execution Agent -> Verification Agent
```

`MultiAgentCoordinator` is the single authority that coordinates and sequences agents. Agents never invoke one another directly, spawn child agents, or create recursive coordinator instances. Each step is executed through the existing `Runtime` (`CoreRuntime`), which remains the sole owner of each child `Task` and `Execution` lifecycle.

## 2. Hardened Architecture & Flow

```text
Coordination Request
    ↓
Coordinator Validates (Agents, Roles, Budgets, Depth)
    ↓
For each step:
  - Check Timeout & Cancellation
  - Agent Lookup (Active status)
  - Policy Authorization (`coordination.execute`)
  - Publish `coordination.agent.selected`
  - Create child Task & Execute through CoreRuntime
  - Publish `coordination.agent.completed` / `failed`
  - If Step is VERIFICATION:
      - Evaluate independent verification verdict (PASS / FAIL)
  - If next step exists:
      - Validate Target Agent & Handoff Budget
      - Create Bounded, Sanitized `AgentHandoff`
      - Publish `coordination.handoff.requested` / `accepted` (or `rejected`)
    ↓
Deterministic Aggregation
    ↓
Publish `coordination.completed` / `coordination.failed`
```

## 3. Strict Verification Semantics

The coordinator **never** forces or fabricates `verified: true` from mere execution completion.
The Verification Agent must return an explicit verdict structure:

```json
{
  "status": "PASS",
  "verified": true,
  "reason": "All health checks and metrics within normal parameters",
  "evidence": { "latencyMs": 12, "errorRate": 0 }
}
```

Verdict Evaluation Rules:
- `PASS` / `verified: true` (without conflict) -> Evaluates to PASS -> Coordination completes with `COMPLETED`.
- `FAIL` / `verified: false` -> Evaluates to FAIL -> Coordination completes with `FAILED` (`VERIFICATION_FAILED`).
- Missing verdict -> Fails closed with `VERIFICATION_MISSING`.
- Malformed output -> Fails closed with `VERIFICATION_MALFORMED`.
- Conflicting verdict (e.g. `status: "PASS"` + `verified: false`) -> Fails closed with `VERIFICATION_CONFLICT`.
- Ambiguous verdict -> Fails closed with `VERIFICATION_AMBIGUOUS`.

## 4. Hardened Bounds & Limits

| Parameter | Limit | Enforcement |
|---|---|---|
| `maxAgents` | 4 | Enforced at `CoordinationRequest.create` & runtime counter `agentsExecuted` |
| `maxHandoffs` | 3 | Enforced at `CoordinationRequest.create` & runtime counter `handoffsCreated` |
| `maxDepth` | 1 | Enforced at `CoordinationRequest.create` (depth < 1) & runtime check |
| `data.maxStringLength` | 2048 chars | Truncated with `[truncated]` |
| `data.maxDepth` | 4 levels | Truncated with `[truncated]` |
| `data.maxObjectKeys` | 64 keys | Truncated |
| Sensitive fields | Automatic | Redacted with `[redacted]` |

## 5. Implementation Status Matrix

### IMPLEMENTED
- Canonical 4-agent sequential workflow (`DIAGNOSTIC` -> `DECISION` -> `EXECUTION` -> `VERIFICATION`)
- Hardened `MultiAgentCoordinator` with runtime budget counters (`agentsExecuted`, `handoffsCreated`, `coordinationDepth`)
- Strict verification semantics with independent verdict evaluation and conflict detection
- Fail-closed agent validation (unknown, inactive, duplicate, invalid roles)
- Policy evaluation before each step with fail-closed denial (`POLICY_DENIED`)
- Bounded, sanitized, immutable `AgentHandoff` payloads
- Cross-agent context and memory isolation
- Comprehensive domain event publishing (`coordination.started`, `agent.selected`, `handoff.requested`, `handoff.accepted`, `handoff.rejected`, `agent.completed`, `agent.failed`, `completed`, `failed`)
- Request-level timeout and cancellation enforcement
- Deterministic aggregation logic
- 40 unit tests covering the complete test matrix

### NOT IMPLEMENTED / LIMITATIONS
- **COORDINATION STATE DURABILITY: NOT YET IMPLEMENTED**
  - Child `Task` and `Execution` entities are durable and recoverable via SQLite and CoreRuntime.
  - Top-level `CoordinationRequest` and `CoordinationResult` state is in-memory and ephemeral.
- **AUTOMATIC RECOVERY FOR COORDINATION SESSIONS: NOT YET IMPLEMENTED**
  - If the host process crashes mid-coordination, individual child tasks reconcile via `RestartRecoveryService`, but the top-level coordination does not automatically resume.
- **DISTRIBUTED MULTI-HOST COORDINATION: NOT YET IMPLEMENTED** (Runs in-process via CoreRuntime)

### FUTURE
- Durable Coordination Request/Session repository
- Policy-driven dynamic agent routing
- Parallel branch coordination (once authorized by architectural review)
