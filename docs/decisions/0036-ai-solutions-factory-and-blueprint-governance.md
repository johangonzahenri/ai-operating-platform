# 0036. AI Solutions Factory & Application Blueprint Governance

## Status

Accepted

## Context

Following Workflow Orchestration & Governed Task Assignment (ADR 0032), Workflow Verification & Result Validation (ADR 0033), Human Oversight, Approval & Escalation Governance (ADR 0034), and Agent Lifecycle, Evaluation & Governance (ADR 0035), the AI Operating Platform introduces a formal, governed subsystem for **AI Solutions Factory & Application Blueprint Governance**.

Enterprises require composite AI solutions that package interconnected workflows, qualified agents, verified capabilities, authorization policies, verification rules, and human oversight approvals into reproducible, versioned, and immutable architectural blueprints.

The platform enforces the fundamental architectural sequence:

$$\text{AI Solution} \to \text{Blueprint} \to \text{Workflows} \to \text{Agents} \to \text{Capabilities} \to \text{Tools / Model Grants} \to \text{Policies} \to \text{Verification} \to \text{Human Oversight} \to \text{Observability}$$

Key architectural invariants enforced:

1. **Fundamental Architectural Separation**:
   $$\text{AI Solution} \neq \text{Application Runtime} \neq \text{Blueprint} \neq \text{Execution} \neq \text{Template} \neq \text{Deployment} \neq \text{Solution Instance}$$
   - AI Solution: Aggregate root managing lifecycle states, version lineage, and owner governance.
   - Blueprint: Immutable structural declaration of dependencies, workflows, agents, capabilities, policies, verifications, adapters, and observability rules.
   - Solution Instance: Concrete, configured deployment of a published solution version for a specific operational runtime.
   - Workflow & Execution: Underlying runtime engines orchestrating tasks and evaluating deterministic rules.

2. **Publish Gate & Deterministic Validation Engine**:
   A solution cannot transition from `DRAFT` to `PUBLISHED` without passing a deterministic validation report (`valid: true`):
   - Every referenced workflow must exist in the same tenant and be in `ACTIVE` state.
   - Every required agent must exist, have an `ACTIVE` lifecycle state, and hold `VERIFIED` status for all required capabilities.
   - Every required capability must exist in the platform catalog or be verified on an active agent.
   - Verification requirements must mandate `requiredVerdict: "PASS"`.
   - Directed acyclic graph (DAG) cycle checks ensure workflow dependencies are acyclic.

3. **Immutability of Published Solution Versions**:
   Published versions are permanently frozen. Modifications require branching a new draft version (e.g., v1 $\to$ v2), ensuring strict reproducibility for audit and enterprise compliance.

4. **Solution Lifecycle State Machine**:
   - `DRAFT`: Editable blueprint composition.
   - `VALIDATING`: Transient validation execution.
   - `VALIDATED`: Validation passed, ready for publication.
   - `PUBLISHED`: Frozen, reproducible, ready for instantiation.
   - `ARCHIVED`: Terminal archived state.
   - `DEPRECATED`: Deprecated for new instances, audit preserved.

5. **Multi-Tenant Boundary Isolation**:
   Cross-tenant solution inspection, blueprint cross-referencing, validation, branching, or instantiation is strictly denied fail-closed with `SolutionTenantMismatchError` (HTTP 403/404).

6. **Optimistic Concurrency Control (OCC) & SQLite WAL Persistence**:
   Both `AISolution` and `SolutionInstance` implement monotonic integer versioning to eliminate race conditions under concurrent updates.

## Decision

We introduce **AI Solutions Factory & Application Blueprint Governance** across domain, application, infrastructure, API, SDK, and web interfaces:

1. **Domain Layer (`src/domain/solution/`)**:
   - `AISolution`: Aggregate Root managing lifecycle state, immutable blueprints per version, and OCC versioning.
   - `SolutionBlueprint`: Typed value object encapsulating workflows, required agents, required capabilities, policies, verifications, approvals, adapters, and observability.
   - `SolutionInstance`: Entity tracking deployed runtime configurations of published solution versions.
   - Typed error hierarchy (`SolutionValidationError`, `SolutionNotValidatedError`, `SolutionPublishedImmutableError`, etc.).
   - Domain event factories (`solution.created`, `solution.validated`, `solution.published`, `solution.version_created`, `solution.instance_created`, `solution.archived`, `solution.deprecated`).

2. **Application Layer (`src/application/solution/`)**:
   - `SolutionBlueprintValidator`: Deterministic cross-checking engine validating active workflows, eligible/verified agents, catalog capabilities, and cycle-free DAGs.
   - `SolutionFactoryService`: Orchestrator enforcing the Publish Gate, version branching, validation reports, and runtime instantiation.

3. **Infrastructure & Persistence Layer (`src/infrastructure/persistence/`)**:
   - `InMemoryAISolutionRepository` & `InMemoryAISolutionInstanceRepository`.
   - `SqliteAISolutionRepository` & `SqliteAISolutionInstanceRepository` with SQLite WAL mode and multi-tenant indexes.

4. **Platform, API & SDK**:
   - PlatformService wiring and DTO mapping.
   - REST endpoints under `/api/v1/solutions/*`.
   - Typed client methods under `client.solutions.*`.
   - Web API client methods and bilingual localization (`en`, `es-419`).

## Consequences

- Standardizes enterprise AI solution packaging and lifecycle governance.
- Guarantees that only structurally sound, verified, and qualified AI systems reach production runtime.
- Zero external runtime npm dependencies maintained (`node:*` standard library only).
- Zero `.innerHTML` usage maintained in frontend clients.
