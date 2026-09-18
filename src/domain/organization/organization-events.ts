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

export function createCoordinationRequestedEvent(
  coord: { id: string; tenantId: string; organizationId: string; teamId: string; sourceAgentId: string; targetAgentId: string; correlationId: string; purpose: string; version: number },
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "coordination.requested",
    traceId,
    coord.id,
    {
      coordinationId: coord.id,
      tenantId: coord.tenantId,
      organizationId: coord.organizationId,
      teamId: coord.teamId,
      sourceAgentId: coord.sourceAgentId,
      targetAgentId: coord.targetAgentId,
      correlationId: coord.correlationId,
      purpose: coord.purpose,
      version: coord.version,
    }
  );
}

export function createCoordinationAuthorizedEvent(
  coord: { id: string; tenantId: string; organizationId: string; teamId: string; sourceAgentId: string; targetAgentId: string; correlationId: string; version: number },
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "coordination.authorized",
    traceId,
    coord.id,
    {
      coordinationId: coord.id,
      tenantId: coord.tenantId,
      organizationId: coord.organizationId,
      teamId: coord.teamId,
      sourceAgentId: coord.sourceAgentId,
      targetAgentId: coord.targetAgentId,
      correlationId: coord.correlationId,
      version: coord.version,
    }
  );
}

export function createCoordinationRejectedEvent(
  coordId: string,
  tenantId: string,
  teamId: string,
  sourceAgentId: string,
  targetAgentId: string,
  reason: string,
  code: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "coordination.rejected",
    traceId,
    coordId,
    {
      coordinationId: coordId,
      tenantId,
      teamId,
      sourceAgentId,
      targetAgentId,
      reason,
      code,
    }
  );
}

export function createCoordinationStartedEvent(
  coord: { id: string; tenantId: string; organizationId: string; teamId: string; sourceAgentId: string; targetAgentId: string; correlationId: string; childExecutionId?: string | undefined; version: number },
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "coordination.started",
    traceId,
    coord.id,
    {
      coordinationId: coord.id,
      tenantId: coord.tenantId,
      organizationId: coord.organizationId,
      teamId: coord.teamId,
      sourceAgentId: coord.sourceAgentId,
      targetAgentId: coord.targetAgentId,
      correlationId: coord.correlationId,
      childExecutionId: coord.childExecutionId,
      version: coord.version,
    }
  );
}

export function createCoordinationCompletedEvent(
  coord: { id: string; tenantId: string; organizationId: string; teamId: string; sourceAgentId: string; targetAgentId: string; correlationId: string; childExecutionId?: string | undefined; version: number },
  output: Readonly<Record<string, unknown>>,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "coordination.completed",
    traceId,
    coord.id,
    {
      coordinationId: coord.id,
      tenantId: coord.tenantId,
      organizationId: coord.organizationId,
      teamId: coord.teamId,
      sourceAgentId: coord.sourceAgentId,
      targetAgentId: coord.targetAgentId,
      correlationId: coord.correlationId,
      childExecutionId: coord.childExecutionId,
      outputSummary: { hasOutput: Boolean(output) },
      version: coord.version,
    }
  );
}

export function createCoordinationFailedEvent(
  coord: { id: string; tenantId: string; organizationId: string; teamId: string; sourceAgentId: string; targetAgentId: string; correlationId: string; childExecutionId?: string | undefined; version: number },
  code: string,
  message: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "coordination.failed",
    traceId,
    coord.id,
    {
      coordinationId: coord.id,
      tenantId: coord.tenantId,
      organizationId: coord.organizationId,
      teamId: coord.teamId,
      sourceAgentId: coord.sourceAgentId,
      targetAgentId: coord.targetAgentId,
      correlationId: coord.correlationId,
      childExecutionId: coord.childExecutionId,
      code,
      message,
      version: coord.version,
    }
  );
}

// --- Agent Profile & Capability Events (Prompt 110) ---

export function createAgentProfileCreatedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; role: string; responsibilities: readonly string[]; capabilities: readonly any[]; status: string; version: number },
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.profile.created",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      role: profile.role,
      responsibilities: profile.responsibilities,
      capabilitiesCount: profile.capabilities.length,
      status: profile.status,
      version: profile.version,
    }
  );
}

export function createAgentProfileUpdatedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; role: string; responsibilities: readonly string[]; capabilities: readonly any[]; status: string; version: number },
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.profile.updated",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      role: profile.role,
      responsibilities: profile.responsibilities,
      capabilitiesCount: profile.capabilities.length,
      status: profile.status,
      version: profile.version,
    }
  );
}

export function createAgentRoleChangedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; version: number },
  previousRole: string,
  newRole: string,
  editorId: string = "system",
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.role.changed",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      previousRole,
      newRole,
      editorId,
      version: profile.version,
    }
  );
}

export function createAgentResponsibilityChangedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; version: number },
  previousResponsibilities: readonly string[],
  newResponsibilities: readonly string[],
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.responsibility.changed",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      previousResponsibilities,
      newResponsibilities,
      version: profile.version,
    }
  );
}

export function createAgentCapabilityAddedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; version: number },
  capability: { id: string; name: string; status: string; category?: string | undefined },
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.capability.added",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      capabilityId: capability.id,
      capabilityName: capability.name,
      capabilityStatus: capability.status,
      category: capability.category,
      version: profile.version,
    }
  );
}

export function createAgentCapabilityRemovedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; version: number },
  capabilityId: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.capability.removed",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      capabilityId,
      version: profile.version,
    }
  );
}

export function createAgentCapabilityVerifiedEvent(
  profile: { agentId: string; tenantId: string; organizationId: string; teamId: string; version: number },
  capabilityId: string,
  verifierId: string,
  traceId: string = crypto.randomUUID()
): DomainEvent {
  return event(
    "agent.capability.verified",
    traceId,
    profile.agentId,
    {
      agentId: profile.agentId,
      tenantId: profile.tenantId,
      organizationId: profile.organizationId,
      teamId: profile.teamId,
      capabilityId,
      verifierId,
      version: profile.version,
    }
  );
}



