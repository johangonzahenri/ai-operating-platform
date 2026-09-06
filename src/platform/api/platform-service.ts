import { createPlatform } from "../../interfaces/composition.js";
import { SequentialOrchestrator } from "../../application/orchestration/sequential-orchestrator.js";
import { StubModelGateway } from "../../infrastructure/model/stub-model-gateway.js";
import { Task } from "../../domain/task/task.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { AgentDefinition } from "../../domain/agent/agent.js";
import {
  AuditObservationDTO,
  ExecutionDTO,
  MetricSummaryDTO,
  OperationDTO,
  OrchestrationRequestDTO,
  OrchestrationResultDTO,
  PlatformStatusDTO,
  TaskDTO,
  ToolDTO,
} from "./platform-dto.js";

export class PlatformService {
  private readonly platform: ReturnType<typeof createPlatform>;
  private readonly orchestrator: SequentialOrchestrator;
  private readonly startTime: Date;

  constructor(platform?: ReturnType<typeof createPlatform>) {
    this.platform = platform ?? createPlatform();
    this.startTime = new Date();
    this.orchestrator = new SequentialOrchestrator(
      new StubModelGateway(),
      this.platform.toolGateway,
      this.platform.events,
      this.platform.policy
    );
  }

  getStatus(): PlatformStatusDTO {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const tasks = this.platform.tasks.list();
    const executions = this.platform.executions.list();
    const tools = this.platform.tools.list();
    const metrics = this.getMetrics();

    return {
      status: "HEALTHY",
      version: "0.7.0",
      uptimeSeconds,
      tasksCount: tasks.length,
      executionsCount: executions.length,
      toolsCount: tools.length,
      metrics,
    };
  }

  getTasks(): readonly TaskDTO[] {
    return this.platform.tasks.list().map((t) => ({
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
    const t = this.platform.tasks.findById(id);
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
    return this.platform.executions.list().map((e) => ({
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
    const e = this.platform.executions.findById(id);
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
    const observations = this.platform.audit.findByExecutionId(executionId);
    return observations.map((obs) => ({
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
    return this.platform.audit.observations.map((obs) => ({
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
    const counters = this.platform.metrics.getAllCounters();
    const samplesCount = this.platform.metrics.samples.length;
    return { counters, samplesCount };
  }

  listTools(): readonly ToolDTO[] {
    return this.platform.tools.list().map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      version: def.version,
    }));
  }

  async submitTask(
    agentId: string,
    input: Record<string, unknown>,
    traceId: string = crypto.randomUUID()
  ): Promise<{ task: TaskDTO; execution: ExecutionDTO }> {
    const taskId = crypto.randomUUID();
    const task = Task.create(taskId, traceId, { agentId, input });
    const agent: AgentDefinition = {
      id: agentId,
      name: `Agent ${agentId}`,
      capabilities: ["reasoning"],
      model: "stub-model",
    };

    const result = await this.platform.runtime.execute(task, agent);

    const taskDto: TaskDTO = {
      id: result.task.id,
      traceId: result.task.traceId,
      agentId: result.task.request.agentId,
      status: result.task.status,
      createdAt: result.task.createdAt.toISOString(),
      input: result.task.request.input,
      output: result.task.result?.output,
      error: result.task.error ? { code: result.task.error.code, message: result.task.error.message } : undefined,
    };

    const execDto: ExecutionDTO = {
      id: result.execution.id,
      taskId: result.execution.taskId,
      traceId: result.execution.traceId,
      status: result.execution.status,
      startedAt: result.execution.startedAt?.toISOString(),
      completedAt: result.execution.completedAt?.toISOString(),
      metadata: result.execution.resultMetadata,
      error: result.execution.error ? { code: result.execution.error.code, message: result.execution.error.message } : undefined,
    };

    return { task: taskDto, execution: execDto };
  }

  async executeOrchestration(request: OrchestrationRequestDTO): Promise<OrchestrationResultDTO> {
    const traceId = request.traceId ?? crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const context = ExecutionContext.create(traceId, executionId, taskId);

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

    const result = await this.orchestrator.execute({
      execution: context,
      operations,
    });

    return {
      status: result.status,
      operations: result.operations.map((op) => ({
        operationId: op.operationId,
        status: op.status,
        output: op.output,
        error: op.error?.message,
      })),
      output: result.output,
    };
  }
}
