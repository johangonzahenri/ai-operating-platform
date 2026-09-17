import {
  OrganizationValidationError,
} from "./organization-errors.js";

export type OrganizationStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface OrganizationProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly status?: OrganizationStatus | undefined;
  readonly version?: number | undefined;
  readonly createdAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface CreateOrganizationProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface UpdateOrganizationProps {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
}

export interface OrganizationRehydrateProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: OrganizationStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_STATUSES: readonly OrganizationStatus[] = ["ACTIVE", "INACTIVE", "ARCHIVED"];

export function validateOrganizationId(id: unknown): string {
  if (typeof id !== "string") {
    throw new OrganizationValidationError("Organization id must be a string");
  }
  const trimmed = id.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new OrganizationValidationError("Organization id must be alphanumeric, dashes or underscores (1-128 chars)");
  }
  return trimmed;
}

export function validateTenantId(id: unknown): string {
  if (typeof id !== "string") {
    throw new OrganizationValidationError("Tenant id must be a string");
  }
  const trimmed = id.trim();
  if (!trimmed) {
    throw new OrganizationValidationError("Tenant id cannot be empty");
  }
  return trimmed;
}

export class Organization {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: OrganizationStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly id: string;
    readonly tenantId: string;
    readonly name: string;
    readonly description: string;
    readonly status: OrganizationStatus;
    readonly version: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.version = props.version;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  get organizationId(): string {
    return this.id;
  }

  static create(props: CreateOrganizationProps): Organization {
    const id = validateOrganizationId(props.id);
    const tenantId = validateTenantId(props.tenantId);

    if (typeof props.name !== "string" || !props.name.trim()) {
      throw new OrganizationValidationError("Organization name must be a non-empty string");
    }

    const name = props.name.trim();
    const description = (props.description ?? "").trim();
    const now = new Date();

    return new Organization({
      id,
      tenantId,
      name,
      description,
      status: "ACTIVE",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: OrganizationRehydrateProps): Organization {
    const id = validateOrganizationId(props.id);
    const tenantId = validateTenantId(props.tenantId);

    if (typeof props.name !== "string" || !props.name.trim()) {
      throw new OrganizationValidationError("Rehydrated organization name must be a non-empty string");
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new OrganizationValidationError(`Invalid organization status: '${props.status}'`);
    }
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new OrganizationValidationError("Rehydrated organization version must be an integer >= 1");
    }
    if (!(props.createdAt instanceof Date) || isNaN(props.createdAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated organization createdAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || isNaN(props.updatedAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated organization updatedAt must be a valid Date");
    }
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new OrganizationValidationError("Rehydrated organization updatedAt cannot precede createdAt");
    }

    return new Organization({
      id,
      tenantId,
      name: props.name.trim(),
      description: props.description ?? "",
      status: props.status,
      version: props.version,
      createdAt: new Date(props.createdAt.getTime()),
      updatedAt: new Date(props.updatedAt.getTime()),
    });
  }

  update(props: UpdateOrganizationProps): Organization {
    if (this.status === "ARCHIVED") {
      throw new OrganizationValidationError("Cannot update an archived organization");
    }

    let nextName = this.name;
    if (props.name !== undefined) {
      if (typeof props.name !== "string" || !props.name.trim()) {
        throw new OrganizationValidationError("Updated organization name must be a non-empty string");
      }
      nextName = props.name.trim();
    }

    let nextDescription = this.description;
    if (props.description !== undefined) {
      nextDescription = props.description.trim();
    }

    return new Organization({
      id: this.id,
      tenantId: this.tenantId,
      name: nextName,
      description: nextDescription,
      status: this.status,
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  activate(): Organization {
    if (this.status === "ARCHIVED") {
      throw new OrganizationValidationError("Cannot activate an archived organization");
    }
    if (this.status === "ACTIVE") return this;

    return new Organization({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      status: "ACTIVE",
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  deactivate(): Organization {
    if (this.status === "ARCHIVED") {
      throw new OrganizationValidationError("Cannot deactivate an archived organization");
    }
    if (this.status === "INACTIVE") return this;

    return new Organization({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      status: "INACTIVE",
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  archive(): Organization {
    if (this.status === "ARCHIVED") return this;

    return new Organization({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      status: "ARCHIVED",
      version: this.version + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
