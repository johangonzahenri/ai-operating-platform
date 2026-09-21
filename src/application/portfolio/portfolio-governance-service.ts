/**
 * AI Operating Platform - PortfolioGovernanceService
 * 
 * Orchestrates multi-enterprise portfolio management, explicit governance mandate validation,
 * objective cascading, and deterministic KPI aggregation across group enterprises.
 * 
 * Invariants:
 * - Cross-Enterprise Default Deny: Without an active, valid Mandate -> Deny.
 * - Deterministic Metric Aggregation: 0 LLM calculations for corporate metrics.
 * - Missing Data is Explicitly Flagged or Failed Closed based on policy.
 */

import {
  EnterprisePortfolio,
  CreateEnterprisePortfolioProps,
  AddEnterpriseToPortfolioProps,
} from "../../domain/portfolio/enterprise-portfolio.js";
import {
  EnterpriseGovernanceMandate,
  CreateGovernanceMandateProps,
} from "../../domain/portfolio/governance-mandate.js";
import {
  PortfolioObjective,
  CreatePortfolioObjectiveProps,
  EnterpriseMetricContribution,
} from "../../domain/portfolio/portfolio-objective.js";
import {
  PortfolioNotFoundError,
  MandateNotFoundError,
  PortfolioObjectiveNotFoundError,
  CrossEnterpriseAccessDeniedError,
  MandateScopeViolationError,
  PortfolioValidationError,
} from "../../domain/portfolio/portfolio-errors.js";
import {
  EnterprisePortfolioRepositoryPort,
  GovernanceMandateRepositoryPort,
  PortfolioObjectiveRepositoryPort,
} from "../ports/portfolio-repository-port.js";
import { EnterpriseRepositoryPort, BusinessMetricRepositoryPort, BusinessObjectiveRepositoryPort } from "../ports/business-repository-port.js";
import { BusinessMetric } from "../../domain/business/business-metric.js";
import { EventPublisher } from "../../domain/events/events.js";
import {
  createPortfolioCreatedEvent,
  createPortfolioEnterpriseAddedEvent,
  createPortfolioEnterpriseRemovedEvent,
  createGovernanceMandateGrantedEvent,
  createGovernanceMandateRevokedEvent,
  createPortfolioObjectiveCreatedEvent,
  createPortfolioObjectiveAggregatedEvent,
} from "../../domain/portfolio/portfolio-events.js";
import {
  MandateReconciliationService,
  MandateReconciliationRequest,
  MandateReconciliationReport,
} from "./mandate-reconciliation-service.js";
import { AutonomyLevel } from "../../domain/business/autonomy-level.js";

export interface PortfolioGovernanceServiceOptions {
  readonly portfolioRepo: EnterprisePortfolioRepositoryPort;
  readonly mandateRepo: GovernanceMandateRepositoryPort;
  readonly objectiveRepo: PortfolioObjectiveRepositoryPort;
  readonly enterpriseRepo?: EnterpriseRepositoryPort | undefined;
  readonly enterpriseObjectiveRepo?: BusinessObjectiveRepositoryPort | undefined;
  readonly enterpriseMetricRepo?: BusinessMetricRepositoryPort | undefined;
  readonly eventPublisher?: EventPublisher | undefined;
  readonly reconciliationService?: MandateReconciliationService | undefined;
}

export interface PortfolioOperatingContext {
  readonly portfolio: EnterprisePortfolio;
  readonly enterprises: readonly { readonly id: string; readonly name?: string; readonly status: string }[];
  readonly activeMandates: readonly EnterpriseGovernanceMandate[];
  readonly objectives: readonly PortfolioObjective[];
  readonly generatedAt: Date;
}

export class PortfolioGovernanceService {
  private readonly portfolioRepo: EnterprisePortfolioRepositoryPort;
  private readonly mandateRepo: GovernanceMandateRepositoryPort;
  private readonly objectiveRepo: PortfolioObjectiveRepositoryPort;
  private readonly enterpriseRepo?: EnterpriseRepositoryPort | undefined;
  private readonly enterpriseObjectiveRepo?: BusinessObjectiveRepositoryPort | undefined;
  private readonly enterpriseMetricRepo?: BusinessMetricRepositoryPort | undefined;
  private readonly eventPublisher?: EventPublisher | undefined;
  private readonly reconciliationService?: MandateReconciliationService | undefined;

