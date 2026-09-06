import { Tool, ToolDefinition, ToolDefinitionError, ToolRegistry } from "../../domain/tools/tool-registry.js";
export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  register(tool: Tool): void { this.validateDefinition(tool.definition); if (this.tools.has(tool.definition.id)) throw new ToolDefinitionError(`Duplicate tool: ${tool.definition.id}`); this.tools.set(tool.definition.id, tool); }
  find(id: string): Tool | undefined { return this.tools.get(id); }
  list() { return [...this.tools.values()].map((tool) => tool.definition); }
  private validateDefinition(definition: ToolDefinition): void {
    if (typeof definition?.id !== "string" || definition.id.trim() === "") throw new ToolDefinitionError("Tool definition requires an id");
    if (typeof definition.name !== "string" || definition.name.trim() === "") throw new ToolDefinitionError("Tool definition requires a name");
    if (typeof definition.description !== "string" || definition.description.trim() === "") throw new ToolDefinitionError("Tool definition requires a description");
    if (!definition.inputSchema || !Array.isArray(definition.inputSchema.required) || typeof definition.inputSchema.properties !== "object") throw new ToolDefinitionError("Tool definition requires an input schema");
  }
}
