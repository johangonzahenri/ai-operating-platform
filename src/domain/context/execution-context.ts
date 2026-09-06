export interface ExecutionContext {
  readonly task: Readonly<Record<string, unknown>>;
  readonly agent: Readonly<Record<string, unknown>>;
  readonly execution: Readonly<Record<string, unknown>>;
  readonly model: Readonly<Record<string, unknown>>;
  readonly tool: Readonly<Record<string, unknown>>;
}
