import { Agent, AgentAlreadyExistsError, AgentNotFoundError } from "../../domain/agent/agent.js";
import { AgentRegistry } from "../../domain/agent/agent-registry.js";
import { AgentProjection, AgentQueryPort } from "../../application/ports/query-ports.js";

export class InMemoryAgentRegistry implements AgentRegistry, AgentQueryPort {
  private readonly agents = new Map<string, Agent>();

  constructor(initialAgents: readonly Agent[] = []) {
    for (const a of initialAgents) {
      this.agents.set(a.id, a);
    }
  }

  register(agent: Agent): void {
    if (this.agents.has(agent.id)) {
      throw new AgentAlreadyExistsError(agent.id);
    }
    this.agents.set(agent.id, agent);
  }

  findById(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  list(): readonly Agent[] {
    return Array.from(this.agents.values());
  }

  update(agent: Agent): void {
    if (!this.agents.has(agent.id)) {
      throw new AgentNotFoundError(agent.id);
    }
    this.agents.set(agent.id, agent);
  }

  delete(id: string): void {
    this.agents.delete(id);
  }

  toProjection(agent: Agent): AgentProjection {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      version: agent.version,
      status: agent.status,
      model: agent.model,
      instructions: agent.instructions,
      tools: agent.tools,
      memoryScope: agent.memoryScope,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }
}
