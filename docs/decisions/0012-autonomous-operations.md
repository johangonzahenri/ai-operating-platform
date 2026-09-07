# 0012. Bounded Autonomous Operations Architecture

Date: 2026-09-07
Status: Proposed (v0.9 Baseline)

## Context

With milestone v0.8 establishing `Agent` as a governed domain capability operating over `CoreRuntime`, the platform requires multi-step autonomous problem solving. However, autonomous behavior introduces substantial architectural risks: infinite loops, unbounded resource consumption, runaway tool execution, and unverified actions.

## Decision

1. **Separation of Concerns**: We explicitly separate `Agent` (the operational capability profile) from `AutonomousOperation` (the bounded multi-step supervisor). An Agent is NOT an autonomous loop.
2. **Strict Budgeting (Boundedness)**: Every autonomous operation must define an immutable `AutonomyBudget` (`maxSteps`, `maxDurationMs`, `maxToolCalls`). The system halts immediately with status `EXHAUSTED` if any limit is reached.
3. **Continuous Governance (Policy Per Step)**: Every planner decision must be approved by `PolicyGateway` before execution. If denied, the operation halts fail-closed.
4. **Execution Through CoreRuntime**: Every step of an autonomous operation is executed as a standard `Task` through `CoreRuntime` and `AgentExecutionStrategy`. No parallel execution engine is introduced.
5. **Strict Prohibitions**:
   - No self-modifying agents.
   - No recursive agent creation or swarm mesh networks.
   - No unconstrained background processes.

## Consequences

- The platform gains governed, multi-step problem solving without compromising architectural predictability or observability.
- All steps remain traceable through existing `traceId`, `taskId`, and `executionId` correlations in `AuditLog`.
- Autonomous operations cannot spiral out of control due to deterministic budget exhaustion.
