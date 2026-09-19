# 0035. Agent Lifecycle, Evaluation & Governance

## Status

Accepted

## Context

Following Workflow Orchestration & Governed Task Assignment (ADR 0032), Workflow Verification & Result Validation (ADR 0033), and Human Oversight, Approval & Escalation Governance (ADR 0034), the AI Operating Platform introduces a formal, governed subsystem for Agent Lifecycle, Evaluation, Qualification, and Execution Eligibility.

In multi-agent systems and enterprise autonomous operations, raw agent registration or unverified profile declarations are insufficient to grant execution authority. The platform enforces the fundamental architectural sequence:

$$\text{Agent} \to \text{Lifecycle State} \to \text{Evaluation / Qualification} \to \text{Capability} \to \text{Discovery} \to \text{Authorization} \to \text{Policy} \to \text{Budget} \to \text{Execution}$$

Key architectural invariants enforced:

1. **Fundamental Architectural Separation**:
   $$\text{Agent Identity} \neq \text{Agent Profile} \neq \text{Agent Lifecycle} \neq \text{Agent Evaluation} \neq \text{Capability Verification} \neq \text{Authorization} \neq \text{Execution Eligibility}$$
   - Identity proves *who* the agent is.
   - Profile declares *what* the agent is configured to do.
   - Lifecycle tracks the agent's operational maturity state.
   - Evaluation records structured, auditable assessment verdicts.
   - Capability Verification certifies specific skills against criteria.
   - Authorization verifies permissions through PolicyGateway / RBAC.
   - Execution Eligibility determines if an agent is strictly allowed to run a workflow step.

2. **Segregation of Duties & Self-Governance Protection**:
   An agent cannot evaluate itself, self-activate, mutate its own lifecycle state, or self-grant capabilities/permissions:
   $$\text{agentId} \neq \text{evaluatorPrincipalId} \quad \text{and} \quad \text{agentId} \neq \text{operatorPrincipalId}$$
   Self-governance attempts are rejected fail-closed with `SelfGovernanceError`.

3. **Lifecycle State Machine & Monotonic Governance**:
   Valid lifecycle states: `REGISTERED` $\to$ `EVALUATION_PENDING` $\to$ `VERIFIED` $\to$ `ACTIVE`.
   Controlled quarantine and exit states:
   - `SUSPENDED`: Temporarily disables execution eligibility; can return to `ACTIVE` upon human operator review.
   - `REVOKED`: Terminal state; permanently revokes execution authority.
   - `DEPRECATED`: Terminal state; preserves audit trails while preventing new task assignments.
   Invalid state transitions are rejected fail-closed with `InvalidLifecycleTransitionError`.

4. **Deterministic Evaluation Model & Version Qualification**:
   Evaluations are first-class aggregate roots bound to the specific `evaluatedProfileVersion`.
   - Types: `IDENTITY_CHECK`, `PROFILE_CHECK`, `CAPABILITY_CHECK`, `POLICY_CHECK`, `CONTRACT_CHECK`, `REGRESSION_CHECK`.
   - Verdicts: `PASS`, `FAIL`, `PENDING`, `EXPIRED`.
   - If an agent profile evolves (version increment), prior qualifications bound to stale versions are invalidated until re-evaluated.

5. **Multi-Tenant Boundary Isolation**:
   Cross-tenant lifecycle inspection, evaluation creation, state transition, or execution dispatch is strictly rejected fail-closed with `AgentLifecycleTenantMismatchError`.

6. **Optimistic Concurrency Control (OCC) & WAL Persistence**:
   Both `AgentLifecycle` and `AgentEvaluation` aggregate roots incorporate monotonic integer versioning to prevent lost updates during concurrent evaluations or operator actions.

7. **Strict Execution Guard in Workflow Orchestration**:
   The workflow orchestrator verifies execution eligibility before task assignment and step dispatch. Only `ACTIVE` agents with non-expired, valid qualifications can execute steps.

## Decision

We introduce **Agent Lifecycle, Evaluation & Governance** across `src/domain/agent/`, `src/application/agent/`, `src/application/workflow/`, `src/infrastructure/persistence/`, and `src/platform/`:

1. **Domain Layer**:
   - `AgentLifecycle`: Aggregate Root managing lifecycle state, profile version binding, last evaluation link, suspension reasons, and OCC versioning.
   - `AgentEvaluation`: Aggregate Root recording evaluation type, evaluator principal, verdict, criteria reference, evidence, expiration timestamp, and profile version qualification.
   - `AgentLifecycleErrors`: Dedicated error hierarchy (`AgentLifecycleError`, `AgentLifecycleValidationError`, `AgentLifecycleNotFoundError`, `AgentEvaluationNotFoundError`, `InvalidLifecycleTransitionError`, `AgentSuspendedError`, `AgentRevokedError`, `AgentDeprecatedError`, `AgentNotQualifiedError`, `AgentEvaluationExpiredError`, `SelfGovernanceError`, `AgentLifecycleConcurrencyConflictError`, `AgentEvaluationConcurrencyConflictError`, `AgentEligibilityDeniedError`, `AgentLifecycleTenantMismatchError`).
   - Domain events: `agent.evaluation.requested`, `agent.evaluation.completed`, `agent.evaluation.expired`, `agent.suspended`, `agent.activated`, `agent.revoked`, `agent.deprecated`.

2. **Application Layer**:
   - `AgentLifecycleRepositoryPort` and `AgentEvaluationRepositoryPort`: Formal ports.
   - `AgentLifecycleService`: Core governance service for lifecycle state management, evaluations, qualification checks, expiration sweeps, and `checkEligibility()`.
   - `WorkflowOrchestratorService`: Updated to guard step execution against agent eligibility.

3. **Infrastructure & Persistence Layer**:
   - `InMemoryAgentLifecycleRepository` & `InMemoryAgentEvaluationRepository`: In-memory implementations with OCC.
   - `SqliteAgentLifecycleRepository` & `SqliteAgentEvaluationRepository`: Durable SQLite WAL storage with tables `agent_lifecycles` and `agent_evaluations` and multi-tenant indexes.

4. **Platform REST API, Client SDK & UI**:
   - REST endpoints: `GET /api/v1/agents/:id/lifecycle`, `POST /api/v1/agents/:id/lifecycle/transition`, `POST /api/v1/agents/:id/evaluations`, `GET /api/v1/agents/:id/evaluations`, `GET /api/v1/agents/:id/evaluations/latest`, `POST /api/v1/agents/:id/evaluations/:evalId/complete`, `GET /api/v1/agents/:id/eligibility`.
   - Typed client SDK: `client.agentLifecycle.*` and `client.agentEvaluations.*`.
   - Web API client methods in `api-client.js` and bilingual translations in `locale-en.js` and `locale-es-419.js`.

## Consequences

- Agent execution is formally protected against unverified, suspended, revoked, deprecated, or self-governed agents.
- Qualification is deterministically bound to specific profile versions and criteria.
- Complete auditability and multi-tenant isolation are guaranteed across all lifecycle events and evaluations.
- Preserves 0 external runtime npm dependencies (`node:*` only) and 0 `.innerHTML` in UI.
