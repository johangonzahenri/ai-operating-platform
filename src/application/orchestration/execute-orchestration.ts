import crypto from "node:crypto";
import { AgentDefinition } from "../../domain/agent/agent.js";
import { Execution } from "../../domain/execution/execution.js";
import { Runtime } from "../../domain/execution/runtime.js";
import { Operation } from "../../domain/orchestration/orchestration.js";
import { Task, InvalidTaskInputError } from "../../domain/task/task.js";

export interface ExecuteOrchestrationRequest {
  readonly operations: readonly Operation[];
  readonly traceId?: string | undefined;
  readonly agentId?: string | undefined;
}

export interface ExecuteOrchestrationResult {
  readonly task: Task;
  readonly execution: Execution;
}

/** Application use case: orchestrates a declared sequence of operations through the CoreRuntime lifecycle. */
export class ExecuteOrchestration {
  constructor(private readonly runtime: Runtime) {}

  async execute(request: ExecuteOrchestrationRequest): Promise<ExecuteOrchestrationResult> {
    if (!request || !Array.isArray(request.operations) || request.operations.length === 0) {
      throw new InvalidTaskInputError("Orchestration requires at least one operation");
    }

    const traceId = request.traceId?.trim() || crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const agentId = request.agentId?.trim() || "orchestrator";

    const task = Task.create(taskId, traceId, {
      agentId,
      input: { operations: request.operations },
    });

    const agent: AgentDefinition = {
      id: agentId,
      name: "Sequential Orchestration Agent",
      capabilities: ["orchestration", "reasoning"],
      model: "stub-model",
    };

    const result = await this.runtime.execute(task, agent);
    return { task: result.task, execution: result.execution };
  }
}