  constructor(options: PortfolioGovernanceServiceOptions) {
    this.portfolioRepo = options.portfolioRepo;
    this.mandateRepo = options.mandateRepo;
    this.objectiveRepo = options.objectiveRepo;
    this.enterpriseRepo = options.enterpriseRepo;
    this.enterpriseObjectiveRepo = options.enterpriseObjectiveRepo;
    this.enterpriseMetricRepo = options.enterpriseMetricRepo;
    this.eventPublisher = options.eventPublisher;
    this.reconciliationService = options.reconciliationService;
  }

  // --- Portfolio Management ---

  async createPortfolio(props: CreateEnterprisePortfolioProps, traceId?: string): Promise<EnterprisePortfolio> {
    const portfolio = EnterprisePortfolio.create(props);
    await this.portfolioRepo.save(portfolio);

    if (this.eventPublisher) {
      await this.eventPublisher.publish(
        createPortfolioCreatedEvent(portfolio.id, portfolio.tenantId, portfolio.name, portfolio.ownerPrincipalId, traceId)
      );
    }
    return portfolio;
  }

  async getPortfolio(id: string, tenantId: string): Promise<EnterprisePortfolio> {
    const portfolio = await this.portfolioRepo.findById(id, tenantId);
    if (!portfolio) {
      throw new PortfolioNotFoundError(id, tenantId);
    }
    return portfolio;
  }

  async listPortfolios(tenantId: string): Promise<readonly EnterprisePortfolio[]> {
    return this.portfolioRepo.findAll(tenantId);
  }

  async addEnterpriseToPortfolio(
    portfolioId: string,
    tenantId: string,
    props: AddEnterpriseToPortfolioProps,
    traceId?: string
  ): Promise<EnterprisePortfolio> {
    const portfolio = await this.getPortfolio(portfolioId, tenantId);
    const updated = portfolio.addEnterprise(props);
    await this.portfolioRepo.save(updated);

    if (this.eventPublisher) {
      await this.eventPublisher.publish(
        createPortfolioEnterpriseAddedEvent(portfolio.id, portfolio.tenantId, props.enterpriseId, props.governanceScope ?? ["COORDINATION"], traceId)
      );
    }
    return updated;
  }

  async removeEnterpriseFromPortfolio(
    portfolioId: string,
    tenantId: string,
    enterpriseId: string,
    expectedConcurrencyVersion?: number,
    traceId?: string
  ): Promise<EnterprisePortfolio> {
    const portfolio = await this.getPortfolio(portfolioId, tenantId);
    const updated = portfolio.removeEnterprise(enterpriseId, expectedConcurrencyVersion);
    await this.portfolioRepo.save(updated);

    if (this.eventPublisher) {
      await this.eventPublisher.publish(
        createPortfolioEnterpriseRemovedEvent(portfolio.id, portfolio.tenantId, enterpriseId, traceId)
      );
    }
    return updated;
  }

  // --- Governance Mandate Management & Evaluation ---

  async grantMandate(props: CreateGovernanceMandateProps, traceId?: string): Promise<EnterpriseGovernanceMandate> {
    const portfolio = await this.getPortfolio(props.portfolioId, props.tenantId);
    if (!portfolio.hasEnterprise(props.sourceEnterpriseId)) {
      throw new PortfolioValidationError(`Source enterprise '${props.sourceEnterpriseId}' is not an active member of portfolio '${props.portfolioId}'`);
    }

    for (const targetId of props.targetEnterpriseIds) {
      if (targetId !== "*" && !portfolio.hasEnterprise(targetId)) {
        throw new PortfolioValidationError(`Target enterprise '${targetId}' is not an active member of portfolio '${props.portfolioId}'`);
      }
    }

    const mandate = EnterpriseGovernanceMandate.create(props);
    await this.mandateRepo.save(mandate);

    if (this.eventPublisher) {
      await this.eventPublisher.publish(
        createGovernanceMandateGrantedEvent(
          mandate.id,
          mandate.tenantId,
          mandate.portfolioId,
          mandate.sourceEnterpriseId,
          mandate.targetEnterpriseIds,
          mandate.granteePrincipalId,
          mandate.authorityScope,
          traceId
        )
      );
    }
    return mandate;
  }

  async revokeMandate(
    mandateId: string,
    tenantId: string,
    reason: string,
    expectedConcurrencyVersion?: number,
    traceId?: string
  ): Promise<EnterpriseGovernanceMandate> {
    const mandate = await this.mandateRepo.findById(mandateId, tenantId);
    if (!mandate) {
      throw new MandateNotFoundError(mandateId, tenantId);
    }
    const updated = mandate.revoke(reason, expectedConcurrencyVersion);
    await this.mandateRepo.save(updated);

    if (this.eventPublisher) {
      await this.eventPublisher.publish(
        createGovernanceMandateRevokedEvent(updated.id, updated.tenantId, updated.portfolioId, reason, traceId)
      );
    }
    return updated;
  }

