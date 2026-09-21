# ADR 0048: AbortSignal Propagation for In-Flight Task Preemption

## Status
ACCEPTED

## Context
In order to resolve OAD-001 (In-Flight Task Preemption & Asynchronous AbortSignals), the AI Operating Platform requires a unified and reliable mechanism to preempt operations, particularly long-running asynchronous tasks and external integrations. Relying solely on synchronous polling is insufficient for interrupting operations in-flight (e.g., HTTP requests via ModelGateways or long-running tool executions).

## Decision
We decided to:
1. **Create a canonical `CancellationToken`** in `src/domain/execution/cancellation.ts`. This token merges synchronous polling (`isCancelled`) and asynchronous aborts by providing access to an `AbortSignal`.
2. **Propagate the `AbortSignal`** throughout the execution pipeline, particularly:
   - `CoreRuntime`
   - `ModelGateway` integrations
   - `ToolGateway` executions
3. **Support hierarchical cancellation** (parent → child token creation) so that sub-tasks or sub-agents receive cancellation automatically if the parent operation is cancelled.
4. **Record a cancellation audit trail** including source (`operator`, `budget`, `policy`, `timeout`, `parent`, `system`), message, timestamp, and propagation path for full traceability.

## Consequences
- Operations across the platform can now be interrupted mid-flight safely and promptly.
- All downstream consumers MUST be updated to accept and correctly handle the `AbortSignal` to avoid hung processes or hanging HTTP requests.
- Fail-closed security and resource management are improved as timeouts and budget exhaustion can aggressively halt work.
- We maintain traceability with detailed reasons provided upon cancellation.
