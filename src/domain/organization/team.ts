import {
  OrganizationValidationError,
} from "./organization-errors.js";

export type TeamStatus = "ACTIVE" | "INACTIVE";

export interface TeamProps {
  readonly id: string;
  readonly areaId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly status?: TeamStatus | undefined;
  readonly version?: number | undefined;
  readonly createdAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface CreateTeamProps {
  readonly id: string;
  readonly areaId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface UpdateTeamProps {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
}

export interface TeamRehydrateProps {
  readonly id: string;
  readonly areaId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: TeamStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_STATUSES: readonly TeamStatus[] = ["ACTIVE", "INACTIVE"];

export function validateTeamId(id: unknown): string {
  if (typeof id !== "string") {
    throw new OrganizationValidationError("Team id must be a string");
  }
  const trimmed = id.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new OrganizationValidationError("Team id must be alphanumeric, dashes or underscores (1-128 chars)");
  }
  return trimmed;
}

export class Team {
  readonly id: string;
  readonly areaId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: TeamStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly id: string;
    readonly areaId: string;
    readonly organizationId: string;
    readonly tenantId: string;
    readonly name: string;
    readonly description: string;
    readonly status: TeamStatus;
    readonly version: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }) {
    this.id = props.id;
    this.areaId = props.areaId;
    this.organizationId = props.organizationId;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  get teamId(): string {
    return this.id;
  }

  static create(props: CreateTeamProps): Team {
    const id = validateTeamId(props.id);
    if (!props.areaId || typeof props.areaId !== "string" || !props.areaId.trim()) {
      throw new OrganizationValidationError("Team requires a valid areaId");
    }
    if (!props.organizationId || typeof props.organizationId !== "string" || !props.organizationId.trim()) {
      throw new OrganizationValidationError("Team requires a valid organizationId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new OrganizationValidationError("Team requires a valid tenantId");
    }
    if (typeof props.name !== "string" || !props.name.trim()) {
      throw new OrganizationValidationError("Team name must be a non-empty string");
    }

    const areaId = props.areaId.trim();
    const organizationId = props.organizationId.trim();
    const tenantId = props.tenantId.trim();
    const name = props.name.trim();
    const description = (props.description ?? "").trim();
    const now = new Date();

    return new Team({
      id,
      areaId,
      organizationId,
      tenantId,
      name,
      description,
      status: "ACTIVE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: TeamRehydrateProps): Team {
    const id = validateTeamId(props.id);
    if (!props.areaId || typeof props.areaId !== "string" || !props.areaId.trim()) {
      throw new OrganizationValidationError("Rehydrated team requires a valid areaId");
    }
    if (!props.organizationId || typeof props.organizationId !== "string" || !props.organizationId.trim()) {
      throw new OrganizationValidationError("Rehydrated team requires a valid organizationId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new OrganizationValidationError("Rehydrated team requires a valid tenantId");
    }
    if (typeof props.name !== "string" || !props.name.trim()) {
      throw new OrganizationValidationError("Rehydrated team name must be a non-empty string");
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new OrganizationValidationError(`Invalid team status: '${props.status}'`);
    }
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new OrganizationValidationError("Rehydrated team version must be an integer >= 1");
    }
    if (!(props.createdAt instanceof Date) || isNaN(props.createdAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated team createdAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || isNaN(props.updatedAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated team updatedAt must be a valid Date");
    }
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new OrganizationValidationError("Rehydrated team updatedAt cannot precede createdAt");
    }

    return new Team({
      id,
      areaId: props.areaId.trim(),
      organizationId: props.organizationId.trim(),
      tenantId: props.tenantId.trim(),
      name: props.name.trim(),
      description: props.description ?? "",
      status: props.status,
      version: props.version,
      createdAt: new Date(props.createdAt.getTime()),
      updatedAt: new Date(props.updatedAt.getTime()),
    });
  }

  update(props: UpdateTeamProps): Team {
    let nextName = this.name;
    if (props.name !== undefined) {
      if (typeof props.name !== "string" || !props.name.trim()) {
        throw new OrganizationValidationError("Updated team name must be a non-empty string");
      }
      nextName = props.name.trim();
    }

    let nextDescription = this.description;
    if (props.description !== undefined) {
      nextDescription = props.description.trim();
    }

    return new Team({
      id: this.id,
      areaId: this.areaId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      name: nextName,
      description: nextDescription,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  activate(): Team {
    if (this.status === "ACTIVE") return this;
    return new Team({
      id: this.id,
      areaId: this.areaId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      status: "ACTIVE",
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  deactivate(): Team {
    if (this.status === "INACTIVE") return this;
    return new Team({
      id: this.id,
      areaId: this.areaId,
      organizationId: this.organizationId,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      status: "INACTIVE",
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
