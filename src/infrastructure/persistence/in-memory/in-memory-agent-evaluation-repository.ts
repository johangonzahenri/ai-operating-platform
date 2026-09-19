import {
  AgentLifecycle,
} from "../../../domain/agent/agent-lifecycle.js";
import {
  AgentEvaluation,
  EvaluationType,
} from "../../../domain/agent/agent-evaluation.js";
import {
  AgentLifecycleRepositoryPort,
  AgentEvaluationRepositoryPort,
} from "../../../application/ports/agent-evaluation-repository-port.js";
import {
  AgentLifecycleConcurrencyConflictError,
  AgentEvaluationConcurrencyConflictError,
} from "../../../domain/agent/agent-lifecycle-errors.js";

export class InMemoryAgentLifecycleRepository implements AgentLifecycleRepositoryPort {
  private readonly store = new Map<string, AgentLifecycle>();

  private key(agentId: string, tenantId: string): string {
    return `${tenantId}:${agentId.toLowerCase()}`;
  }

  async save(lifecycle: AgentLifecycle): Promise<AgentLifecycle> {
    const k = this.key(lifecycle.agentId, lifecycle.tenantId);
    const existing = this.store.get(k);

    if (existing && existing.version >= lifecycle.version) {
      throw new AgentLifecycleConcurrencyConflictError(
        `Agent lifecycle OCC conflict: expected version > ${existing.version}, but got ${lifecycle.version}`
      );
    }

    this.store.set(k, lifecycle);
    return lifecycle;
  }

  async findByAgentId(agentId: string, tenantId?: string): Promise<AgentLifecycle | null> {
    const normalizedAgentId = agentId.toLowerCase();
    for (const lc of this.store.values()) {
      if (lc.agentId.toLowerCase() === normalizedAgentId) {
        if (!tenantId || lc.tenantId === tenantId) {
          return lc;
        }
      }
    }
    return null;
  }

  async findByTenantId(
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentLifecycle[]> {
    const list = Array.from(this.store.values()).filter((lc) => lc.tenantId === tenantId);
    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    return list.slice(start, end);
  }

  async delete(agentId: string, tenantId: string): Promise<boolean> {
    const k = this.key(agentId, tenantId);
    return this.store.delete(k);
  }

  clear(): void {
    this.store.clear();
  }
}

export class InMemoryAgentEvaluationRepository implements AgentEvaluationRepositoryPort {
  private readonly store = new Map<string, AgentEvaluation>();

  async save(evaluation: AgentEvaluation): Promise<AgentEvaluation> {
    const existing = this.store.get(evaluation.id);
    if (existing && existing.version >= evaluation.version) {
      throw new AgentEvaluationConcurrencyConflictError(
        `Agent evaluation OCC conflict: expected version > ${existing.version}, but got ${evaluation.version}`
      );
    }
    this.store.set(evaluation.id, evaluation);
    return evaluation;
  }

  async findById(id: string, tenantId?: string): Promise<AgentEvaluation | null> {
    const item = this.store.get(id);
    if (!item) return null;
    if (tenantId && item.tenantId !== tenantId) return null;
    return item;
  }

  async findByAgentId(
    agentId: string,
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentEvaluation[]> {
    const normalizedAgentId = agentId.toLowerCase();
    const list = Array.from(this.store.values())
      .filter((e) => e.tenantId === tenantId && e.agentId.toLowerCase() === normalizedAgentId)
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime());

    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    return list.slice(start, end);
  }

  async findLatestByAgentAndType(
    agentId: string,
    evaluationType: EvaluationType,
    tenantId: string
  ): Promise<AgentEvaluation | null> {
    const normalizedAgentId = agentId.toLowerCase();
    const list = Array.from(this.store.values())
      .filter(
        (e) =>
          e.tenantId === tenantId &&
          e.agentId.toLowerCase() === normalizedAgentId &&
          e.evaluationType === evaluationType
      )
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime());

    return list[0] ?? null;
  }

  async findExpiringBefore(date: Date, tenantId?: string): Promise<readonly AgentEvaluation[]> {
    return Array.from(this.store.values()).filter((e) => {
      if (tenantId && e.tenantId !== tenantId) return false;
      if (!e.expiresAt) return false;
      return e.expiresAt.getTime() <= date.getTime() && e.verdict !== "EXPIRED";
    });
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const item = this.store.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }
}
