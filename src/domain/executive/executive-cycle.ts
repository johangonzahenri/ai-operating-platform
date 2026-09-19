/**
 * AI Operating Platform - Executive Cycle Aggregate Root
 * 
 * Formal orchestration cycle managing the closed business loop:
 * OBSERVE -> ANALYZE -> PLAN -> GOVERN -> DECIDE -> EXECUTE -> VERIFY -> MEASURE -> ADAPT
 */

import {
  ExecutiveCycleValidationError,
  InvalidExecutiveCycleTransitionError,
  ExecutiveCycleExhaustedError,
  ExecutiveConcurrencyConflictError,
} from "./executive-errors.js";

export type ExecutiveCycleStatus =
  | "CREATED"
  | "OBSERVING"
  | "ANALYZING"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "VERIFYING"
  | "MEASURING"
  | "COMPLETED"
  | "REASSESSING"
  | "FAILED"
  | "BLOCKED";

const VALID_CYCLE_STATUSES: readonly ExecutiveCycleStatus[] = [
  "CREATED",
  "OBSERVING",
  "ANALYZING",
  "PLANNING",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "VERIFYING",
  "MEASURING",
  "COMPLETED",
  "REASSESSING",
  "FAILED",
  "BLOCKED",
];

const ALLOWED_CYCLE_TRANSITIONS: Readonly<Record<ExecutiveCycleStatus, readonly ExecutiveCycleStatus[]>> = {
  CREATED: ["OBSERVING", "FAILED", "BLOCKED"],
  OBSERVING: ["ANALYZING", "FAILED", "BLOCKED"],
  ANALYZING: ["PLANNING", "COMPLETED", "FAILED", "BLOCKED"],
  PLANNING: ["AWAITING_APPROVAL", "EXECUTING", "REASSESSING", "FAILED", "BLOCKED"],
  AWAITING_APPROVAL: ["EXECUTING", "REASSESSING", "BLOCKED", "FAILED"],
  EXECUTING: ["VERIFYING", "REASSESSING", "FAILED", "BLOCKED"],
  VERIFYING: ["MEASURING", "REASSESSING", "FAILED", "BLOCKED"],
  MEASURING: ["COMPLETED", "REASSESSING", "FAILED"],
  REASSESSING: ["PLANNING", "AWAITING_APPROVAL", "REASSESSING", "FAILED", "BLOCKED"],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: [],
};

export interface ExecutiveCycleProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly status: ExecutiveCycleStatus;
  readonly contextSnapshotId?: string | undefined;
  readonly analysisId?: string | undefined;
  readonly planId?: string | undefined;
  readonly activeActionIndex: number;
  readonly decisionRecordIds: readonly string[];
  readonly workflowInstanceIds: readonly string[];
  readonly verificationResultIds: readonly string[];
  readonly approvalRequestId?: string | undefined;
  readonly replanningCount: number;
  readonly maxReplanningAttempts: number;
  readonly maxActionsPerCycle: number;
  readonly outcomeSummary?: string | undefined;
  readonly failureReason?: string | undefined;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateExecutiveCycleProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly maxReplanningAttempts?: number | undefined;
  readonly maxActionsPerCycle?: number | undefined;
}

