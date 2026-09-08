import {
  OperationDetailProjection,
  OperationProjection,
} from "../../../application/ports/query-ports.js";
import {
  AutonomousOperation,
  AutonomousOperationStatus,
} from "../../../domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../../domain/autonomy/autonomy-budget.js";
import { AutonomyConsumption } from "../../../domain/autonomy/autonomy-consumption.js";
import { Decision, DecisionType } from "../../../domain/autonomy/decision.js";
import { Observation, ObservationStatus } from "../../../domain/autonomy/observation.js";
import { Plan, PlanStep } from "../../../domain/autonomy/plan.js";
import { SqlitePersistenceError } from "./sqlite-errors.js";

export interface OperationRow {
  readonly id: string;
  readonly agent_id: string;
  readonly objective: string;
  readonly status: string;
  readonly budget_max_steps: number;
  readonly budget_max_duration_ms: number;
  readonly budget_max_tool_calls: number;
  readonly budget_max_tokens: number | null;
  readonly consumption_steps_used: number;
  readonly consumption_elapsed_ms: number;
  readonly consumption_tool_calls_used: number;
  readonly consumption_tokens_used: number | null;
  readonly created_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly termination_reason: string | null;
  readonly failure_error_code: string | null;
  readonly failure_error_message: string | null;
  readonly result_output: string | null;
  readonly version: number;
}

export interface PlanRow {
  readonly id: string;
  readonly operation_id: string;
  readonly total_steps: number;
  readonly created_at: string;
}

export interface PlanStepRow {
  readonly id: string;
  readonly plan_id: string;
  readonly operation_id: string;
  readonly step_order: number;
  readonly action: string;
  readonly input: string;
  readonly metadata: string | null;
}

export interface ObservationRow {
  readonly observation_id: string;
  readonly operation_id: string;
  readonly step_id: string;
  readonly status: string;
  readonly duration_ms: number;
  readonly tool_calls: number;
  readonly output: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly metadata: string | null;
  readonly created_at: string;
}

export interface DecisionRow {
  readonly id: number;
  readonly operation_id: string;
  readonly type: string;
  readonly step_id: string | null;
  readonly action: string | null;
  readonly input: string | null;
  readonly output: string | null;
  readonly reason: string | null;
  readonly failure_error_code: string | null;
  readonly failure_error_message: string | null;
  readonly decided_at: string;
}

const VALID_STATUSES: readonly AutonomousOperationStatus[] = [
  "SUBMITTED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BUDGET_EXHAUSTED",
];

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Rehydrates an AutonomousOperation domain aggregate from relational database columns.
 */
export function mapRowToAutonomousOperation(row: OperationRow): AutonomousOperation {
  if (!VALID_STATUSES.includes(row.status as AutonomousOperationStatus)) {
    throw new SqlitePersistenceError(`Corrupted operation status in database: '${row.status}'`);
  }

  if (!row.id || !ID_REGEX.test(row.id)) {
    throw new SqlitePersistenceError(`Corrupted operation id in database: '${row.id}'`);
  }

  if (!row.agent_id || !ID_REGEX.test(row.agent_id)) {
    throw new SqlitePersistenceError(`Corrupted agent_id in database: '${row.agent_id}'`);
  }

  const budget = AutonomyBudget.create({
    maxSteps: row.budget_max_steps,
    maxDurationMs: row.budget_max_duration_ms,
    maxToolCalls: row.budget_max_tool_calls,
    maxTokens: row.budget_max_tokens ?? undefined,
  });

  const consumption = AutonomyConsumption.create({
    stepsUsed: row.consumption_steps_used,
    toolCallsUsed: row.consumption_tool_calls_used,
    elapsedMs: row.consumption_elapsed_ms,
    tokensUsed: row.consumption_tokens_used ?? undefined,
  });

  const failureError =
    row.failure_error_code && row.failure_error_message
      ? { code: row.failure_error_code, message: row.failure_error_message }
      : undefined;

  const resultOutput = row.result_output
    ? JSON.parse(row.result_output)
    : undefined;

  return AutonomousOperation.rehydrate({
    id: row.id,
    objective: row.objective,
    agentId: row.agent_id,
    budget,
    consumption,
    status: row.status as AutonomousOperationStatus,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    terminationReason: row.termination_reason ?? undefined,
    failureError,
    resultOutput,
  });
}

/**
 * Rehydrates a Plan domain entity from relational database rows.
 */
