# 0011. Agent Architecture as a First-Class Capability

Date: 2026-09-07
Status: Accepted

## Context

In milestones v0.1 through v0.7, the platform established a single, robust execution pipeline around `Task`, `Execution`, and `CoreRuntime`, complemented by Model, Tool, Orchestration, Memory, Governance, and Observability subsystems. As we enter v0.8, the system requires an Agent capability to define operational profiles with explicit models, instructions, tool permissions, and memory scopes.

## Decision

1. **Agent is a Domain Entity, Not a Runtime**: We introduce `Agent` as a first-class domain entity and configuration capability, storing `id`, `name`, `description`, `model`, `instructions`, `tools` (whitelist), `memoryScope`, `status` (`ACTIVE`/`INACTIVE`), and `version`.
2. **Execution Invariant**: **AGENT DOES NOT REPLACE EXECUTION.** There is no secondary runtime, shadow execution context, or separate agent lifecycle. An Agent execution is an application-level orchestration through the standard `SubmitTask` use case and `CoreRuntime`.
3. **AgentExecutionStrategy**: Execution of an Agent is implemented as an `ExecutionStrategy` (`AgentExecutionStrategy`) plugged directly into `CoreRuntime`.
4. **Fail-Closed Governance & Whitelist Enforcement**: `AgentExecutionStrategy` enforces fail-closed `PolicyGateway` evaluation before execution, validates tool invocation against `agent.tools`, and confines memory operations to `agent.memoryScope`.
5. **No Autonomous Loops in v0.8**: Autonomous loops (`while(true)`, `Think -> Act -> Observe`, self-reflection, recursive swarms) are strictly prohibited in v0.8 and deferred to v0.9.

## Consequences

- Architectural integrity is preserved: the single execution lifecycle (`QUEUED` -> `RUNNING` -> `COMPLETED`/`FAILED`) remains the sole engine path.
- Tool authorization is strictly enforced at runtime: an agent cannot execute any tool not explicitly listed in its whitelist.
- Observability and Governance naturally capture Agent operations via correlated `agent.started`, `agent.completed`, and `agent.failed` events.
- External applications interact with agents exclusively via Platform API contracts (`/api/v1/agents*`), preserving hexagonal isolation.
