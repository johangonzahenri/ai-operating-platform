export interface ToolDefinition {
  readonly id: string; readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly capabilities: readonly string[]; readonly permissions: readonly string[];
}
export interface ToolRegistry { find(id: string): ToolDefinition | undefined; list(): readonly ToolDefinition[]; }
export interface ToolExecutor { execute(tool: ToolDefinition, input: Readonly<Record<string, unknown>>, traceId: string): Promise<Readonly<Record<string, unknown>>>; }
