import { AgentDefinition } from "../agent/agent.js";
import { Task } from "../task/task.js";
import { ExecutionContext } from "./execution-context.js";

export interface ExecutionStrategyResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** A capability port: CoreRuntime owns lifecycle while a strategy performs the operation. */
export interface ExecutionStrategy {
  execute(context: ExecutionContext, task: Task, agent: AgentDefinition): Promise<ExecutionStrategyResult>;
}
