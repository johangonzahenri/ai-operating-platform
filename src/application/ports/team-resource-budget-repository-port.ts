import {
  TeamResourceBudget,
  ResourceConsumptionRequest,
} from "../../domain/organization/team-resource-budget.js";

export interface AtomicConsumptionResult {
  readonly success: boolean;
  readonly budget?: TeamResourceBudget | undefined;
  readonly reason?: string | undefined;
}

export interface TeamResourceBudgetRepositoryPort {
  save(budget: TeamResourceBudget): Promise<TeamResourceBudget>;
  findById(budgetId: string, tenantId: string): Promise<TeamResourceBudget | undefined>;
  findByTeamId(teamId: string, tenantId: string): Promise<TeamResourceBudget | undefined>;
  findByOrganizationId(organizationId: string, tenantId: string): Promise<readonly TeamResourceBudget[]>;
  consumeAtomic(
    teamId: string,
    tenantId: string,
    request: ResourceConsumptionRequest,
    expectedVersion?: number
  ): Promise<AtomicConsumptionResult>;
  deleteBudget(teamId: string, tenantId: string): Promise<boolean>;
}
