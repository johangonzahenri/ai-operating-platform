import { AgentDefinition } from "../../domain/agent/agent.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { ExecutionStrategy, ExecutionStrategyResult } from "../../domain/execution/execution-strategy.js";
import { ModelGateway } from "../../domain/model/model-gateway.js";
import { Task } from "../../domain/task/task.js";

/** v0.2 strategy adapter. It is the only runtime path that understands the ModelGateway capability. */
export class ModelExecutionStrategy implements ExecutionStrategy {
  constructor(private readonly models: ModelGateway, private readonly events: EventPublisher) {}
  async execute(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<ExecutionStrategyResult> {
    const refs = { taskId: task.id, executionId: context.executionId };
    this.events.publish(event("model.requested", context.traceId, context.executionId, { model: agent.model }, undefined, undefined, refs));
    try {
      const response = await this.models.generate({ traceId: context.traceId, model: agent.model, input: task.request.input });
      this.events.publish(event("model.completed", context.traceId, context.executionId, { provider: response.provider }, undefined, undefined, refs));
      return { output: response.output, metadata: { provider: response.provider, model: agent.model } };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown model failure";
      this.events.publish(event("model.failed", context.traceId, context.executionId, { message }, undefined, undefined, refs));
      throw cause;
    }
  }
}
