import crypto from "node:crypto";
import {
  AgentProfile,
  CreateCapabilityProps,
  ProfileNotFoundError,
  ProfileValidationError,
} from "../../domain/organization/agent-profile.js";
import { MembershipRole } from "../../domain/organization/agent-membership.js";
import { AgentStatus } from "../../domain/agent/agent.js";
import {
  AgentDiscoveryCriteria,
  AgentProfileRepositoryPort,
} from "../ports/agent-profile-repository-port.js";
import { OrganizationHierarchyRepository } from "../ports/organization-repository-port.js";
import { AgentQueryPort } from "../ports/query-ports.js";
import { EventPublisher } from "../../domain/events/events.js";
import {
  CrossTenantOrganizationError,
  TeamNotFoundError,
} from "../../domain/organization/organization-errors.js";
import {
  createAgentProfileCreatedEvent,
  createAgentProfileUpdatedEvent,
  createAgentRoleChangedEvent,
  createAgentResponsibilityChangedEvent,
  createAgentCapabilityAddedEvent,
  createAgentCapabilityRemovedEvent,
  createAgentCapabilityVerifiedEvent,
} from "../../domain/organization/organization-events.js";

export interface AgentProfileServiceOptions {
  readonly profileRepository: AgentProfileRepositoryPort;
  readonly organizationRepository: OrganizationHierarchyRepository;
  readonly agentQuery: AgentQueryPort;
  readonly events?: EventPublisher | undefined;
}

export interface CreateProfileParams {
  readonly agentId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly role?: MembershipRole | undefined;
  readonly responsibilities?: readonly string[] | undefined;
  readonly capabilities?: readonly CreateCapabilityProps[] | undefined;
  readonly status?: AgentStatus | undefined;
}

export class AgentProfileService {
  private readonly profileRepo: AgentProfileRepositoryPort;
  private readonly orgRepo: OrganizationHierarchyRepository;
  private readonly agentQuery: AgentQueryPort;
  private readonly events?: EventPublisher | undefined;

  constructor(options: AgentProfileServiceOptions) {
    this.profileRepo = options.profileRepository;
    this.orgRepo = options.organizationRepository;
    this.agentQuery = options.agentQuery;
    this.events = options.events;
  }

  async createProfile(params: CreateProfileParams, traceId: string = crypto.randomUUID()): Promise<AgentProfile> {
    // 1. Verify Team existence and tenant
    const team = await this.orgRepo.findTeamById(params.teamId);
    if (!team) {
      throw new TeamNotFoundError(params.teamId);
    }
    if (team.tenantId !== params.tenantId) {
      throw new CrossTenantOrganizationError(`Team '${params.teamId}' belongs to another tenant`);
    }

    // 2. Verify Agent existence
    const agent = this.agentQuery.findById(params.agentId);
    if (!agent) {
      throw new ProfileValidationError(`Agent '${params.agentId}' not found`);
    }

    // 3. Verify Agent Membership in Team
    const membership = await this.orgRepo.findMembershipByTeamAndAgent(params.teamId, params.agentId);
    if (!membership) {
      throw new ProfileValidationError(`Agent '${params.agentId}' is not a member of team '${params.teamId}'`);
    }

    const profile = AgentProfile.create({
      agentId: params.agentId,
      tenantId: params.tenantId,
      organizationId: team.organizationId,
      teamId: params.teamId,
      role: params.role ?? membership.role,
      responsibilities: params.responsibilities,
      capabilities: params.capabilities,
      status: params.status ?? agent.status,
    });

    const saved = await this.profileRepo.save(profile);
    if (this.events) {
      await this.events.publish(createAgentProfileCreatedEvent(saved, traceId));
    }
    return saved;
  }

  async getProfile(agentId: string, tenantId?: string): Promise<AgentProfile> {
    const profile = await this.profileRepo.findByAgentId(agentId);
    if (!profile) {
      throw new ProfileNotFoundError(agentId);
    }
    if (tenantId && profile.tenantId !== tenantId) {
      throw new CrossTenantOrganizationError(`Cross-tenant access forbidden for agent '${agentId}'`);
    }
    return profile;
  }

