import type {
  AuditObservationDTO,
  DurableEventDTO,
  ExecutionDTO,
  PlatformHealthDTO,
  TaskDTO,
} from "../api/platform-dto.js";

export type ExecutionStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | string;

export interface ExecutionContract {
  readonly executionId: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: ExecutionStatus;
  readonly createdAt?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly currentStep?: string | undefined;
  readonly completedSteps: readonly string[];
  readonly result?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  readonly currentRound?: number | undefined;
  readonly currentTool?: string | undefined;
  readonly toolCalls?: number | undefined;
  readonly completedToolCalls?: number | undefined;
  readonly finalResult?: Readonly<Record<string, unknown>> | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly toolErrors?: number | undefined;
  readonly currentActivity?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly toolCallObservations?: readonly Readonly<Record<string, unknown>>[] | undefined;
}

export interface TaskContract {
  readonly taskId: string;
  readonly traceId: string;
  readonly agentId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly result?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface EventContract {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly eventType: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly traceId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type HealthContract = PlatformHealthDTO;

export function toTaskDTO(task: TaskDTO): TaskContract {
  return {
    taskId: task.id,
    traceId: task.traceId,
    agentId: task.agentId,
    status: task.status,
    createdAt: task.createdAt,
    input: task.input,
    result: task.output,
    error: task.error,
  };
}

export function toExecutionDTO(execution: ExecutionDTO): ExecutionContract {
  const metadata = execution.metadata;
  const completedSteps = Array.isArray(metadata?.completedSteps)
    ? metadata.completedSteps.filter((step): step is string => typeof step === "string")
    : [];
  const currentStep = typeof metadata?.currentStep === "string" ? metadata.currentStep : undefined;
  const result = metadata && typeof metadata.result === "object" && metadata.result !== null
    ? metadata.result as Readonly<Record<string, unknown>>
    : undefined;

  return {
    executionId: execution.id,
    taskId: execution.taskId,
    traceId: execution.traceId,
    status: execution.status,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    currentStep,
    completedSteps,
    result,
    error: execution.error,
    provider: execution.provider,
    model: execution.model,
    currentRound: execution.currentRound,
    currentTool: execution.currentTool,
    toolCalls: execution.toolCalls,
    completedToolCalls: execution.completedToolCalls,
    toolErrors: execution.toolErrors,
    currentActivity: execution.currentActivity,
    durationMs: execution.durationMs,
    finalResult: execution.finalResult,
    toolCallObservations: execution.toolCallObservations,
  };
}

export function toEventDTO(event: DurableEventDTO | AuditObservationDTO): EventContract {
  if ("aggregateType" in event) {
    return {
      eventId: event.id,
      occurredAt: event.occurredAt,
      eventType: event.type,
      executionId: event.aggregateType === "execution" ? event.aggregateId : undefined,
      traceId: event.traceId,
      payload: event.payload,
    };
  }
  return {
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    eventType: event.type,
    executionId: event.executionId,
    taskId: event.taskId,
    traceId: event.traceId,
    payload: event.payload,
  };
}

export function toHealthDTO(health: PlatformHealthDTO): HealthContract {
  return health;
}

export type PlatformMetadataContract = import("../api/platform-dto.js").PlatformMetadataDTO;
export type SafeAgentMetadataContract = import("../api/platform-dto.js").SafeAgentMetadataDTO;
export type TaskCancellationContract = import("../api/platform-dto.js").TaskCancellationResultDTO;

