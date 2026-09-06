import { EventPublisher, event } from "../../domain/events/events.js";
import { ModelGateway } from "../../domain/model/model-gateway.js";
import { Operation, OperationExecutionError, OperationResult, OrchestrationRequest, OrchestrationResult, Orchestrator } from "../../domain/orchestration/orchestration.js";
import { ToolGateway } from "../../domain/tools/tool-registry.js";
import { PolicyDeniedError, PolicyEvaluationError, PolicyGateway } from "../../domain/policy/policy.js";

/** Coordinates a finite declared sequence; it performs no planning, retries, or parallel work. */
export class SequentialOrchestrator implements Orchestrator {
  constructor(private readonly models: ModelGateway, private readonly tools: ToolGateway, private readonly events: EventPublisher, private readonly policy?: PolicyGateway) {}
  async execute(request: OrchestrationRequest): Promise<OrchestrationResult> {
    this.validate(request);
    const refs = { taskId: request.execution.taskId, executionId: request.execution.executionId };
    if (request.cancelled) { this.events.publish(event("orchestration.cancelled", request.execution.traceId, request.execution.executionId, {}, undefined, undefined, refs)); return { status: "CANCELLED", operations: [] }; }
    this.events.publish(event("orchestration.started", request.execution.traceId, request.execution.executionId, {}, undefined, undefined, refs));
    const results: OperationResult[] = [];
    for (const operation of request.operations) {
      try {
        await this.authorize(operation, request);
        this.events.publish(event("operation.started", request.execution.traceId, operation.id, { operationId: operation.id, kind: operation.kind }, undefined, undefined, refs));
        const output = await this.run(operation, request, results);
        const result: OperationResult = { operationId: operation.id, status: "COMPLETED", output, ...(operation.metadata ? { metadata: operation.metadata } : {}) }; results.push(result);
        this.events.publish(event("operation.completed", request.execution.traceId, operation.id, { operationId: operation.id, kind: operation.kind }, undefined, undefined, refs));
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error("Unknown operation failure"); const result: OperationResult = { operationId: operation.id, status: "FAILED", error }; results.push(result);
        this.events.publish(event("operation.failed", request.execution.traceId, operation.id, { operationId: operation.id, message: error.message }, undefined, undefined, refs));
        this.events.publish(event("orchestration.failed", request.execution.traceId, request.execution.executionId, { operationId: operation.id }, undefined, undefined, refs));
        return { status: "FAILED", operations: results };
      }
    }
    const output = results.at(-1)?.output; this.events.publish(event("orchestration.completed", request.execution.traceId, request.execution.executionId, {}, undefined, undefined, refs));
    return { status: "COMPLETED", operations: results, ...(output ? { output } : {}) };
  }
  private async run(operation: Operation, request: OrchestrationRequest, results: readonly OperationResult[]): Promise<Readonly<Record<string, unknown>>> {
    const input = this.resolveInput(operation, results);
    try {
      if (operation.kind === "MODEL") return (await this.models.generate({ traceId: request.execution.traceId, model: operation.model, input, metadata: operation.metadata })).output;
      return (await this.tools.execute(operation.toolId, input, request.execution)).output;
    } catch (cause) { const error = cause instanceof Error ? cause : new Error("Unknown operation failure"); throw new OperationExecutionError(operation.id, error.message, error); }
  }
  private async authorize(operation: Operation, request: OrchestrationRequest): Promise<void> {
    if (!this.policy) return;
    const resourceId = operation.kind === "MODEL" ? operation.model : operation.toolId;
    try {
      const decision = await this.policy.evaluate({ traceId: request.execution.traceId, executionId: request.execution.executionId, taskId: request.execution.taskId, operationId: operation.id, operationType: operation.kind, resourceId, metadata: operation.metadata ?? {} });
      const refs = { taskId: request.execution.taskId, executionId: request.execution.executionId };
      this.events.publish(event("policy.evaluated", request.execution.traceId, operation.id, { operationId: operation.id, policyId: decision.policyId, allowed: decision.allowed }, undefined, undefined, refs));
      if (!decision.allowed) { const reason = decision.reason ?? "Operation denied by policy"; this.events.publish(event("policy.denied", request.execution.traceId, operation.id, { operationId: operation.id, policyId: decision.policyId, reason }, undefined, undefined, refs)); throw new PolicyDeniedError(decision.policyId, operation.id, reason); }
      this.events.publish(event("policy.allowed", request.execution.traceId, operation.id, { operationId: operation.id, policyId: decision.policyId }, undefined, undefined, refs));
    } catch (cause) {
      if (cause instanceof PolicyDeniedError) throw cause;
      throw new PolicyEvaluationError("Policy evaluation unavailable; operation denied", cause instanceof Error ? cause : undefined);
    }
  }
  private resolveInput(operation: Operation, results: readonly OperationResult[]): Readonly<Record<string, unknown>> {
    const resolved: Record<string, unknown> = { ...operation.input };
    for (const binding of operation.bindings ?? []) {
      const prior = results.find((result) => result.operationId === binding.operationId)?.output;
      if (!prior || !(binding.sourceKey in prior)) throw new OrchestrationValidationError(`Binding for ${operation.id} cannot resolve ${binding.operationId}.${binding.sourceKey}`);
      resolved[binding.targetKey] = prior[binding.sourceKey];
    }
    return resolved;
  }
  private validate(request: OrchestrationRequest): void {
    if (!request?.execution) throw new OrchestrationValidationError("Orchestration requires execution context");
    if (!Array.isArray(request.operations) || request.operations.length === 0) throw new OrchestrationValidationError("Orchestration requires at least one operation");
    const ids = new Set<string>();
    for (const operation of request.operations) { if (!operation.id?.trim() || ids.has(operation.id)) throw new OrchestrationValidationError("Operation ids must be unique and non-empty"); ids.add(operation.id); }
  }
}