export class ExecutiveCycle {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly status: ExecutiveCycleStatus;
  readonly contextSnapshotId?: string | undefined;
  readonly analysisId?: string | undefined;
  readonly planId?: string | undefined;
  readonly activeActionIndex: number;
  readonly decisionRecordIds: readonly string[];
  readonly workflowInstanceIds: readonly string[];
  readonly verificationResultIds: readonly string[];
  readonly approvalRequestId?: string | undefined;
  readonly replanningCount: number;
  readonly maxReplanningAttempts: number;
  readonly maxActionsPerCycle: number;
  readonly outcomeSummary?: string | undefined;
  readonly failureReason?: string | undefined;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ExecutiveCycleProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.status = props.status;
    this.contextSnapshotId = props.contextSnapshotId;
    this.analysisId = props.analysisId;
    this.planId = props.planId;
    this.activeActionIndex = props.activeActionIndex;
    this.decisionRecordIds = props.decisionRecordIds;
    this.workflowInstanceIds = props.workflowInstanceIds;
    this.verificationResultIds = props.verificationResultIds;
    this.approvalRequestId = props.approvalRequestId;
    this.replanningCount = props.replanningCount;
    this.maxReplanningAttempts = props.maxReplanningAttempts;
    this.maxActionsPerCycle = props.maxActionsPerCycle;
    this.outcomeSummary = props.outcomeSummary;
    this.failureReason = props.failureReason;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateExecutiveCycleProps): ExecutiveCycle {
    if (!props.id || typeof props.id !== "string" || !props.id.trim()) {
      throw new ExecutiveCycleValidationError("ExecutiveCycle requires a valid non-empty id");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new ExecutiveCycleValidationError("ExecutiveCycle requires a valid non-empty tenantId");
    }
    if (!props.enterpriseId || typeof props.enterpriseId !== "string" || !props.enterpriseId.trim()) {
      throw new ExecutiveCycleValidationError("ExecutiveCycle requires a valid non-empty enterpriseId");
    }

    const now = new Date();
    return new ExecutiveCycle({
      id: props.id.trim(),
      tenantId: props.tenantId.trim(),
      enterpriseId: props.enterpriseId.trim(),
      status: "CREATED",
      activeActionIndex: 0,
      decisionRecordIds: Object.freeze([]),
      workflowInstanceIds: Object.freeze([]),
      verificationResultIds: Object.freeze([]),
      replanningCount: 0,
      maxReplanningAttempts: props.maxReplanningAttempts ?? 3,
      maxActionsPerCycle: props.maxActionsPerCycle ?? 10,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: ExecutiveCycleProps): ExecutiveCycle {
    if (!VALID_CYCLE_STATUSES.includes(props.status)) {
      throw new ExecutiveCycleValidationError(`Invalid ExecutiveCycle status '${props.status}'`);
    }
    return new ExecutiveCycle(props);
  }

  private transitionTo(newStatus: ExecutiveCycleStatus, updates: Partial<ExecutiveCycleProps> = {}): ExecutiveCycle {
    const allowed = ALLOWED_CYCLE_TRANSITIONS[this.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new InvalidExecutiveCycleTransitionError(this.status, newStatus);
    }
    return new ExecutiveCycle({
      ...this,
      ...updates,
      status: newStatus,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  startObserving(contextSnapshotId: string): ExecutiveCycle {
    return this.transitionTo("OBSERVING", { contextSnapshotId });
  }

  startAnalyzing(analysisId: string): ExecutiveCycle {
    return this.transitionTo("ANALYZING", { analysisId });
  }

  startPlanning(planId?: string): ExecutiveCycle {
    return this.transitionTo("PLANNING", { ...(planId ? { planId } : {}) });
  }

  awaitApproval(approvalRequestId: string): ExecutiveCycle {
    return this.transitionTo("AWAITING_APPROVAL", { approvalRequestId });
  }

  startExecuting(decisionRecordId?: string): ExecutiveCycle {
    const decisionRecordIds = decisionRecordId
      ? Object.freeze([...this.decisionRecordIds, decisionRecordId])
      : this.decisionRecordIds;
    return this.transitionTo("EXECUTING", { decisionRecordIds });
  }

  startVerifying(workflowInstanceId?: string): ExecutiveCycle {
    const workflowInstanceIds = workflowInstanceId
      ? Object.freeze([...this.workflowInstanceIds, workflowInstanceId])
      : this.workflowInstanceIds;
    return this.transitionTo("VERIFYING", { workflowInstanceIds });
  }

  startMeasuring(verificationResultId?: string): ExecutiveCycle {
    const verificationResultIds = verificationResultId
      ? Object.freeze([...this.verificationResultIds, verificationResultId])
      : this.verificationResultIds;
    return this.transitionTo("MEASURING", { verificationResultIds });
  }

  requestReassessment(reason?: string): ExecutiveCycle {
    if (this.replanningCount >= this.maxReplanningAttempts) {
      throw new ExecutiveCycleExhaustedError(this.id, "REPLANNING_ATTEMPTS", this.maxReplanningAttempts);
    }
    return this.transitionTo("REASSESSING", {
      replanningCount: this.replanningCount + 1,
      outcomeSummary: reason,
    });
  }

  complete(outcomeSummary: string): ExecutiveCycle {
    return this.transitionTo("COMPLETED", { outcomeSummary });
  }

  fail(reason: string): ExecutiveCycle {
    return this.transitionTo("FAILED", { failureReason: reason });
  }

  block(reason: string): ExecutiveCycle {
    return this.transitionTo("BLOCKED", { failureReason: reason });
  }

  assertConcurrency(expectedVersion: number): void {
    if (this.concurrencyVersion !== expectedVersion) {
      throw new ExecutiveConcurrencyConflictError(this.id, expectedVersion, this.concurrencyVersion);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      tenantId: this.tenantId,
      enterpriseId: this.enterpriseId,
      status: this.status,
      contextSnapshotId: this.contextSnapshotId,
      analysisId: this.analysisId,
      planId: this.planId,
      activeActionIndex: this.activeActionIndex,
      decisionRecordIds: this.decisionRecordIds,
      workflowInstanceIds: this.workflowInstanceIds,
      verificationResultIds: this.verificationResultIds,
      approvalRequestId: this.approvalRequestId,
      replanningCount: this.replanningCount,
      maxReplanningAttempts: this.maxReplanningAttempts,
      maxActionsPerCycle: this.maxActionsPerCycle,
      outcomeSummary: this.outcomeSummary,
      failureReason: this.failureReason,
      concurrencyVersion: this.concurrencyVersion,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
