# 0028. Team Resource Governance: Budgets, Quotas & Atomic Consumption Control

## Status

Accepted

## Context

Following the establishment of the Virtual Organization Foundation (ADR 0027), operational teams (`Team`) require explicit resource consumption governance. In an enterprise environment, autonomous agent operations, model inferences, tool calls, and execution steps cannot run unconstrained without risking quota exhaustion, cost overruns, or starvation of other functional units.

Key governance invariants must be maintained:
1. **Separation of Concerns**:
   - `Membership ≠ Permission`: Membership in a team does not grant authorization.
   - `Membership ≠ Budget`: Team membership assigns operational responsibility, but resource budgets govern the aggregate team envelope.
   - `Budget ≠ Authorization`: Having available budget does not bypass security evaluation (`PolicyGateway` / RBAC).
2. **Canonical Execution Chain**:
   `Identity` -> `Tenant isolation` -> `Org context` -> `Team context` -> `Policy evaluation` -> `Resource budget evaluation` -> `AutonomyBudget / execution constraints` -> `Model / Tool invocation`.
3. **Fail-Closed Default**:
   If a team has no budget configured or if its budget is exhausted or suspended, operations are rejected immediately (`NO BUDGET = DENY`).
4. **Last-Unit Race Condition Concurrency Safety**:
   When multiple concurrent operations compete for the final remaining resource unit, execution must deterministically grant exactly 1 `ALLOW` and reject the rest with `DENY`.
5. **No Speculative Metrics**:
   Budget limits and consumption track verified measurements (executions, model calls, tool calls, autonomous steps, duration in milliseconds, and real tokens when available).

## Decision

We introduce **Team Resource Governance & Budget Control** under `src/domain/organization/team-resource-budget.ts`, `src/application/organization/team-resource-budget-service.ts`, and `src/infrastructure/persistence/sqlite/sqlite-team-resource-budget-repository.ts`:

1. **Domain Aggregate (`TeamResourceBudget`)**:
   - Manages bounded operational limits: `maxExecutions`, `maxModelCalls`, `maxToolCalls`, `maxAutonomousSteps`, `maxDurationMs`, `maxTokens`.
   - Tracks immutable consumed counters with OCC versioning (`version: number`).
   - Lifecycle states: `ACTIVE`, `EXHAUSTED`, `SUSPENDED`.
   - Windows: `LIFETIME`, `DAILY`, `MONTHLY`.
   - Domain methods: `canConsume(request)`, `consume(request)`, `updateLimits(limits)`, `suspend()`, `reactivate()`, `getRemaining()`, `isExhausted()`.
2. **Persistence & Atomic Transactions**:
   - Port `TeamResourceBudgetRepositoryPort`.
   - `InMemoryTeamResourceBudgetRepository` for fast unit tests.
   - `SqliteTeamResourceBudgetRepository` with table `team_resource_budgets`, unique index `(team_id, tenant_id)`, and atomic `BEGIN IMMEDIATE` transactions to prevent check-and-consume race conditions.
3. **Domain Events & Observability**:
   - `team.budget.created`, `team.budget.updated`, `team.budget.exhausted`, `team.budget.status_changed`
   - `team.resource.consumption.authorized`, `team.resource.consumption.denied`
4. **Platform REST API**:
   - `GET /api/v1/teams/:id/budget`
   - `POST /api/v1/teams/:id/budget`
   - `PATCH /api/v1/teams/:id/budget`
   - `POST /api/v1/teams/:id/budget/authorize`
   - `POST /api/v1/teams/:id/budget/consume`
   - Strict 404 for `/api/platform/v1/*` routes.
5. **Web Control Plane & Symmetrical i18n**:
   - Team budget metrics, quota usage visualization, suspend/reactivate toggles in Team detail view (0 `innerHTML`).
   - Symmetrical translations in `locale-es-419.js` and `locale-en.js`.

## Consequences

- Teams operate within explicit, deterministic resource envelopes.
- Last-unit concurrency safety prevents over-quota execution.
- Clear separation between runtime `AutonomyBudget` (per-step execution constraint) and aggregate `TeamResourceBudget` (team quota envelope).
- Complete telemetry and audit trail for resource consumption decisions.
