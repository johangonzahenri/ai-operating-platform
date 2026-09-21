# 0030. Organizational Coordination Foundation

## Status

Accepted

## Context

Following the establishment of Virtual Organizations (ADR 0027) and Team Resource Budget Governance (ADR 0028), the AI Operating Platform required a formalized mechanism for inter-agent work coordination and delegation within enterprise boundaries.

Prior to Phase 60, task executions were triggered directly against individual agents or via sequential orchestrator pipelines without formal structural boundaries connecting agent delegation to organizational units (`Organization` -> `Area` -> `Team` -> `AgentMembership`), organizational policy controls, or team-level quota enforcement.

Uncontrolled inter-agent delegation presents critical risks in multi-agent enterprise systems:
1. **Infinite Delegation Cycles**: Agent A delegates to Agent B, which delegates back to Agent A (or through a cycle $A \to B \to C \to A$), leading to resource exhaustion.
2. **Unbounded Call Trees**: Unconstrained nested delegations generating unbounded execution depth.
3. **Cross-Tenant Leakage**: Delegation requests crossing strict tenant boundaries or accessing unauthorized organizational teams.
4. **Policy Bypass**: Delegations bypassing the centralized `PolicyGateway` or executing tools/actions forbidden in the target agent's scope.
5. **Resource Runaway**: Delegations proceeding without debiting or checking team-level resource budgets.
6. **Loss of Correlation & Traceability**: Inability to reconstruct parent-child causality across distributed agent operations.

## Decision

We introduce the **Organizational Coordination Foundation** connecting virtual organizations, policy governance, team resource budgets, cycle detection, depth limits, and correlated child task execution:

1. **`AgentCoordinationRecord` Aggregate (`src/domain/organization/organizational-coordination.ts`)**:
   - Represents the complete lifecycle of an organizational coordination:
     - `REQUESTED` $\to$ `AUTHORIZED` $\to$ `DISPATCHED` $\to$ `RUNNING` $\to$ `COMPLETED` / `FAILED` / `REJECTED`
   - Incorporates **Optimistic Concurrency Control (OCC)** via monotonic integer `version` incrementing on each state mutation.
   - Enforces fail-closed validation:
     - Non-empty tenant, organization, team, source agent, target agent, and purpose.
     - Source and target agent identity must differ ($sourceAgentId \neq targetAgentId$).
     - **Cycle Detection**: Inspects delegation `history`; throws `CoordinationCycleError` if target agent is in history.
     - **Depth Limits**: Enforces `depth < maxDepth` (default maxDepth: 3); throws `CoordinationDepthExceededError`.
     - **Handoff Limits**: Enforces `handoffCount < maxHandoffs` (default maxHandoffs: 5).
     - Payload bounding and defensive immutability (`Object.freeze`, bounded data limits).

2. **`OrganizationalCoordinationService` (`src/application/organization/organizational-coordination-service.ts`)**:
   - Executes the 10-step governance pipeline:
     1. Validate Organization and Team existence and strict tenant matching.
     2. Verify source and target agents exist and have `ACTIVE` status.
     3. Verify target agent has an `ACTIVE` membership in the specified target team.
     4. Create initial `AgentCoordinationRecord` with cycle, depth, and handoff checks.
     5. Evaluate `PolicyGateway` (`coordination.execute`); reject if denied.
     6. Transition record to `AUTHORIZED`.
     7. Evaluate and atomically debit `TeamResourceBudget`; reject if exhausted or suspended.
     8. Create child `Task` correlated to parent execution/trace; transition record to `DISPATCHED`.
     9. Transition record to `RUNNING` and emit `coordination.started`.
     10. Execute child task on `Runtime`; complete with result or mark `FAILED` upon errors.

3. **Persistence Adapters (`src/infrastructure/persistence/`)**:
   - `InMemoryCoordinationRepository`: Fast in-memory aggregate storage with OCC version checking.
   - `SqliteCoordinationRepository`: Durable SQLite adapter with schema table `agent_coordinations` and OCC enforcement.

4. **REST API & Platform Client SDK (`src/platform/api/http-router.ts` & `src/platform-client/index.ts`)**:
   - `POST /api/v1/teams/:id/coordinations`: Initiates formal team coordination.
   - `GET /api/v1/teams/:id/coordinations`: Lists coordinations for a team.
   - `GET /api/v1/coordinations/:id`: Retrieves individual coordination record with strict tenant isolation.
   - Bilingual i18n support in Spanish (es-419) and English (en).

5. **Anti-Patterns Explicitly Rejected**:
   - *Autonomous Corporate Personhood*: No fake "CEO agents" or virtual company hierarchy abstractions.
   - *Cross-Tenant Delegation*: Strict 0-tolerance cross-tenant coordination.
   - *Policy Inheritance / Bypass*: Target agent retains its own sandbox, tool allowlist, and policy restrictions.
   - *Uncorrelated Execution*: Child tasks always carry the parent's `correlationId` and `traceId`.

## Consequences

### Positive
- Formal, auditable multi-agent collaboration bounded by organizational hierarchy and team membership.
- Deterministic prevention of recursion loops and runaway depth trees.
- Fail-closed security via PolicyGateway and TeamResourceBudget integration.
- Full end-to-end traceability with durable domain events.

### Neutral / Trade-offs
- Slight coordination latency overhead due to multi-step validation and budget debiting.
- Coordination records persist in durable storage, requiring eventual retention/archival policies for high-volume environments.
