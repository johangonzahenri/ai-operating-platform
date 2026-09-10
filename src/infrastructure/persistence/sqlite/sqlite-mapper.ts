import {
  AgentProjection,
  ExecutionProjection,
  OperationDetailProjection,
  OperationProjection,
  TaskProjection,
} from "../../../application/ports/query-ports.js";
import { Agent, AgentStatus } from "../../../domain/agent/agent.js";
import {
  AutonomousOperation,
  AutonomousOperationStatus,
} from "../../../domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../../domain/autonomy/autonomy-budget.js";
import { AutonomyConsumption } from "../../../domain/autonomy/autonomy-consumption.js";
import { Decision, DecisionType } from "../../../domain/autonomy/decision.js";
import { Observation, ObservationStatus } from "../../../domain/autonomy/observation.js";
import { Plan, PlanStep } from "../../../domain/autonomy/plan.js";
import { Execution, ExecutionStatus } from "../../../domain/execution/execution.js";
import { Task, TaskError, TaskStatus } from "../../../domain/task/task.js";
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

export interface TaskRow {
  readonly id: string;
  readonly trace_id: string;
  readonly agent_id: string;
  readonly input: string;
  readonly status: string;
  readonly created_at: string;
  readonly completed_at: string | null;
  readonly output: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
}

export interface ExecutionRow {
  readonly id: string;
  readonly task_id: string;
  readonly trace_id: string;
  readonly status: string;
  readonly created_at: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly result_metadata: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
}

export interface AgentRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly instructions: string;
  readonly tools: string;
  readonly memory_scope: string;
  readonly status: string;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export function parseIsoDate(value: unknown, fieldName: string): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SqlitePersistenceError(`Invalid date string for ${fieldName}: '${String(value)}'`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SqlitePersistenceError(`Invalid date parsing for ${fieldName}: '${value}'`);
  }
  return date;
}

export function parseJsonObject<T = Record<string, unknown>>(json: string, fieldName: string): T {
  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SqlitePersistenceError(`Field ${fieldName} must be a JSON object, received ${typeof parsed}`);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof SqlitePersistenceError) throw err;
    throw new SqlitePersistenceError(
      `Malformed JSON in field ${fieldName}: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
}

export function parseJsonArray<T = unknown>(json: string, fieldName: string): readonly T[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new SqlitePersistenceError(`Field ${fieldName} must be a JSON array`);
    }
    return parsed as readonly T[];
  } catch (err) {
    if (err instanceof SqlitePersistenceError) throw err;
    throw new SqlitePersistenceError(
      `Malformed JSON array in field ${fieldName}: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
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

const VALID_TASK_STATUSES: readonly TaskStatus[] = [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "WAITING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

const VALID_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  "CREATED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

const VALID_AGENT_STATUSES: readonly AgentStatus[] = ["ACTIVE", "INACTIVE"];

/**
 * Rehydrates a Task domain aggregate from a relational database row.
 */
export function mapRowToTask(row: TaskRow): Task {
  if (!VALID_TASK_STATUSES.includes(row.status as TaskStatus)) {
    throw new SqlitePersistenceError(`Corrupted task status in database: '${row.status}'`);
  }
  if (!row.id || typeof row.id !== "string" || row.id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted task id in database: '${row.id}'`);
  }
  if (!row.trace_id || typeof row.trace_id !== "string" || row.trace_id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted task trace_id in database: '${row.trace_id}'`);
  }
  if (!row.agent_id || typeof row.agent_id !== "string" || row.agent_id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted task agent_id in database: '${row.agent_id}'`);
  }

  const createdAt = parseIsoDate(row.created_at, "tasks.created_at");
  const input = parseJsonObject<Record<string, unknown>>(row.input, "tasks.input");

  let result: { output: Record<string, unknown>; completedAt: Date } | undefined;
  if (row.output !== null && row.output !== undefined) {
    if (!row.completed_at) {
      throw new SqlitePersistenceError("Task in database has output but missing completed_at timestamp");
    }
    result = {
      output: parseJsonObject<Record<string, unknown>>(row.output, "tasks.output"),
      completedAt: parseIsoDate(row.completed_at, "tasks.completed_at"),
    };
  } else if (row.completed_at) {
    throw new SqlitePersistenceError("Task in database has completed_at timestamp but missing output");
  }

  let error: TaskError | undefined;
  if (row.error_code && row.error_message) {
    error = new TaskError(row.error_code, row.error_message);
  } else if (row.error_code || row.error_message) {
    throw new SqlitePersistenceError("Task in database has incomplete error fields");
  }

  try {
    return Task.rehydrate({
      id: row.id,
      traceId: row.trace_id,
      request: {
        agentId: row.agent_id,
        input,
      },
      status: row.status as TaskStatus,
      createdAt,
      result,
      error,
    });
  } catch (domainErr) {
    throw new SqlitePersistenceError(
      `Failed to rehydrate Task aggregate: ${domainErr instanceof Error ? domainErr.message : String(domainErr)}`,
      domainErr
    );
  }
}

/**
 * Maps a TaskRow to lightweight TaskProjection (CQRS Read Model).
 */
export function mapRowToTaskProjection(row: TaskRow): TaskProjection {
  const createdAt = parseIsoDate(row.created_at, "tasks.created_at");
  const input = parseJsonObject<Record<string, unknown>>(row.input, "tasks.input");

  let result: { readonly output: Readonly<Record<string, unknown>> } | undefined;
  if (row.output) {
    result = { output: parseJsonObject<Record<string, unknown>>(row.output, "tasks.output") };
  }

  let error: { readonly code: string; readonly message: string } | undefined;
  if (row.error_code && row.error_message) {
    error = { code: row.error_code, message: row.error_message };
  }

  return {
    id: row.id,
    traceId: row.trace_id,
    request: {
      agentId: row.agent_id,
      input,
    },
    status: row.status,
    createdAt,
    result,
    error,
  };
}

/**
 * Rehydrates an Execution domain aggregate from a relational database row.
 */
export function mapRowToExecution(row: ExecutionRow): Execution {
  if (!VALID_EXECUTION_STATUSES.includes(row.status as ExecutionStatus)) {
    throw new SqlitePersistenceError(`Corrupted execution status in database: '${row.status}'`);
  }
  if (!row.id || typeof row.id !== "string" || row.id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted execution id in database: '${row.id}'`);
  }
  if (!row.task_id || typeof row.task_id !== "string" || row.task_id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted execution task_id in database: '${row.task_id}'`);
  }
  if (!row.trace_id || typeof row.trace_id !== "string" || row.trace_id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted execution trace_id in database: '${row.trace_id}'`);
  }

  const createdAt = parseIsoDate(row.created_at, "executions.created_at");
  const startedAt = row.started_at ? parseIsoDate(row.started_at, "executions.started_at") : undefined;
  const completedAt = row.completed_at ? parseIsoDate(row.completed_at, "executions.completed_at") : undefined;
  const resultMetadata = row.result_metadata
    ? parseJsonObject<Record<string, unknown>>(row.result_metadata, "executions.result_metadata")
    : undefined;

  let error: TaskError | undefined;
  if (row.error_code && row.error_message) {
    error = new TaskError(row.error_code, row.error_message);
  } else if (row.error_code || row.error_message) {
    throw new SqlitePersistenceError("Execution in database has incomplete error fields");
  }

  try {
    return Execution.rehydrate({
      id: row.id,
      taskId: row.task_id,
      traceId: row.trace_id,
      status: row.status as ExecutionStatus,
      createdAt,
      startedAt,
      completedAt,
      resultMetadata,
      error,
    });
  } catch (domainErr) {
    throw new SqlitePersistenceError(
      `Failed to rehydrate Execution aggregate: ${domainErr instanceof Error ? domainErr.message : String(domainErr)}`,
      domainErr
    );
  }
}

