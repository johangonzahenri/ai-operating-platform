import { Organization } from "../../domain/organization/organization.js";
import { Area } from "../../domain/organization/area.js";
import { Team } from "../../domain/organization/team.js";
import { AgentMembership } from "../../domain/organization/agent-membership.js";

export interface OrganizationRepositoryPort {
  saveOrganization(org: Organization): Promise<Organization>;
  findOrganizationById(id: string): Promise<Organization | undefined>;
  findOrganizationsByTenantId(tenantId: string): Promise<readonly Organization[]>;
}

export interface AreaRepositoryPort {
  saveArea(area: Area): Promise<Area>;
  findAreaById(id: string): Promise<Area | undefined>;
  findAreasByOrganizationId(organizationId: string): Promise<readonly Area[]>;
  findAreasByTenantId(tenantId: string): Promise<readonly Area[]>;
}

export interface TeamRepositoryPort {
  saveTeam(team: Team): Promise<Team>;
  findTeamById(id: string): Promise<Team | undefined>;
  findTeamsByAreaId(areaId: string): Promise<readonly Team[]>;
  findTeamsByOrganizationId(organizationId: string): Promise<readonly Team[]>;
}

export interface AgentMembershipRepositoryPort {
  saveMembership(membership: AgentMembership): Promise<AgentMembership>;
  findMembershipById(id: string): Promise<AgentMembership | undefined>;
  findMembershipByTeamAndAgent(teamId: string, agentId: string): Promise<AgentMembership | undefined>;
  findMembershipsByTeamId(teamId: string): Promise<readonly AgentMembership[]>;
  findMembershipsByAgentId(agentId: string): Promise<readonly AgentMembership[]>;
  deleteMembership(teamId: string, agentId: string): Promise<boolean>;
}

export interface OrganizationHierarchyRepository
  extends OrganizationRepositoryPort,
    AreaRepositoryPort,
    TeamRepositoryPort,
    AgentMembershipRepositoryPort {}
