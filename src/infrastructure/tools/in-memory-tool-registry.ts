import {
  Tool,
  ToolDefinition,
  ToolDefinitionError,
  ToolNotFoundError,
  ToolRegistry,
  ToolValidationError,
} from "../../domain/tools/tool-registry.js";

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.validateDefinition(tool.definition);
    if (this.tools.has(tool.definition.id)) {
      throw new ToolDefinitionError(`Duplicate tool: ${tool.definition.id}`);
    }
    this.tools.set(tool.definition.id, tool);
  }

  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  find(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  get(id: string): Tool {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new ToolNotFoundError(id);
    }
    return tool;
  }

  findById(id: string): ToolDefinition | undefined {
    return this.tools.get(id)?.definition;
  }

  list(): readonly ToolDefinition[] {
    return Object.freeze([...this.tools.values()].map((tool) => tool.definition));
  }

  validate(id: string, input: Readonly<Record<string, unknown>>): boolean {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new ToolNotFoundError(id);
    }
    if (input === null || typeof input !== "object") {
      throw new ToolValidationError(id, "Tool input must be a non-null object");
    }
    const { required, properties } = tool.definition.inputSchema;
    for (const key of required) {
      if (!(key in input)) {
        throw new ToolValidationError(id, `Missing required input property: ${key}`);
      }
    }
    for (const [key, type] of Object.entries(properties)) {
      if (key in input && typeof input[key] !== type) {
        throw new ToolValidationError(id, `Input property '${key}' must be of type '${type}'`);
      }
    }
    return true;
  }

  authorize(toolId: string, permissions: readonly string[]): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return false;
    }
    const toolPermissions = tool.definition.permissions ?? [];
    if (toolPermissions.length === 0) {
      return true; // No special permissions required
    }
    const granted = new Set(permissions);
    return toolPermissions.every((p) => granted.has(p));
  }

  private validateDefinition(definition: ToolDefinition): void {
    if (typeof definition?.id !== "string" || definition.id.trim() === "") {
      throw new ToolDefinitionError("Tool definition requires an id");
    }
    if (typeof definition.name !== "string" || definition.name.trim() === "") {
      throw new ToolDefinitionError("Tool definition requires a name");
    }
    if (typeof definition.description !== "string" || definition.description.trim() === "") {
      throw new ToolDefinitionError("Tool definition requires a description");
    }
    if (
      !definition.inputSchema ||
      !Array.isArray(definition.inputSchema.required) ||
      typeof definition.inputSchema.properties !== "object"
    ) {
      throw new ToolDefinitionError("Tool definition requires an input schema");
    }
    if (definition.riskLevel !== undefined) {
      const validRisks = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (!validRisks.includes(definition.riskLevel)) {
        throw new ToolDefinitionError(`Invalid riskLevel: ${definition.riskLevel}`);
      }
    }
    if (definition.timeoutMs !== undefined && (typeof definition.timeoutMs !== "number" || definition.timeoutMs <= 0)) {
      throw new ToolDefinitionError("timeoutMs must be a positive number when provided");
    }
  }
}

