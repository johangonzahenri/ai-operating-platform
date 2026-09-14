export interface TaskDTO {
  readonly id: string;
  readonly traceId: string;
  readonly agentId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface ExecutionDTO {
  readonly id: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly currentRound?: number | undefined;
  readonly currentTool?: string | undefined;
  readonly toolCalls?: number | undefined;
  readonly completedToolCalls?: number | undefined;
  readonly toolErrors?: number | undefined;
  readonly currentActivity?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly finalResult?: Readonly<Record<string, unknown>> | undefined;
  readonly toolCallObservations?: readonly Readonly<Record<string, unknown>>[] | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface OperationDTO {
  readonly kind: "MODEL" | "TOOL";
  readonly id: string;
  readonly model?: string | undefined;
  readonly toolId?: string | undefined;
  readonly input: Readonly<Record<string, unknown>>;
  readonly bindings?: readonly { readonly targetKey: string; readonly operationId: string; readonly sourceKey: string }[] | undefined;
}

export interface OrchestrationRequestDTO {
  readonly operations: readonly OperationDTO[];
  readonly traceId?: string | undefined;
}

export interface OrchestrationResultDTO {
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED";
  readonly operations: readonly {
    readonly operationId: string;
    readonly kind?: "MODEL" | "TOOL" | undefined;
    readonly status: string;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly error?: string | undefined;
  }[];
  readonly output?: Readonly<Record<string, unknown>> | undefined;
}

export interface AuditObservationDTO {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly type: string;
  readonly traceId: string;
  readonly aggregateId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly operationId?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface MetricSummaryDTO {
  readonly counters: Readonly<Record<string, number>>;
  readonly samplesCount: number;
}

export interface ToolDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
}

export interface ModelDTO {
  readonly id: string;
  readonly provider: string;
  readonly name: string;
  readonly status: "connected" | "available" | "unavailable";
  readonly capabilities: readonly string[];
}

export interface AgentDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly model: string;
  readonly instructions: string;
  readonly tools: readonly string[];
  readonly memoryScope?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAgentRequestDTO {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly model: string;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export interface UpdateAgentRequestDTO {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly model?: string | undefined;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export interface ExecuteAgentRequestDTO {
  readonly input: Readonly<Record<string, unknown>>;
  readonly traceId?: string | undefined;
}

export interface ExecuteAgentResponseDTO {
  readonly task: TaskDTO;
  readonly execution: ExecutionDTO;
}

export interface PlatformStatusDTO {
  readonly status: "HEALTHY";
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly tasksCount: number;
  readonly executionsCount: number;
  readonly toolsCount: number;
  readonly modelsCount?: number | undefined;
  readonly agentsCount?: number | undefined;
  readonly operationsCount?: number | undefined;
  readonly metrics: MetricSummaryDTO;
}

export interface ApiErrorResponseDTO {
  readonly error: string;
  readonly status: number;
  readonly code?: string | undefined;
  readonly traceId?: string | undefined;
}

// --- Autonomous Operation DTOs (v0.9) ---

export interface AutonomyBudgetDTO {
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number | undefined;
}

export interface AutonomyConsumptionDTO {
  readonly stepsUsed: number;
  readonly elapsedMs: number;
  readonly toolCallsUsed: number;
  readonly tokensUsed?: number | undefined;
}

export interface AutonomousOperationDTO {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly status: string;
  readonly budget: AutonomyBudgetDTO;
  readonly consumption: AutonomyConsumptionDTO;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly terminationReason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlanStepDTO {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlanDTO {
  readonly id: string;
  readonly operationId: string;
  readonly totalSteps: number;
  readonly steps: readonly PlanStepDTO[];
  readonly createdAt: string;
}

export interface ObservationDTO {
  readonly observationId: string;
  readonly operationId: string;
  readonly stepId: string;
  readonly status: "SUCCESS" | "FAILED" | "CANCELLED";
  readonly durationMs: number;
  readonly toolCalls: number;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface DecisionDTO {
  readonly type: "EXECUTE_STEP" | "COMPLETE" | "STOP" | "FAIL";
  readonly operationId: string;
  readonly stepId?: string | undefined;
  readonly action?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly decidedAt: string;
}

export interface AutonomousOperationDetailDTO {
  readonly operation: AutonomousOperationDTO;
  readonly plan?: PlanDTO | undefined;
  readonly observations: readonly ObservationDTO[];
  readonly decisions: readonly DecisionDTO[];
}

export interface CreateAutonomousOperationRequestDTO {
  readonly id?: string | undefined;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudgetDTO;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface CancelAutonomousOperationRequestDTO {
  readonly reason?: string | undefined;
}

export interface ComponentHealthDTO {
  readonly status: "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED" | "READY" | "RECONCILED";
  readonly message?: string | undefined;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlatformHealthDTO {
  readonly status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  readonly liveness?: "UP" | "DOWN" | undefined;
  readonly readiness?: "READY" | "NOT_READY" | undefined;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly components: {
    readonly api: ComponentHealthDTO;
    readonly sqlite: ComponentHealthDTO & {
      readonly mode: "durable" | "in-memory";
    };
    readonly eventStore: ComponentHealthDTO & {
      readonly persistedCount: number;
      readonly queryableCount: number;
      readonly lastEventOccurredAt?: string | undefined;
    };
    readonly runtime: ComponentHealthDTO;
    readonly recovery: ComponentHealthDTO;
  };
}

export interface DurableEventDTO {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: string;
  readonly version: number;
  readonly metadata: {
    readonly sequenceNumber: number;
    readonly traceId: string;
    readonly correlationId: string;
    readonly causationId?: string | undefined;
    readonly schemaVersion: number;
  };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DurableEventListResponseDTO {
  readonly data: readonly DurableEventDTO[];
  readonly meta: {
    readonly count: number;
    readonly total: number;
    readonly afterSequence?: number | undefined;
    readonly beforeSequence?: number | undefined;
  };
}

// --- Diagnostics DTOs (v0.9.2) ---

export interface DiagnosticTraceNodeDTO {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: string;
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ExecutionTraceDiagnosticDTO {
  readonly traceId: string;
  readonly rootTaskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED" | "IN_PROGRESS" | "UNKNOWN";
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly failureReason?: string | undefined;
  readonly failureCode?: string | undefined;
  readonly isCrashRecovered: boolean;
  readonly timeline: readonly DiagnosticTraceNodeDTO[];
  readonly causalChain: readonly string[];
}

export interface CrashRecoveryDiagnosticDTO {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly recoveredAt: string;
  readonly code: string;
  readonly reason: string;
  readonly terminalStatus: string;
}

// --- Pagination DTOs (v0.9.2) ---

export interface PaginatedResponseDTO<T> {
  readonly data: readonly T[];
  readonly meta: {
    readonly count: number;
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  };
}

export interface PaginationOptions {
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

// --- Platform API v1 DTOs (Phase 14) ---

export interface PlatformMetadataDTO {
  readonly name: string;
  readonly version: string;
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly status: string;
  readonly capabilities: readonly string[];
  readonly defaultModel: string;
  readonly modelsCount: number;
  readonly toolsCount: number;
  readonly agentsCount: number;
}

export interface SafeAgentMetadataDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly model: string;
  readonly tools: readonly string[];
  readonly memoryScope?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskCancellationResultDTO {
  readonly taskId: string;
  readonly status: "CANCELLED";
  readonly cancelledAt: string;
  readonly reason?: string | undefined;
}

export interface PlatformApiResponse<T> {
  readonly success: boolean;
  readonly data?: T | undefined;
  readonly error?: { readonly code: string; readonly message: string; readonly details?: unknown } | undefined;
  readonly requestId: string;
  readonly correlationId?: string | undefined;
}

