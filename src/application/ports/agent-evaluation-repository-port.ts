import { AgentLifecycle } from "../../domain/agent/agent-lifecycle.js";
import { AgentEvaluation, EvaluationType } from "../../domain/agent/agent-evaluation.js";

export interface AgentLifecycleRepositoryPort {
  save(lifecycle: AgentLifecycle): Promise<AgentLifecycle>;
  findByAgentId(agentId: string, tenantId?: string): Promise<AgentLifecycle | null>;
  findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly AgentLifecycle[]>;
  delete(agentId: string, tenantId: string): Promise<boolean>;
}

export interface AgentEvaluationRepositoryPort {
  save(evaluation: AgentEvaluation): Promise<AgentEvaluation>;
  findById(id: string, tenantId?: string): Promise<AgentEvaluation | null>;
  findByAgentId(
    agentId: string,
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentEvaluation[]>;
  findLatestByAgentAndType(
    agentId: string,
    evaluationType: EvaluationType,
    tenantId: string
  ): Promise<AgentEvaluation | null>;
  findExpiringBefore(date: Date, tenantId?: string): Promise<readonly AgentEvaluation[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
