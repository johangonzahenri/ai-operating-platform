# 0007. Sequential orchestration over Execution

Date: 2026-09-06
Status: Accepted

## Decision

Represent a finite orchestration as declared Model and Tool operations executed by `SequentialOrchestrator`. The orchestrator owns ordering, controlled result bindings and stop-on-failure behavior; `Execution` remains the lifecycle and correlation authority. `OrchestratedExecutionStrategy` is the narrow bridge to `CoreRuntime`.

## Consequences

v0.4 supports only sequential declared plans. It has no planning, retries, parallelism, scheduling, distributed coordination or agent loop. A pre-cancelled plan produces a cancelled execution through the existing runtime lifecycle.
