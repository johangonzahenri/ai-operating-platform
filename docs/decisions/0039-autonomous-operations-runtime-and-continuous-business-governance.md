# ADR 0039: Autonomous Operations Runtime & Continuous Business Governance

## Status
ACCEPTED

## Context
The AI Operating Platform previously introduced Business Foundations (Fase 67, ADR 0037) and the Executive Orchestrator (Fase 68, ADR 0038) providing closed-loop business cycles. However, continuous operations require an autonomous execution runtime daemon capable of operating around the clock in an event-driven, scheduled, supervised, recoverable, idempotent, bounded, and auditable manner.

To operate safely at enterprise scale without runaway autonomy or hallucinations, the autonomous daemon must uphold fundamental structural invariants:
$$\text{Trigger} \neq \text{Decision} \neq \text{Plan} \neq \text{Execution}$$
$$\text{Autonomy} \neq \text{Authority}$$
$$\text{Identity} + \text{Authority} + \text{PolicyGateway} + \text{Budget} + \text{Agent Eligibility} + \text{Verification} + \text{Human Oversight} + \text{Audit}$$

## Decision
We implemented the Autonomous Operations Runtime and Continuous Business Governance subsystem within `src/domain/autonomous/`, `src/application/autonomous/`, `src/infrastructure/persistence/`, `src/platform/api/`, and `src/platform-client/`.

Key architectural principles:
1. **No Sovereign AI CEO**: Autonomy does not confer unrestricted authority. Triggers initiate governed cycles that must traverse PolicyGateway, Team Budgets, Agent Eligibility, Human Oversight tokens, and deterministic verification.
2. **Mutual Exclusion & Distributed Leases (`RuntimeLease`)**:
   Distributed execution leases with TTL (`ttlMs`), heartbeat renewals, and resource locking prevent overlapping or racing executions on the same enterprise/objective context across concurrent runtime worker instances.
3. **Multi-Trigger Engine (`AutonomousTrigger`)**:
   Supports `SCHEDULED` (cron-like recurring intervals), `EVENT_DRIVEN` (listening on domain events like `workflow.failed`, `metric.updated`), `THRESHOLD` (numeric metric bounds), and `MANUAL` execution modes with optimistic concurrency control.
4. **Daemon Lifecycle & Safety Halt Circuit Breaker (`AutonomousRuntimeState`)**:
   FSM states (`STOPPED` $\to$ `STARTING` $\to$ `RUNNING` $\to$ `PAUSED` $\to$ `STOPPING` $\to$ `SAFETY_HALTED`). When consecutive cycle failures exceed `maxConsecutiveFailures` (default 5), the circuit breaker automatically transitions to `SAFETY_HALTED`, ceasing all automated dispatching and emitting safety alarms.
5. **Idempotency & Window Deduplication**:
   Schedule windows (`windowKey`) and deduplication mechanisms prevent duplicate trigger firings within identical evaluation windows.
6. **Optimistic Concurrency Control (OCC) & Persistence**:
   SQLite WAL storage with compound indexes on `(tenant_id, enterprise_id)` and OCC monotonic version increments on all aggregate roots (`AutonomousTrigger`, `RuntimeLease`, `AutonomousRuntimeState`).
7. **Zero External Runtime Dependencies**:
   Constructed exclusively using Node.js standard libraries (`node:sqlite`, `node:crypto`, `node:http`).

## Consequences
### Positive
- True 24/7 continuous autonomous business operations with deterministic safety boundaries.
- Resilient distributed execution across multiple instances with guaranteed mutual exclusion.
- Comprehensive auditability and telemetry through durable domain events (`autonomous.runtime.started`, `autonomous.trigger.fired`, `autonomous.runtime.safety_halted`).
- Full end-to-end integration across REST API (`/api/v1/autonomous/*`), PlatformClient SDK, and Web UI.

### Invariants Maintained
- Zero runtime external npm dependencies.
- Strict DOM generation in UI (0 `.innerHTML`).
- Full test pass across 57 suites (1340 tests).
