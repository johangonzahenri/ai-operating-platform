import { ExecuteOrchestration } from "../../application/orchestration/execute-orchestration.js";
import { SubmitTask } from "../../application/submit-task.js";
import { AgentService } from "../../application/agent/agent-service.js";
import {
  AgentProjection,
  AgentQueryPort,
  AuditObservationProjection,
  AuditQueryPort,
  ExecutionProjection,
  ExecutionQueryPort,
  MetricSampleProjection,
  MetricsQueryPort,
  ModelProjection,
  ModelQueryPort,
  TaskProjection,
  TaskQueryPort,
  ToolProjection,
  ToolQueryPort,
} from "../../application/ports/query-ports.js";
import { InMemoryModelRegistry } from "../../infrastructure/model/in-memory-model-registry.js";
import {
  AgentDTO,
  AuditObservationDTO,
  CreateAgentRequestDTO,
  ExecutionDTO,
  MetricSummaryDTO,
  ModelDTO,
  OrchestrationRequestDTO,
  OrchestrationResultDTO,
  PlatformStatusDTO,
  TaskDTO,
  ToolDTO,
  UpdateAgentRequestDTO,
} from "./platform-dto.js";

export interface PlatformDependencies {
  readonly tasks: TaskQueryPort;
  readonly executions: ExecutionQueryPort;
  readonly audit: AuditQueryPort;
  readonly metrics: MetricsQueryPort;
  readonly tools: ToolQueryPort;
  readonly models?: ModelQueryPort | undefined;
  readonly agents?: AgentQueryPort | undefined;
  readonly agentService?: AgentService | undefined;
  readonly submitTask: SubmitTask;
  readonly executeOrchestration: ExecuteOrchestration;
}

export class PlatformService {
  private readonly deps: PlatformDependencies;
  private readonly models: ModelQueryPort;
  private readonly agents?: AgentQueryPort | undefined;
  private readonly agentService?: AgentService | undefined;
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
    this.startTime = new Date();
  }

  getStatus(): PlatformStatusDTO {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const tasks = this.deps.tasks.list();
    const executions = this.deps.executions.list();
    const tools = this.deps.tools.list();
    const models = this.models.list();
    const agents = this.listAgents();
    const metrics = this.getMetrics();

    return {
      status: "HEALTHY",
      version: "0.8.0",
      uptimeSeconds,
      tasksCount: tasks.length,
      executionsCount: executions.length,
      toolsCount: tools.length,
      modelsCount: models.length,
      agentsCount: agents.length,
      metrics,
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

  getExecutions(): readonly ExecutionDTO[] {
    return this.deps.executions.list().map((e: ExecutionProjection) => ({
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
    return {
      id: e.id,
      taskId: e.taskId,
      traceId: e.traceId,
      status: e.status,
      startedAt: e.startedAt?.toISOString(),
      completedAt: e.completedAt?.toISOString(),
      metadata: e.resultMetadata,
      error: e.error ? { code: e.error.code, message: e.error.message } : undefined,
    };
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

  getAuditLogs(): readonly AuditObservationDTO[] {
    return this.deps.audit.observations.map((obs: AuditObservationProjection) => ({
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

    return { task: taskDto, execution: execDto };
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

    return { task: taskDto, execution: execDto };
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
}
