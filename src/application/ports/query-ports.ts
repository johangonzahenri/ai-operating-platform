export interface TaskProjection {
  readonly id: string;
  readonly traceId: string;
  readonly request: {
    readonly agentId: string;
    readonly input: Readonly<Record<string, unknown>>;
  };
  readonly status: string;
  readonly createdAt: Date;
  readonly result?: {
    readonly output: Readonly<Record<string, unknown>>;
  } | undefined;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  } | undefined;
}

export interface TaskQueryPort {
  findById(id: string): TaskProjection | undefined;
  list(): readonly TaskProjection[];
}

export interface ExecutionProjection {
  readonly id: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: string;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly resultMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  } | undefined;
}

export interface ExecutionQueryPort {
  findById(id: string): ExecutionProjection | undefined;
  list(): readonly ExecutionProjection[];
}

export interface AuditObservationProjection {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly type: string;
  readonly traceId: string;
  readonly aggregateId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly operationId?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuditQueryPort {
  readonly observations: readonly AuditObservationProjection[];
  findByExecutionId(executionId: string): readonly AuditObservationProjection[];
}

export interface MetricSampleProjection {
  readonly name: string;
  readonly value: number;
  readonly dimensions?: Readonly<Record<string, string>> | undefined;
}

export interface MetricsQueryPort {
  getAllCounters(): Readonly<Record<string, number>>;
  readonly samples: readonly MetricSampleProjection[];
}

export interface ToolProjection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
}

export interface ToolQueryPort {
  list(): readonly ToolProjection[];
  findById(id: string): ToolProjection | undefined;
}

export interface ModelProjection {
  readonly id: string;
  readonly provider: string;
  readonly name: string;
  readonly status: "connected" | "available" | "unavailable";
  readonly capabilities: readonly string[];
}

export interface ModelQueryPort {
  list(): readonly ModelProjection[];
  findById(id: string): ModelProjection | undefined;
}

export interface AgentProjection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly model: string;
  readonly instructions: string;
  readonly tools: readonly string[];
  readonly memoryScope?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentQueryPort {
  list(): readonly AgentProjection[];
  findById(id: string): AgentProjection | undefined;
}

export interface OperationProjection {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly status: string;
  readonly budget: {
    readonly maxSteps: number;
    readonly maxDurationMs: number;
    readonly maxToolCalls: number;
    readonly maxTokens?: number | undefined;
  };
  readonly consumption: {
    readonly stepsUsed: number;
    readonly elapsedMs: number;
    readonly toolCallsUsed: number;
    readonly tokensUsed?: number | undefined;
  };
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly terminationReason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;
}

export interface OperationDetailProjection extends OperationProjection {
  readonly plan?: {
    readonly id: string;
    readonly operationId: string;
    readonly totalSteps: number;
    readonly steps: readonly {
      readonly id: string;
      readonly order: number;
      readonly action: string;
      readonly input: Readonly<Record<string, unknown>>;
      readonly metadata?: Readonly<Record<string, unknown>> | undefined;
    }[];
    readonly createdAt: Date;
  } | undefined;
  readonly observations: readonly {
    readonly observationId: string;
    readonly operationId: string;
    readonly stepId: string;
    readonly status: string;
    readonly durationMs: number;
    readonly toolCalls: number;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly error?: { readonly code: string; readonly message: string } | undefined;
  }[];
  readonly decisions: readonly {
    readonly type: string;
    readonly operationId: string;
    readonly stepId?: string | undefined;
    readonly action?: string | undefined;
    readonly input?: Readonly<Record<string, unknown>> | undefined;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly reason?: string | undefined;
    readonly failureError?: { readonly code: string; readonly message: string } | undefined;
    readonly decidedAt: Date;
  }[];
}

export interface OperationQueryPort {
  listProjections(): readonly OperationProjection[];
  findDetailById(id: string): OperationDetailProjection | undefined;
}

export interface ApplicationProjection {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly role: string;
  readonly implementationStatus: "IMPLEMENTED" | "PARTIAL" | "DESIGNED" | "PLANNED";
  readonly runtimeStatus: "HEALTHY" | "OPERATIONAL" | "AVAILABLE" | "ENFORCED" | "WAL_ACTIVE" | "NOT_CONNECTED" | "OFFLINE" | "DEGRADED";
  readonly sourceOfTruth?: string | undefined;
  readonly allowedCapabilities: readonly string[];
  readonly authenticationMode: "API_KEY" | "BEARER_TOKEN" | "MUTUAL_TLS";
  readonly endpoints: readonly string[];
  readonly architecture: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  readonly tenantId?: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApplicationQueryPort {
  list(): readonly ApplicationProjection[];
  findById(id: string): ApplicationProjection | undefined;
}
