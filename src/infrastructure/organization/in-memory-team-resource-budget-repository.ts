import {
  TeamResourceBudgetRepositoryPort,
  AtomicConsumptionResult,
} from "../../application/ports/team-resource-budget-repository-port.js";
import {
  TeamResourceBudget,
  ResourceConsumptionRequest,
} from "../../domain/organization/team-resource-budget.js";

export class InMemoryTeamResourceBudgetRepository implements TeamResourceBudgetRepositoryPort {
  private readonly budgets = new Map<string, TeamResourceBudget>();

  private key(tenantId: string, teamId: string): string {
    return `${tenantId}:${teamId}`;
  }

  async save(budget: TeamResourceBudget): Promise<TeamResourceBudget> {
    const k = this.key(budget.tenantId, budget.teamId);
    this.budgets.set(k, budget);
    return budget;
  }

  async findById(budgetId: string, tenantId: string): Promise<TeamResourceBudget | undefined> {
    for (const budget of this.budgets.values()) {
      if (budget.id === budgetId && budget.tenantId === tenantId) {
        return budget;
      }
    }
    return undefined;
  }

  async findByTeamId(teamId: string, tenantId: string): Promise<TeamResourceBudget | undefined> {
    const k = this.key(tenantId, teamId);
    return this.budgets.get(k);
  }

  async findByOrganizationId(organizationId: string, tenantId: string): Promise<readonly TeamResourceBudget[]> {
    const result: TeamResourceBudget[] = [];
    for (const budget of this.budgets.values()) {
      if (budget.organizationId === organizationId && budget.tenantId === tenantId) {
        result.push(budget);
      }
    }
    return result;
  }

  async consumeAtomic(
    teamId: string,
    tenantId: string,
    request: ResourceConsumptionRequest,
    expectedVersion?: number
  ): Promise<AtomicConsumptionResult> {
    const k = this.key(tenantId, teamId);
    const existing = this.budgets.get(k);

    if (!existing) {
      return {
        success: false,
        reason: `Budget for team '${teamId}' not found`,
      };
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      return {
        success: false,
        reason: `Optimistic concurrency conflict: expected version ${expectedVersion}, got ${existing.version}`,
      };
    }

    const check = existing.canConsume(request);
    if (!check.allowed) {
      return {
        success: false,
        reason: check.reason,
      };
    }

    const updated = existing.consume(request);
    this.budgets.set(k, updated);

    return {
      success: true,
      budget: updated,
    };
  }

  async deleteBudget(teamId: string, tenantId: string): Promise<boolean> {
    const k = this.key(tenantId, teamId);
    return this.budgets.delete(k);
  }

  clear(): void {
    this.budgets.clear();
  }
}
