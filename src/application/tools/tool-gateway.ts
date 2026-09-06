import { EventPublisher, event } from "../../domain/events/events.js";
import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { ToolGateway, ToolNotFoundError, ToolRequest, ToolResult, ToolValidationError, ToolExecutionError, ToolRegistry } from "../../domain/tools/tool-registry.js";

export class RegistryToolGateway implements ToolGateway {
  constructor(private readonly registry: ToolRegistry, private readonly events: EventPublisher) {}
  async execute(toolId: string, input: Readonly<Record<string, unknown>>, context: ExecutionContext): Promise<ToolResult> {
    return this.executeRequest({ toolId, input }, context);
  }
  async executeRequest(request: ToolRequest, context: ExecutionContext): Promise<ToolResult> {
    if (typeof request?.toolId !== "string" || request.toolId.trim() === "") throw new ToolValidationError("unknown", "Tool request requires a tool id");
    const tool = this.registry.find(request.toolId); if (!tool) throw new ToolNotFoundError(request.toolId);
    this.validate(request.toolId, request.input, tool.definition.inputSchema.required, tool.definition.inputSchema.properties);
    const refs = { taskId: context.taskId, executionId: context.executionId };
    this.events.publish(event("tool.execution.started", context.traceId, request.toolId, { toolId: request.toolId }, undefined, undefined, refs));
    try {
      const result = await tool.execute(request.input, context);
      this.events.publish(event("tool.execution.completed", context.traceId, request.toolId, { toolId: request.toolId }, undefined, undefined, refs)); return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown tool failure";
      this.events.publish(event("tool.execution.failed", context.traceId, request.toolId, { toolId: request.toolId, message }, undefined, undefined, refs));
      throw cause instanceof ToolExecutionError ? cause : new ToolExecutionError(request.toolId, message);
    }
  }
  private validate(toolId: string, input: Readonly<Record<string, unknown>>, required: readonly string[], properties: Readonly<Record<string, string>>): void {
    if (input === null || typeof input !== "object") throw new ToolValidationError(toolId, "Tool input must be an object");
    for (const key of required) if (!(key in input)) throw new ToolValidationError(toolId, `Missing required input: ${key}`);
    for (const [key, type] of Object.entries(properties)) if (key in input && typeof input[key] !== type) throw new ToolValidationError(toolId, `Input ${key} must be a ${type}`);
  }
}
