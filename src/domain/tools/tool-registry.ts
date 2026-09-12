import { ExecutionContext } from "../execution/execution-context.js";

export type ToolValueType = "string" | "number" | "boolean";

export type ToolRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ToolInputSchema {
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, ToolValueType>>;
}

export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
  readonly inputSchema: ToolInputSchema;
  readonly outputSchema?: Readonly<Record<string, unknown>> | undefined;
  readonly permissions?: readonly string[] | undefined;
  readonly riskLevel?: ToolRiskLevel | undefined;
  readonly timeoutMs?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ToolRequest {
  readonly toolId: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ToolResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class ToolDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolDefinitionError";
  }
}

export class ToolNotFoundError extends Error {
  constructor(readonly toolId: string) {
    super(`Tool not found: ${toolId}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends Error {
  constructor(readonly toolId: string, message: string) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class ToolExecutionError extends Error {
  constructor(readonly toolId: string, message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

export class ToolAuthorizationError extends Error {
  constructor(readonly toolId: string, message = `Tool '${toolId}' is not authorized for this context`) {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

export interface Tool {
  readonly definition: ToolDefinition;
  execute(input: Readonly<Record<string, unknown>>, context: ExecutionContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  unregister?(id: string): boolean;
  find(id: string): Tool | undefined;
  get?(id: string): Tool;
  list(): readonly ToolDefinition[];
  validate?(id: string, input: Readonly<Record<string, unknown>>): boolean;
  authorize?(toolId: string, permissions: readonly string[]): boolean;
}

export interface ToolGateway {
  execute(toolId: string, input: Readonly<Record<string, unknown>>, context: ExecutionContext): Promise<ToolResult>;
  definition?(toolId: string): ToolDefinition | undefined;
}
