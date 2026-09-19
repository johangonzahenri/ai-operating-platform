# ADR 0038: Executive Orchestrator & Closed-Loop Business Operations

## Status
ACCEPTED

## Context
The AI Operating Platform requires an executive-level orchestration layer capable of continuously governing business operations across the hierarchy:
$$\text{Platform} \to \text{Enterprise} \to \text{Organization} \to \text{Area} \to \text{Team} \to \text{Agent}$$
$$\text{Strategy} \to \text{Objective} \to \text{Initiative} \to \text{AI Solution} \to \text{Workflow} \to \text{Agent} \to \text{Execution} \to \text{Verification} \to \text{Human Oversight} \to \text{Outcome} \to \text{KPI} \to \text{Decision}$$

Prior implementations introduced Business Foundations (Fase 67, ADR 0037), Multi-Agent Lifecycle & Coordination (Fase 65, ADR 0035), AI Solutions & Solution Blueprints (Fase 66, ADR 0036), Workflow Orchestration & Verification (Fases 62-63, ADR 0032-0033), and Human Oversight & Approval (Fase 64, ADR 0034).

However, an enterprise operating system requires a closed-loop executive orchestration cycle to detect drift in ground-truth KPIs, capture immutable operational snapshots, synthesize deterministic plans, evaluate authority boundaries, enforce human oversight tokens for high-impact actions, dispatch governed executions, verify results, measure outcome convergence, and trigger bounded replanning without uncontrolled loops or unconstrained "AI CEO" sovereign autonomy.

## Decision
We implemented the Executive Orchestrator and Closed-Loop Business Operations subsystem within `src/domain/executive/`, `src/application/executive/`, `src/infrastructure/persistence/`, `src/platform/api/`, and `src/platform-client/`.

Key architectural tenets:
1. **No Sovereign AI CEO**: The system enforces bounded executive orchestration. All actions are subject to Identity, AuthorityScope, PolicyGateway (`evaluate`), Budget limits, capability matching, deterministic verification, and Human Oversight tokens (`ApprovalRequest`).
2. **Deterministic Closed-Loop FSM**:
   $$\text{OBSERVE} \to \text{ANALYZE} \to \text{PLAN} \to \text{GOVERN} \to \text{DECIDE} \to \text{EXECUTE} \to \text{VERIFY} \to \text{MEASURE} \to \text{ADAPT}$$
   Cycles transition strictly through state machine states (`CREATED` $\to$ `OBSERVING` $\to$ `ANALYZING` $\to$ `PLANNING` $\to$ `AWAITING_APPROVAL` $\to$ `EXECUTING` $\to$ `VERIFYING` $\to$ `MEASURING` $\to$ `COMPLETED` / `REASSESSING` / `FAILED` / `BLOCKED`).
3. **Immutable Context Snapshots**: `ExecutiveContextSnapshot` captures point-in-time state of Objectives, Initiatives, Metrics, Solutions, and Workflows to ensure reproducible reasoning, deterministic governance validation, and tamper-proof audit trails.
4. **Deterministic Plan Validation**: `ExecutivePlanValidator` asserts cross-tenant boundaries, entity existence, published solution version consistency, and active workflow definitions.
5. **Bounded Replanning & Infinite Loop Trapping**: `ExecutiveCycle` enforces strict upper limits on `replanningCount <= maxReplanningAttempts` (default 3) and `maxActionsPerCycle` (default 10), failing closed with `ExecutiveCycleExhaustedError` when bounds are reached.
6. **Optimistic Concurrency Control (OCC)**: Monotonic `concurrencyVersion` across cycles, snapshots, analyses, and plans in SQLite and InMemory repositories prevents race conditions and phantom updates.
7. **Strict Multi-Tenant Isolation**: Compound keys `(id, tenantId)` and indexes `(tenant_id, enterprise_id)` guarantee zero cross-tenant leakage.

## Consequences
### Positive
- Closed-loop business operations with verified KPI convergence and automated deviation detection.
- Complete regulatory auditability with explicit Executive Decision Records and durable domain events.
- Zero npm runtime dependencies (`node:sqlite`, `node:crypto`, `node:http`).
- Full compatibility with existing PlatformClient SDK, REST API routes, and web console.

### Compliance & Invariants
- 100% strict DOM manipulation (0 `.innerHTML`).
- Full test pass across 49 test suites (1324 tests).
