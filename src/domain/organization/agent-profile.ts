import {
  BoundedDataLimits,
  DEFAULT_BOUNDED_DATA_LIMITS,
  deepFreeze,
  sanitizeBoundedValue,
} from "../context/bounded-data.js";
import { MembershipRole } from "./agent-membership.js";
import { AgentStatus } from "../agent/agent.js";

export type CapabilityStatus = "DECLARED" | "VERIFIED" | "DISABLED";

export const STANDARD_RESPONSIBILITIES: readonly string[] = [
  "DIAGNOSTICS",
  "ANALYSIS",
  "EXECUTION",
  "VERIFICATION",
  "CUSTOMER_SUPPORT",
  "CATALOG",
  "INVENTORY",
  "COORDINATION",
  "SECURITY",
  "MAINTENANCE",
];

const ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;
const SLUG_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;
const VALID_CAPABILITY_STATUSES: readonly CapabilityStatus[] = ["DECLARED", "VERIFIED", "DISABLED"];
const VALID_MEMBERSHIP_ROLES: readonly MembershipRole[] = ["LEAD", "SPECIALIST", "OPERATOR", "REVIEWER"];
const VALID_AGENT_STATUSES: readonly AgentStatus[] = ["ACTIVE", "INACTIVE"];

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

export class ProfileNotFoundError extends Error {
  constructor(readonly agentId: string) {
    super(`Agent profile not found for agent: '${agentId}'`);
    this.name = "ProfileNotFoundError";
  }
}

export class CapabilityNotFoundError extends Error {
  constructor(readonly capabilityId: string, readonly agentId?: string) {
    super(`Capability '${capabilityId}' not found${agentId ? ` on agent '${agentId}'` : ""}`);
    this.name = "CapabilityNotFoundError";
  }
}

export class CapabilityAlreadyExistsError extends Error {
  constructor(readonly capabilityId: string, readonly agentId?: string) {
    super(`Capability '${capabilityId}' already exists${agentId ? ` on agent '${agentId}'` : ""}`);
    this.name = "CapabilityAlreadyExistsError";
  }
}

export class ProfileConcurrencyConflictError extends Error {
  constructor(message: string = "Agent profile version mismatch (OCC conflict)") {
    super(message);
    this.name = "ProfileConcurrencyConflictError";
  }
}

