import crypto from "node:crypto";
import {
  Agent,
  AgentAlreadyExistsError,
  AgentInactiveError,
  AgentNotFoundError,
  AgentProps,
  AgentValidationError,
  UpdateAgentProps,
  validateAgentId,
} from "../../domain/agent/agent.js";
import { AgentRegistry } from "../../domain/agent/agent-registry.js";
import { Runtime } from "../../domain/execution/runtime.js";
import { Task, InvalidTaskInputError } from "../../domain/task/task.js";
import { ExecutionProjection, ModelQueryPort, TaskProjection, ToolQueryPort } from "../ports/query-ports.js";

export interface CreateAgentCommand {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly model: string;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export interface UpdateAgentCommand {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly model?: string | undefined;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export class AgentService {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly runtime: Runtime,
    private readonly models?: ModelQueryPort | undefined,
    private readonly tools?: ToolQueryPort | undefined
  ) {}

  createAgent(command: CreateAgentCommand): Agent {
    if (!command) {
      throw new AgentValidationError("Agent creation requires a valid payload");
    }
    const id = validateAgentId(command.id);

    const existing = this.registry.findById(id);
    if (existing) {
      throw new AgentAlreadyExistsError(id);
    }

    // Validate model if model registry is available
    if (this.models && command.model) {
      const model = this.models.findById(command.model.trim());
      if (!model) {
        throw new AgentValidationError(`Referenced model '${command.model}' is not registered`);
      }
    }

    // Validate tools if tool registry is available
    if (this.tools && Array.isArray(command.tools)) {
      for (const t of command.tools) {
        if (typeof t === "string" && t.trim()) {
          const tool = this.tools.findById(t.trim());
          if (!tool) {
            throw new AgentValidationError(`Referenced tool '${t}' is not registered`);
          }
        }
      }
    }

    const agent = Agent.create({
      id,
      name: command.name,
      description: command.description,
      model: command.model,
      instructions: command.instructions,
      tools: command.tools,
      memoryScope: command.memoryScope,
    });

    this.registry.register(agent);
    return agent;
  }

  getAgent(id: string): Agent {
    const validId = validateAgentId(id);
    const agent = this.registry.findById(validId);
    if (!agent) {
      throw new AgentNotFoundError(validId);
    }
    return agent;
  }

  listAgents(): readonly Agent[] {
    return this.registry.list();
  }

  updateAgent(id: string, patch: UpdateAgentCommand): Agent {
    const validId = validateAgentId(id);
    const agent = this.registry.findById(validId);
    if (!agent) {
      throw new AgentNotFoundError(validId);
    }

    // Validate model if model registry is available
    if (this.models && patch.model) {
      const model = this.models.findById(patch.model.trim());
      if (!model) {
        throw new AgentValidationError(`Referenced model '${patch.model}' is not registered`);
      }
    }

    // Validate tools if tool registry is available
    if (this.tools && Array.isArray(patch.tools)) {
      for (const t of patch.tools) {
        if (typeof t === "string" && t.trim()) {
          const tool = this.tools.findById(t.trim());
          if (!tool) {
            throw new AgentValidationError(`Referenced tool '${t}' is not registered`);
          }
        }
      }
    }

    const updated = agent.update(patch);
    this.registry.update(updated);
    return updated;
  }

  activateAgent(id: string): Agent {
    const validId = validateAgentId(id);
    const agent = this.registry.findById(validId);
    if (!agent) {
      throw new AgentNotFoundError(validId);
    }
    const activated = agent.activate();
    this.registry.update(activated);
    return activated;
  }

  deactivateAgent(id: string): Agent {
    const validId = validateAgentId(id);
    const agent = this.registry.findById(validId);
    if (!agent) {
      throw new AgentNotFoundError(validId);
    }
    const deactivated = agent.deactivate();
    this.registry.update(deactivated);
    return deactivated;
  }

  async executeAgent(
    agentId: string,
    input: Record<string, unknown>,
    traceId?: string | undefined
  ): Promise<{ task: TaskProjection; execution: ExecutionProjection }> {
    const validId = validateAgentId(agentId);
    const agent = this.registry.findById(validId);
    if (!agent) {
      throw new AgentNotFoundError(validId);
    }
    if (agent.status !== "ACTIVE") {
      throw new AgentInactiveError(validId);
    }

    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
      throw new InvalidTaskInputError("Agent execution requires a non-empty input object");
    }

    const finalTraceId = traceId?.trim() || crypto.randomUUID();
    const taskId = crypto.randomUUID();

    const task = Task.create(taskId, finalTraceId, {
      agentId: agent.id,
      input,
    });

    const result = await this.runtime.execute(task, agent.toDefinition());
    return {
      task: result.task,
      execution: result.execution,
    };
  }

  getRuntime(): Runtime {
    return this.runtime;
  }
}
