import { AgentDefinition } from "../agent/agent.js";
import { Task } from "../task/task.js";
import { Execution } from "./execution.js";
import { ExecutionContext } from "./execution-context.js";

export interface RuntimeResult { readonly task: Task; readonly execution: Execution; readonly context: ExecutionContext; }
export interface Runtime { execute(task: Task, agent: AgentDefinition): Promise<RuntimeResult>; }
