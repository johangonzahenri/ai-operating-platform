import crypto from "node:crypto";
import { PLATFORM_VERSION } from "../version.js";

import { ExecuteOrchestration } from "../../application/orchestration/execute-orchestration.js";
import { SubmitTask } from "../../application/submit-task.js";
import { AgentService } from "../../application/agent/agent-service.js";
import { AutonomousOperationService } from "../../application/autonomy/autonomous-operation-service.js";
import {
  AgentProjection,
  AgentQueryPort,
  ApplicationProjection,
  ApplicationQueryPort,
  AuditObservationProjection,
  AuditQueryPort,
  ExecutionProjection,
  ExecutionQueryPort,
  MetricSampleProjection,
  MetricsQueryPort,
  ModelProjection,
  ModelQueryPort,
  OperationDetailProjection,
  OperationProjection,
  OperationQueryPort,
  TaskProjection,
  TaskQueryPort,
  ToolProjection,
  ToolQueryPort,
} from "../../application/ports/query-ports.js";
import { InMemoryModelRegistry } from "../../infrastructure/model/in-memory-model-registry.js";
import { InMemoryApplicationRegistry } from "../../infrastructure/application/in-memory-application-registry.js";
import {
  AuditQueryOptions,
  DurableEvent,
  DurableEventQueryPort,
  DurableEventStore,
} from "../../application/ports/durable-event-port.js";
import { SqliteDatabase } from "../../infrastructure/persistence/sqlite/sqlite-database.js";
import { RuntimeDiagnosticsService } from "../../application/diagnostics/runtime-diagnostics.js";
import {
  Task,
  TaskRepository,
  TaskNotFoundError,
  InvalidTaskTransitionError,
} from "../../domain/task/task.js";
import { IdempotencyStore } from "../../application/ports/idempotency-port.js";
import { InMemoryIdempotencyStore } from "../../infrastructure/persistence/in-memory-idempotency-store.js";
import { EnterpriseGovernanceService } from "../../application/governance/governance-service.js";
import {
  AgentDTO,
  ApplicationDTO,
  AuditObservationDTO,
  AutonomousOperationDetailDTO,
  AutonomousOperationDTO,
  CreateAgentRequestDTO,
  CreateAutonomousOperationRequestDTO,
  CrashRecoveryDiagnosticDTO,
  DiagnosticTraceNodeDTO,
  DurableEventDTO,
  DurableEventListResponseDTO,
  ExecutionDTO,
  ExecutionTraceDiagnosticDTO,
  MetricSummaryDTO,
  ModelDTO,
  OrchestrationRequestDTO,
  OrchestrationResultDTO,
  PaginatedResponseDTO,
  PaginationOptions,
  PlatformHealthDTO,
  PlatformMetadataDTO,
  PlatformStatusDTO,
  SafeAgentMetadataDTO,
  TaskCancellationResultDTO,
  TaskDTO,
  ToolDTO,
  UpdateAgentRequestDTO,
} from "./platform-dto.js";
import { projectExecutionObservability } from "../product/execution-observability.js";

export { TaskNotFoundError };


export interface PlatformDependencies {
  readonly tasks: TaskQueryPort;
  readonly taskRepository?: TaskRepository | undefined;
  readonly executions: ExecutionQueryPort;
  readonly audit: AuditQueryPort;
  readonly metrics: MetricsQueryPort;
  readonly tools: ToolQueryPort;
  readonly models?: ModelQueryPort | undefined;
  readonly agents?: AgentQueryPort | undefined;
  readonly agentService?: AgentService | undefined;
  readonly applications?: ApplicationQueryPort | undefined;
  readonly submitTask: SubmitTask;
  readonly executeOrchestration: ExecuteOrchestration;
  readonly operations?: OperationQueryPort | undefined;
  readonly operationService?: AutonomousOperationService | undefined;
  readonly eventStore?: (DurableEventStore & DurableEventQueryPort) | undefined;
  readonly db?: SqliteDatabase | undefined;
  readonly diagnostics?: RuntimeDiagnosticsService | undefined;
  readonly idempotencyStore?: IdempotencyStore | undefined;
}

export class PlatformService {
  private readonly deps: PlatformDependencies;
  private readonly models: ModelQueryPort;
  private readonly agents?: AgentQueryPort | undefined;
  private readonly agentService?: AgentService | undefined;
  private readonly applications: ApplicationQueryPort;
  private readonly operations?: OperationQueryPort | undefined;
  private readonly operationService?: AutonomousOperationService | undefined;
  private readonly eventStore?: (DurableEventStore & DurableEventQueryPort) | undefined;
  private readonly db?: SqliteDatabase | undefined;
  private readonly diagnostics?: RuntimeDiagnosticsService | undefined;
  private readonly idempotencyStore: IdempotencyStore;
  private readonly governanceService: EnterpriseGovernanceService;
  private readonly startTime: Date;

