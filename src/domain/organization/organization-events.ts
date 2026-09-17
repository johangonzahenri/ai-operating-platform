import crypto from "node:crypto";
import { DomainEvent, event } from "../events/events.js";
import { Organization } from "./organization.js";
import { Area } from "./area.js";
import { Team } from "./team.js";
import { AgentMembership } from "./agent-membership.js";
import { TeamResourceBudget, ResourceConsumptionRequest } from "./team-resource-budget.js";


export function createOrganizationCreatedEvent(org: Organization, traceId: string = crypto.randomUUID()): DomainEvent {
  return event(
    "organization.created",
    traceId,
    org.id,
    {
      organizationId: org.id,
      tenantId: org.tenantId,
      name: org.name,
      status: org.status,
      version: org.version,
    }
  );
}

export function createOrganizationUpdatedEvent(org: Organization, traceId: string = crypto.randomUUID()): DomainEvent {
  return event(
    "organization.updated",
    traceId,
    org.id,
    {
      organizationId: org.id,
      tenantId: org.tenantId,
      name: org.name,
      status: org.status,
      version: org.version,
    }
  );
}

export function createOrganizationStatusChangedEvent(
  org: Organization,
  previousStatus: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "organization.status_changed",
    traceId,
    org.id,
    {
      organizationId: org.id,
      tenantId: org.tenantId,
      previousStatus,
      newStatus: org.status,
      version: org.version,
    }
  );
}

export function createAreaCreatedEvent(area: Area, traceId: string = crypto.randomUUID()): DomainEvent {
  return event(
    "area.created",
    traceId,
    area.id,
    {
      areaId: area.id,
      organizationId: area.organizationId,
      tenantId: area.tenantId,
      name: area.name,
      status: area.status,
      version: area.version,
    }
  );
}

export function createAreaUpdatedEvent(area: Area, traceId: string = crypto.randomUUID()): DomainEvent {
  return event(
    "area.updated",
    traceId,
    area.id,
    {
      areaId: area.id,
      organizationId: area.organizationId,
      tenantId: area.tenantId,
      name: area.name,
      status: area.status,
      version: area.version,
    }
  );
}

export function createTeamCreatedEvent(team: Team, traceId: string = crypto.randomUUID()): DomainEvent {
  return event(
    "team.created",
    traceId,
    team.id,
    {
      teamId: team.id,
      areaId: team.areaId,
      organizationId: team.organizationId,
      tenantId: team.tenantId,
      name: team.name,
      status: team.status,
      version: team.version,
    }
  );
}

export function createTeamUpdatedEvent(team: Team, traceId: string = crypto.randomUUID()): DomainEvent {
  return event(
    "team.updated",
    traceId,
    team.id,
    {
      teamId: team.id,
      areaId: team.areaId,
      organizationId: team.organizationId,
      tenantId: team.tenantId,
      name: team.name,
      status: team.status,
      version: team.version,
    }
  );
}

export function createAgentAssignedToTeamEvent(
  membership: AgentMembership,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.assigned_to_team",
    traceId,
    membership.id,
    {
      membershipId: membership.id,
      teamId: membership.teamId,
      agentId: membership.agentId,
      organizationId: membership.organizationId,
      tenantId: membership.tenantId,
      role: membership.role,
      status: membership.status,
    }
  );
}

export function createAgentRemovedFromTeamEvent(
  membership: AgentMembership,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.removed_from_team",
    traceId,
    membership.id,
    {
      membershipId: membership.id,
      teamId: membership.teamId,
      agentId: membership.agentId,
      organizationId: membership.organizationId,
      tenantId: membership.tenantId,
      role: membership.role,
      status: membership.status,
    }
  );
}

export function createTeamBudgetCreatedEvent(
  budget: TeamResourceBudget,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "team.budget.created",
    traceId,
    budget.id,
    {
      budgetId: budget.id,
      teamId: budget.teamId,
      organizationId: budget.organizationId,
      tenantId: budget.tenantId,
      limits: budget.limits,
      window: budget.window,
      status: budget.status,
      version: budget.version,
    }
  );
}

export function createTeamBudgetUpdatedEvent(
  budget: TeamResourceBudget,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "team.budget.updated",
    traceId,
    budget.id,
    {
      budgetId: budget.id,
      teamId: budget.teamId,
      organizationId: budget.organizationId,
      tenantId: budget.tenantId,
      limits: budget.limits,
      consumed: budget.consumed,
      window: budget.window,
      status: budget.status,
      version: budget.version,
    }
  );
}

export function createTeamBudgetExhaustedEvent(
  budget: TeamResourceBudget,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "team.budget.exhausted",
    traceId,
    budget.id,
    {
      budgetId: budget.id,
      teamId: budget.teamId,
      organizationId: budget.organizationId,
      tenantId: budget.tenantId,
      consumed: budget.consumed,
      limits: budget.limits,
      version: budget.version,
    }
  );
}

export function createTeamBudgetStatusChangedEvent(
  budget: TeamResourceBudget,
  previousStatus: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "team.budget.status_changed",
    traceId,
    budget.id,
    {
      budgetId: budget.id,
      teamId: budget.teamId,
      organizationId: budget.organizationId,
      tenantId: budget.tenantId,
      previousStatus,
      newStatus: budget.status,
      version: budget.version,
    }
  );
}

export function createTeamResourceConsumptionAuthorizedEvent(
  budget: TeamResourceBudget,
  requested: ResourceConsumptionRequest,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "team.resource.consumption.authorized",
    traceId,
    budget.id,
    {
      budgetId: budget.id,
      teamId: budget.teamId,
      tenantId: budget.tenantId,
      requested,
      remaining: budget.getRemaining(),
      version: budget.version,
    }
  );
}

export function createTeamResourceConsumptionDeniedEvent(
  teamId: string,
  tenantId: string,
  requested: ResourceConsumptionRequest,
  reason: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "team.resource.consumption.denied",
    traceId,
    teamId,
    {
      teamId,
      tenantId,
      requested,
      reason,
    }
  );
}

