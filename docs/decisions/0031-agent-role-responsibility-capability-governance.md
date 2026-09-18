# 0031. Agent Role, Responsibility & Capability Governance

## Status

Accepted

## Context

Following the establishment of the Virtual Organization Foundation (ADR 0027), Team Resource Governance (ADR 0028), and Organizational Coordination Foundation (ADR 0030), agents within the multi-tenant AI Operating Platform require formal domain governance over their functional profile, responsibilities, and verified capabilities.

Key architectural invariants must be guaranteed:
1. **Separation of Functional Model and Security Authorization**:
   - `Role ≠ Permission`: Membership roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`) define functional coordination hierarchy within a team, not security authorization or RBAC permission bypass.
   - `Responsibility ≠ Permission`: Responsibilities (`CODE_REVIEW`, `INCIDENT_RESPONSE`, etc.) designate functional job domain suitability, not access control grants.
   - `Capability ≠ Tool / Model Grant`: Capabilities represent declared/verified functional competencies (`CODE_ANALYSIS`, `FORENSIC_TRIAGE`, etc.), not direct tool or model allowlists.
   - `Discovery ≠ Authorization`: Discovering an agent by capability or responsibility does not imply permission to invoke or coordinate without PolicyGateway evaluation.
2. **Canonical Execution Chain**:
   $$\text{Organization} \to \text{Area} \to \text{Team} \to \text{Agent} \to \text{Role} \to \text{Responsibilities} \to \text{Capabilities} \to \text{Coordination} \to \text{Execution}$$
3. **Multi-Criteria Discovery & Strict Multi-Tenant Boundary**:
   Discovery of candidate agents supports multi-dimensional filtering (`tenantId`, `role`, `responsibility`, `capabilityId`, `capabilityStatus`, `teamId`, `organizationId`) strictly isolated to the caller's tenant (0 cross-tenant discovery).
4. **Optimistic Concurrency Control (OCC)**:
   Concurrent profile mutations (role changes, responsibility assignments, capability additions/verifications) are protected against lost updates via explicit OCC versioning.

## Decision

We introduce **Agent Role, Responsibility & Capability Governance** under `src/domain/organization/agent-profile.ts`, `src/application/organization/agent-profile-service.ts`, and persistence adapters `src/infrastructure/persistence/in-memory/in-memory-agent-profile-repository.ts` & `src/infrastructure/persistence/sqlite/sqlite-agent-profile-repository.ts`:

1. **Domain Aggregate (`AgentProfile`)**:
   - Manages agent organizational metadata, role, array of responsibilities, and list of typed capabilities.
   - Capability lifecycle: `DECLARED` -> `VERIFIED` -> `DISABLED`.
   - Rehydration via static `rehydrate()` with OCC version tracking.
   - Invariant validation methods: `hasResponsibility()`, `hasCapability()`, `hasVerifiedCapability()`, `addCapability()`, `verifyCapability()`, `disableCapability()`, `removeCapability()`, `updateRole()`, `updateResponsibilities()`.
2. **Application Service (`AgentProfileService`)**:
   - Enforces team existence and tenant isolation before profile creation.
   - Validates agent membership in target team and synchronizes role changes.
   - Implements multi-criteria `discoverAgents()` and `matchAgentForCoordination()`.
3. **Domain Events & Observability**:
   - `agent.profile.created`, `agent.profile.updated`, `agent.role.changed`, `agent.responsibility.changed`, `agent.capability.added`, `agent.capability.removed`, `agent.capability.verified`.
4. **Platform REST API**:
   - `GET /api/v1/agents/:id/profile`
   - `POST /api/v1/agents/:id/profile`
   - `PATCH /api/v1/agents/:id/profile`
   - `POST /api/v1/agents/:id/capabilities`
   - `POST /api/v1/agents/:id/capabilities/:capId/verify`
   - `POST /api/v1/agents/:id/capabilities/:capId/disable`
   - `DELETE /api/v1/agents/:id/capabilities/:capId`
   - `GET /api/v1/agents/discover` & `POST /api/v1/agents/discover`
5. **Platform SDK Client & Web Console**:
   - Platform client `client.agentProfiles.*` with typed DTOs.
   - Web console UI with profile visualization, capability badges, and bilingual i18n (`es-419` / `en`).

## Consequences

- Clear enterprise structure mapping agent roles, responsibilities, and verified capabilities.
- Prevents security confusion between functional suitability and access authorization.
- Deterministic multi-criteria discovery enables governed inter-agent coordination.
- Zero runtime external dependencies and complete multi-tenant isolation preserved.
