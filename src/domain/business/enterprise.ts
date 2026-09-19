/**
 * AI Operating Platform - Enterprise Aggregate Root
 * 
 * Represents a governed business enterprise entity within a tenant context.
 * Serves as the top-level anchor for strategic objectives, operating models,
 * organizations, initiatives, and business governance.
 */

import {
  BusinessValidationError,
  InvalidBusinessLifecycleTransitionError,
  BusinessConcurrencyConflictError,
  BusinessTenantMismatchError,
} from "./business-errors.js";

export type EnterpriseStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface EnterpriseProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly industry: string;
  readonly status: EnterpriseStatus;
  readonly vision?: string | undefined;
  readonly strategicMission?: string | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEnterpriseProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly industry: string;
  readonly vision?: string | undefined;
  readonly strategicMission?: string | undefined;
}

export interface UpdateEnterpriseProps {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly industry?: string | undefined;
  readonly vision?: string | undefined;
  readonly strategicMission?: string | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_STATUSES: readonly EnterpriseStatus[] = ["ACTIVE", "SUSPENDED", "ARCHIVED"];

export class Enterprise {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly industry: string;
  readonly status: EnterpriseStatus;
  readonly vision?: string | undefined;
  readonly strategicMission?: string | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: EnterpriseProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description;
    this.industry = props.industry;
    this.status = props.status;
    this.vision = props.vision;
    this.strategicMission = props.strategicMission;
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateEnterpriseProps): Enterprise {
    if (!props) {
      throw new BusinessValidationError("CreateEnterpriseProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new BusinessValidationError("Enterprise id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new BusinessValidationError("Tenant id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const name = props.name?.trim();
    if (!name || name.length > 256) {
      throw new BusinessValidationError("Enterprise name must be 1-256 characters");
    }
    const description = props.description?.trim() ?? "";
    const industry = props.industry?.trim() ?? "General";
    const now = new Date();

    return new Enterprise({
      id,
      tenantId,
      name,
      description,
      industry,
      status: "ACTIVE",
      vision: props.vision?.trim(),
      strategicMission: props.strategicMission?.trim(),
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: EnterpriseProps): Enterprise {
    if (!props) {
      throw new BusinessValidationError("EnterpriseProps is required for rehydration");
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new BusinessValidationError(`Invalid enterprise status: '${props.status}'`);
    }
    return new Enterprise(props);
  }

  update(props: UpdateEnterpriseProps): Enterprise {
    if (
      props.expectedConcurrencyVersion !== undefined &&
      props.expectedConcurrencyVersion !== this.concurrencyVersion
    ) {
      throw new BusinessConcurrencyConflictError(
        this.id,
        props.expectedConcurrencyVersion,
        this.concurrencyVersion
      );
    }
    if (this.status === "ARCHIVED") {
      throw new InvalidBusinessLifecycleTransitionError("ARCHIVED", "UPDATED", "Enterprise");
    }

    const name = props.name !== undefined ? props.name.trim() : this.name;
    if (!name || name.length > 256) {
      throw new BusinessValidationError("Enterprise name must be 1-256 characters");
    }
    const description = props.description !== undefined ? props.description.trim() : this.description;
    const industry = props.industry !== undefined ? props.industry.trim() : this.industry;
    const vision = props.vision !== undefined ? props.vision.trim() : this.vision;
    const strategicMission =
      props.strategicMission !== undefined ? props.strategicMission.trim() : this.strategicMission;

    return new Enterprise({
      id: this.id,
      tenantId: this.tenantId,
      name,
      description,
      industry,
      status: this.status,
      vision,
      strategicMission,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  suspend(reason?: string): Enterprise {
    if (this.status === "ARCHIVED") {
      throw new InvalidBusinessLifecycleTransitionError("ARCHIVED", "SUSPENDED", "Enterprise");
    }
    return new Enterprise({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      industry: this.industry,
      status: "SUSPENDED",
      vision: this.vision,
      strategicMission: this.strategicMission,
      version: this.version,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  reactivate(): Enterprise {
    if (this.status === "ARCHIVED") {
      throw new InvalidBusinessLifecycleTransitionError("ARCHIVED", "ACTIVE", "Enterprise");
    }
    return new Enterprise({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      industry: this.industry,
      status: "ACTIVE",
      vision: this.vision,
      strategicMission: this.strategicMission,
      version: this.version,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  archive(): Enterprise {
    return new Enterprise({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      industry: this.industry,
      status: "ARCHIVED",
      vision: this.vision,
      strategicMission: this.strategicMission,
      version: this.version,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  assertTenant(expectedTenantId: string): void {
    if (this.tenantId !== expectedTenantId) {
      throw new BusinessTenantMismatchError(this.id, expectedTenantId, this.tenantId);
    }
  }
}
