import { ModelMessage } from "../model/model-gateway.js";
import { BoundedDataLimits, DEFAULT_BOUNDED_DATA_LIMITS, deepFreeze, sanitizeBoundedValue, validateBoundedDataLimits } from "./bounded-data.js";

export interface TaskContextLimits extends BoundedDataLimits {
  readonly maxMessages: number;
  readonly maxObservations: number;
  readonly maxStringLength: number;
  readonly maxDepth: number;
  readonly maxObjectKeys: number;
}

export const DEFAULT_TASK_CONTEXT_LIMITS: Readonly<TaskContextLimits> = Object.freeze({
  maxMessages: 16,
  maxObservations: 16,
  maxStringLength: 2048,
  maxDepth: 4,
  maxObjectKeys: 64,
});

export interface TaskContextProps {
  readonly taskId: string;
  readonly executionId: string;
  readonly objective: string;
  readonly taskMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly executionStatus?: string | undefined;
  readonly executionSummary?: Readonly<Record<string, unknown>> | undefined;
  readonly currentRound?: number | undefined;
  readonly currentTool?: string | undefined;
  readonly observations?: readonly unknown[] | undefined;
  readonly messages?: readonly ModelMessage[] | undefined;
  readonly suppliedContext?: Readonly<Record<string, unknown>> | undefined;
  readonly finalResult?: Readonly<Record<string, unknown>> | undefined;
}

export interface TaskContextSnapshot {
  readonly taskId: string;
  readonly executionId: string;
  readonly objective: string;
  readonly taskMetadata: Readonly<Record<string, unknown>>;
  readonly executionStatus?: string | undefined;
  readonly executionSummary: Readonly<Record<string, unknown>>;
  readonly currentRound: number;
  readonly currentTool?: string | undefined;
  readonly observations: readonly Readonly<Record<string, unknown>>[];
  readonly messages: readonly ModelMessage[];
  readonly suppliedContext: Readonly<Record<string, unknown>>;
  readonly finalResult?: Readonly<Record<string, unknown>> | undefined;
  readonly truncated: boolean;
  readonly messageCount: number;
  readonly observationCount: number;
}

export interface TaskContextSnapshotOptions {
  readonly includeMessages?: boolean;
}

export class TaskContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskContextValidationError";
  }
}

function validateLimits(limits: TaskContextLimits): TaskContextLimits {
  validateBoundedDataLimits(limits);
  if (!Number.isInteger(limits.maxMessages) || limits.maxMessages < 1 || !Number.isInteger(limits.maxObservations) || limits.maxObservations < 1) {
    throw new TaskContextValidationError("Task context message and observation limits must be positive integers");
  }
  return limits;
}

function safeValue(
  value: unknown,
  limits: TaskContextLimits,
  depth = 0,
  state: { truncated: boolean } = { truncated: false }
): unknown {
  return sanitizeBoundedValue(value, limits, depth, state);
}

function normalizeRecord(
  value: unknown,
  limits: TaskContextLimits,
  state: { truncated: boolean }
): Readonly<Record<string, unknown>> {
  return deepFreeze((safeValue(value ?? {}, limits, 0, state) ?? {}) as Record<string, unknown>);
}

function normalizeMessages(
  messages: readonly ModelMessage[] | undefined,
  limits: TaskContextLimits,
  state: { truncated: boolean }
): readonly ModelMessage[] {
  const source = messages ?? [];
  if (source.length > limits.maxMessages) state.truncated = true;
  return deepFreeze(source.slice(-limits.maxMessages).map((message) => safeValue(message, limits, 0, state) as ModelMessage));
}

function normalizeObservations(
  observations: readonly unknown[] | undefined,
  limits: TaskContextLimits,
  state: { truncated: boolean }
): readonly Readonly<Record<string, unknown>>[] {
  const source = observations ?? [];
  if (source.length > limits.maxObservations) state.truncated = true;
  return deepFreeze(source.slice(-limits.maxObservations).map((observation) => normalizeRecord(observation, limits, state)));
}

