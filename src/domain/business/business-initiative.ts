/**
 * AI Operating Platform - BusinessInitiative Aggregate Root
 * 
 * Connects Strategic Objectives to executable AI Solutions and Workflows.
 * 
 * Objective -> Initiative -> Solution / Workflow -> Task -> Execution
 */

import {
  BusinessValidationError,
  InvalidBusinessLifecycleTransitionError,
  BusinessConcurrencyConflictError,
  BusinessTenantMismatchError,
} from "./business-errors.js";

export type BusinessInitiativeLifecycleState =
  | "PLANNED"
  | "ACTIVE"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export interface BusinessInitiativeProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly lifecycleState: BusinessInitiativeLifecycleState;
  readonly targetStartDate?: Date | undefined;
  readonly targetEndDate?: Date | undefined;
  readonly linkedSolutionIds: readonly string[];
  readonly linkedWorkflowIds: readonly string[];
  readonly expectedOutcome?: string | undefined;
  readonly actualOutcome?: string | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBusinessInitiativeProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly targetStartDate?: Date | undefined;
  readonly targetEndDate?: Date | undefined;
  readonly linkedSolutionIds?: readonly string[] | undefined;
  readonly linkedWorkflowIds?: readonly string[] | undefined;
  readonly expectedOutcome?: string | undefined;
}

