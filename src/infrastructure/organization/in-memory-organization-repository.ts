import {
  OrganizationHierarchyRepository,
} from "../../application/ports/organization-repository-port.js";
import { Organization } from "../../domain/organization/organization.js";
import { Area } from "../../domain/organization/area.js";
import { Team } from "../../domain/organization/team.js";
import { AgentMembership } from "../../domain/organization/agent-membership.js";

export class InMemoryOrganizationRepository implements OrganizationHierarchyRepository {
  private readonly organizations = new Map<string, Organization>();
  private readonly areas = new Map<string, Area>();
  private readonly teams = new Map<string, Team>();
  private readonly memberships = new Map<string, AgentMembership>();

  // --- OrganizationRepositoryPort ---
  async saveOrganization(org: Organization): Promise<Organization> {
    this.organizations.set(org.id, org);
    return org;
  }

  async findOrganizationById(id: string): Promise<Organization | undefined> {
    return this.organizations.get(id);
  }

  async findOrganizationsByTenantId(tenantId: string): Promise<readonly Organization[]> {
    return Array.from(this.organizations.values()).filter((o) => o.tenantId === tenantId);
  }

  // --- AreaRepositoryPort ---
  async saveArea(area: Area): Promise<Area> {
    this.areas.set(area.id, area);
    return area;
  }

  async findAreaById(id: string): Promise<Area | undefined> {
    return this.areas.get(id);
  }

  async findAreasByOrganizationId(organizationId: string): Promise<readonly Area[]> {
    return Array.from(this.areas.values()).filter((a) => a.organizationId === organizationId);
  }

  async findAreasByTenantId(tenantId: string): Promise<readonly Area[]> {
    return Array.from(this.areas.values()).filter((a) => a.tenantId === tenantId);
  }

  // --- TeamRepositoryPort ---
  async saveTeam(team: Team): Promise<Team> {
    this.teams.set(team.id, team);
    return team;
  }

  async findTeamById(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async findTeamsByAreaId(areaId: string): Promise<readonly Team[]> {
    return Array.from(this.teams.values()).filter((t) => t.areaId === areaId);
  }

  async findTeamsByOrganizationId(organizationId: string): Promise<readonly Team[]> {
    return Array.from(this.teams.values()).filter((t) => t.organizationId === organizationId);
  }

  // --- AgentMembershipRepositoryPort ---
  async saveMembership(membership: AgentMembership): Promise<AgentMembership> {
    this.memberships.set(membership.id, membership);
    return membership;
  }

  async findMembershipById(id: string): Promise<AgentMembership | undefined> {
    return this.memberships.get(id);
  }

  async findMembershipByTeamAndAgent(teamId: string, agentId: string): Promise<AgentMembership | undefined> {
    return Array.from(this.memberships.values()).find(
      (m) => m.teamId === teamId && m.agentId === agentId
    );
  }

  async findMembershipsByTeamId(teamId: string): Promise<readonly AgentMembership[]> {
    return Array.from(this.memberships.values()).filter((m) => m.teamId === teamId);
  }

  async findMembershipsByAgentId(agentId: string): Promise<readonly AgentMembership[]> {
    return Array.from(this.memberships.values()).filter((m) => m.agentId === agentId);
  }

  async deleteMembership(teamId: string, agentId: string): Promise<boolean> {
    const existing = await this.findMembershipByTeamAndAgent(teamId, agentId);
    if (!existing) return false;
    return this.memberships.delete(existing.id);
  }

  clear(): void {
    this.organizations.clear();
    this.areas.clear();
    this.teams.clear();
    this.memberships.clear();
  }
}
