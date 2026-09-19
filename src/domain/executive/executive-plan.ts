/**
 * AI Operating Platform - Executive Plan Aggregate Root
 * 
 * Formal declarative action plan produced by the Executive Orchestrator.
 * 
 * Invariants:
 * - Plan != Execution.
 * - Declarative only; contains 0 arbitrary shell code or direct unconstrained DB mutations.
 * - Must pass PlanValidator and GovernanceGate before becoming eligible for execution.
 */

import {
  ExecutivePlanValidationError,
  ExecutiveConcurrencyConflictError,
} from "./executive-errors.js";

export type ExecutivePlanStatus =
  | "DRAFT"
  | "VALIDATED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export type ExecutiveActionType =
  | "START_WORKFLOW"
  | "CREATE_INITIATIVE"
  | "REQUEST_APPROVAL"
  | "PAUSE_OPERATION"
  | "NO_ACTION"
  | "ADAPT_PLAN";

export interface ExecutivePlanAction {
  readonly actionId: string;
  readonly order: number;
  readonly actionType: ExecutiveActionType;
  readonly targetId: string;
  readonly solutionId?: string | undefined;
  readonly solutionVersion?: number | undefined;
  readonly workflowDefinitionId?: string | undefined;
  readonly requiredCapabilities: readonly string[];
  readonly expectedOutcome: string;
  readonly requiresApproval: boolean;
  readonly requiresVerification: boolean;
  readonly policyReferences: readonly string[];
  readonly inputPayload?: Readonly<Record<string, unknown>> | undefined;
}

export interface ExecutivePlanProps {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly initiativeId?: string | undefined;
  readonly rationale: string;
  readonly actions: readonly ExecutivePlanAction[];
  readonly status: ExecutivePlanStatus;
  readonly validationViolations?: readonly string[] | undefined;
  readonly rejectionReason?: string | undefined;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateExecutivePlanProps {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly initiativeId?: string | undefined;
  readonly rationale: string;
  readonly actions: readonly ExecutivePlanAction[];
}

export class ExecutivePlan {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly initiativeId?: string | undefined;
  readonly rationale: string;
  readonly actions: readonly ExecutivePlanAction[];
  readonly status: ExecutivePlanStatus;
  readonly validationViolations: readonly string[];
  readonly rejectionReason?: string | undefined;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ExecutivePlanProps) {
    this.id = props.id;
    this.cycleId = props.cycleId;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.objectiveId = props.objectiveId;
    this.initiativeId = props.initiativeId;
    this.rationale = props.rationale;
    this.actions = props.actions;
    this.status = props.status;
    this.validationViolations = props.validationViolations ?? [];
    this.rejectionReason = props.rejectionReason;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateExecutivePlanProps): ExecutivePlan {
    if (!props.id || typeof props.id !== "string" || !props.id.trim()) {
      throw new ExecutivePlanValidationError("ExecutivePlan requires a valid non-empty id");
    }
    if (!props.cycleId || typeof props.cycleId !== "string" || !props.cycleId.trim()) {
      throw new ExecutivePlanValidationError("ExecutivePlan requires a valid cycleId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new ExecutivePlanValidationError("ExecutivePlan requires a valid tenantId");
    }
    if (!props.enterpriseId || typeof props.enterpriseId !== "string" || !props.enterpriseId.trim()) {
      throw new ExecutivePlanValidationError("ExecutivePlan requires a valid enterpriseId");
    }
    if (!props.objectiveId || typeof props.objectiveId !== "string" || !props.objectiveId.trim()) {
      throw new ExecutivePlanValidationError("ExecutivePlan requires a valid objectiveId");
    }
    if (!props.actions || !Array.isArray(props.actions) || props.actions.length === 0) {
      throw new ExecutivePlanValidationError("ExecutivePlan must contain at least one action");
    }

    const now = new Date();
    const sanitizedActions: ExecutivePlanAction[] = props.actions.map((act, index) => {
      if (!act.actionId) {
        throw new ExecutivePlanValidationError(`Action at index ${index} must have a valid actionId`);
      }
      return {
        actionId: act.actionId.trim(),
        order: act.order ?? index + 1,
        actionType: act.actionType,
        targetId: act.targetId?.trim() ?? "",
        solutionId: act.solutionId?.trim() || undefined,
        solutionVersion: act.solutionVersion,
        workflowDefinitionId: act.workflowDefinitionId?.trim() || undefined,
        requiredCapabilities: Object.freeze([...(act.requiredCapabilities ?? [])]),
        expectedOutcome: act.expectedOutcome ?? "",
        requiresApproval: Boolean(act.requiresApproval),
        requiresVerification: Boolean(act.requiresVerification),
        policyReferences: Object.freeze([...(act.policyReferences ?? [])]),
        inputPayload: act.inputPayload ? Object.freeze({ ...act.inputPayload }) : undefined,
      };
    });

    return new ExecutivePlan({
      id: props.id.trim(),
      cycleId: props.cycleId.trim(),
      tenantId: props.tenantId.trim(),
      enterpriseId: props.enterpriseId.trim(),
      objectiveId: props.objectiveId.trim(),
      initiativeId: props.initiativeId?.trim() || undefined,
      rationale: props.rationale ?? "",
      actions: Object.freeze(sanitizedActions),
      status: "DRAFT",
      validationViolations: [],
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: ExecutivePlanProps): ExecutivePlan {
    return new ExecutivePlan(props);
  }

  markValidated(): ExecutivePlan {
    return new ExecutivePlan({
      ...this,
      status: "VALIDATED",
      validationViolations: [],
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markApproved(): ExecutivePlan {
    return new ExecutivePlan({
      ...this,
      status: "APPROVED",
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markRejected(reason: string, violations: readonly string[] = []): ExecutivePlan {
    return new ExecutivePlan({
      ...this,
      status: "REJECTED",
      rejectionReason: reason,
      validationViolations: Object.freeze([...violations]),
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markExecuting(): ExecutivePlan {
    return new ExecutivePlan({
      ...this,
      status: "EXECUTING",
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markCompleted(): ExecutivePlan {
    return new ExecutivePlan({
      ...this,
      status: "COMPLETED",
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  markFailed(reason: string): ExecutivePlan {
    return new ExecutivePlan({
      ...this,
      status: "FAILED",
      rejectionReason: reason,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  assertConcurrency(expectedVersion: number): void {
    if (this.concurrencyVersion !== expectedVersion) {
      throw new ExecutiveConcurrencyConflictError(this.id, expectedVersion, this.concurrencyVersion);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      cycleId: this.cycleId,
      tenantId: this.tenantId,
      enterpriseId: this.enterpriseId,
      objectiveId: this.objectiveId,
      initiativeId: this.initiativeId,
      rationale: this.rationale,
      actions: this.actions,
      status: this.status,
      validationViolations: this.validationViolations,
      rejectionReason: this.rejectionReason,
      concurrencyVersion: this.concurrencyVersion,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
