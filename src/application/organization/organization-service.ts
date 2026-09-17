import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { AgentQueryPort } from "../ports/query-ports.js";
import { OrganizationHierarchyRepository } from "../ports/organization-repository-port.js";
import {
  Organization,
  CreateOrganizationProps,
  UpdateOrganizationProps,
} from "../../domain/organization/organization.js";
import { Area, CreateAreaProps, UpdateAreaProps } from "../../domain/organization/area.js";
import { Team, CreateTeamProps, UpdateTeamProps } from "../../domain/organization/team.js";
import {
  AgentMembership,
  CreateAgentMembershipProps,
  MembershipRole,
} from "../../domain/organization/agent-membership.js";
import {
  OrganizationNotFoundError,
  AreaNotFoundError,
  TeamNotFoundError,
  CrossTenantOrganizationError,
  MembershipConflictError,
  OrganizationConflictError,
} from "../../domain/organization/organization-errors.js";
import {
  createOrganizationCreatedEvent,
  createOrganizationUpdatedEvent,
  createOrganizationStatusChangedEvent,
  createAreaCreatedEvent,
  createAreaUpdatedEvent,
  createTeamCreatedEvent,
  createTeamUpdatedEvent,
  createAgentAssignedToTeamEvent,
  createAgentRemovedFromTeamEvent,
} from "../../domain/organization/organization-events.js";

export interface OrganizationServiceOptions {
  readonly repository: OrganizationHierarchyRepository;
  readonly agentQuery: AgentQueryPort;
  readonly events?: EventPublisher | undefined;
}

export class OrganizationService {
  private readonly repo: OrganizationHierarchyRepository;
  private readonly agentQuery: AgentQueryPort;
  private readonly events?: EventPublisher | undefined;

  constructor(options: OrganizationServiceOptions) {
    this.repo = options.repository;
    this.agentQuery = options.agentQuery;
    this.events = options.events;
  }

  // --- Organization Use Cases ---

  async createOrganization(
    props: CreateOrganizationProps,
    traceId = crypto.randomUUID()
  ): Promise<Organization> {
    const existing = await this.repo.findOrganizationById(props.id);
    if (existing) {
      throw new OrganizationConflictError(`Organization already exists: '${props.id}'`);
    }

    const org = Organization.create(props);
    const saved = await this.repo.saveOrganization(org);

    if (this.events) {
      this.events.publish(createOrganizationCreatedEvent(saved, traceId));
    }

    return saved;
  }

  async getOrganization(id: string, tenantId?: string): Promise<Organization> {
    const org = await this.repo.findOrganizationById(id);
    if (!org) {
      throw new OrganizationNotFoundError(id);
    }
    if (tenantId && org.tenantId !== tenantId) {
      throw new CrossTenantOrganizationError(`Access denied to organization '${id}' across tenant boundaries`);
    }
    return org;
  }

  async listOrganizations(tenantId: string): Promise<readonly Organization[]> {
    return this.repo.findOrganizationsByTenantId(tenantId);
  }

