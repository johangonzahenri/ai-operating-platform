export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly model: string;
}
