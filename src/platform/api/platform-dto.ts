export interface TaskDTO {
  readonly id: string;
  readonly traceId: string;
  readonly agentId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface ExecutionDTO {
  readonly id: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface OperationDTO {
  readonly kind: "MODEL" | "TOOL";
  readonly id: string;
  readonly model?: string;
  readonly toolId?: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly bindings?: readonly { readonly targetKey: string; readonly operationId: string; readonly sourceKey: string }[];
}

export interface OrchestrationRequestDTO {
  readonly operations: readonly OperationDTO[];
  readonly traceId?: string;
}

export interface OrchestrationResultDTO {
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED";
  readonly operations: readonly {
    readonly operationId: string;
    readonly status: string;
    readonly output?: Readonly<Record<string, unknown>>;
    readonly error?: string;
  }[];
  readonly output?: Readonly<Record<string, unknown>>;
}

export interface AuditObservationDTO {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly type: string;
  readonly traceId: string;
  readonly aggregateId: string;
  readonly taskId?: string;
  readonly executionId?: string;
  readonly operationId?: string;
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
  readonly version?: string;
}

export interface PlatformStatusDTO {
  readonly status: "HEALTHY";
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly tasksCount: number;
  readonly executionsCount: number;
  readonly toolsCount: number;
  readonly metrics: MetricSummaryDTO;
}
