/**
 * AI Operating Platform - BusinessObjective Aggregate Root
 * 
 * Represents a gobernable business objective (Strategic, Operational, Tactical)
 * with monotonic lifecycle transitions, OCC versioning, and link lineage.
 * 
 * Strategy != Objective != Task
 * Objective != Initiative != Execution
 */

import {
  BusinessValidationError,
  InvalidBusinessLifecycleTransitionError,
  BusinessConcurrencyConflictError,
  BusinessTenantMismatchError,
} from "./business-errors.js";

export type BusinessObjectiveType = "STRATEGIC" | "OPERATIONAL" | "TACTICAL";

export type BusinessObjectiveLifecycleState =
  | "DRAFT"
  | "ACTIVE"
  | "AT_RISK"
  | "ACHIEVED"
  | "MISSED"
  | "CANCELLED"
  | "ARCHIVED";

export interface TargetMetricDefinition {
  readonly name: string;
  readonly unit: string;
  readonly targetValue: number;
}

export interface BusinessObjectiveProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly type: BusinessObjectiveType;
  readonly lifecycleState: BusinessObjectiveLifecycleState;
  readonly targetMetric?: TargetMetricDefinition | undefined;
  readonly startDate?: Date | undefined;
  readonly targetDate?: Date | undefined;
  readonly achievedAt?: Date | undefined;
  readonly linkedInitiativeIds: readonly string[];
  readonly linkedSolutionIds: readonly string[];
  readonly linkedWorkflowIds: readonly string[];
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBusinessObjectiveProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly type?: BusinessObjectiveType | undefined;
  readonly targetMetric?: TargetMetricDefinition | undefined;
  readonly startDate?: Date | undefined;
  readonly targetDate?: Date | undefined;
  readonly linkedInitiativeIds?: readonly string[] | undefined;
  readonly linkedSolutionIds?: readonly string[] | undefined;
  readonly linkedWorkflowIds?: readonly string[] | undefined;
}

