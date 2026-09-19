# 0037. AI Enterprise Operating System & Executive Governance Foundation

## Status

Accepted

## Context

Following AI Solutions Factory & Blueprint Governance (ADR 0036), the AI Operating Platform evolves towards an autonomous enterprise operating system driven by governed AI agents.

Long-term strategic vision of the platform:
To construct a platform capable of creating, running, and governing entire enterprises through verifiable AI agents, while maintaining absolute human oversight, deterministic auditing, cryptographic identity boundaries, and multi-tenant security guarantees.

The platform enforces the fundamental strategic alignment sequence:

$$\text{Strategy} \to \text{Objective} \to \text{Initiative} \to \text{Solution} \to \text{Workflow} \to \text{Agent} \to \text{Execution} \to \text{Verification} \to \text{Human Oversight} \to \text{Outcome} \to \text{KPI} \to \text{Decision}$$

Key architectural invariants enforced:

1. **Fundamental Architectural Separation**:
   $$\text{Platform} \neq \text{Enterprise} \neq \text{Organization} \neq \text{Area} \neq \text{Team} \neq \text{Agent} \neq \text{Solution} \neq \text{Workflow} \neq \text{Objective} \neq \text{Initiative} \neq \text{Decision} \neq \text{Execution}$$
   - Platform: Technical multi-tenant infrastructure hosting organizations, engines, and security planes.
   - Enterprise: Top-level autonomous business entity holding corporate vision, strategic mission, and high-level objectives.
   - Organization / Area / Team: Hierarchical organizational units managing agents and operational compute budgets.
   - BusinessObjective: Governed strategic, operational, or tactical target with deterministic lifecycle states and KPI metrics.
   - BusinessInitiative: Strategic program connecting objectives to executable AI Solutions and Workflows.
   - BusinessMetric (KPI): Verifiable business metric with mandatory ground-truth source provenance.
   - ExecutiveDecisionRecord: Formal, immutable record of executive decisions (WHO, WHAT, UNDER WHAT AUTHORITY, UNDER WHICH POLICY).

2. **No Sovereign "AI CEO" & Autonomy Guardrails**:
   Autonomous actions are strictly bounded by Identity, Authority Scope, Policy Gateway, Resource Budget, Verification, and Human Oversight.
   High-impact actions (`STRATEGIC_OBJECTIVE_MUTATION`, `FINANCIAL_TRANSFER`, `POLICY_MUTATION`, etc.) strictly require human approval across all autonomy levels (`LEVEL_0_MANUAL` to `LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS`).

3. **Ground-Truth KPI Verification**:
   Business metrics must originate from explicit source systems (e.g. audited billing, CRM, verification reports). Fabricated metrics or missing sources are rejected fail-closed.
   Gaps are deterministically calculated as $\text{targetValue} - \text{currentValue}$.

4. **Multi-Tenant Boundary Isolation**:
   All business aggregate roots (`Enterprise`, `BusinessObjective`, `BusinessInitiative`, `BusinessMetric`, `ExecutiveDecisionRecord`) enforce strict tenant isolation across memory, queries, and SQLite storage.

5. **Optimistic Concurrency Control (OCC) & SQLite WAL Persistence**:
   All aggregates use monotonic integer versioning with SQLite WAL tables indexed by multi-tenant compound keys (`(tenant_id, id)`).

## Decision

We implement the **AI Enterprise Operating System & Executive Governance Foundation** across domain, application, infrastructure, API, SDK, and web interfaces:

1. **Domain Layer (`src/domain/business/`)**:
   - `Enterprise`: Top-level aggregate root managing identity, mission, vision, and status.
   - `BusinessObjective`: Aggregate root with FSM (`DRAFT` $\to$ `ACTIVE` $\to$ `AT_RISK` $\to$ `ACHIEVED` | `MISSED` | `CANCELLED` $\to$ `ARCHIVED`).
   - `BusinessInitiative`: Aggregate root connecting objectives to solutions and workflows (`PLANNED` $\to$ `ACTIVE` $\to$ `BLOCKED` $\to$ `COMPLETED` | `CANCELLED`).
   - `BusinessMetric`: KPI aggregate root with mandatory source provenance and gap calculations.
   - `ExecutiveDecisionRecord`: Immutable governance decision record with authority provenance.
   - `AutonomyLevel`: Progressive taxonomy and high-impact action gating helpers.
   - Typed error hierarchy and domain event factories (`enterprise.created`, `objective.created`, `initiative.created`, `metric.updated`, `decision.recorded`).

2. **Application Layer (`src/application/business/` & `src/application/ports/`)**:
   - `BusinessRepositoryPort`: Interfaces for enterprise, objective, initiative, metric, and decision persistence.
   - `EnterpriseOperatingService`: Orchestration service managing business lifecycles and `BusinessOperatingContext` aggregation.

3. **Infrastructure Layer (`src/infrastructure/persistence/`)**:
   - In-memory repositories with OCC.
   - SQLite WAL repositories for `enterprises`, `business_objectives`, `business_initiatives`, `business_metrics`, and `executive_decision_records`.

4. **Platform, API & SDK**:
   - REST API endpoints under `/api/v1/business/*`.
   - Typed SDK methods under `client.business.*`.
   - Web API client wrappers in `api-client.js`.
   - Internationalization keys in English and Spanish.

## Consequences

- Full strategic alignment from vision to agent execution is established and auditable.
- Executive governance decisions are bound to explicit authority delegations and policy gateways.
- 0 runtime external npm dependencies (`node:*` standard library only).
- Zero `.innerHTML` usage throughout web interfaces.
