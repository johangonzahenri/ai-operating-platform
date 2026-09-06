import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { Tool, ToolResult } from "../../domain/tools/tool-registry.js";
export class CalculatorTool implements Tool {
  readonly definition = { id: "calculator", name: "Calculator", description: "Adds two numeric values.", version: "1", inputSchema: { required: ["left", "right"], properties: { left: "number" as const, right: "number" as const } } };
  async execute(input: Readonly<Record<string, unknown>>, _context: ExecutionContext): Promise<ToolResult> {
    return { output: { value: (input.left as number) + (input.right as number) }, metadata: { operation: "add" } };
  }
}
