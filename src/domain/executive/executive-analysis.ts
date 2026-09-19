/**
 * AI Operating Platform - Executive Analysis Domain Entity
 * 
 * Formal evaluation and synthesis of detected signals against the context snapshot.
 */

import { ExecutiveSignal } from "./executive-signal.js";
import { ExecutiveCycleValidationError } from "./executive-errors.js";

export type RecommendedActionCategory =
  | "NO_ACTION"
  | "START_WORKFLOW"
  | "CREATE_INITIATIVE"
  | "PAUSE_OPERATION"
  | "REQUEST_APPROVAL"
  | "ADAPT_PLAN";

export interface ExecutiveAnalysisProps {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly observedSignals: readonly ExecutiveSignal[];
  readonly affectedObjectiveIds: readonly string[];
  readonly affectedInitiativeIds: readonly string[];
  readonly impactedSolutionIds: readonly string[];
  readonly impactedWorkflowIds: readonly string[];
  readonly budgetConstraints?: readonly string[] | undefined;
  readonly evidenceReferences: readonly string[];
  readonly recommendedActionCategory: RecommendedActionCategory;
  readonly summary: string;
  readonly createdAt?: Date | undefined;
}

export class ExecutiveAnalysis {
  readonly id: string;
  readonly cycleId: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly observedSignals: readonly ExecutiveSignal[];
  readonly affectedObjectiveIds: readonly string[];
  readonly affectedInitiativeIds: readonly string[];
  readonly impactedSolutionIds: readonly string[];
  readonly impactedWorkflowIds: readonly string[];
  readonly budgetConstraints: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly recommendedActionCategory: RecommendedActionCategory;
  readonly summary: string;
  readonly createdAt: Date;

  constructor(props: ExecutiveAnalysisProps) {
    if (!props.id || typeof props.id !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveAnalysis requires a valid id");
    }
    if (!props.cycleId || typeof props.cycleId !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveAnalysis requires a valid cycleId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveAnalysis requires a valid tenantId");
    }
    if (!props.enterpriseId || typeof props.enterpriseId !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveAnalysis requires a valid enterpriseId");
    }

    this.id = props.id.trim();
    this.cycleId = props.cycleId.trim();
    this.tenantId = props.tenantId.trim();
    this.enterpriseId = props.enterpriseId.trim();
    this.observedSignals = Object.freeze([...(props.observedSignals ?? [])]);
    this.affectedObjectiveIds = Object.freeze([...(props.affectedObjectiveIds ?? [])]);
    this.affectedInitiativeIds = Object.freeze([...(props.affectedInitiativeIds ?? [])]);
    this.impactedSolutionIds = Object.freeze([...(props.impactedSolutionIds ?? [])]);
    this.impactedWorkflowIds = Object.freeze([...(props.impactedWorkflowIds ?? [])]);
    this.budgetConstraints = Object.freeze([...(props.budgetConstraints ?? [])]);
    this.evidenceReferences = Object.freeze([...(props.evidenceReferences ?? [])]);
    this.recommendedActionCategory = props.recommendedActionCategory;
    this.summary = props.summary ?? "";
    this.createdAt = props.createdAt ? new Date(props.createdAt) : new Date();

    Object.freeze(this);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      cycleId: this.cycleId,
      tenantId: this.tenantId,
      enterpriseId: this.enterpriseId,
      observedSignals: this.observedSignals.map((s) => s.toJSON()),
      affectedObjectiveIds: this.affectedObjectiveIds,
      affectedInitiativeIds: this.affectedInitiativeIds,
      impactedSolutionIds: this.impactedSolutionIds,
      impactedWorkflowIds: this.impactedWorkflowIds,
      budgetConstraints: this.budgetConstraints,
      evidenceReferences: this.evidenceReferences,
      recommendedActionCategory: this.recommendedActionCategory,
      summary: this.summary,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
