import { Agent } from "./agent.js";

export interface AgentRegistry {
  register(agent: Agent): void;
  findById(id: string): Agent | undefined;
  list(): readonly Agent[];
  update(agent: Agent): void;
  delete(id: string): void;
}
