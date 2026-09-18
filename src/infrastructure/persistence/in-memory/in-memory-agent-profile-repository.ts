import {
  AgentProfile,
  ProfileConcurrencyConflictError,
} from "../../../domain/organization/agent-profile.js";
import {
  AgentDiscoveryCriteria,
  AgentProfileRepositoryPort,
} from "../../../application/ports/agent-profile-repository-port.js";

export class InMemoryAgentProfileRepository implements AgentProfileRepositoryPort {
  private readonly profiles = new Map<string, AgentProfile>();

  async save(profile: AgentProfile): Promise<AgentProfile> {
    const existing = this.profiles.get(profile.agentId);
    if (existing) {
      if (existing.version !== profile.version - 1 && existing.version !== profile.version) {
        throw new ProfileConcurrencyConflictError(
          `Agent profile OCC conflict on agent '${profile.agentId}': current version ${existing.version}, expected ${profile.version - 1}`
        );
      }
    }
    this.profiles.set(profile.agentId, profile);
    return profile;
  }

  async findByAgentId(agentId: string, tenantId?: string): Promise<AgentProfile | undefined> {
    const profile = this.profiles.get(agentId);
    if (!profile) return undefined;
    if (tenantId && profile.tenantId !== tenantId) return undefined;
    return profile;
  }

  async findByTeamId(teamId: string, tenantId?: string): Promise<readonly AgentProfile[]> {
    return Array.from(this.profiles.values()).filter(
      (p) => p.teamId === teamId && (!tenantId || p.tenantId === tenantId)
    );
  }

  async findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly AgentProfile[]> {
    const filtered = Array.from(this.profiles.values()).filter((p) => p.tenantId === tenantId);
    const start = offset && offset > 0 ? offset : 0;
    const end = limit && limit > 0 ? start + limit : undefined;
    return filtered.slice(start, end);
  }

  async discover(criteria: AgentDiscoveryCriteria): Promise<readonly AgentProfile[]> {
    const result = Array.from(this.profiles.values()).filter((p) => {
      if (p.tenantId !== criteria.tenantId) return false;
      if (criteria.organizationId && p.organizationId !== criteria.organizationId) return false;
      if (criteria.teamId && p.teamId !== criteria.teamId) return false;
      if (criteria.role && p.role !== criteria.role) return false;
      if (criteria.status && p.status !== criteria.status) return false;
      if (criteria.responsibility && !p.hasResponsibility(criteria.responsibility)) return false;
      if (criteria.capabilityId) {
        const cap = p.capabilities.find((c) => c.id === criteria.capabilityId!.trim().toLowerCase());
        if (!cap || cap.status === "DISABLED") return false;
        if (criteria.capabilityStatus && cap.status !== criteria.capabilityStatus) return false;
      }
      return true;
    });

    const start = criteria.offset && criteria.offset > 0 ? criteria.offset : 0;
    const end = criteria.limit && criteria.limit > 0 ? start + criteria.limit : undefined;
    return result.slice(start, end);
  }

  async delete(agentId: string, tenantId?: string): Promise<boolean> {
    const existing = this.profiles.get(agentId);
    if (!existing) return false;
    if (tenantId && existing.tenantId !== tenantId) return false;
    return this.profiles.delete(agentId);
  }

  clear(): void {
    this.profiles.clear();
  }
}