export interface UpdateBusinessObjectiveProps {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly targetMetric?: TargetMetricDefinition | undefined;
  readonly startDate?: Date | undefined;
  readonly targetDate?: Date | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_TYPES: readonly BusinessObjectiveType[] = ["STRATEGIC", "OPERATIONAL", "TACTICAL"];
const VALID_STATES: readonly BusinessObjectiveLifecycleState[] = [
  "DRAFT",
  "ACTIVE",
  "AT_RISK",
  "ACHIEVED",
  "MISSED",
  "CANCELLED",
  "ARCHIVED",
];

export class BusinessObjective {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly type: BusinessObjectiveType;
  readonly lifecycleState: BusinessObjectiveLifecycleState;
  readonly targetMetric?: TargetMetricDefinition | undefined;
  readonly startDate?: Date | undefined;
  readonly targetDate?: Date | undefined;
  readonly achievedAt?: Date | undefined;
  readonly linkedInitiativeIds: readonly string[];
  readonly linkedSolutionIds: readonly string[];
  readonly linkedWorkflowIds: readonly string[];
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BusinessObjectiveProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.organizationId = props.organizationId;
    this.areaId = props.areaId;
    this.teamId = props.teamId;
    this.title = props.title;
    this.description = props.description;
    this.ownerPrincipalId = props.ownerPrincipalId;
    this.type = props.type;
    this.lifecycleState = props.lifecycleState;
    this.targetMetric = props.targetMetric ? Object.freeze({ ...props.targetMetric }) : undefined;
    this.startDate = props.startDate;
    this.targetDate = props.targetDate;
    this.achievedAt = props.achievedAt;
    this.linkedInitiativeIds = Object.freeze([...props.linkedInitiativeIds]);
    this.linkedSolutionIds = Object.freeze([...props.linkedSolutionIds]);
    this.linkedWorkflowIds = Object.freeze([...props.linkedWorkflowIds]);
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateBusinessObjectiveProps): BusinessObjective {
    if (!props) {
      throw new BusinessValidationError("CreateBusinessObjectiveProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new BusinessValidationError("Objective id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new BusinessValidationError("Tenant id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const enterpriseId = props.enterpriseId?.trim();
    if (!enterpriseId || !ID_REGEX.test(enterpriseId)) {
      throw new BusinessValidationError("Enterprise id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const title = props.title?.trim();
    if (!title || title.length > 256) {
      throw new BusinessValidationError("Objective title must be 1-256 characters");
    }
    const description = props.description?.trim() ?? "";
    const ownerPrincipalId = props.ownerPrincipalId?.trim();
    if (!ownerPrincipalId) {
      throw new BusinessValidationError("Owner principal id is required");
    }
    const type: BusinessObjectiveType = props.type ?? "STRATEGIC";
    if (!VALID_TYPES.includes(type)) {
      throw new BusinessValidationError(`Invalid objective type: '${type}'`);
    }

    if (props.targetMetric) {
      if (!props.targetMetric.name?.trim() || isNaN(props.targetMetric.targetValue)) {
        throw new BusinessValidationError("Target metric must specify a valid name and numeric targetValue");
      }
    }

    const now = new Date();

    return new BusinessObjective({
      id,
      tenantId,
      enterpriseId,
      organizationId: props.organizationId?.trim(),
      areaId: props.areaId?.trim(),
      teamId: props.teamId?.trim(),
      title,
      description,
      ownerPrincipalId,
      type,
      lifecycleState: "DRAFT",
      targetMetric: props.targetMetric,
      startDate: props.startDate,
      targetDate: props.targetDate,
      linkedInitiativeIds: props.linkedInitiativeIds ?? [],
      linkedSolutionIds: props.linkedSolutionIds ?? [],
      linkedWorkflowIds: props.linkedWorkflowIds ?? [],
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: BusinessObjectiveProps): BusinessObjective {
    if (!props) {
      throw new BusinessValidationError("BusinessObjectiveProps is required for rehydration");
    }
    if (!VALID_STATES.includes(props.lifecycleState)) {
      throw new BusinessValidationError(`Invalid objective lifecycle state: '${props.lifecycleState}'`);
    }
    return new BusinessObjective(props);
  }

  update(props: UpdateBusinessObjectiveProps): BusinessObjective {
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
    if (this.lifecycleState === "ARCHIVED") {
      throw new InvalidBusinessLifecycleTransitionError("ARCHIVED", "UPDATED", "BusinessObjective");
    }

    const title = props.title !== undefined ? props.title.trim() : this.title;
    if (!title || title.length > 256) {
      throw new BusinessValidationError("Objective title must be 1-256 characters");
    }
    const description = props.description !== undefined ? props.description.trim() : this.description;

    return new BusinessObjective({
      ...this,
      title,
      description,
      organizationId: props.organizationId !== undefined ? props.organizationId?.trim() : this.organizationId,
      areaId: props.areaId !== undefined ? props.areaId?.trim() : this.areaId,
      teamId: props.teamId !== undefined ? props.teamId?.trim() : this.teamId,
      targetMetric: props.targetMetric !== undefined ? props.targetMetric : this.targetMetric,
      startDate: props.startDate !== undefined ? props.startDate : this.startDate,
      targetDate: props.targetDate !== undefined ? props.targetDate : this.targetDate,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  activate(): BusinessObjective {
    if (this.lifecycleState !== "DRAFT" && this.lifecycleState !== "AT_RISK") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "ACTIVE", "BusinessObjective");
    }
    return new BusinessObjective({
      ...this,
      lifecycleState: "ACTIVE",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markAtRisk(reason?: string): BusinessObjective {
    if (this.lifecycleState !== "ACTIVE") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "AT_RISK", "BusinessObjective");
    }
    return new BusinessObjective({
      ...this,
      lifecycleState: "AT_RISK",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markAchieved(): BusinessObjective {
    if (this.lifecycleState !== "ACTIVE" && this.lifecycleState !== "AT_RISK") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "ACHIEVED", "BusinessObjective");
    }
    return new BusinessObjective({
      ...this,
      lifecycleState: "ACHIEVED",
      achievedAt: new Date(),
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markMissed(): BusinessObjective {
    if (this.lifecycleState !== "ACTIVE" && this.lifecycleState !== "AT_RISK") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "MISSED", "BusinessObjective");
    }
    return new BusinessObjective({
      ...this,
      lifecycleState: "MISSED",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  cancel(): BusinessObjective {
    if (this.lifecycleState === "ARCHIVED" || this.lifecycleState === "ACHIEVED") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "CANCELLED", "BusinessObjective");
    }
    return new BusinessObjective({
      ...this,
      lifecycleState: "CANCELLED",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  archive(): BusinessObjective {
    return new BusinessObjective({
      ...this,
      lifecycleState: "ARCHIVED",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  linkInitiative(initiativeId: string): BusinessObjective {
    const trimmed = initiativeId.trim();
    if (!trimmed || this.linkedInitiativeIds.includes(trimmed)) {
      return this;
    }
    return new BusinessObjective({
      ...this,
      linkedInitiativeIds: [...this.linkedInitiativeIds, trimmed],
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  unlinkInitiative(initiativeId: string): BusinessObjective {
    const trimmed = initiativeId.trim();
    if (!this.linkedInitiativeIds.includes(trimmed)) {
      return this;
    }
    return new BusinessObjective({
      ...this,
      linkedInitiativeIds: this.linkedInitiativeIds.filter((id) => id !== trimmed),
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  linkSolution(solutionId: string): BusinessObjective {
    const trimmed = solutionId.trim();
    if (!trimmed || this.linkedSolutionIds.includes(trimmed)) {
      return this;
    }
    return new BusinessObjective({
      ...this,
      linkedSolutionIds: [...this.linkedSolutionIds, trimmed],
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  linkWorkflow(workflowId: string): BusinessObjective {
    const trimmed = workflowId.trim();
    if (!trimmed || this.linkedWorkflowIds.includes(trimmed)) {
      return this;
    }
    return new BusinessObjective({
      ...this,
      linkedWorkflowIds: [...this.linkedWorkflowIds, trimmed],
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  assertTenant(expectedTenantId: string): void {
    if (this.tenantId !== expectedTenantId) {
      throw new BusinessTenantMismatchError(this.id, expectedTenantId, this.tenantId);
    }
  }
}
