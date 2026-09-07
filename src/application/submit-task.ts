import crypto from "node:crypto";
import { AgentDefinition } from "../domain/agent/agent.js";
import { Runtime } from "../domain/execution/runtime.js";
import { Task, InvalidTaskInputError } from "../domain/task/task.js";
import { ExecutionProjection, TaskProjection } from "./ports/query-ports.js";

export interface SubmitTaskRequest {
  readonly agentId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly traceId?: string | undefined;
}

export interface SubmitTaskResponse {
  readonly task: TaskProjection;
  readonly execution: ExecutionProjection;
}

/** Application use case: submits and executes a single task through the CoreRuntime lifecycle. */
export class SubmitTask {
  constructor(private readonly runtime: Runtime) {}

  async execute(request: SubmitTaskRequest): Promise<SubmitTaskResponse> {
    if (!request) {
      throw new InvalidTaskInputError("Task submission requires a valid request");
    }
    const agentId = request.agentId?.trim();
    if (!agentId) {
      throw new InvalidTaskInputError("Task request requires an agent id");
    }
    if (!request.input || typeof request.input !== "object" || Object.keys(request.input).length === 0) {
      throw new InvalidTaskInputError("Task request requires non-empty input");
    }

    const traceId = request.traceId?.trim() || crypto.randomUUID();
    const taskId = crypto.randomUUID();

    const task = Task.create(taskId, traceId, {
      agentId,
      input: request.input,
    });

    const agent: AgentDefinition = {
      id: agentId,
      name: `Agent ${agentId}`,
      capabilities: ["reasoning"],
      model: "stub-model",
    };

    const result = await this.runtime.execute(task, agent);
    return {
      task: result.task,
      execution: result.execution,
    };
  }
}