  async updateRole(
    agentId: string,
    newRole: MembershipRole,
    tenantId: string,
    editorId: string = "system",
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const oldRole = existing.role;
    const updated = existing.updateRole(newRole);

    const saved = await this.profileRepo.save(updated);

    // Sync role with AgentMembership if exists
    const membership = await this.orgRepo.findMembershipByTeamAndAgent(existing.teamId, agentId);
    if (membership && membership.role !== newRole) {
      const updatedMembership = membership.updateRole(newRole);
      await this.orgRepo.saveMembership(updatedMembership);
    }

    if (this.events) {
      await this.events.publish(createAgentRoleChangedEvent(saved, oldRole, newRole, editorId, traceId));
    }
    return saved;
  }

  async updateResponsibilities(
    agentId: string,
    responsibilities: readonly string[],
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const oldResponsibilities = existing.responsibilities;
    const updated = existing.setResponsibilities(responsibilities);

    const saved = await this.profileRepo.save(updated);
    if (this.events) {
      await this.events.publish(
        createAgentResponsibilityChangedEvent(saved, oldResponsibilities, saved.responsibilities, traceId)
      );
    }
    return saved;
  }

  async addCapability(
    agentId: string,
    props: CreateCapabilityProps,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const updated = existing.addCapability(props);

    const saved = await this.profileRepo.save(updated);
    const addedCap = saved.capabilities.find((c) => c.id === props.id.trim().toLowerCase());
    if (this.events && addedCap) {
      await this.events.publish(createAgentCapabilityAddedEvent(saved, addedCap, traceId));
    }
    return saved;
  }

  async removeCapability(
    agentId: string,
    capabilityId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const updated = existing.removeCapability(capabilityId);

    const saved = await this.profileRepo.save(updated);
    if (this.events) {
      await this.events.publish(createAgentCapabilityRemovedEvent(saved, capabilityId.trim().toLowerCase(), traceId));
    }
    return saved;
  }

  async verifyCapability(
    agentId: string,
    capabilityId: string,
    verifierId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const updated = existing.verifyCapability(capabilityId, verifierId);

    const saved = await this.profileRepo.save(updated);
    if (this.events) {
      await this.events.publish(
        createAgentCapabilityVerifiedEvent(saved, capabilityId.trim().toLowerCase(), verifierId, traceId)
      );
    }
    return saved;
  }

  async disableCapability(
    agentId: string,
    capabilityId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const updated = existing.disableCapability(capabilityId);

    const saved = await this.profileRepo.save(updated);
    if (this.events) {
      await this.events.publish(createAgentProfileUpdatedEvent(saved, traceId));
    }
    return saved;
  }

  async setStatus(
    agentId: string,
    status: AgentStatus,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AgentProfile> {
    const existing = await this.getProfile(agentId, tenantId);
    const updated = existing.setStatus(status);

    const saved = await this.profileRepo.save(updated);
    if (this.events) {
      await this.events.publish(createAgentProfileUpdatedEvent(saved, traceId));
    }
    return saved;
  }

  async discoverAgents(criteria: AgentDiscoveryCriteria): Promise<readonly AgentProfile[]> {
    if (!criteria.tenantId || typeof criteria.tenantId !== "string" || !criteria.tenantId.trim()) {
      throw new ProfileValidationError("tenantId is required for agent discovery");
    }
    if (criteria.teamId) {
      const team = await this.orgRepo.findTeamById(criteria.teamId);
      if (!team) {
        throw new TeamNotFoundError(criteria.teamId);
      }
      if (team.tenantId !== criteria.tenantId) {
        throw new CrossTenantOrganizationError(`Team '${criteria.teamId}' does not belong to tenant '${criteria.tenantId}'`);
      }
    }
    return this.profileRepo.discover(criteria);
  }

  async matchAgentForCoordination(params: {
    tenantId: string;
    teamId: string;
    requiredCapability?: string | undefined;
    requiredResponsibility?: string | undefined;
    preferredRole?: MembershipRole | undefined;
    requireVerifiedCapability?: boolean | undefined;
  }): Promise<AgentProfile | undefined> {
    const candidates = await this.discoverAgents({
      tenantId: params.tenantId,
      teamId: params.teamId,
      role: params.preferredRole,
      responsibility: params.requiredResponsibility,
      capabilityId: params.requiredCapability,
      capabilityStatus: params.requireVerifiedCapability ? "VERIFIED" : undefined,
      status: "ACTIVE",
    });

    if (candidates.length === 0) return undefined;

    // Prefer verified capabilities if available
    if (params.requiredCapability) {
      const verifiedCandidate = candidates.find((p) => p.hasCapability(params.requiredCapability!, true));
      if (verifiedCandidate) return verifiedCandidate;
    }

    return candidates[0];
  }
}
