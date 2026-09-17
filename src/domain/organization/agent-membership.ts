import {
  OrganizationValidationError,
} from "./organization-errors.js";

export type MembershipRole = "LEAD" | "SPECIALIST" | "OPERATOR" | "REVIEWER";
export type MembershipStatus = "ACTIVE" | "INACTIVE";

export interface AgentMembershipProps {
  readonly id: string;
  readonly teamId: string;
  readonly agentId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly role?: MembershipRole | undefined;
  readonly status?: MembershipStatus | undefined;
  readonly joinedAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface CreateAgentMembershipProps {
  readonly id?: string | undefined;
  readonly teamId: string;
  readonly agentId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly role?: MembershipRole | undefined;
}

export interface AgentMembershipRehydrateProps {
  readonly id: string;
  readonly teamId: string;
  readonly agentId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly joinedAt: Date;
  readonly updatedAt: Date;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_ROLES: readonly MembershipRole[] = ["LEAD", "SPECIALIST", "OPERATOR", "REVIEWER"];
const VALID_STATUSES: readonly MembershipStatus[] = ["ACTIVE", "INACTIVE"];

export function validateMembershipId(id: unknown): string {
  if (typeof id !== "string") {
    throw new OrganizationValidationError("Membership id must be a string");
  }
  const trimmed = id.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new OrganizationValidationError("Membership id must be alphanumeric, dashes or underscores (1-128 chars)");
  }
  return trimmed;
}

export class AgentMembership {
  readonly id: string;
  readonly teamId: string;
  readonly agentId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly joinedAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly id: string;
    readonly teamId: string;
    readonly agentId: string;
    readonly organizationId: string;
    readonly tenantId: string;
    readonly role: MembershipRole;
    readonly status: MembershipStatus;
    readonly joinedAt: Date;
    readonly updatedAt: Date;
  }) {
    this.id = props.id;
    this.teamId = props.teamId;
    this.agentId = props.agentId;
    this.organizationId = props.organizationId;
    this.tenantId = props.tenantId;
    this.role = props.role;
    this.status = props.status;
    this.joinedAt = props.joinedAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  get membershipId(): string {
    return this.id;
  }

  static create(props: CreateAgentMembershipProps): AgentMembership {
    if (!props.teamId || typeof props.teamId !== "string" || !props.teamId.trim()) {
      throw new OrganizationValidationError("Agent membership requires a valid teamId");
    }
    if (!props.agentId || typeof props.agentId !== "string" || !props.agentId.trim()) {
      throw new OrganizationValidationError("Agent membership requires a valid agentId");
    }
    if (!props.organizationId || typeof props.organizationId !== "string" || !props.organizationId.trim()) {
      throw new OrganizationValidationError("Agent membership requires a valid organizationId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new OrganizationValidationError("Agent membership requires a valid tenantId");
    }

    const teamId = props.teamId.trim();
    const agentId = props.agentId.trim();
    const organizationId = props.organizationId.trim();
    const tenantId = props.tenantId.trim();
    const id = props.id ? validateMembershipId(props.id) : `mship_${teamId}_${agentId}`;

    const role = props.role ?? "SPECIALIST";
    if (!VALID_ROLES.includes(role)) {
      throw new OrganizationValidationError(`Invalid membership role: '${role}'`);
    }

    const now = new Date();

    return new AgentMembership({
      id,
      teamId,
      agentId,
      organizationId,
      tenantId,
      role,
      status: "ACTIVE",
      joinedAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: AgentMembershipRehydrateProps): AgentMembership {
    const id = validateMembershipId(props.id);
    if (!props.teamId || typeof props.teamId !== "string" || !props.teamId.trim()) {
      throw new OrganizationValidationError("Rehydrated membership requires a valid teamId");
    }
    if (!props.agentId || typeof props.agentId !== "string" || !props.agentId.trim()) {
      throw new OrganizationValidationError("Rehydrated membership requires a valid agentId");
    }
    if (!props.organizationId || typeof props.organizationId !== "string" || !props.organizationId.trim()) {
      throw new OrganizationValidationError("Rehydrated membership requires a valid organizationId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new OrganizationValidationError("Rehydrated membership requires a valid tenantId");
    }
    if (!VALID_ROLES.includes(props.role)) {
      throw new OrganizationValidationError(`Invalid membership role: '${props.role}'`);
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new OrganizationValidationError(`Invalid membership status: '${props.status}'`);
    }
    if (!(props.joinedAt instanceof Date) || isNaN(props.joinedAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated membership joinedAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || isNaN(props.updatedAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated membership updatedAt must be a valid Date");
    }
    if (props.updatedAt.getTime() < props.joinedAt.getTime()) {
      throw new OrganizationValidationError("Rehydrated membership updatedAt cannot precede joinedAt");
    }

    return new AgentMembership({
      id,
      teamId: props.teamId.trim(),
      agentId: props.agentId.trim(),
      organizationId: props.organizationId.trim(),
      tenantId: props.tenantId.trim(),
      role: props.role,
      status: props.status,
      joinedAt: new Date(props.joinedAt.getTime()),
      updatedAt: new Date(props.updatedAt.getTime()),
    });
  }

  updateRole(role: MembershipRole): AgentMembership {
    if (!VALID_ROLES.includes(role)) {
      throw new OrganizationValidationError(`Invalid membership role: '${role}'`);
    }

    return new AgentMembership({
      id: this.id,
      teamId: this.teamId,
      agentId: this.agentId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      role,
      status: this.status,
      joinedAt: this.joinedAt,
      updatedAt: new Date(),
    });
  }

  activate(): AgentMembership {
    if (this.status === "ACTIVE") return this;
    return new AgentMembership({
      id: this.id,
      teamId: this.teamId,
      agentId: this.agentId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      role: this.role,
      status: "ACTIVE",
      joinedAt: this.joinedAt,
      updatedAt: new Date(),
    });
  }

  deactivate(): AgentMembership {
    if (this.status === "INACTIVE") return this;
    return new AgentMembership({
      id: this.id,
      teamId: this.teamId,
      agentId: this.agentId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      role: this.role,
      status: "INACTIVE",
      joinedAt: this.joinedAt,
      updatedAt: new Date(),
    });
  }
}
