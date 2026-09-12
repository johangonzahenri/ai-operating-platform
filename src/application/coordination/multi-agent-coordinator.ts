import crypto from "node:crypto";
import { AgentRegistry } from "../../domain/agent/agent-registry.js";
import { AgentHandoff, CoordinationRequest, CoordinationResult } from "../../domain/coordination/coordination.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { Runtime } from "../../domain/execution/runtime.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { Task } from "../../domain/task/task.js";

export interface CoordinationCancellation {
  readonly isCancelled: boolean;
  readonly reason?: string;
}

export interface MultiAgentCoordinatorOptions {
  readonly now?: () => Date;
  readonly ids?: { next(): string };
}

export class MultiAgentCoordinator {
  private readonly now: () => Date;
  private readonly ids: { next(): string };

  constructor(
    private readonly runtime: Runtime,
    private readonly agents: AgentRegistry,
    private readonly policy: PolicyGateway,
    private readonly events: EventPublisher,
    options: MultiAgentCoordinatorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.ids = options.ids ?? { next: () => crypto.randomUUID() };
  }

  async run(request: CoordinationRequest, cancellation?: CoordinationCancellation): Promise<CoordinationResult> {
    const startedAt = this.now();
    const refs = { taskId: request.taskId };
    const steps: CoordinationResult["steps"][number][] = [];
    const handoffs: AgentHandoff[] = [];
    this.events.publish(event("coordination.started", request.correlationId, request.coordinationId, { coordinationId: request.coordinationId }, undefined, startedAt, refs));
    let payload: Readonly<Record<string, unknown>> = { objective: request.objective, input: request.input };
    let sourceAgentId = "coordinator";
    let lastExecutionId = request.coordinationId;
    try {
      for (let index = 0; index < request.steps.length; index += 1) {
        if (cancellation?.isCancelled) return this.finish(request, steps, handoffs, "CANCELLED", undefined, { code: "CANCELLED", message: cancellation.reason ?? "Coordination cancelled" });
        if (this.now().getTime() - startedAt.getTime() > request.timeoutMs) return this.finish(request, steps, handoffs, "TIMEOUT", undefined, { code: "TIMEOUT", message: "Coordination timeout exceeded" });
        const step = request.steps[index];
        if (!step) throw new Error("Coordination step is missing");
        const agent = this.agents.findById(step.agentId);
        if (!agent) throw new Error(`Unknown coordination agent '${step.agentId}'`);
        if (agent.status !== "ACTIVE") throw new Error(`Coordination agent '${step.agentId}' is inactive`);
        const decision = await this.policy.evaluate({
          traceId: request.correlationId, operationId: request.coordinationId, operationType: "MODEL", resourceId: agent.id,
          agentId: agent.id, action: "coordination.execute", metadata: { role: step.role, sourceAgentId },
        });
        if (!decision.allowed) return this.finish(request, steps, handoffs, "POLICY_DENIED", undefined, { code: "POLICY_DENIED", message: decision.reason ?? "Coordination denied" });
        this.events.publish(event("coordination.agent.selected", request.correlationId, agent.id, { coordinationId: request.coordinationId, role: step.role }, undefined, this.now(), { taskId: request.taskId }));
        const childTask = Task.create(this.ids.next(), request.correlationId, { agentId: agent.id, input: payload });
        const result = await this.runtime.execute(childTask, agent.toDefinition());
        const stepResult = { agentId: agent.id, role: step.role, status: result.execution.status, executionId: result.execution.id, ...(result.task.result ? { output: result.task.result.output } : {}) };
        steps.push(stepResult);
        lastExecutionId = result.execution.id;
        if (result.execution.status !== "COMPLETED" || !result.task.result) {
          this.events.publish(event("coordination.agent.failed", request.correlationId, agent.id, { coordinationId: request.coordinationId, status: result.execution.status }, undefined, this.now(), { taskId: request.taskId, executionId: result.execution.id }));
          return this.finish(request, steps, handoffs, "FAILED", undefined, { code: "AGENT_EXECUTION_FAILED", message: `Agent '${agent.id}' did not complete` });
        }
        this.events.publish(event("coordination.agent.completed", request.correlationId, agent.id, { coordinationId: request.coordinationId }, undefined, this.now(), { taskId: request.taskId, executionId: result.execution.id }));
        if (index < request.steps.length - 1) {
          const next = request.steps[index + 1];
          if (!next) throw new Error("Next coordination step is missing");
          this.events.publish(event("coordination.handoff.requested", request.correlationId, request.coordinationId, { coordinationId: request.coordinationId, sourceAgentId: agent.id, targetAgentId: next.agentId }, undefined, this.now(), { taskId: request.taskId, executionId: result.execution.id }));
          const handoff = AgentHandoff.create({
            correlationId: request.correlationId, taskId: request.taskId, executionId: result.execution.id,
            sourceAgentId: agent.id, targetAgentId: next.agentId, objective: request.objective,
            payload: result.task.result.output, metadata: { role: step.role },
            status: "ACCEPTED", createdAt: this.now(), completedAt: this.now(),
          });
          handoffs.push(handoff);
          this.events.publish(event("coordination.handoff.accepted", request.correlationId, handoff.handoffId, { coordinationId: request.coordinationId, sourceAgentId: agent.id, targetAgentId: next.agentId }, undefined, this.now(), { taskId: request.taskId, executionId: result.execution.id }));
          payload = handoff.payload;
          sourceAgentId = agent.id;
        }
      }
      return this.finish(request, steps, handoffs, "COMPLETED", { ...(steps.at(-1)?.output ?? {}), verified: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Coordination failed";
      return this.finish(request, steps, handoffs, "FAILED", undefined, { code: "COORDINATION_FAILED", message: `${message} (lastExecutionId=${lastExecutionId})` });
    }
  }

  private finish(request: CoordinationRequest, steps: CoordinationResult["steps"], handoffs: readonly AgentHandoff[], status: CoordinationResult["status"], output?: Readonly<Record<string, unknown>>, error?: Readonly<{ code: string; message: string }>): CoordinationResult {
    const result: CoordinationResult = { coordinationId: request.coordinationId, correlationId: request.correlationId, taskId: request.taskId, status, steps: Object.freeze([...steps]), handoffs: Object.freeze([...handoffs]), ...(output ? { output } : {}), ...(error ? { error } : {}) };
    this.events.publish(event(status === "COMPLETED" ? "coordination.completed" : "coordination.failed", request.correlationId, request.coordinationId, { coordinationId: request.coordinationId, status, stepCount: steps.length, handoffCount: handoffs.length, ...(error ? { code: error.code } : {}) }, undefined, this.now(), { taskId: request.taskId }));
    return Object.freeze(result);
  }
}