  async listMandates(portfolioId: string, tenantId: string): Promise<readonly EnterpriseGovernanceMandate[]> {
    return this.mandateRepo.findByPortfolioId(portfolioId, tenantId);
  }

  async validateCrossEnterpriseAuthority(params: {
    readonly tenantId: string;
    readonly portfolioId: string;
    readonly granteePrincipalId: string;
    readonly sourceEnterpriseId: string;
    readonly targetEnterpriseId: string;
    readonly operation: string;
    readonly objectiveId?: string | undefined;
    readonly requestedAutonomy?: AutonomyLevel | undefined;
  }): Promise<{ readonly authorized: boolean; readonly mandateId?: string; readonly reason?: string; readonly requiresApproval: boolean }> {
    // If operating on the same enterprise, mandate is not required (enterprise-local authority applies)
    if (params.sourceEnterpriseId === params.targetEnterpriseId) {
      return { authorized: true, requiresApproval: false };
    }

    const activeMandates = await this.mandateRepo.findActiveMandates(
      params.granteePrincipalId,
      params.portfolioId,
      params.tenantId,
      params.targetEnterpriseId
    );

    if (activeMandates.length === 0) {
      return {
        authorized: false,
        reason: `No active governance mandate found granting principal '${params.granteePrincipalId}' authority over target enterprise '${params.targetEnterpriseId}' in portfolio '${params.portfolioId}'`,
        requiresApproval: true,
      };
    }

    for (const mandate of activeMandates) {
      const evalResult = mandate.evaluateAuthority({
        targetEnterpriseId: params.targetEnterpriseId,
        operation: params.operation,
        objectiveId: params.objectiveId,
        requestedAutonomy: params.requestedAutonomy,
      });

      if (evalResult.allowed) {
        return {
          authorized: true,
          mandateId: mandate.id,
          requiresApproval: evalResult.requiresApproval,
        };
      }
    }

    return {
      authorized: false,
      reason: `Active mandates exist but none permit operation '${params.operation}' on enterprise '${params.targetEnterpriseId}'`,
      requiresApproval: true,
    };
  }

  // --- Portfolio Objective Management & Metric Aggregation ---

  async createPortfolioObjective(props: CreatePortfolioObjectiveProps, traceId?: string): Promise<PortfolioObjective> {
    const portfolio = await this.getPortfolio(props.portfolioId, props.tenantId);
    for (const entId of props.participatingEnterpriseIds) {
      if (!portfolio.hasEnterprise(entId)) {
        throw new PortfolioValidationError(`Participating enterprise '${entId}' is not an active member of portfolio '${props.portfolioId}'`);
      }
    }

    const objective = PortfolioObjective.create(props);
    await this.objectiveRepo.save(objective);

    if (this.eventPublisher) {
      await this.eventPublisher.publish(
        createPortfolioObjectiveCreatedEvent(
          objective.id,
          objective.tenantId,
          objective.portfolioId,
          objective.title,
          objective.type,
          objective.ownerPrincipalId,
          objective.participatingEnterpriseIds,
          traceId
        )
      );
    }
    return objective;
  }

  async activatePortfolioObjective(
    objectiveId: string,
    tenantId: string,
    expectedConcurrencyVersion?: number
  ): Promise<PortfolioObjective> {
    const objective = await this.objectiveRepo.findById(objectiveId, tenantId);
    if (!objective) {
      throw new PortfolioObjectiveNotFoundError(objectiveId, tenantId);
    }
    const updated = objective.activate(expectedConcurrencyVersion);
    await this.objectiveRepo.save(updated);
    return updated;
  }

  async linkEnterpriseObjective(
    portfolioObjectiveId: string,
    tenantId: string,
    enterpriseObjectiveId: string,
    expectedConcurrencyVersion?: number
  ): Promise<PortfolioObjective> {
    const objective = await this.objectiveRepo.findById(portfolioObjectiveId, tenantId);
    if (!objective) {
      throw new PortfolioObjectiveNotFoundError(portfolioObjectiveId, tenantId);
    }
    const updated = objective.linkEnterpriseObjective(enterpriseObjectiveId, expectedConcurrencyVersion);
    await this.objectiveRepo.save(updated);
    return updated;
  }

