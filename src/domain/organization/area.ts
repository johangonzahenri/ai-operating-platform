import {
  OrganizationValidationError,
} from "./organization-errors.js";

export type AreaStatus = "ACTIVE" | "INACTIVE";

export interface AreaProps {
  readonly id: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly status?: AreaStatus | undefined;
  readonly version?: number | undefined;
  readonly createdAt?: Date | undefined;
  readonly updatedAt?: Date | undefined;
}

export interface CreateAreaProps {
  readonly id: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface UpdateAreaProps {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
}

export interface AreaRehydrateProps {
  readonly id: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: AreaStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_STATUSES: readonly AreaStatus[] = ["ACTIVE", "INACTIVE"];

export function validateAreaId(id: unknown): string {
  if (typeof id !== "string") {
    throw new OrganizationValidationError("Area id must be a string");
  }
  const trimmed = id.trim();
  if (!trimmed || !ID_REGEX.test(trimmed)) {
    throw new OrganizationValidationError("Area id must be alphanumeric, dashes or underscores (1-128 chars)");
  }
  return trimmed;
}

export class Area {
  readonly id: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: AreaStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: {
    readonly id: string;
    readonly organizationId: string;
    readonly tenantId: string;
    readonly name: string;
    readonly description: string;
    readonly status: AreaStatus;
    readonly version: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }) {
    this.id = props.id;
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

  get areaId(): string {
    return this.id;
  }

  static create(props: CreateAreaProps): Area {
    const id = validateAreaId(props.id);
    if (!props.organizationId || typeof props.organizationId !== "string" || !props.organizationId.trim()) {
      throw new OrganizationValidationError("Area requires a valid organizationId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new OrganizationValidationError("Area requires a valid tenantId");
    }
    if (typeof props.name !== "string" || !props.name.trim()) {
      throw new OrganizationValidationError("Area name must be a non-empty string");
    }

    const organizationId = props.organizationId.trim();
    const tenantId = props.tenantId.trim();
    const name = props.name.trim();
    const description = (props.description ?? "").trim();
    const now = new Date();

    return new Area({
      id,
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

  static rehydrate(props: AreaRehydrateProps): Area {
    const id = validateAreaId(props.id);
    if (!props.organizationId || typeof props.organizationId !== "string" || !props.organizationId.trim()) {
      throw new OrganizationValidationError("Rehydrated area requires a valid organizationId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new OrganizationValidationError("Rehydrated area requires a valid tenantId");
    }
    if (typeof props.name !== "string" || !props.name.trim()) {
      throw new OrganizationValidationError("Rehydrated area name must be a non-empty string");
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new OrganizationValidationError(`Invalid area status: '${props.status}'`);
    }
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new OrganizationValidationError("Rehydrated area version must be an integer >= 1");
    }
    if (!(props.createdAt instanceof Date) || isNaN(props.createdAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated area createdAt must be a valid Date");
    }
    if (!(props.updatedAt instanceof Date) || isNaN(props.updatedAt.getTime())) {
      throw new OrganizationValidationError("Rehydrated area updatedAt must be a valid Date");
    }
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new OrganizationValidationError("Rehydrated area updatedAt cannot precede createdAt");
    }

    return new Area({
      id,
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

  update(props: UpdateAreaProps): Area {
    let nextName = this.name;
    if (props.name !== undefined) {
      if (typeof props.name !== "string" || !props.name.trim()) {
        throw new OrganizationValidationError("Updated area name must be a non-empty string");
      }
      nextName = props.name.trim();
    }

    let nextDescription = this.description;
    if (props.description !== undefined) {
      nextDescription = props.description.trim();
    }

    return new Area({
      id: this.id,
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

  activate(): Area {
    if (this.status === "ACTIVE") return this;
    return new Area({
      id: this.id,
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

  deactivate(): Area {
    if (this.status === "INACTIVE") return this;
    return new Area({
      id: this.id,
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