  async updateOrganization(
    idOrProps: string | { organizationId: string; tenantId?: string; name?: string; description?: string; status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" },
    propsOrTraceId?: (UpdateOrganizationProps & { status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" }) | string,
    tenantId?: string,
    traceId = crypto.randomUUID()
  ): Promise<Organization> {
    let id: string;
    let props: UpdateOrganizationProps & { status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" };
    let tenant: string | undefined;
    let trace: string;

    if (typeof idOrProps === "object") {
      id = idOrProps.organizationId;
      props = {
        ...(idOrProps.name !== undefined ? { name: idOrProps.name } : {}),
        ...(idOrProps.description !== undefined ? { description: idOrProps.description } : {}),
        ...(idOrProps.status !== undefined ? { status: idOrProps.status } : {}),
      };
      tenant = idOrProps.tenantId;
      trace = typeof propsOrTraceId === "string" ? propsOrTraceId : crypto.randomUUID();
    } else {
      id = idOrProps;
      props = (propsOrTraceId as UpdateOrganizationProps & { status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" }) ?? {};
      tenant = tenantId;
      trace = traceId;
    }

    const org = await this.getOrganization(id, tenant);
    let updated = org;

    if (props.name !== undefined || props.description !== undefined) {
      updated = updated.update({ name: props.name, description: props.description });
    }

    if (props.status && props.status !== org.status) {
      const prev = updated.status;
      if (props.status === "ACTIVE") updated = updated.activate();
      else if (props.status === "INACTIVE") updated = updated.deactivate();
      else if (props.status === "ARCHIVED") updated = updated.archive();

      if (this.events) {
        this.events.publish(createOrganizationStatusChangedEvent(updated, prev, traceId));
      }
    }

    const saved = await this.repo.saveOrganization(updated);

    if (this.events) {
      this.events.publish(createOrganizationUpdatedEvent(saved, traceId));
    }

    return saved;
  }

  // --- Area Use Cases ---

  async createArea(
    props: CreateAreaProps,
    traceId = crypto.randomUUID()
  ): Promise<Area> {
    // Validate organization exists and belongs to same tenant
    const org = await this.getOrganization(props.organizationId, props.tenantId);

    const existing = await this.repo.findAreaById(props.id);
    if (existing) {
      throw new OrganizationConflictError(`Area already exists: '${props.id}'`);
    }

    const area = Area.create(props);
    const saved = await this.repo.saveArea(area);

    if (this.events) {
      this.events.publish(createAreaCreatedEvent(saved, traceId));
    }

    return saved;
  }

  async getArea(id: string, tenantId?: string): Promise<Area> {
    const area = await this.repo.findAreaById(id);
    if (!area) {
      throw new AreaNotFoundError(id);
    }
    if (tenantId && area.tenantId !== tenantId) {
      throw new CrossTenantOrganizationError(`Access denied to area '${id}' across tenant boundaries`);
    }
    return area;
  }

  async listAreas(organizationId: string, tenantId?: string): Promise<readonly Area[]> {
    // Verify org belongs to tenant if tenantId provided
    if (tenantId) {
      await this.getOrganization(organizationId, tenantId);
    }
    return this.repo.findAreasByOrganizationId(organizationId);
  }

  // --- Team Use Cases ---

  async createTeam(
    props: CreateTeamProps,
    traceId = crypto.randomUUID()
  ): Promise<Team> {
    // Validate area exists and belongs to same tenant
    const area = await this.getArea(props.areaId, props.tenantId);
    if (area.organizationId !== props.organizationId) {
      throw new CrossTenantOrganizationError(
        `Area '${props.areaId}' belongs to organization '${area.organizationId}', not '${props.organizationId}'`
      );
    }

    const existing = await this.repo.findTeamById(props.id);
    if (existing) {
      throw new OrganizationConflictError(`Team already exists: '${props.id}'`);
    }

    const team = Team.create(props);
    const saved = await this.repo.saveTeam(team);

    if (this.events) {
      this.events.publish(createTeamCreatedEvent(saved, traceId));
    }

    return saved;
  }

  async getTeam(id: string, tenantId?: string): Promise<Team> {
    const team = await this.repo.findTeamById(id);
    if (!team) {
      throw new TeamNotFoundError(id);
    }
    if (tenantId && team.tenantId !== tenantId) {
      throw new CrossTenantOrganizationError(`Access denied to team '${id}' across tenant boundaries`);
    }
    return team;
  }

  async listTeams(areaId: string, tenantId?: string): Promise<readonly Team[]> {
    if (tenantId) {
      await this.getArea(areaId, tenantId);
    }
    return this.repo.findTeamsByAreaId(areaId);
  }

  async listTeamsByOrganization(organizationId: string, tenantId?: string): Promise<readonly Team[]> {
    if (tenantId) {
      await this.getOrganization(organizationId, tenantId);
    }
    return this.repo.findTeamsByOrganizationId(organizationId);
  }

  // --- Agent Membership Use Cases ---

  async assignAgentToTeam(
    props: {
      readonly teamId: string;
      readonly agentId: string;
      readonly tenantId: string;
      readonly role?: MembershipRole | undefined;
    },
    traceId: string = crypto.randomUUID()
  ): Promise<AgentMembership> {
    const team = await this.getTeam(props.teamId, props.tenantId);

    // Verify agent exists in registry
    const agent = this.agentQuery.findById(props.agentId);
    if (!agent) {
      throw new OrganizationNotFoundError(`Agent not found: '${props.agentId}'`);
    }

    // Check duplicate membership
    const existing = await this.repo.findMembershipByTeamAndAgent(props.teamId, props.agentId);
    if (existing && existing.status === "ACTIVE") {
      throw new MembershipConflictError(
        `Agent '${props.agentId}' is already an active member of team '${props.teamId}'`
      );
    }

    const membership = AgentMembership.create({
      teamId: team.id,
      agentId: props.agentId,
      organizationId: team.organizationId,
      tenantId: props.tenantId,
      role: props.role,
    });

    const saved = await this.repo.saveMembership(membership);

    if (this.events) {
      this.events.publish(createAgentAssignedToTeamEvent(saved, traceId));
    }

    return saved;
  }

  async removeAgentFromTeam(
    teamId: string,
    agentId: string,
    tenantId?: string,
    traceId: string = crypto.randomUUID()
  ): Promise<boolean> {
    const team = await this.getTeam(teamId, tenantId);

    const membership = await this.repo.findMembershipByTeamAndAgent(team.id, agentId);
    if (!membership) {
      return false;
    }

    const deleted = await this.repo.deleteMembership(team.id, agentId);

    if (deleted && this.events) {
      this.events.publish(createAgentRemovedFromTeamEvent(membership, traceId));
    }

    return deleted;
  }

  async listTeamMembers(teamId: string, tenantId?: string): Promise<readonly AgentMembership[]> {
    await this.getTeam(teamId, tenantId);
    return this.repo.findMembershipsByTeamId(teamId);
  }

  async listAgentMemberships(agentId: string): Promise<readonly AgentMembership[]> {
    return this.repo.findMembershipsByAgentId(agentId);
  }

  // Aliases for compatibility
  async assignAgent(
    props: {
      readonly teamId: string;
      readonly agentId: string;
      readonly tenantId: string;
      readonly organizationId?: string | undefined;
      readonly role?: MembershipRole | undefined;
    },
    traceId?: string
  ): Promise<AgentMembership> {
    return this.assignAgentToTeam(props, traceId);
  }

  async removeAgent(
    teamId: string,
    agentId: string,
    tenantId?: string,
    traceId?: string
  ): Promise<boolean> {
    return this.removeAgentFromTeam(teamId, agentId, tenantId, traceId);
  }

  async listTeamMemberships(teamId: string, tenantId?: string): Promise<readonly AgentMembership[]> {
    return this.listTeamMembers(teamId, tenantId);
  }

  async getOrganizationHierarchy(
    organizationId: string,
    tenantId?: string
  ): Promise<{
    organization: Organization;
    areas: readonly {
      area: Area;
      teams: readonly {
        team: Team;
        members: readonly AgentMembership[];
      }[];
    }[];
  }> {
    const org = await this.getOrganization(organizationId, tenantId);
    const areas = await this.listAreas(organizationId, tenantId);
    const areasHierarchy = await Promise.all(
      areas.map(async (area) => {
        const teams = await this.listTeams(area.id, tenantId);
        const teamsHierarchy = await Promise.all(
          teams.map(async (team) => {
            const members = await this.listTeamMembers(team.id, tenantId);
            return { team, members };
          })
        );
        return { area, teams: teamsHierarchy };
      })
    );
    return { organization: org, areas: areasHierarchy };
  }
}