export class TaskContext {
  readonly taskId: string;
  readonly executionId: string;
  readonly objective: string;
  readonly taskMetadata: Readonly<Record<string, unknown>>;
  readonly executionStatus?: string | undefined;
  readonly executionSummary: Readonly<Record<string, unknown>>;
  readonly currentRound: number;
  readonly currentTool?: string | undefined;
  readonly observations: readonly Readonly<Record<string, unknown>>[];
  readonly messages: readonly ModelMessage[];
  readonly suppliedContext: Readonly<Record<string, unknown>>;
  readonly finalResult?: Readonly<Record<string, unknown>> | undefined;
  readonly truncated: boolean;

  private constructor(snapshot: TaskContextSnapshot) {
    this.taskId = snapshot.taskId;
    this.executionId = snapshot.executionId;
    this.objective = snapshot.objective;
    this.taskMetadata = snapshot.taskMetadata;
    this.executionStatus = snapshot.executionStatus;
    this.executionSummary = snapshot.executionSummary;
    this.currentRound = snapshot.currentRound;
    this.currentTool = snapshot.currentTool;
    this.observations = snapshot.observations;
    this.messages = snapshot.messages;
    this.suppliedContext = snapshot.suppliedContext;
    this.finalResult = snapshot.finalResult;
    this.truncated = snapshot.truncated;
    Object.freeze(this);
  }

  static create(props: TaskContextProps, limits: TaskContextLimits = DEFAULT_TASK_CONTEXT_LIMITS): TaskContext {
    validateLimits(limits);
    if (!props || typeof props !== "object") throw new TaskContextValidationError("TaskContext props are required");
    const taskId = typeof props.taskId === "string" ? props.taskId.trim() : "";
    const executionId = typeof props.executionId === "string" ? props.executionId.trim() : "";
    const objective = typeof props.objective === "string" ? props.objective.trim() : "";
    if (!taskId || !executionId || !objective) {
      throw new TaskContextValidationError("TaskContext requires taskId, executionId, and objective");
    }
    if (objective.length > limits.maxStringLength) {
      throw new TaskContextValidationError("TaskContext objective exceeds the configured string limit");
    }
    if (props.currentRound !== undefined && (!Number.isInteger(props.currentRound) || props.currentRound < 0)) {
      throw new TaskContextValidationError("TaskContext currentRound must be a non-negative integer");
    }
    const state = { truncated: false };
    const messages = normalizeMessages(props.messages, limits, state);
    const observations = normalizeObservations(props.observations, limits, state);
    const finalResult = props.finalResult === undefined ? undefined : normalizeRecord(props.finalResult, limits, state);
    return new TaskContext({
      taskId,
      executionId,
      objective,
      taskMetadata: normalizeRecord(props.taskMetadata, limits, state),
      ...(props.executionStatus !== undefined ? { executionStatus: String(props.executionStatus).slice(0, limits.maxStringLength) } : {}),
      executionSummary: normalizeRecord(props.executionSummary, limits, state),
      currentRound: props.currentRound ?? 0,
      ...(props.currentTool !== undefined ? { currentTool: String(props.currentTool).slice(0, limits.maxStringLength) } : {}),
      observations,
      messages,
      suppliedContext: normalizeRecord(props.suppliedContext, limits, state),
      ...(finalResult !== undefined ? { finalResult } : {}),
      truncated: state.truncated,
      messageCount: messages.length,
      observationCount: observations.length,
    });
  }

  snapshot(options: TaskContextSnapshotOptions = {}): TaskContextSnapshot {
    return deepFreeze({
      taskId: this.taskId,
      executionId: this.executionId,
      objective: this.objective,
      taskMetadata: this.taskMetadata,
      ...(this.executionStatus !== undefined ? { executionStatus: this.executionStatus } : {}),
      executionSummary: this.executionSummary,
      currentRound: this.currentRound,
      ...(this.currentTool !== undefined ? { currentTool: this.currentTool } : {}),
      observations: this.observations,
      messages: options.includeMessages === false ? [] : this.messages,
      suppliedContext: this.suppliedContext,
      ...(this.finalResult !== undefined ? { finalResult: this.finalResult } : {}),
      truncated: this.truncated,
      messageCount: this.messages.length,
      observationCount: this.observations.length,
    });
  }
}