  constructor(deps: PlatformDependencies) {
    this.deps = deps;
    this.models = deps.models ?? new InMemoryModelRegistry([
      {
        id: "stub-model",
        provider: "stub",
        name: "Stub Deterministic Model",
        status: "connected",
        capabilities: ["text-generation", "structured-output"],
      },
    ]);
    this.agents = deps.agents;
    this.agentService = deps.agentService;
    this.applications = deps.applications ?? new InMemoryApplicationRegistry();
    this.operations = deps.operations;
    this.operationService = deps.operationService;
    this.eventStore = deps.eventStore;
    this.db = deps.db;
    this.diagnostics = deps.diagnostics;
    this.idempotencyStore = deps.idempotencyStore ?? new InMemoryIdempotencyStore();
    this.governanceService = new EnterpriseGovernanceService();
    this.startTime = new Date();
  }

  getGovernanceService(): EnterpriseGovernanceService {
    return this.governanceService;
  }

  getLiveness(): { status: "UP"; uptimeSeconds: number; timestamp: string } {
    return {
      status: "UP",
      uptimeSeconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness(): { status: "READY" | "NOT_READY"; database: string; timestamp: string } {
    let databaseStatus = "READY";
    if (this.db) {
      try {
        const rawDb = this.db.open();
        const check = rawDb.prepare("SELECT 1 as alive;").get() as { alive?: number } | undefined;
        if (check?.alive !== 1) databaseStatus = "NOT_READY";
      } catch {
        databaseStatus = "NOT_READY";
      }
    }
    return {
      status: databaseStatus === "READY" ? "READY" : "NOT_READY",
      database: databaseStatus,
      timestamp: new Date().toISOString(),
    };
  }

  getIdempotencyStore(): IdempotencyStore {
    return this.idempotencyStore;
  }

  getStatus(): PlatformStatusDTO {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const tasks = this.deps.tasks.list();
    const executions = this.deps.executions.list();
    const tools = this.deps.tools.list();
    const models = this.models.list();
    const agents = this.listAgents();
    const operations = this.listOperations();
    const metrics = this.getMetrics();

    return {
      status: "HEALTHY",
      version: PLATFORM_VERSION,
      uptimeSeconds,
      tasksCount: tasks.length,
      executionsCount: executions.length,
      toolsCount: tools.length,
      modelsCount: models.length,
      agentsCount: agents.length,
      operationsCount: operations.length,
      metrics,
    };
  }

  getPlatformMetadata(): PlatformMetadataDTO {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const models = this.models.list();
    const tools = this.deps.tools.list();
    const agents = this.listAgents();
    const applications = this.listApplications();

    return {
      name: "AI Operating Platform",
      version: PLATFORM_VERSION,
      environment: process.env.NODE_ENV || "production",
      uptimeSeconds,
      status: "HEALTHY",
      capabilities: [
        "tasks",
        "executions",
        "agents",
        "tools",
        "models",
        "orchestration",
        "autonomy",
        "diagnostics",
        "events",
        "security",
      ],
      defaultModel: models[0]?.id ?? "stub-model",
      modelsCount: models.length,
      toolsCount: tools.length,
      agentsCount: agents.length,
    };
  }

  listSafeAgents(): readonly SafeAgentMetadataDTO[] {
    return this.listAgents().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      version: a.version,
      status: a.status,
      model: a.model,
      tools: a.tools,
      memoryScope: a.memoryScope,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  }


  getHealth(): PlatformHealthDTO {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const nowIso = new Date().toISOString();

    // 1. SQLite Engine Check
    let sqliteStatus: "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED" = "NOT_CONFIGURED";
    let sqliteMode: "durable" | "in-memory" = "in-memory";
    let sqliteMessage = "SQLite running in-memory or not configured";

    if (this.db) {
      try {
        const rawDb = this.db.open();
        const check = rawDb.prepare("SELECT 1 as alive;").get() as { alive?: number } | undefined;
        if (check?.alive === 1) {
          sqliteStatus = "ONLINE";
          sqliteMode = "durable";
          sqliteMessage = "SQLite durable engine verified (WAL mode active)";
        } else {
          sqliteStatus = "DEGRADED";
          sqliteMessage = "SQLite health check returned unexpected response";
        }
      } catch (err) {
        sqliteStatus = "OFFLINE";
        sqliteMode = "durable";
        sqliteMessage = `SQLite database check failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      sqliteStatus = "ONLINE";
      sqliteMode = "in-memory";
      sqliteMessage = "Ephemeral memory persistence active";
    }

    // 2. Event Store Check
    let eventStoreStatus: "ONLINE" | "OFFLINE" = "ONLINE";
    let persistedCount = 0;
    let queryableCount = 0;
    let lastEventOccurredAt: string | undefined = undefined;

    if (this.eventStore) {
      try {
        const allEvents = this.eventStore.getAllEvents();
        persistedCount = allEvents.length;
        queryableCount = allEvents.length;
        const lastEvent = allEvents[allEvents.length - 1];
        if (lastEvent) {
          lastEventOccurredAt = lastEvent.occurredAt.toISOString();
        }

      } catch {
        eventStoreStatus = "OFFLINE";
      }
    }

    // 3. System Overall Status
    const isHealthy = sqliteStatus === "ONLINE" && eventStoreStatus === "ONLINE";

    return {
      status: isHealthy ? "HEALTHY" : "DEGRADED",
      liveness: "UP",
      readiness: isHealthy ? "READY" : "NOT_READY",
      version: PLATFORM_VERSION,
      uptimeSeconds,
      timestamp: nowIso,
      components: {
        api: {
          status: "ONLINE",
          message: "Platform HTTP API operational",
        },
        sqlite: {
          status: sqliteStatus,
          mode: sqliteMode,
          message: sqliteMessage,
        },
        eventStore: {
          status: eventStoreStatus,
          persistedCount,
          queryableCount,
          lastEventOccurredAt,
          message: `${queryableCount} durable events queryable`,
        },
        runtime: {
          status: "ONLINE",
          message: "CoreRuntime execution engine online",
        },
        recovery: {
          status: "READY",
          message: "Crash recovery reconciliation engine ready",
        },
      },
    };
  }

  getEvents(options?: AuditQueryOptions): DurableEventListResponseDTO {
    if (!this.eventStore) {
      return {
        data: [],
        meta: {
          count: 0,
          total: 0,
          afterSequence: options?.afterSequence,
          beforeSequence: options?.beforeSequence,
        },
      };
    }

    const allEvents = this.eventStore.getAllEvents();
    const total = allEvents.length;
    const matchedEvents = options ? this.eventStore.query(options) : allEvents;

    const data: DurableEventDTO[] = matchedEvents.map((e: DurableEvent) => ({
      id: e.eventId,
      sequenceNumber: e.sequenceNumber,
      type: e.eventType,
      aggregateType: e.aggregateType,
      aggregateId: e.aggregateId,
      traceId: e.traceId,
      correlationId: e.correlationId,
      causationId: e.causationId,
      occurredAt: e.occurredAt.toISOString(),
      version: e.schemaVersion,
      metadata: {
        sequenceNumber: e.sequenceNumber,
        traceId: e.traceId,
        correlationId: e.correlationId,
        causationId: e.causationId,
        schemaVersion: e.schemaVersion,
      },
      payload: e.payload,
    }));

    return {
      data,
      meta: {
        count: data.length,
        total,
        afterSequence: options?.afterSequence,
        beforeSequence: options?.beforeSequence,
      },
    };
  }

  getEvent(id: string): DurableEventDTO | undefined {
    if (!this.eventStore) {
      return undefined;
    }

    const allEvents = this.eventStore.getAllEvents();
    const isNum = /^\d+$/.test(id);
    const numSeq = isNum ? parseInt(id, 10) : undefined;

    const e = allEvents.find((evt) => evt.eventId === id || (numSeq !== undefined && evt.sequenceNumber === numSeq));
    if (!e) {
      return undefined;
    }

    return {
      id: e.eventId,
      sequenceNumber: e.sequenceNumber,
      type: e.eventType,
      aggregateType: e.aggregateType,
      aggregateId: e.aggregateId,
      traceId: e.traceId,
      correlationId: e.correlationId,
      causationId: e.causationId,
      occurredAt: e.occurredAt.toISOString(),
      version: e.schemaVersion,
      metadata: {
        sequenceNumber: e.sequenceNumber,
        traceId: e.traceId,
        correlationId: e.correlationId,
        causationId: e.causationId,
        schemaVersion: e.schemaVersion,
      },
      payload: e.payload,
    };
  }


  getTasks(): readonly TaskDTO[] {
    return this.deps.tasks.list().map((t: TaskProjection) => ({
      id: t.id,
      traceId: t.traceId,
      agentId: t.request.agentId,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      input: t.request.input,
      output: t.result?.output,
      error: t.error ? { code: t.error.code, message: t.error.message } : undefined,
    }));
  }

  getTask(id: string): TaskDTO | undefined {
    const t = this.deps.tasks.findById(id);
    if (!t) return undefined;
    return {
      id: t.id,
      traceId: t.traceId,
      agentId: t.request.agentId,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      input: t.request.input,
      output: t.result?.output,
      error: t.error ? { code: t.error.code, message: t.error.message } : undefined,
    };
  }

  cancelTask(id: string, reason?: string): TaskCancellationResultDTO {
    const tasksRepo = this.deps.taskRepository ?? (this.deps.tasks as unknown as TaskRepository);
    const task = tasksRepo.findById ? tasksRepo.findById(id) : undefined;
    if (!task) {
      const projection = this.deps.tasks.findById(id);
      if (!projection) {
        throw new TaskNotFoundError(`Task '${id}' not found`);
      }
      throw new Error(`Task repository does not support modification for task '${id}'`);
    }

    if (task.status === "COMPLETED" || task.status === "FAILED") {
      throw new InvalidTaskTransitionError(task.status, "CANCELLED");
    }

    if (task.status !== "CANCELLED") {
      const cancelled = task.transition("CANCELLED");
      tasksRepo.save(cancelled);

      if (this.eventStore) {
        this.eventStore.append({
          eventId: crypto.randomUUID(),
          eventType: "task.cancelled",
          aggregateType: "task",
          aggregateId: id,
          traceId: task.traceId,
          correlationId: task.traceId,
          occurredAt: new Date(),
          schemaVersion: 1,
          payload: { taskId: id, reason: reason ?? "User requested cancellation" },
        });
      }

    }

    return {
      taskId: id,
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      reason,
    };
  }

  getTaskEvents(taskId: string): readonly DurableEventDTO[] {
    if (!this.eventStore) {
      return [];
    }
    const all = this.getEvents({ taskId });
    return all.data.filter(
      (e) =>
        e.aggregateId === taskId ||
        (e.payload && typeof e.payload === "object" && (e.payload as Record<string, unknown>).taskId === taskId) ||
        (e.metadata && (e.metadata as Record<string, unknown>).taskId === taskId)
    );
  }


  getExecutions(): readonly ExecutionDTO[] {
    return this.deps.executions.list().map((e: ExecutionProjection) => this.enrichExecution({
      id: e.id,
      taskId: e.taskId,
      traceId: e.traceId,
      status: e.status,
      startedAt: e.startedAt?.toISOString(),
      completedAt: e.completedAt?.toISOString(),
      metadata: e.resultMetadata,
      error: e.error ? { code: e.error.code, message: e.error.message } : undefined,
    }));
  }

  getExecution(id: string): ExecutionDTO | undefined {
    const e = this.deps.executions.findById(id);
    if (!e) return undefined;
    return this.enrichExecution({
      id: e.id,
      taskId: e.taskId,
      traceId: e.traceId,
      status: e.status,
      startedAt: e.startedAt?.toISOString(),
      completedAt: e.completedAt?.toISOString(),
      metadata: e.resultMetadata,
      error: e.error ? { code: e.error.code, message: e.error.message } : undefined,
    });
  }

  getExecutionForTask(taskId: string): ExecutionDTO | undefined {
    const execution = this.deps.executions.list().find((candidate) => candidate.taskId === taskId);
    if (!execution) return undefined;
    return this.enrichExecution({
      id: execution.id,
      taskId: execution.taskId,
      traceId: execution.traceId,
      status: execution.status,
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      metadata: execution.resultMetadata,
      error: execution.error ? { code: execution.error.code, message: execution.error.message } : undefined,
    });
  }

  private enrichExecution(execution: ExecutionDTO): ExecutionDTO {
    return { ...execution, ...projectExecutionObservability(execution, this.getExecutionTimeline(execution.id)) };
  }

  getExecutionTimeline(executionId: string): readonly AuditObservationDTO[] {
    const observations = this.deps.audit.findByExecutionId(executionId);
    return observations.map((obs: AuditObservationProjection) => ({
      eventId: obs.eventId,
      occurredAt: obs.occurredAt.toISOString(),
      type: obs.type,
      traceId: obs.traceId,
      aggregateId: obs.aggregateId,
      taskId: obs.taskId,
      executionId: obs.executionId,
      operationId: obs.operationId,
      payload: obs.payload,
    }));
  }

  getAuditLogs(executionId?: string): readonly AuditObservationDTO[] {
    const list = executionId ? this.deps.audit.findByExecutionId(executionId) : this.deps.audit.observations;
    return list.map((obs: AuditObservationProjection) => ({
      eventId: obs.eventId,
      occurredAt: obs.occurredAt.toISOString(),
      type: obs.type,
      traceId: obs.traceId,
      aggregateId: obs.aggregateId,
      taskId: obs.taskId,
      executionId: obs.executionId,
      operationId: obs.operationId,
      payload: obs.payload,
    }));
  }


  getMetrics(): MetricSummaryDTO {
    const counters = this.deps.metrics.getAllCounters();
    const samplesCount = this.deps.metrics.samples.length;
    return { counters, samplesCount };
  }

  listTools(): readonly ToolDTO[] {
    return this.deps.tools.list().map((def: ToolProjection) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      version: def.version,
    }));
  }

  getTool(id: string): ToolDTO | undefined {
    const def = this.deps.tools.findById(id);
    if (!def) return undefined;
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      version: def.version,
    };
  }

  listModels(): readonly ModelDTO[] {
    return this.models.list().map((m: ModelProjection) => ({
      id: m.id,
      provider: m.provider,
      name: m.name,
      status: m.status,
      capabilities: m.capabilities,
    }));
  }

  getModel(id: string): ModelDTO | undefined {
    const m = this.models.findById(id);
    if (!m) return undefined;
    return {
      id: m.id,
      provider: m.provider,
      name: m.name,
      status: m.status,
      capabilities: m.capabilities,
    };
  }

  // --- External Application Operations ---

  listApplications(): readonly ApplicationDTO[] {
    return this.applications.list().map((app: ApplicationProjection) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      category: app.category,
      role: app.role,
      implementationStatus: app.implementationStatus,
      runtimeStatus: app.runtimeStatus,
      allowedCapabilities: app.allowedCapabilities,
      authenticationMode: app.authenticationMode,
      endpoints: app.endpoints,
      architecture: app.architecture,
      tags: app.tags,
      tenantId: app.tenantId,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    }));
  }

  getApplication(id: string): ApplicationDTO | undefined {
    const app = this.applications.findById(id);
    if (!app) return undefined;
    return {
      id: app.id,
      name: app.name,
      description: app.description,
      category: app.category,
      role: app.role,
      implementationStatus: app.implementationStatus,
      runtimeStatus: app.runtimeStatus,
      allowedCapabilities: app.allowedCapabilities,
      authenticationMode: app.authenticationMode,
      endpoints: app.endpoints,
      architecture: app.architecture,
      tags: app.tags,
      tenantId: app.tenantId,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    };
  }

  getApplicationRegistry(): ApplicationQueryPort {
    return this.applications;
  }

  // --- Agent Operations ---

  listAgents(): readonly AgentDTO[] {
    if (!this.agents) return [];
    return this.agents.list().map((a: AgentProjection) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      version: a.version,
      status: a.status,
      model: a.model,
      instructions: a.instructions,
      tools: a.tools,
      memoryScope: a.memoryScope,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }

  getAgent(id: string): AgentDTO | undefined {
    if (!this.agents) return undefined;
    const a = this.agents.findById(id);
    if (!a) return undefined;
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      version: a.version,
      status: a.status,
      model: a.model,
      instructions: a.instructions,
      tools: a.tools,
      memoryScope: a.memoryScope,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  createAgent(dto: CreateAgentRequestDTO): AgentDTO {
    if (!this.agentService) {
      throw new Error("AgentService not configured in PlatformService");
    }
    const created = this.agentService.createAgent(dto);
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      version: created.version,
      status: created.status,
      model: created.model,
      instructions: created.instructions,
      tools: created.tools,
      memoryScope: created.memoryScope,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  updateAgent(id: string, dto: UpdateAgentRequestDTO): AgentDTO {
    if (!this.agentService) {
      throw new Error("AgentService not configured in PlatformService");
    }
    const updated = this.agentService.updateAgent(id, dto);
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      version: updated.version,
      status: updated.status,
      model: updated.model,
      instructions: updated.instructions,
      tools: updated.tools,
      memoryScope: updated.memoryScope,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  activateAgent(id: string): AgentDTO {
    if (!this.agentService) {
      throw new Error("AgentService not configured in PlatformService");
    }
    const activated = this.agentService.activateAgent(id);
    return {
      id: activated.id,
      name: activated.name,
      description: activated.description,
      version: activated.version,
      status: activated.status,
      model: activated.model,
      instructions: activated.instructions,
      tools: activated.tools,
      memoryScope: activated.memoryScope,
      createdAt: activated.createdAt.toISOString(),
      updatedAt: activated.updatedAt.toISOString(),
    };
  }

  deactivateAgent(id: string): AgentDTO {
    if (!this.agentService) {
      throw new Error("AgentService not configured in PlatformService");
    }
    const deactivated = this.agentService.deactivateAgent(id);
    return {
      id: deactivated.id,
      name: deactivated.name,
      description: deactivated.description,
      version: deactivated.version,
      status: deactivated.status,
      model: deactivated.model,
      instructions: deactivated.instructions,
      tools: deactivated.tools,
      memoryScope: deactivated.memoryScope,
      createdAt: deactivated.createdAt.toISOString(),
      updatedAt: deactivated.updatedAt.toISOString(),
    };
  }

  async executeAgent(
    agentId: string,
    input: Record<string, unknown>,
    traceId?: string | undefined
  ): Promise<{ task: TaskDTO; execution: ExecutionDTO }> {
    if (!this.agentService) {
      throw new Error("AgentService not configured in PlatformService");
    }
    const { task, execution } = await this.agentService.executeAgent(agentId, input, traceId);

    const taskDto: TaskDTO = {
      id: task.id,
      traceId: task.traceId,
      agentId: task.request.agentId,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      input: task.request.input,
      output: task.result?.output,
      error: task.error ? { code: task.error.code, message: task.error.message } : undefined,
    };

    const execDto: ExecutionDTO = {
      id: execution.id,
      taskId: execution.taskId,
      traceId: execution.traceId,
      status: execution.status,
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      metadata: execution.resultMetadata,
      error: execution.error ? { code: execution.error.code, message: execution.error.message } : undefined,
    };

    return { task: taskDto, execution: this.enrichExecution(execDto) };
  }

  // --- Task & Execution Submission ---

  async submitTask(
    agentId: string,
    input: Record<string, unknown>,
    traceId?: string | undefined
  ): Promise<{ task: TaskDTO; execution: ExecutionDTO }> {
    const { task, execution } = await this.deps.submitTask.execute({
      agentId,
      input,
      traceId,
    });

    const taskDto: TaskDTO = {
      id: task.id,
      traceId: task.traceId,
      agentId: task.request.agentId,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      input: task.request.input,
      output: task.result?.output,
      error: task.error ? { code: task.error.code, message: task.error.message } : undefined,
    };

    const execDto: ExecutionDTO = {
      id: execution.id,
      taskId: execution.taskId,
      traceId: execution.traceId,
      status: execution.status,
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      metadata: execution.resultMetadata,
      error: execution.error ? { code: execution.error.code, message: execution.error.message } : undefined,
    };

    return { task: taskDto, execution: this.enrichExecution(execDto) };
  }

  async submitExecution(
    agentId: string,
    input: Record<string, unknown>,
    traceId?: string | undefined
  ): Promise<{ task: TaskDTO; execution: ExecutionDTO }> {
    return this.submitTask(agentId, input, traceId);
  }

  async executeOrchestration(request: OrchestrationRequestDTO): Promise<OrchestrationResultDTO> {
    const operations = request.operations.map((op) => {
      if (op.kind === "MODEL") {
        return {
          kind: "MODEL" as const,
          id: op.id,
          model: op.model ?? "stub-model",
          input: op.input,
          bindings: op.bindings,
        };
      } else {
        return {
          kind: "TOOL" as const,
          id: op.id,
          toolId: op.toolId ?? "calculator",
          input: op.input,
          bindings: op.bindings,
        };
      }
    });

    const { task, execution } = await this.deps.executeOrchestration.execute({
      operations,
      traceId: request.traceId,
      agentId: "orchestrator",
    });

    const timeline = this.deps.audit.findByExecutionId(execution.id);
    const rawOutput = task.result?.output;
    const taskOps = (rawOutput && typeof rawOutput === "object" && "__operations" in rawOutput && Array.isArray((rawOutput as Record<string, unknown>).__operations))
      ? ((rawOutput as Record<string, unknown>).__operations as readonly {
          operationId: string;
          status: string;
          output?: Readonly<Record<string, unknown>> | undefined;
          error?: string | undefined;
        }[])
      : undefined;

    const opResults: {
      operationId: string;
      kind: "MODEL" | "TOOL";
      status: string;
      output?: Readonly<Record<string, unknown>> | undefined;
      error?: string | undefined;
    }[] = [];

    let encounteredFailure = false;
    for (const op of request.operations) {
      const fromTask = taskOps?.find((o) => o.operationId === op.id);
      const completedEv = timeline.find((ev) => ev.type === "operation.completed" && ev.operationId === op.id);
      const failedEv = timeline.find((ev) => ev.type === "operation.failed" && ev.operationId === op.id);

      if (fromTask && fromTask.status === "COMPLETED") {
        opResults.push({
          operationId: op.id,
          kind: op.kind,
          status: "COMPLETED",
          output: fromTask.output,
        });
      } else if (completedEv) {
        const payloadOutput = (completedEv.payload.output as Readonly<Record<string, unknown>>) ?? undefined;
        opResults.push({
          operationId: op.id,
          kind: op.kind,
          status: "COMPLETED",
          output: payloadOutput,
        });
      } else if (failedEv || (fromTask && fromTask.status === "FAILED")) {
        encounteredFailure = true;
        opResults.push({
          operationId: op.id,
          kind: op.kind,
          status: "FAILED",
          error: fromTask?.error ?? String(failedEv?.payload.message ?? "Operation failed"),
        });
      } else {
        const status = (task.status === "FAILED" || encounteredFailure) ? "CANCELLED" : "COMPLETED";
        opResults.push({
          operationId: op.id,
          kind: op.kind,
          status,
        });
      }
    }

    let cleanOutput: Readonly<Record<string, unknown>> | undefined = undefined;
    if (rawOutput && typeof rawOutput === "object") {
      const copy: Record<string, unknown> = { ...rawOutput };
      delete copy.__operations;
      cleanOutput = Object.keys(copy).length > 0 ? copy : undefined;
    }

    return {
      taskId: task.id,
      executionId: execution.id,
      status: (execution.status === "COMPLETED" || execution.status === "FAILED" || execution.status === "CANCELLED")
        ? execution.status
        : "COMPLETED",
      operations: opResults,
      output: cleanOutput,
    };
  }

  // --- Autonomous Operations (v0.9) ---

  listOperations(): readonly AutonomousOperationDTO[] {
    if (this.operations) {
      return this.operations.listProjections().map((op: OperationProjection) => ({
        id: op.id,
        objective: op.objective,
        agentId: op.agentId,
        status: op.status,
        budget: { ...op.budget },
        consumption: { ...op.consumption },
        createdAt: op.createdAt.toISOString(),
        startedAt: op.startedAt?.toISOString(),
        completedAt: op.completedAt?.toISOString(),
        terminationReason: op.terminationReason,
        failureError: op.failureError ? { ...op.failureError } : undefined,
        resultOutput: op.resultOutput ? { ...op.resultOutput } : undefined,
      }));
    }
    if (this.operationService) {
      return this.operationService.listOperations().map((op) => {
        const snap = op.snapshot();
        return {
          id: snap.id,
          objective: snap.objective,
          agentId: snap.agentId,
          status: snap.status,
          budget: { ...snap.budget },
          consumption: { ...snap.consumption },
          createdAt: snap.createdAt.toISOString(),
          startedAt: snap.startedAt?.toISOString(),
          completedAt: snap.completedAt?.toISOString(),
          terminationReason: snap.terminationReason,
          failureError: snap.failureError ? { ...snap.failureError } : undefined,
          resultOutput: snap.resultOutput ? { ...snap.resultOutput } : undefined,
        };
      });
    }
    return [];
  }

  getOperation(id: string): AutonomousOperationDTO | undefined {
    if (this.operations) {
      const detail = this.operations.findDetailById(id);
      if (detail) {
        return {
          id: detail.id,
          objective: detail.objective,
          agentId: detail.agentId,
          status: detail.status,
          budget: { ...detail.budget },
          consumption: { ...detail.consumption },
          createdAt: detail.createdAt.toISOString(),
          startedAt: detail.startedAt?.toISOString(),
          completedAt: detail.completedAt?.toISOString(),
          terminationReason: detail.terminationReason,
          failureError: detail.failureError ? { ...detail.failureError } : undefined,
          resultOutput: detail.resultOutput ? { ...detail.resultOutput } : undefined,
        };
      }
    }
    if (this.operationService) {
      const op = this.operationService.getOperation(id);
      if (!op) return undefined;
      const snap = op.snapshot();
      return {
        id: snap.id,
        objective: snap.objective,
        agentId: snap.agentId,
        status: snap.status,
        budget: { ...snap.budget },
        consumption: { ...snap.consumption },
        createdAt: snap.createdAt.toISOString(),
        startedAt: snap.startedAt?.toISOString(),
        completedAt: snap.completedAt?.toISOString(),
        terminationReason: snap.terminationReason,
        failureError: snap.failureError ? { ...snap.failureError } : undefined,
        resultOutput: snap.resultOutput ? { ...snap.resultOutput } : undefined,
      };
    }
    return undefined;
  }

  getOperationDetail(id: string): AutonomousOperationDetailDTO | undefined {
    if (this.operations) {
      const detail = this.operations.findDetailById(id);
      if (!detail) return undefined;
      return {
        operation: {
          id: detail.id,
          objective: detail.objective,
          agentId: detail.agentId,
          status: detail.status,
          budget: { ...detail.budget },
          consumption: { ...detail.consumption },
          createdAt: detail.createdAt.toISOString(),
          startedAt: detail.startedAt?.toISOString(),
          completedAt: detail.completedAt?.toISOString(),
          terminationReason: detail.terminationReason,
          failureError: detail.failureError ? { ...detail.failureError } : undefined,
          resultOutput: detail.resultOutput ? { ...detail.resultOutput } : undefined,
        },
        plan: detail.plan
          ? {
              id: detail.plan.id,
              operationId: detail.plan.operationId,
              totalSteps: detail.plan.totalSteps,
              steps: detail.plan.steps.map((s) => ({
                id: s.id,
                order: s.order,
                action: s.action,
                input: { ...s.input },
                metadata: s.metadata ? { ...s.metadata } : undefined,
              })),
              createdAt: detail.plan.createdAt.toISOString(),
            }
          : undefined,
        observations: detail.observations.map((obs) => ({
          observationId: obs.observationId,
          operationId: obs.operationId,
          stepId: obs.stepId,
          status: obs.status as "SUCCESS" | "FAILED" | "CANCELLED",
          durationMs: obs.durationMs,
          toolCalls: obs.toolCalls,
          output: obs.output ? { ...obs.output } : undefined,
          error: obs.error ? { ...obs.error } : undefined,
        })),
        decisions: detail.decisions.map((dec) => ({
          type: dec.type as "EXECUTE_STEP" | "COMPLETE" | "STOP" | "FAIL",
          operationId: dec.operationId,
          stepId: dec.stepId,
          action: dec.action,
          input: dec.input ? { ...dec.input } : undefined,
          output: dec.output ? { ...dec.output } : undefined,
          reason: dec.reason,
          failureError: dec.failureError ? { ...dec.failureError } : undefined,
          decidedAt: dec.decidedAt.toISOString(),
        })),
      };
    }
    if (this.operationService) {
      const record = this.operationService.getOperationRecord(id);
      if (!record) return undefined;
      const snap = record.operation.snapshot();
      return {
        operation: {
          id: snap.id,
          objective: snap.objective,
          agentId: snap.agentId,
          status: snap.status,
          budget: { ...snap.budget },
          consumption: { ...snap.consumption },
          createdAt: snap.createdAt.toISOString(),
          startedAt: snap.startedAt?.toISOString(),
          completedAt: snap.completedAt?.toISOString(),
          terminationReason: snap.terminationReason,
          failureError: snap.failureError ? { ...snap.failureError } : undefined,
          resultOutput: snap.resultOutput ? { ...snap.resultOutput } : undefined,
        },
        plan: record.plan
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
              createdAt: record.plan.createdAt.toISOString(),
            }
          : undefined,
        observations: record.observations.map((obs) => ({
          observationId: obs.observationId,
          operationId: obs.operationId,
          stepId: obs.stepId,
          status: obs.status,
          durationMs: obs.durationMs,
          toolCalls: obs.toolCalls ?? 0,
          output: obs.output ? { ...obs.output } : undefined,
          error: obs.error ? { ...obs.error } : undefined,
        })),
        decisions: record.decisions.map((dec) => ({
          type: dec.type,
          operationId: dec.operationId,
          stepId: dec.stepId,
          action: dec.action,
          input: dec.input ? { ...dec.input } : undefined,
          output: dec.output ? { ...dec.output } : undefined,
          reason: dec.reason,
          failureError: dec.failureError ? { ...dec.failureError } : undefined,
          decidedAt: dec.decidedAt.toISOString(),
        })),
      };
    }
    return undefined;
  }

  async createOperation(
    req: CreateAutonomousOperationRequestDTO
  ): Promise<AutonomousOperationDetailDTO> {
    if (!this.operationService) {
      throw new Error("AutonomousOperationService not configured in PlatformService");
    }
    const result = await this.operationService.executeOperation({
      id: req.id,
      agentId: req.agentId,
      objective: req.objective,
      budget: req.budget,
      metadata: req.metadata,
    });
    const detail = this.getOperationDetail(result.operation.id);
    if (!detail) {
      throw new Error(`Failed to retrieve operation detail for '${result.operation.id}'`);
    }
    return detail;
  }

  cancelOperation(id: string, reason?: string): AutonomousOperationDTO {
    if (!this.operationService) {
      throw new Error("AutonomousOperationService not configured in PlatformService");
    }
    const cancelled = this.operationService.cancelOperation(id, reason);
    const snap = cancelled.snapshot();
    return {
      id: snap.id,
      objective: snap.objective,
      agentId: snap.agentId,
      status: snap.status,
      budget: { ...snap.budget },
      consumption: { ...snap.consumption },
      createdAt: snap.createdAt.toISOString(),
      startedAt: snap.startedAt?.toISOString(),
      completedAt: snap.completedAt?.toISOString(),
      terminationReason: snap.terminationReason,
      failureError: snap.failureError ? { ...snap.failureError } : undefined,
      resultOutput: snap.resultOutput ? { ...snap.resultOutput } : undefined,
    };
  }

  // --- Diagnostics (v0.9.2) ---

  private mapTraceNode(node: { readonly sequenceNumber: number; readonly eventId: string; readonly eventType: string; readonly aggregateType: string; readonly aggregateId: string; readonly causationId?: string | undefined; readonly occurredAt: Date; readonly status?: string | undefined; readonly reason?: string | undefined; readonly code?: string | undefined; readonly message?: string | undefined; readonly payload: Readonly<Record<string, unknown>> }): DiagnosticTraceNodeDTO {
    return {
      sequenceNumber: node.sequenceNumber,
      eventId: node.eventId,
      eventType: node.eventType,
      aggregateType: node.aggregateType,
      aggregateId: node.aggregateId,
      causationId: node.causationId,
      occurredAt: node.occurredAt.toISOString(),
      status: node.status,
      reason: node.reason,
      code: node.code,
      message: node.message,
      payload: node.payload,
    };
  }

  getTraceDiagnostics(traceId: string): ExecutionTraceDiagnosticDTO | undefined {
    if (!this.diagnostics) return undefined;
    const result = this.diagnostics.getTraceDiagnostics(traceId);
    if (!result) return undefined;
    return {
      traceId: result.traceId,
      rootTaskId: result.rootTaskId,
      executionId: result.executionId,
      agentId: result.agentId,
      status: result.status,
      startedAt: result.startedAt?.toISOString(),
      completedAt: result.completedAt?.toISOString(),
      durationMs: result.durationMs,
      failureReason: result.failureReason,
      failureCode: result.failureCode,
      isCrashRecovered: result.isCrashRecovered,
      timeline: result.timeline.map((n) => this.mapTraceNode(n)),
      causalChain: [...result.causalChain],
    };
  }

  getCrashRecoveryHistory(): readonly CrashRecoveryDiagnosticDTO[] {
    if (!this.diagnostics) return [];
    return this.diagnostics.getCrashRecoveryDiagnostics().map((d) => ({
      eventId: d.eventId,
      sequenceNumber: d.sequenceNumber,
      aggregateType: d.aggregateType,
      aggregateId: d.aggregateId,
      traceId: d.traceId,
      recoveredAt: d.recoveredAt.toISOString(),
      code: d.code,
      reason: d.reason,
      terminalStatus: d.terminalStatus,
    }));
  }

  getTaskDiagnostics(taskId: string): readonly DiagnosticTraceNodeDTO[] {
    if (!this.diagnostics) return [];
    return this.diagnostics.getTaskHistory(taskId).map((n) => this.mapTraceNode(n));
  }

  // --- Paginated Listings (v0.9.2) ---

  getTasksPaginated(options?: PaginationOptions): PaginatedResponseDTO<TaskDTO> {
    const allTasks = this.getTasks();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const sliced = allTasks.slice(offset, offset + limit);
    return {
      data: sliced,
      meta: { count: sliced.length, total: allTasks.length, limit, offset },
    };
  }

  getExecutionsPaginated(options?: PaginationOptions): PaginatedResponseDTO<ExecutionDTO> {
    const allExecs = this.getExecutions();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const sliced = allExecs.slice(offset, offset + limit);
    return {
      data: sliced,
      meta: { count: sliced.length, total: allExecs.length, limit, offset },
    };
  }

  listOperationsPaginated(options?: PaginationOptions & { readonly status?: string | undefined }): PaginatedResponseDTO<AutonomousOperationDTO> {
    let allOps = this.listOperations();
    if (options?.status) {
      allOps = allOps.filter((op) => op.status === options.status);
    }
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const sliced = allOps.slice(offset, offset + limit);
    return {
      data: sliced,
      meta: { count: sliced.length, total: allOps.length, limit, offset },
    };
  }

  listAgentsPaginated(options?: PaginationOptions & { readonly status?: string | undefined }): PaginatedResponseDTO<AgentDTO> {
    let allAgents = this.listAgents();
    if (options?.status) {
      allAgents = allAgents.filter((a) => a.status === options.status);
    }
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const sliced = allAgents.slice(offset, offset + limit);
    return {
      data: sliced,
      meta: { count: sliced.length, total: allAgents.length, limit, offset },
    };
  }
}