  async listPortfolioObjectives(portfolioId: string, tenantId: string): Promise<readonly PortfolioObjective[]> {
    return this.objectiveRepo.findByPortfolioId(portfolioId, tenantId);
  }

  async aggregatePortfolioMetrics(
    objectiveId: string,
    tenantId: string,
    explicitContributions?: readonly EnterpriseMetricContribution[],
    expectedConcurrencyVersion?: number,
    traceId?: string
  ): Promise<PortfolioObjective> {
    const objective = await this.objectiveRepo.findById(objectiveId, tenantId);
    if (!objective) {
      throw new PortfolioObjectiveNotFoundError(objectiveId, tenantId);
    }

    let contributions: EnterpriseMetricContribution[] = [];

    if (explicitContributions && explicitContributions.length > 0) {
      contributions = [...explicitContributions];
    } else if (this.enterpriseMetricRepo && objective.linkedEnterpriseObjectiveIds.length > 0) {
      for (const entId of objective.participatingEnterpriseIds) {
        const entMetrics = await this.enterpriseMetricRepo.listByEnterprise(entId, tenantId);
        const matched = entMetrics.find((m: BusinessMetric) => Boolean(objective.targetMetric && m.name.toLowerCase() === objective.targetMetric.name.toLowerCase()));
        if (matched && matched.currentValue !== undefined) {
          contributions.push({
            enterpriseId: entId,
            metricId: matched.id,
            value: matched.currentValue,
            status: "MEASURED",
            recordedAt: matched.lastUpdated,
          });
        } else {
          contributions.push({
            enterpriseId: entId,
            status: "MISSING",
          });
        }
      }
    } else {
      // Missing data for all participating enterprises
      for (const entId of objective.participatingEnterpriseIds) {
        contributions.push({ enterpriseId: entId, status: "MISSING" });
      }
    }

    const updated = objective.aggregateMetrics(contributions, expectedConcurrencyVersion);
    await this.objectiveRepo.save(updated);

    if (this.eventPublisher) {
      const measuredCount = contributions.filter((c) => c.status === "MEASURED").length;
      await this.eventPublisher.publish(
        createPortfolioObjectiveAggregatedEvent(
          updated.id,
          updated.tenantId,
          updated.portfolioId,
          updated.currentAggregatedValue,
          updated.gap,
          objective.participatingEnterpriseIds.length,
          objective.participatingEnterpriseIds.length - measuredCount,
          traceId
        )
      );
    }
    return updated;
  }

  // --- Portfolio Operating Context ---

  async getPortfolioOperatingContext(portfolioId: string, tenantId: string): Promise<PortfolioOperatingContext> {
    const portfolio = await this.getPortfolio(portfolioId, tenantId);
    const activeMandates = await this.mandateRepo.findByPortfolioId(portfolioId, tenantId);
    const objectives = await this.objectiveRepo.findByPortfolioId(portfolioId, tenantId);

    const enterprises: { id: string; name?: string; status: string }[] = [];
    for (const m of portfolio.memberships) {
      let entName: string | undefined = undefined;
      if (this.enterpriseRepo) {
        const ent = await this.enterpriseRepo.findById(m.enterpriseId, tenantId);
        if (ent) entName = ent.name;
      }
      enterprises.push({
        id: m.enterpriseId,
        ...(entName !== undefined ? { name: entName } : {}),
        status: m.status,
      });
    }

    return {
      portfolio,
      enterprises: Object.freeze(enterprises),
      activeMandates: Object.freeze(activeMandates.filter((man) => man.isEffectiveAt())),
      objectives: Object.freeze(objectives),
      generatedAt: new Date(),
    };
  }

  // --- Mandate Reconciliation ---

  async reconcileMandate(
    request: MandateReconciliationRequest,
    traceId?: string
  ): Promise<MandateReconciliationReport> {
    if (!this.reconciliationService) {
      throw new PortfolioValidationError("Reconciliation service is not configured on PortfolioGovernanceService");
    }
    return this.reconciliationService.reconcileMandate(request, traceId);
  }

  async reconcileExpiredMandates(
    tenantId: string,
    traceId?: string
  ): Promise<readonly MandateReconciliationReport[]> {
    if (!this.reconciliationService) {
      throw new PortfolioValidationError("Reconciliation service is not configured on PortfolioGovernanceService");
    }
    return this.reconciliationService.reconcileExpiredMandates(tenantId, traceId);
  }
}
