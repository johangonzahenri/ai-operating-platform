import {
  OperationDetailProjection,
  OperationProjection,
  OperationQueryPort,
} from "../../application/ports/query-ports.js";
import { AutonomousOperation } from "../../domain/autonomy/autonomous-operation.js";
import { Decision } from "../../domain/autonomy/decision.js";
import { Observation } from "../../domain/autonomy/observation.js";
import {
  OperationRecord,
  OperationRepositoryPort,
} from "../../domain/autonomy/operation-repository.js";
import { Plan } from "../../domain/autonomy/plan.js";

export class InMemoryOperationRepository
  implements OperationRepositoryPort, OperationQueryPort
{
  private readonly records = new Map<string, OperationRecord>();

  save(
    operation: AutonomousOperation,
    details?: {
      readonly plan?: Plan | undefined;
      readonly observations?: readonly Observation[] | undefined;
      readonly decisions?: readonly Decision[] | undefined;
    }
  ): void {
    const existing = this.records.get(operation.id);
    const plan = details?.plan !== undefined ? details.plan : existing?.plan;
    const observations =
      details?.observations !== undefined
        ? Object.freeze([...details.observations])
        : existing?.observations ?? Object.freeze([]);
    const decisions =
      details?.decisions !== undefined
        ? Object.freeze([...details.decisions])
        : existing?.decisions ?? Object.freeze([]);

    this.records.set(
      operation.id,
      Object.freeze({
        operation,
        plan,
        observations,
        decisions,
      })
    );
  }

  findById(id: string): AutonomousOperation | undefined {
    return this.records.get(id)?.operation;
  }

  findRecordById(id: string): OperationRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    return {
      operation: record.operation,
      plan: record.plan,
      observations: record.observations,
      decisions: record.decisions,
    };
  }

  list(): readonly AutonomousOperation[] {
    return Array.from(this.records.values()).map((r) => r.operation);
  }

  listRecords(): readonly OperationRecord[] {
    return Array.from(this.records.values()).map((r) => ({
      operation: r.operation,
      plan: r.plan,
      observations: r.observations,
      decisions: r.decisions,
    }));
  }

  // --- OperationQueryPort (CQRS Projections) ---

  listProjections(): readonly OperationProjection[] {
    return Array.from(this.records.values()).map((r) => {
      const snap = r.operation.snapshot();
      return {
        id: snap.id,
        objective: snap.objective,
        agentId: snap.agentId,
        status: snap.status,
        budget: { ...snap.budget },
        consumption: { ...snap.consumption },
        createdAt: snap.createdAt,
        startedAt: snap.startedAt,
        completedAt: snap.completedAt,
        terminationReason: snap.terminationReason,
        failureError: snap.failureError ? { ...snap.failureError } : undefined,
        resultOutput: snap.resultOutput ? { ...snap.resultOutput } : undefined,
      };
    });
  }

  findDetailById(id: string): OperationDetailProjection | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    const op = record.operation;
    const snap = op.snapshot();

    const planProjection = record.plan
      ? {
          id: record.plan.id,
          operationId: record.plan.operationId,
          totalSteps: record.plan.totalSteps,
          steps: record.plan.steps.map((s) => ({
            id: s.id,
            order: s.order,
            action: s.action,
            input: { ...s.input },
            metadata: s.metadata ? { ...s.metadata } : undefined,
          })),
          createdAt: record.plan.createdAt,
        }
      : undefined;

    const observationProjections = record.observations.map((obs) => ({
      observationId: obs.observationId,
      operationId: obs.operationId,
      stepId: obs.stepId,
      status: obs.status,
      durationMs: obs.durationMs,
      toolCalls: obs.toolCalls ?? 0,
      output: obs.output ? { ...obs.output } : undefined,
      error: obs.error ? { ...obs.error } : undefined,
    }));

    const decisionProjections = record.decisions.map((dec) => ({
      type: dec.type,
      operationId: dec.operationId,
      stepId: dec.stepId,
      action: dec.action,
      input: dec.input ? { ...dec.input } : undefined,
      output: dec.output ? { ...dec.output } : undefined,
      reason: dec.reason,
      failureError: dec.failureError ? { ...dec.failureError } : undefined,
      decidedAt: dec.decidedAt,
    }));

    return {
      id: snap.id,
      objective: snap.objective,
      agentId: snap.agentId,
      status: snap.status,
      budget: { ...snap.budget },
      consumption: { ...snap.consumption },
      createdAt: snap.createdAt,
      startedAt: snap.startedAt,
      completedAt: snap.completedAt,
      terminationReason: snap.terminationReason,
      failureError: snap.failureError ? { ...snap.failureError } : undefined,
      resultOutput: snap.resultOutput ? { ...snap.resultOutput } : undefined,
      plan: planProjection,
      observations: observationProjections,
      decisions: decisionProjections,
    };
  }
}

