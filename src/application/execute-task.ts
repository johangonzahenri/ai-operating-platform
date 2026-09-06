import { AgentDefinition } from "../domain/agent/agent.js";
import { Runtime } from "../domain/execution/runtime.js";
import { Task } from "../domain/task/task.js";

export class ExecuteTask {
  constructor(private readonly runtime: Runtime) {}

  async execute(task: Task, agent: AgentDefinition): Promise<Task> {
    return (await this.runtime.execute(task, agent)).task;
  }
}
