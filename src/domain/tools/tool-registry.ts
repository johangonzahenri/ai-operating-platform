import { ExecutionContext } from "../execution/execution-context.js";

export type ToolValueType = "string" | "number" | "boolean";
export interface ToolInputSchema { readonly required: readonly string[]; readonly properties: Readonly<Record<string, ToolValueType>>; }
export interface ToolDefinition { readonly id: string; readonly name: string; readonly description: string; readonly version?: string; readonly inputSchema: ToolInputSchema; readonly metadata?: Readonly<Record<string, unknown>>; }
export interface ToolRequest { readonly toolId: string; readonly input: Readonly<Record<string, unknown>>; }
export interface ToolResult { readonly output: Readonly<Record<string, unknown>>; readonly metadata?: Readonly<Record<string, unknown>>; }
export class ToolDefinitionError extends Error { constructor(message: string) { super(message); this.name = "ToolDefinitionError"; } }
export class ToolNotFoundError extends Error { constructor(readonly toolId: string) { super(`Tool not found: ${toolId}`); this.name = "ToolNotFoundError"; } }
export class ToolValidationError extends Error { constructor(readonly toolId: string, message: string) { super(message); this.name = "ToolValidationError"; } }
export class ToolExecutionError extends Error { constructor(readonly toolId: string, message: string) { super(message); this.name = "ToolExecutionError"; } }
export interface Tool { readonly definition: ToolDefinition; execute(input: Readonly<Record<string, unknown>>, context: ExecutionContext): Promise<ToolResult>; }
export interface ToolRegistry { register(tool: Tool): void; find(id: string): Tool | undefined; list(): readonly ToolDefinition[]; }
export interface ToolGateway { execute(toolId: string, input: Readonly<Record<string, unknown>>, context: ExecutionContext): Promise<ToolResult>; }
