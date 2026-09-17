import crypto from "node:crypto";
import { DomainEvent, event } from "../events/events.js";
import { Organization } from "./organization.js";
import { Area } from "./area.js";
import { Team } from "./team.js";
import { AgentMembership } from "./agent-membership.js";

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
