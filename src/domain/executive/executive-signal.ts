/**
 * AI Operating Platform - Executive Signal Value Object
 * 
 * Formal representation of an observable operational or strategic condition.
 * 
 * Invariants:
 * - Signal != Decision != Plan != Execution.
 * - Signals only inform with factual evidence references; they never trigger unconstrained actions.
 */

import { ExecutiveCycleValidationError } from "./executive-errors.js";

export type ExecutiveSignalType =
  | "KPI_OFF_TRACK"
  | "KPI_AT_RISK"
  | "OBJECTIVE_AT_RISK"
  | "OBJECTIVE_MISSED"
  | "INITIATIVE_BLOCKED"
  | "WORKFLOW_FAILURE"
  | "VERIFICATION_FAILURE"
  | "APPROVAL_BLOCKED"
  | "AGENT_UNAVAILABLE"
  | "BUDGET_CONSTRAINT";

export type ExecutiveSignalSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type ExecutiveSignalTargetType =
  | "METRIC"
  | "OBJECTIVE"
  | "INITIATIVE"
  | "WORKFLOW"
  | "AGENT"
  | "BUDGET"
  | "APPROVAL";

export interface ExecutiveSignalProps {
  readonly id: string;
  readonly type: ExecutiveSignalType;
  readonly severity: ExecutiveSignalSeverity;
  readonly source: string;
  readonly targetType: ExecutiveSignalTargetType;
  readonly targetId: string;
  readonly description: string;
  readonly evidenceReference: string;
  readonly detectedAt: Date;
}

export class ExecutiveSignal {
  readonly id: string;
  readonly type: ExecutiveSignalType;
  readonly severity: ExecutiveSignalSeverity;
  readonly source: string;
  readonly targetType: ExecutiveSignalTargetType;
  readonly targetId: string;
  readonly description: string;
  readonly evidenceReference: string;
  readonly detectedAt: Date;

  constructor(props: ExecutiveSignalProps) {
    if (!props.id || typeof props.id !== "string") {
      throw new ExecutiveCycleValidationError("ExecutiveSignal requires a valid non-empty id");
    }
    if (!props.source || typeof props.source !== "string" || !props.source.trim()) {
      throw new ExecutiveCycleValidationError("ExecutiveSignal requires a mandatory ground-truth source");
    }
    if (!props.targetId || typeof props.targetId !== "string" || !props.targetId.trim()) {
      throw new ExecutiveCycleValidationError("ExecutiveSignal requires a valid targetId");
    }
    if (!props.evidenceReference || typeof props.evidenceReference !== "string" || !props.evidenceReference.trim()) {
      throw new ExecutiveCycleValidationError("ExecutiveSignal requires a valid non-empty evidenceReference");
    }

    this.id = props.id.trim();
    this.type = props.type;
    this.severity = props.severity;
    this.source = props.source.trim();
    this.targetType = props.targetType;
    this.targetId = props.targetId.trim();
    this.description = props.description ?? "";
    this.evidenceReference = props.evidenceReference.trim();
    this.detectedAt = props.detectedAt ? new Date(props.detectedAt) : new Date();

    Object.freeze(this);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      severity: this.severity,
      source: this.source,
      targetType: this.targetType,
      targetId: this.targetId,
      description: this.description,
      evidenceReference: this.evidenceReference,
      detectedAt: this.detectedAt.toISOString(),
    };
  }
}
