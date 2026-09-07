import { AgentDefinition } from "../../domain/agent/agent.js";
import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { ExecutionStrategy, ExecutionStrategyResult } from "../../domain/execution/execution-strategy.js";
import { ModelGateway } from "../../domain/model/model-gateway.js";
import { PolicyDeniedError, PolicyEvaluationError, PolicyGateway } from "../../domain/policy/policy.js";
import { Task } from "../../domain/task/task.js";

/** v0.2 strategy adapter with mandatory policy governance. */
export class ModelExecutionStrategy implements ExecutionStrategy {
  constructor(
    private readonly models: ModelGateway,
    private readonly events: EventPublisher,
    private readonly policy: PolicyGateway
  ) {}

  async execute(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<ExecutionStrategyResult> {
    const refs = { taskId: task.id, executionId: context.executionId };
    await this.authorize(context, task, agent);
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

  private async authorize(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<void> {
    if (!this.policy || typeof this.policy.evaluate !== "function") {
      throw new PolicyEvaluationError("PolicyGateway is mandatory and must provide evaluate()");
    }
    const refs = { taskId: task.id, executionId: context.executionId };
    try {
      const decision = await this.policy.evaluate({
        traceId: context.traceId,
        executionId: context.executionId,
        taskId: task.id,
        operationId: context.executionId,
        operationType: "MODEL",
        resourceId: agent.model,
        metadata: task.request.input ?? {},
      });
      this.events.publish(
        event("policy.evaluated", context.traceId, context.executionId, {
          operationId: context.executionId,
          policyId: decision.policyId,
          allowed: decision.allowed,
        }, undefined, undefined, refs)
      );
      if (!decision.allowed) {
        const reason = decision.reason ?? "Model execution denied by policy";
        this.events.publish(
          event("policy.denied", context.traceId, context.executionId, {
            operationId: context.executionId,
            policyId: decision.policyId,
            reason,
          }, undefined, undefined, refs)
        );
        throw new PolicyDeniedError(decision.policyId, context.executionId, reason);
      }
      this.events.publish(
        event("policy.allowed", context.traceId, context.executionId, {
          operationId: context.executionId,
          policyId: decision.policyId,
        }, undefined, undefined, refs)
      );
    } catch (cause) {
      if (cause instanceof PolicyDeniedError) throw cause;
      throw new PolicyEvaluationError("Policy evaluation unavailable; model execution denied", cause instanceof Error ? cause : undefined);
    }
  }
}
