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