/**
 * Maps an ExecutionRow to lightweight ExecutionProjection (CQRS Read Model).
 */
export function mapRowToExecutionProjection(row: ExecutionRow): ExecutionProjection {
  const startedAt = row.started_at ? parseIsoDate(row.started_at, "executions.started_at") : undefined;
  const completedAt = row.completed_at ? parseIsoDate(row.completed_at, "executions.completed_at") : undefined;
  const resultMetadata = row.result_metadata
    ? parseJsonObject<Record<string, unknown>>(row.result_metadata, "executions.result_metadata")
    : undefined;

  let error: { readonly code: string; readonly message: string } | undefined;
  if (row.error_code && row.error_message) {
    error = { code: row.error_code, message: row.error_message };
  }

  return {
    id: row.id,
    taskId: row.task_id,
    traceId: row.trace_id,
    status: row.status,
    startedAt,
    completedAt,
    resultMetadata,
    error,
  };
}

/**
 * Rehydrates an Agent domain aggregate from a relational database row.
 */
export function mapRowToAgent(row: AgentRow): Agent {
  if (!VALID_AGENT_STATUSES.includes(row.status as AgentStatus)) {
    throw new SqlitePersistenceError(`Corrupted agent status in database: '${row.status}'`);
  }
  if (!row.id || typeof row.id !== "string" || row.id.trim() === "") {
    throw new SqlitePersistenceError(`Corrupted agent id in database: '${row.id}'`);
  }
  if (typeof row.version !== "number" || !Number.isInteger(row.version) || row.version < 1) {
    throw new SqlitePersistenceError(`Corrupted agent version in database: '${row.version}'`);
  }

  const createdAt = parseIsoDate(row.created_at, "agents.created_at");
  const updatedAt = parseIsoDate(row.updated_at, "agents.updated_at");
  const rawTools = parseJsonArray<string>(row.tools, "agents.tools");
  for (const t of rawTools) {
    if (typeof t !== "string" || t.trim() === "") {
      throw new SqlitePersistenceError(`Corrupted tool entry in agent tools array: '${String(t)}'`);
    }
  }

  try {
    return Agent.rehydrate({
      id: row.id,
      name: row.name,
      description: row.description,
      model: row.model,
      instructions: row.instructions,
      tools: rawTools,
      memoryScope: row.memory_scope,
      status: row.status as AgentStatus,
      version: row.version,
      createdAt,
      updatedAt,
    });
  } catch (domainErr) {
    throw new SqlitePersistenceError(
      `Failed to rehydrate Agent aggregate: ${domainErr instanceof Error ? domainErr.message : String(domainErr)}`,
      domainErr
    );
  }
}

/**
 * Maps an AgentRow to lightweight AgentProjection (CQRS Read Model).
 */
export function mapRowToAgentProjection(row: AgentRow): AgentProjection {
  const createdAt = parseIsoDate(row.created_at, "agents.created_at");
  const updatedAt = parseIsoDate(row.updated_at, "agents.updated_at");
  const tools = parseJsonArray<string>(row.tools, "agents.tools");

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    status: row.status as "ACTIVE" | "INACTIVE",
    model: row.model,
    instructions: row.instructions,
    tools,
    memoryScope: row.memory_scope,
    createdAt,
    updatedAt,
  };
}

