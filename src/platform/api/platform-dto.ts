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
  readonly metrics: MetricSummaryDTO;
}

export interface ApiErrorResponseDTO {
  readonly error: string;
  readonly status: number;
  readonly code?: string | undefined;
  readonly traceId?: string | undefined;
}
