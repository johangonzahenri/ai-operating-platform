/**
 * AI Operating Platform - Executive Context Snapshot
 * 
 * Immutable point-in-time snapshot of the enterprise operational context.
 * Enables reproducible reasoning, deterministic governance evaluation, and auditability.
 */

import { ExecutiveCycleValidationError } from "./executive-errors.js";

export interface ObjectiveSnapshot {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly concurrencyVersion: number;
}

export interface InitiativeSnapshot {
  readonly id: string;
  readonly objectiveId: string;
  readonly title: string;
  readonly lifecycleState: string;
  readonly linkedSolutionIds: readonly string[];
  readonly linkedWorkflowIds: readonly string[];
  readonly concurrencyVersion: number;
}

export interface MetricSnapshot {
  readonly id: string;
  readonly objectiveId: string;
  readonly name: string;
  readonly targetValue: number;
  readonly currentValue?: number | undefined;
  readonly gap?: number | undefined;
  readonly status: string;
  readonly source: string;
  readonly lastUpdated: Date;
  readonly concurrencyVersion: number;
}

export interface SolutionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly publishedVersion?: number | undefined;
  readonly status: string;
}

export interface WorkflowDefinitionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly status: string;
  readonly stepCount: number;
}

export interface ExecutiveContextSnapshotProps {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly enterpriseName: string;
  readonly enterpriseStatus: string;
  readonly capturedAt: Date;
  readonly objectives: readonly ObjectiveSnapshot[];
  readonly initiatives: readonly InitiativeSnapshot[];
  readonly metrics: readonly MetricSnapshot[];
  readonly solutions: readonly SolutionSnapshot[];
  readonly workflows: readonly WorkflowDefinitionSnapshot[];
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class ExecutiveContextSnapshot {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly enterpriseName: string;
  readonly enterpriseStatus: string;
  readonly capturedAt: Date;
  readonly objectives: readonly ObjectiveSnapshot[];
  readonly initiatives: readonly InitiativeSnapshot[];
  readonly metrics: readonly MetricSnapshot[];
  readonly solutions: readonly SolutionSnapshot[];
  readonly workflows: readonly WorkflowDefinitionSnapshot[];
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(props: ExecutiveContextSnapshotProps) {
    if (!props.id || typeof props.id !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveContextSnapshot requires a valid id");
    }
    if (!props.cycleId || typeof props.cycleId !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveContextSnapshot requires a valid cycleId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveContextSnapshot requires a valid tenantId");
    }
    if (!props.enterpriseId || typeof props.enterpriseId !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveContextSnapshot requires a valid enterpriseId");
    }

    this.id = props.id.trim();
    this.cycleId = props.cycleId.trim();
    this.tenantId = props.tenantId.trim();
    this.enterpriseId = props.enterpriseId.trim();
    this.enterpriseName = props.enterpriseName ?? "";
    this.enterpriseStatus = props.enterpriseStatus ?? "ACTIVE";
    this.capturedAt = props.capturedAt ? new Date(props.capturedAt) : new Date();
    this.objectives = Object.freeze([...(props.objectives ?? [])]);
    this.initiatives = Object.freeze([...(props.initiatives ?? [])]);
    this.metrics = Object.freeze([...(props.metrics ?? [])]);
    this.solutions = Object.freeze([...(props.solutions ?? [])]);
    this.workflows = Object.freeze([...(props.workflows ?? [])]);
    this.metadata = Object.freeze({ ...(props.metadata ?? {}) });

    Object.freeze(this);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      cycleId: this.cycleId,
      tenantId: this.tenantId,
      enterpriseId: this.enterpriseId,
      enterpriseName: this.enterpriseName,
      enterpriseStatus: this.enterpriseStatus,
      capturedAt: this.capturedAt.toISOString(),
      objectives: this.objectives,
      initiatives: this.initiatives,
      metrics: this.metrics,
      solutions: this.solutions,
      workflows: this.workflows,
      metadata: this.metadata,
    };
  }
}
