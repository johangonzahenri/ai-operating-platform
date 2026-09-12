# Multi-Agent Coordination Runtime

The platform now provides a minimal, bounded coordination application service for the
operations diagnostic use case:

`coordination request -> coordinator -> agent -> bounded handoff -> next agent -> deterministic result`

`MultiAgentCoordinator` is the only component that selects and sequences agents. Agents
never invoke one another directly. Each step is executed through the existing `Runtime`,
which remains the sole owner of each child `Task` and `Execution` lifecycle. The
coordination request supplies the parent task and correlation identifiers; child tasks
share the correlation ID and remain independently observable and recoverable.

The runtime accepts at most four distinct agents and three handoffs, has one coordinator
level, sanitizes handoff payloads with the shared bounded-data limits, and performs no
automatic retries or recursive spawning. Policy is evaluated before every agent step.
Cancellation and a request timeout produce terminal coordination results without
inventing a second execution lifecycle.

Handoffs are bounded coordination data, not Memory, EventStore records, or a second model
conversation history. Events contain coordination metadata and identifiers only; payload
values are not published.