export interface AgentCapability {
  readonly id: string;
  readonly name: string;
  readonly version?: string | undefined;
  readonly description?: string | undefined;
  readonly category?: string | undefined;
  readonly status: CapabilityStatus;
  readonly verifiedAt?: Date | undefined;
  readonly verifiedBy?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface CreateCapabilityProps {
  readonly id: string;
  readonly name: string;
  readonly version?: string | undefined;
  readonly description?: string | undefined;
  readonly category?: string | undefined;
  readonly status?: CapabilityStatus | undefined;
  readonly verifiedAt?: Date | undefined;
  readonly verifiedBy?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface CreateAgentProfileProps {
  readonly agentId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly role?: MembershipRole | undefined;
  readonly responsibilities?: readonly string[] | undefined;
  readonly capabilities?: readonly CreateCapabilityProps[] | undefined;
  readonly status?: AgentStatus | undefined;
}

export interface RehydrateAgentProfileProps {
  readonly agentId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly role: MembershipRole;
  readonly responsibilities: readonly string[];
  readonly capabilities: readonly AgentCapability[];
  readonly status: AgentStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function validateId(val: unknown, fieldName: string): string {
  if (typeof val !== "string" || !val.trim() || !ID_REGEX.test(val.trim())) {
    throw new ProfileValidationError(`${fieldName} must be a valid non-empty string matching ${ID_REGEX}`);
  }
  return val.trim();
}

function validateResponsibility(val: unknown): string {
  if (typeof val !== "string" || !val.trim() || !SLUG_REGEX.test(val.trim())) {
    throw new ProfileValidationError(`Responsibility must be a non-empty string matching ${SLUG_REGEX}`);
  }
  return val.trim().toUpperCase();
}

function sanitizeCapability(props: CreateCapabilityProps, limits: BoundedDataLimits): AgentCapability {
  const id = validateId(props.id, "Capability id").toLowerCase();
  if (typeof props.name !== "string" || !props.name.trim()) {
    throw new ProfileValidationError("Capability name must be a non-empty string");
  }
  const name = props.name.trim();
  const version = props.version && typeof props.version === "string" ? props.version.trim() : undefined;
  const description = props.description && typeof props.description === "string" ? props.description.trim() : undefined;
  const category = props.category && typeof props.category === "string" ? props.category.trim() : undefined;
  const status: CapabilityStatus = props.status ?? "DECLARED";
  if (!VALID_CAPABILITY_STATUSES.includes(status)) {
    throw new ProfileValidationError(`Invalid capability status: '${status}'`);
  }

  const verifiedAt = props.verifiedAt instanceof Date ? new Date(props.verifiedAt.getTime()) : undefined;
  const verifiedBy = props.verifiedBy && typeof props.verifiedBy === "string" ? props.verifiedBy.trim() : undefined;

  const state = { truncated: false };
  const metadata = props.metadata
    ? (deepFreeze(sanitizeBoundedValue(props.metadata, limits, 0, state)) as Readonly<Record<string, unknown>>)
    : undefined;

  return Object.freeze({
    id,
    name,
    version,
    description,
    category,
    status,
    verifiedAt,
    verifiedBy,
    metadata,
  });
}

export class AgentProfile {
  readonly agentId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly role: MembershipRole;
  readonly responsibilities: readonly string[];
  readonly capabilities: readonly AgentCapability[];
  readonly status: AgentStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly agentId: string;
    readonly tenantId: string;
    readonly organizationId: string;
    readonly teamId: string;
    readonly role: MembershipRole;
    readonly responsibilities: readonly string[];
    readonly capabilities: readonly AgentCapability[];
    readonly status: AgentStatus;
    readonly version: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }) {
    this.agentId = props.agentId;
    this.tenantId = props.tenantId;
    this.organizationId = props.organizationId;
    this.teamId = props.teamId;
    this.role = props.role;
    this.responsibilities = props.responsibilities;
    this.capabilities = props.capabilities;
    this.status = props.status;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateAgentProfileProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): AgentProfile {
    const agentId = validateId(props.agentId, "Agent id");
    const tenantId = validateId(props.tenantId, "Tenant id");
    const organizationId = validateId(props.organizationId, "Organization id");
    const teamId = validateId(props.teamId, "Team id");

    const role: MembershipRole = props.role ?? "OPERATOR";
    if (!VALID_MEMBERSHIP_ROLES.includes(role)) {
      throw new ProfileValidationError(`Invalid role: '${role}'`);
    }

    const responsibilities = Array.isArray(props.responsibilities)
      ? Object.freeze(Array.from(new Set(props.responsibilities.map(validateResponsibility))))
      : Object.freeze([]);

    const capabilitiesMap = new Map<string, AgentCapability>();
    if (Array.isArray(props.capabilities)) {
      for (const capProps of props.capabilities) {
        const sanitized = sanitizeCapability(capProps, limits);
        if (capabilitiesMap.has(sanitized.id)) {
          throw new CapabilityAlreadyExistsError(sanitized.id, agentId);
        }
        capabilitiesMap.set(sanitized.id, sanitized);
      }
    }
    const capabilities = Object.freeze(Array.from(capabilitiesMap.values()));

    const status: AgentStatus = props.status ?? "ACTIVE";
    if (!VALID_AGENT_STATUSES.includes(status)) {
      throw new ProfileValidationError(`Invalid agent status: '${status}'`);
    }

    const now = new Date();
    return new AgentProfile({
      agentId,
      tenantId,
      organizationId,
      teamId,
      role,
      responsibilities,
      capabilities,
      status,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: RehydrateAgentProfileProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): AgentProfile {
    const agentId = validateId(props.agentId, "Agent id");
    const tenantId = validateId(props.tenantId, "Tenant id");
    const organizationId = validateId(props.organizationId, "Organization id");
    const teamId = validateId(props.teamId, "Team id");

    if (!VALID_MEMBERSHIP_ROLES.includes(props.role)) {
      throw new ProfileValidationError(`Invalid role: '${props.role}'`);
    }

    if (!Array.isArray(props.responsibilities)) {
      throw new ProfileValidationError("Responsibilities must be an array");
    }
    const responsibilities = Object.freeze(Array.from(new Set(props.responsibilities.map(validateResponsibility))));

    if (!Array.isArray(props.capabilities)) {
      throw new ProfileValidationError("Capabilities must be an array");
    }
    const capabilities = Object.freeze(props.capabilities.map((c) => sanitizeCapability(c, limits)));

    if (!VALID_AGENT_STATUSES.includes(props.status)) {
      throw new ProfileValidationError(`Invalid agent status: '${props.status}'`);
    }

    if (typeof props.version !== "number" || props.version < 1) {
      throw new ProfileValidationError("Version must be a positive integer >= 1");
    }

    if (!(props.createdAt instanceof Date) || Number.isNaN(props.createdAt.getTime())) {
      throw new ProfileValidationError("createdAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || Number.isNaN(props.updatedAt.getTime())) {
      throw new ProfileValidationError("updatedAt must be a valid Date");
    }

    return new AgentProfile({
      agentId,
      tenantId,
      organizationId,
      teamId,
      role: props.role,
      responsibilities,
      capabilities,
      status: props.status,
      version: props.version,
      createdAt: new Date(props.createdAt.getTime()),
      updatedAt: new Date(props.updatedAt.getTime()),
    });
  }

  updateRole(newRole: MembershipRole): AgentProfile {
    if (!VALID_MEMBERSHIP_ROLES.includes(newRole)) {
      throw new ProfileValidationError(`Invalid role: '${newRole}'`);
    }
    if (this.role === newRole) {
      return this;
    }
    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: newRole,
      responsibilities: this.responsibilities,
      capabilities: this.capabilities,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  setResponsibilities(newResponsibilities: readonly string[]): AgentProfile {
    if (!Array.isArray(newResponsibilities)) {
      throw new ProfileValidationError("Responsibilities must be an array");
    }
    const normalized = Object.freeze(Array.from(new Set(newResponsibilities.map(validateResponsibility))));
    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: this.role,
      responsibilities: normalized,
      capabilities: this.capabilities,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  addCapability(props: CreateCapabilityProps, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): AgentProfile {
    const sanitized = sanitizeCapability(props, limits);
    if (this.capabilities.some((c) => c.id === sanitized.id)) {
      throw new CapabilityAlreadyExistsError(sanitized.id, this.agentId);
    }
    const updatedCapabilities = Object.freeze([...this.capabilities, sanitized]);
    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: this.role,
      responsibilities: this.responsibilities,
      capabilities: updatedCapabilities,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  removeCapability(capabilityId: string): AgentProfile {
    const normalizedId = validateId(capabilityId, "Capability id").toLowerCase();
    const exists = this.capabilities.some((c) => c.id === normalizedId);
    if (!exists) {
      throw new CapabilityNotFoundError(normalizedId, this.agentId);
    }
    const updatedCapabilities = Object.freeze(this.capabilities.filter((c) => c.id !== normalizedId));
    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: this.role,
      responsibilities: this.responsibilities,
      capabilities: updatedCapabilities,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  verifyCapability(capabilityId: string, verifierId: string): AgentProfile {
    const normalizedId = validateId(capabilityId, "Capability id").toLowerCase();
    const verifier = validateId(verifierId, "Verifier id");
    const existing = this.capabilities.find((c) => c.id === normalizedId);
    if (!existing) {
      throw new CapabilityNotFoundError(normalizedId, this.agentId);
    }

    const verifiedCapability: AgentCapability = Object.freeze({
      ...existing,
      status: "VERIFIED",
      verifiedAt: new Date(),
      verifiedBy: verifier,
    });

    const updatedCapabilities = Object.freeze(
      this.capabilities.map((c) => (c.id === normalizedId ? verifiedCapability : c))
    );

    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: this.role,
      responsibilities: this.responsibilities,
      capabilities: updatedCapabilities,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  disableCapability(capabilityId: string): AgentProfile {
    const normalizedId = validateId(capabilityId, "Capability id").toLowerCase();
    const existing = this.capabilities.find((c) => c.id === normalizedId);
    if (!existing) {
      throw new CapabilityNotFoundError(normalizedId, this.agentId);
    }

    const disabledCapability: AgentCapability = Object.freeze({
      ...existing,
      status: "DISABLED",
    });

    const updatedCapabilities = Object.freeze(
      this.capabilities.map((c) => (c.id === normalizedId ? disabledCapability : c))
    );

    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: this.role,
      responsibilities: this.responsibilities,
      capabilities: updatedCapabilities,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  setStatus(newStatus: AgentStatus): AgentProfile {
    if (!VALID_AGENT_STATUSES.includes(newStatus)) {
      throw new ProfileValidationError(`Invalid agent status: '${newStatus}'`);
    }
    if (this.status === newStatus) {
      return this;
    }
    return new AgentProfile({
      agentId: this.agentId,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      teamId: this.teamId,
      role: this.role,
      responsibilities: this.responsibilities,
      capabilities: this.capabilities,
      status: newStatus,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  hasCapability(capabilityId: string, requireVerified: boolean = false): boolean {
    const normalizedId = capabilityId.trim().toLowerCase();
    const cap = this.capabilities.find((c) => c.id === normalizedId);
    if (!cap) return false;
    if (cap.status === "DISABLED") return false;
    if (requireVerified && cap.status !== "VERIFIED") return false;
    return true;
  }

  hasResponsibility(responsibility: string): boolean {
    const normalized = responsibility.trim().toUpperCase();
    return this.responsibilities.includes(normalized);
  }
}
