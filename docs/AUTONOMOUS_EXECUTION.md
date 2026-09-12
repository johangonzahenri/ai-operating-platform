# Controlled Autonomous Execution

Autonomous execution preserves the existing Core boundaries:

* LLM decides a structured tool call.
* Core validates the registered schema.
* Policy authorizes the operation.
* `RegistryToolGateway` dispatches the tool.
* The EventPublisher observes the lifecycle.
* The observation is sent back to the provider-neutral gateway.

No provider can mutate the registry, policy, event store, credentials,
filesystem, or database. Tool definitions are derived from the agent's
authorized tool list. The same `traceId`, `taskId`, and `executionId` are
retained across all turns.

Execution limits are centralized in `execution-limits.ts` and validated as
finite positive integers: `MAX_TOOL_CALLS`, `MAX_TOOL_ROUNDS`, and
`MAX_EXECUTION_TIME` (milliseconds). Model, tool, and total execution timeout
boundaries are separate; completed operations clear their timers.

Tentaciones remains an external application. Its adapter calls Platform API;
product discovery and catalog ownership remain in Tentaciones.