export interface UpdateBusinessInitiativeProps {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly targetStartDate?: Date | undefined;
  readonly targetEndDate?: Date | undefined;
  readonly expectedOutcome?: string | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_STATES: readonly BusinessInitiativeLifecycleState[] = [
  "PLANNED",
  "ACTIVE",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

export class BusinessInitiative {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly lifecycleState: BusinessInitiativeLifecycleState;
  readonly targetStartDate?: Date | undefined;
  readonly targetEndDate?: Date | undefined;
  readonly linkedSolutionIds: readonly string[];
  readonly linkedWorkflowIds: readonly string[];
  readonly expectedOutcome?: string | undefined;
  readonly actualOutcome?: string | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BusinessInitiativeProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.objectiveId = props.objectiveId;
    this.title = props.title;
    this.description = props.description;
    this.ownerPrincipalId = props.ownerPrincipalId;
    this.organizationId = props.organizationId;
    this.areaId = props.areaId;
    this.teamId = props.teamId;
    this.lifecycleState = props.lifecycleState;
    this.targetStartDate = props.targetStartDate;
    this.targetEndDate = props.targetEndDate;
    this.linkedSolutionIds = Object.freeze([...props.linkedSolutionIds]);
    this.linkedWorkflowIds = Object.freeze([...props.linkedWorkflowIds]);
    this.expectedOutcome = props.expectedOutcome;
    this.actualOutcome = props.actualOutcome;
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateBusinessInitiativeProps): BusinessInitiative {
    if (!props) {
      throw new BusinessValidationError("CreateBusinessInitiativeProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new BusinessValidationError("Initiative id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new BusinessValidationError("Tenant id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const enterpriseId = props.enterpriseId?.trim();
    if (!enterpriseId || !ID_REGEX.test(enterpriseId)) {
      throw new BusinessValidationError("Enterprise id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const objectiveId = props.objectiveId?.trim();
    if (!objectiveId || !ID_REGEX.test(objectiveId)) {
      throw new BusinessValidationError("Objective id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const title = props.title?.trim();
    if (!title || title.length > 256) {
      throw new BusinessValidationError("Initiative title must be 1-256 characters");
    }
    const description = props.description?.trim() ?? "";
    const ownerPrincipalId = props.ownerPrincipalId?.trim();
    if (!ownerPrincipalId) {
      throw new BusinessValidationError("Owner principal id is required");
    }
    const now = new Date();

    return new BusinessInitiative({
      id,
      tenantId,
      enterpriseId,
      objectiveId,
      title,
      description,
      ownerPrincipalId,
      organizationId: props.organizationId?.trim(),
      areaId: props.areaId?.trim(),
      teamId: props.teamId?.trim(),
      lifecycleState: "PLANNED",
      targetStartDate: props.targetStartDate,
      targetEndDate: props.targetEndDate,
      linkedSolutionIds: props.linkedSolutionIds ?? [],
      linkedWorkflowIds: props.linkedWorkflowIds ?? [],
      expectedOutcome: props.expectedOutcome?.trim(),
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: BusinessInitiativeProps): BusinessInitiative {
    if (!props) {
      throw new BusinessValidationError("BusinessInitiativeProps is required for rehydration");
    }
    if (!VALID_STATES.includes(props.lifecycleState)) {
      throw new BusinessValidationError(`Invalid initiative lifecycle state: '${props.lifecycleState}'`);
    }
    return new BusinessInitiative(props);
  }

  update(props: UpdateBusinessInitiativeProps): BusinessInitiative {
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
    if (this.lifecycleState === "COMPLETED" || this.lifecycleState === "CANCELLED") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "UPDATED", "BusinessInitiative");
    }

    const title = props.title !== undefined ? props.title.trim() : this.title;
    if (!title || title.length > 256) {
      throw new BusinessValidationError("Initiative title must be 1-256 characters");
    }
    const description = props.description !== undefined ? props.description.trim() : this.description;

    return new BusinessInitiative({
      ...this,
      title,
      description,
      organizationId: props.organizationId !== undefined ? props.organizationId?.trim() : this.organizationId,
      areaId: props.areaId !== undefined ? props.areaId?.trim() : this.areaId,
      teamId: props.teamId !== undefined ? props.teamId?.trim() : this.teamId,
      targetStartDate: props.targetStartDate !== undefined ? props.targetStartDate : this.targetStartDate,
      targetEndDate: props.targetEndDate !== undefined ? props.targetEndDate : this.targetEndDate,
      expectedOutcome: props.expectedOutcome !== undefined ? props.expectedOutcome?.trim() : this.expectedOutcome,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  activate(): BusinessInitiative {
    if (this.lifecycleState !== "PLANNED" && this.lifecycleState !== "BLOCKED") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "ACTIVE", "BusinessInitiative");
    }
    return new BusinessInitiative({
      ...this,
      lifecycleState: "ACTIVE",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  block(reason?: string): BusinessInitiative {
    if (this.lifecycleState !== "ACTIVE") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "BLOCKED", "BusinessInitiative");
    }
    return new BusinessInitiative({
      ...this,
      lifecycleState: "BLOCKED",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  complete(actualOutcome?: string): BusinessInitiative {
    if (this.lifecycleState !== "ACTIVE" && this.lifecycleState !== "BLOCKED") {
      throw new InvalidBusinessLifecycleTransitionError(this.lifecycleState, "COMPLETED", "BusinessInitiative");
    }
    return new BusinessInitiative({
      ...this,
      lifecycleState: "COMPLETED",
      actualOutcome: actualOutcome?.trim() ?? this.expectedOutcome,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  cancel(reason?: string): BusinessInitiative {
    if (this.lifecycleState === "COMPLETED") {
      throw new InvalidBusinessLifecycleTransitionError("COMPLETED", "CANCELLED", "BusinessInitiative");
    }
    return new BusinessInitiative({
      ...this,
      lifecycleState: "CANCELLED",
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  linkSolution(solutionId: string): BusinessInitiative {
    const trimmed = solutionId.trim();
    if (!trimmed || this.linkedSolutionIds.includes(trimmed)) {
      return this;
    }
    return new BusinessInitiative({
      ...this,
      linkedSolutionIds: [...this.linkedSolutionIds, trimmed],
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  unlinkSolution(solutionId: string): BusinessInitiative {
    const trimmed = solutionId.trim();
    if (!this.linkedSolutionIds.includes(trimmed)) {
      return this;
    }
    return new BusinessInitiative({
      ...this,
      linkedSolutionIds: this.linkedSolutionIds.filter((id) => id !== trimmed),
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  linkWorkflow(workflowId: string): BusinessInitiative {
    const trimmed = workflowId.trim();
    if (!trimmed || this.linkedWorkflowIds.includes(trimmed)) {
      return this;
    }
    return new BusinessInitiative({
      ...this,
      linkedWorkflowIds: [...this.linkedWorkflowIds, trimmed],
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  unlinkWorkflow(workflowId: string): BusinessInitiative {
    const trimmed = workflowId.trim();
    if (!this.linkedWorkflowIds.includes(trimmed)) {
      return this;
    }
    return new BusinessInitiative({
      ...this,
      linkedWorkflowIds: this.linkedWorkflowIds.filter((id) => id !== trimmed),
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