export function mapRowToPlan(planRow: PlanRow, stepRows: readonly PlanStepRow[]): Plan {
  const steps = stepRows.map((s) =>
    PlanStep.create({
      id: s.id,
      order: s.step_order,
      action: s.action,
      input: JSON.parse(s.input),
      metadata: s.metadata ? JSON.parse(s.metadata) : undefined,
    })
  );

  return Plan.create({
    id: planRow.id,
    operationId: planRow.operation_id,
    steps,
    createdAt: new Date(planRow.created_at),
  });
}

/**
 * Rehydrates an Observation Value Object from a relational database row.
 */
export function mapRowToObservation(row: ObservationRow): Observation {
  return Observation.create({
    observationId: row.observation_id,
    operationId: row.operation_id,
    stepId: row.step_id,
    status: row.status as ObservationStatus,
    durationMs: row.duration_ms,
    toolCalls: row.tool_calls,
    output: row.output ? JSON.parse(row.output) : undefined,
    error:
      row.error_code && row.error_message
        ? { code: row.error_code, message: row.error_message }
        : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  });
}

/**
 * Rehydrates a Decision domain entity from a relational database row.
 */
export function mapRowToDecision(row: DecisionRow): Decision {
  return Decision.create({
    operationId: row.operation_id,
    type: row.type as DecisionType,
    stepId: row.step_id ?? undefined,
    action: row.action ?? undefined,
    input: row.input ? JSON.parse(row.input) : undefined,
    output: row.output ? JSON.parse(row.output) : undefined,
    reason: row.reason ?? undefined,
    failureError:
      row.failure_error_code && row.failure_error_message
        ? { code: row.failure_error_code, message: row.failure_error_message }
        : undefined,
    decidedAt: new Date(row.decided_at),
  });
}

/**
 * Maps an OperationRow to lightweight OperationProjection (CQRS Read Model).
 */
export function mapRowToProjection(row: OperationRow): OperationProjection {
  return {
    id: row.id,
    objective: row.objective,
    agentId: row.agent_id,
    status: row.status,
    budget: {
      maxSteps: row.budget_max_steps,
      maxDurationMs: row.budget_max_duration_ms,
      maxToolCalls: row.budget_max_tool_calls,
      maxTokens: row.budget_max_tokens ?? undefined,
    },
    consumption: {
      stepsUsed: row.consumption_steps_used,
      elapsedMs: row.consumption_elapsed_ms,
      toolCallsUsed: row.consumption_tool_calls_used,
      tokensUsed: row.consumption_tokens_used ?? undefined,
    },
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    terminationReason: row.termination_reason ?? undefined,
    failureError:
      row.failure_error_code && row.failure_error_message
        ? { code: row.failure_error_code, message: row.failure_error_message }
        : undefined,
    resultOutput: row.result_output ? JSON.parse(row.result_output) : undefined,
  };
}

/**
 * Maps relational rows to deep OperationDetailProjection.
 */
export function mapRowsToDetailProjection(
  opRow: OperationRow,
  planRow?: PlanRow,
  stepRows: readonly PlanStepRow[] = [],
  obsRows: readonly ObservationRow[] = [],
  decRows: readonly DecisionRow[] = []
): OperationDetailProjection {
  const base = mapRowToProjection(opRow);

  const plan = planRow
    ? {
        id: planRow.id,
        operationId: planRow.operation_id,
        totalSteps: planRow.total_steps,
        steps: stepRows.map((s) => ({
          id: s.id,
          order: s.step_order,
          action: s.action,
          input: JSON.parse(s.input),
          metadata: s.metadata ? JSON.parse(s.metadata) : undefined,
        })),
        createdAt: new Date(planRow.created_at),
      }
    : undefined;

  const observations = obsRows.map((obs) => ({
    observationId: obs.observation_id,
    operationId: obs.operation_id,
    stepId: obs.step_id,
    status: obs.status,
    durationMs: obs.duration_ms,
    toolCalls: obs.tool_calls,
    output: obs.output ? JSON.parse(obs.output) : undefined,
    error:
      obs.error_code && obs.error_message
        ? { code: obs.error_code, message: obs.error_message }
        : undefined,
  }));

  const decisions = decRows.map((dec) => ({
    type: dec.type,
    operationId: dec.operation_id,
    stepId: dec.step_id ?? undefined,
    action: dec.action ?? undefined,
    input: dec.input ? JSON.parse(dec.input) : undefined,
    output: dec.output ? JSON.parse(dec.output) : undefined,
    reason: dec.reason ?? undefined,
    failureError:
      dec.failure_error_code && dec.failure_error_message
        ? { code: dec.failure_error_code, message: dec.failure_error_message }
        : undefined,
    decidedAt: new Date(dec.decided_at),
  }));

  return {
    ...base,
    plan,
    observations,
    decisions,
  };
}
