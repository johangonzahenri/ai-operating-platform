import { ExecutionContext } from "../../domain/execution/execution-context.js";
import { Tool, ToolDefinition, ToolExecutionContext, ToolResult } from "../../domain/tools/tool-registry.js";

export class CalculatorTool implements Tool {
  readonly definition: ToolDefinition = {
    id: "calculator",
    name: "Calculator",
    description: "Adds two numeric values.",
    version: "1.0.0",
    riskLevel: "LOW",
    executionMode: "READ_ONLY",
    timeoutMs: 5000,
    inputSchema: {
      required: ["left", "right"],
      properties: {
        left: "number",
        right: "number",
      },
    },
    outputSchema: {
      required: ["value"],
      properties: {
        value: "number",
      },
    },
  };

  async execute(
    input: Readonly<Record<string, unknown>>,
    _context: ExecutionContext | ToolExecutionContext
  ): Promise<ToolResult> {
    return {
      output: { value: (input.left as number) + (input.right as number) },
      metadata: { operation: "add" },
    };
  }
}
