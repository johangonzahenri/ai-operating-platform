import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { OrganizationHierarchyRepository } from "../ports/organization-repository-port.js";
import { TeamResourceBudgetRepositoryPort } from "../ports/team-resource-budget-repository-port.js";
import {
  TeamResourceBudget,
  BudgetLimits,
  BudgetRemaining,
  BudgetWindow,
  ResourceConsumptionRequest,
} from "../../domain/organization/team-resource-budget.js";
import {
  TeamNotFoundError,
  BudgetNotFoundError,
  OrganizationConflictError,
  CrossTenantOrganizationError,
} from "../../domain/organization/organization-errors.js";
import {
  createTeamBudgetCreatedEvent,
  createTeamBudgetUpdatedEvent,
  createTeamBudgetExhaustedEvent,
  createTeamBudgetStatusChangedEvent,
  createTeamResourceConsumptionAuthorizedEvent,
  createTeamResourceConsumptionDeniedEvent,
} from "../../domain/organization/organization-events.js";

export interface TeamResourceBudgetServiceOptions {
  readonly budgetRepository: TeamResourceBudgetRepositoryPort;
  readonly organizationRepository: OrganizationHierarchyRepository;
  readonly events?: EventPublisher | undefined;
}

export interface CreateTeamBudgetProps {
  readonly id?: string | undefined;
  readonly teamId: string;
  readonly tenantId: string;
  readonly limits: BudgetLimits;
  readonly window?: BudgetWindow | undefined;
}

export interface ConsumptionEvaluationResult {
  readonly allowed: boolean;
  readonly reason?: string | undefined;
  readonly budget?: TeamResourceBudget | undefined;
  readonly remaining?: BudgetRemaining | undefined;
}

export class TeamResourceBudgetService {
  private readonly budgetRepo: TeamResourceBudgetRepositoryPort;
  private readonly orgRepo: OrganizationHierarchyRepository;
  private readonly events?: EventPublisher | undefined;

  constructor(options: TeamResourceBudgetServiceOptions) {
    this.budgetRepo = options.budgetRepository;
    this.orgRepo = options.organizationRepository;
    this.events = options.events;
  }

  private async publish(event: ReturnType<typeof createTeamBudgetCreatedEvent>): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }

  async createBudget(
    props: CreateTeamBudgetProps,
    traceId: string = crypto.randomUUID()
  ): Promise<TeamResourceBudget> {

    const team = await this.orgRepo.findTeamById(props.teamId);
    if (!team) {
      throw new TeamNotFoundError(props.teamId);
    }
    if (team.tenantId !== props.tenantId) {
      throw new CrossTenantOrganizationError(
        `Team '${props.teamId}' belongs to another tenant`
      );
    }

    const existing = await this.budgetRepo.findByTeamId(props.teamId, props.tenantId);
    if (existing) {
      throw new OrganizationConflictError(
        `Budget already exists for team '${props.teamId}'`
      );
    }

    const budget = TeamResourceBudget.create({
      id: props.id,
      teamId: props.teamId,
      organizationId: team.organizationId,
      tenantId: props.tenantId,
      limits: props.limits,
      window: props.window,
    });

    await this.budgetRepo.save(budget);
    await this.publish(createTeamBudgetCreatedEvent(budget, traceId));

    return budget;
  }

  async getBudget(teamId: string, tenantId: string): Promise<TeamResourceBudget> {
    const team = await this.orgRepo.findTeamById(teamId);
    if (!team) {
      throw new TeamNotFoundError(teamId);
    }
    if (team.tenantId !== tenantId) {
      throw new CrossTenantOrganizationError(
        `Team '${teamId}' belongs to another tenant`
      );
    }

    const budget = await this.budgetRepo.findByTeamId(teamId, tenantId);
    if (!budget) {
      throw new BudgetNotFoundError(teamId);
    }

    return budget;
  }

  async updateBudget(
    teamId: string,
    tenantId: string,
    limits: Partial<BudgetLimits>,
    traceId: string = crypto.randomUUID()
  ): Promise<TeamResourceBudget> {
    const existing = await this.getBudget(teamId, tenantId);
    const updated = existing.updateLimits(limits);

    await this.budgetRepo.save(updated);
    await this.publish(createTeamBudgetUpdatedEvent(updated, traceId));

    if (updated.status === "EXHAUSTED" && existing.status !== "EXHAUSTED") {
      await this.publish(createTeamBudgetExhaustedEvent(updated, traceId));
    }

    return updated;
  }

  async suspendBudget(
    teamId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<TeamResourceBudget> {
    const existing = await this.getBudget(teamId, tenantId);
    if (existing.status === "SUSPENDED") return existing;

    const previousStatus = existing.status;
    const updated = existing.suspend();

    await this.budgetRepo.save(updated);
    await this.publish(createTeamBudgetStatusChangedEvent(updated, previousStatus, traceId));

    return updated;
  }

  async reactivateBudget(
    teamId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<TeamResourceBudget> {
    const existing = await this.getBudget(teamId, tenantId);
    if (existing.status !== "SUSPENDED") return existing;

    const previousStatus = existing.status;
    const updated = existing.reactivate();

    await this.budgetRepo.save(updated);
    await this.publish(createTeamBudgetStatusChangedEvent(updated, previousStatus, traceId));

    return updated;
  }

  async evaluateAndConsume(
    teamId: string,
    tenantId: string,
    request: ResourceConsumptionRequest,
    traceId: string = crypto.randomUUID()
  ): Promise<ConsumptionEvaluationResult> {
    const team = await this.orgRepo.findTeamById(teamId);
    if (!team) {
      await this.publish(
        createTeamResourceConsumptionDeniedEvent(
          teamId,
          tenantId,
          request,
          `Team '${teamId}' not found`,
          traceId
        )
      );
      return {
        allowed: false,
        reason: `Team '${teamId}' not found`,
      };
    }
    if (team.tenantId !== tenantId) {
      await this.publish(
        createTeamResourceConsumptionDeniedEvent(
          teamId,
          tenantId,
          request,
          `Cross-tenant access forbidden`,
          traceId
        )
      );
      return {
        allowed: false,
        reason: "Cross-tenant access forbidden",
      };
    }

    const result = await this.budgetRepo.consumeAtomic(teamId, tenantId, request);

    if (result.success && result.budget) {
      await this.publish(
        createTeamResourceConsumptionAuthorizedEvent(result.budget, request, traceId)
      );
      if (result.budget.status === "EXHAUSTED") {
        await this.publish(createTeamBudgetExhaustedEvent(result.budget, traceId));
      }
      return {
        allowed: true,
        budget: result.budget,
        remaining: result.budget.getRemaining(),
      };
    }

    const reason = result.reason ?? `Resource consumption denied for team '${teamId}'`;
    await this.publish(
      createTeamResourceConsumptionDeniedEvent(teamId, tenantId, request, reason, traceId)
    );

    return {
      allowed: false,
      reason,
    };
  }

  async deleteBudget(teamId: string, tenantId: string): Promise<boolean> {
    await this.getBudget(teamId, tenantId);
    return this.budgetRepo.deleteBudget(teamId, tenantId);
  }
}
