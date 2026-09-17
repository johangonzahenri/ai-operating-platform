# 0027. Virtual Organization Foundation: Organization, Functional Areas, Working Teams & Agent Membership

## Status

Accepted

## Context

As the AI Operating Platform evolves towards autonomous enterprise multi-agent workflows, managing agents as flat, isolated entities becomes insufficient. Real-world organizations operate through hierarchical divisions, functional areas (e.g., Engineering, Operations, Finance), and dedicated operational teams (e.g., Core Platform, SRE, Payments Copilot). 

Furthermore, strict enterprise architectural boundaries must be enforced:
1. **Tenant ≠ Organization**: A Tenant represents the top-level billing, tenant isolation, and security perimeter. An Organization represents a logical business entity operating strictly inside a Tenant. Multiple organizations may exist within one tenant, but an organization can never cross tenant boundaries.
2. **Membership ≠ Permission**: Team membership models organizational structure, leadership, and operational assignment (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`). Team membership does NOT grant tool capabilities, model access, or bypass RBAC; security evaluation and default-deny policies remain fail-closed.
3. **Application ≠ Organization**: Applications (such as `tentaciones-commerce` or `vehicle-parts-platform`) are external consumers integrating via the Platform API. They interact with teams or agents, but are not synonymous with internal organizational structures.

## Decision

We introduce the first real layer of the Virtual Organization Foundation under `src/domain/organization/`, `src/application/organization/`, and `src/infrastructure/organization/`:

1. **Domain Aggregates & Entities**:
   - `Organization`: Logical business entity identified by `organizationId` within a `tenantId`. Supports lifecycle states: `ACTIVE`, `INACTIVE`, `ARCHIVED`. Rehydration follows formal static factory methods (`Organization.rehydrate(...)`). Soft lifecycle rules enforce that archived organizations cannot be reactivated.
   - `Area`: Functional department/division within an organization (`areaId`, `organizationId`, `tenantId`).
   - `Team`: Operational working unit within an area (`teamId`, `areaId`, `organizationId`, `tenantId`).
   - `AgentMembership`: Explicit association linking an `Agent` to a `Team` with designated roles (`LEAD`, `SPECIALIST`, `OPERATOR`, `REVIEWER`) and status (`ACTIVE`, `SUSPENDED`).
2. **Persistence & Concurrency**:
   - Port `OrganizationRepositoryPort` defining repository operations for organizations, areas, teams, and memberships.
   - `InMemoryOrganizationRepository` for high-speed unit test execution.
   - `SqliteOrganizationRepository` for durable storage using `node:sqlite` in WAL mode, compound indices, transactional atomicity, and optimistic concurrency control (OCC) version tracking.
3. **Domain Events & Observability**:
   - Emit typed, immutable domain events with correlated `traceId`:
     - `organization.created`, `organization.updated`, `organization.archived`
     - `area.created`, `area.updated`
     - `team.created`, `team.updated`
     - `agent.assigned_to_team`, `agent.removed_from_team`
4. **Platform API & Routing**:
   - RESTful endpoints strictly mounted under canonical `/api/v1/*`:
     - `/api/v1/organizations`, `/api/v1/organizations/:id`, `/api/v1/organizations/:id/areas`, `/api/v1/organizations/:id/hierarchy`
     - `/api/v1/areas/:id`, `/api/v1/areas/:id/teams`
     - `/api/v1/teams/:id`, `/api/v1/teams/:id/agents`, `/api/v1/teams/:id/agents/:agentId`
   - Strict 404 block for `/api/platform/v1/*` organization routes to enforce canonical API surface convergence.
5. **Web Control Plane & Symmetrical i18n**:
   - Interactive Organization Tree, hierarchy inspection, area/team management, and agent assignment.
   - Strict DOM manipulation (0 `innerHTML`).
   - Symmetrical translations for `es-419` and `en`.

## Consequences

- First-class structural modeling of virtual organizations, areas, teams, and agent roles.
- Cross-tenant boundaries and RBAC fail-closed invariants are preserved.
- Full traceability across hierarchy creation and team memberships via durable SQLite WAL events.
- Foundation established for subsequent phases (Task Delegation, Team Orchestration, Agent Workflows).
