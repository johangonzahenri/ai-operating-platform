import { AgentProfile, CapabilityStatus } from "../../domain/organization/agent-profile.js";
import { MembershipRole } from "../../domain/organization/agent-membership.js";
import { AgentStatus } from "../../domain/agent/agent.js";

export interface AgentDiscoveryCriteria {
  readonly tenantId: string;
  readonly organizationId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly role?: MembershipRole | undefined;
  readonly responsibility?: string | undefined;
  readonly capabilityId?: string | undefined;
  readonly capabilityStatus?: CapabilityStatus | undefined;
  readonly status?: AgentStatus | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface AgentProfileRepositoryPort {
  save(profile: AgentProfile): Promise<AgentProfile>;
  findByAgentId(agentId: string, tenantId?: string): Promise<AgentProfile | undefined>;
  findByTeamId(teamId: string, tenantId?: string): Promise<readonly AgentProfile[]>;
  findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly AgentProfile[]>;
  discover(criteria: AgentDiscoveryCriteria): Promise<readonly AgentProfile[]>;
  delete(agentId: string, tenantId?: string): Promise<boolean>;
}
