/**
 * AI Operating Platform - EnterpriseOperatingService
 * 
 * Central orchestration service for the AI Enterprise Operating System.
 * Enforces business lifecycle transitions, authority checks, decision recording,
 * KPI ground-truth verification, and business operating context aggregation.
 */

import {
  Enterprise,
  CreateEnterpriseProps,
  UpdateEnterpriseProps,
} from "../../domain/business/enterprise.js";
import {
  BusinessObjective,
  CreateBusinessObjectiveProps,
  UpdateBusinessObjectiveProps,
} from "../../domain/business/business-objective.js";
import {
  BusinessInitiative,
  CreateBusinessInitiativeProps,
  UpdateBusinessInitiativeProps,
} from "../../domain/business/business-initiative.js";
import {
  BusinessMetric,
  CreateBusinessMetricProps,
  RecordMeasurementProps,
} from "../../domain/business/business-metric.js";
import {
  ExecutiveDecisionRecord,
  CreateExecutiveDecisionRecordProps,
} from "../../domain/business/executive-decision-record.js";
import {
  EnterpriseNotFoundError,
  BusinessObjectiveNotFoundError,
  BusinessInitiativeNotFoundError,
  BusinessMetricNotFoundError,
  ExecutiveDecisionNotFoundError,
  UnauthorizedExecutiveDecisionError,
  BusinessValidationError,
} from "../../domain/business/business-errors.js";
import {
  EnterpriseRepositoryPort,
  BusinessObjectiveRepositoryPort,
  BusinessInitiativeRepositoryPort,
  BusinessMetricRepositoryPort,
  ExecutiveDecisionRepositoryPort,
} from "../ports/business-repository-port.js";
import { EventPublisher } from "../../domain/events/events.js";
import {
  createEnterpriseCreatedEvent,
  createBusinessObjectiveCreatedEvent,
  createBusinessObjectiveStateChangedEvent,
  createBusinessInitiativeCreatedEvent,
  createBusinessInitiativeStateChangedEvent,
  createBusinessMetricUpdatedEvent,
  createExecutiveDecisionRecordedEvent,
} from "../../domain/business/business-events.js";

export interface EnterpriseOperatingServiceOptions {
  readonly enterpriseRepo: EnterpriseRepositoryPort;
  readonly objectiveRepo: BusinessObjectiveRepositoryPort;
  readonly initiativeRepo: BusinessInitiativeRepositoryPort;
  readonly metricRepo: BusinessMetricRepositoryPort;
  readonly decisionRepo: ExecutiveDecisionRepositoryPort;
  readonly eventPublisher?: EventPublisher | undefined;
}

export interface BusinessOperatingContext {
  readonly enterprise: Enterprise;
  readonly objectives: readonly BusinessObjective[];
  readonly initiatives: readonly BusinessInitiative[];
  readonly metrics: readonly BusinessMetric[];
  readonly recentDecisions: readonly ExecutiveDecisionRecord[];
  readonly generatedAt: Date;
}

export class EnterpriseOperatingService {
  private readonly enterpriseRepo: EnterpriseRepositoryPort;
  private readonly objectiveRepo: BusinessObjectiveRepositoryPort;
  private readonly initiativeRepo: BusinessInitiativeRepositoryPort;
  private readonly metricRepo: BusinessMetricRepositoryPort;
  private readonly decisionRepo: ExecutiveDecisionRepositoryPort;
  private readonly eventPublisher?: EventPublisher | undefined;

  constructor(options: EnterpriseOperatingServiceOptions) {
    this.enterpriseRepo = options.enterpriseRepo;
    this.objectiveRepo = options.objectiveRepo;
    this.initiativeRepo = options.initiativeRepo;
    this.metricRepo = options.metricRepo;
    this.decisionRepo = options.decisionRepo;
    this.eventPublisher = options.eventPublisher;
  }

  // ---------------------------------------------------------------------------
  // Enterprise Aggregate Methods
  // ---------------------------------------------------------------------------

  async createEnterprise(props: CreateEnterpriseProps, traceId?: string): Promise<Enterprise> {
    const enterprise = Enterprise.create(props);
    await this.enterpriseRepo.save(enterprise);

    this.eventPublisher?.publish(
      createEnterpriseCreatedEvent(enterprise.id, enterprise.tenantId, enterprise.name, traceId)
    );

    return enterprise;
  }

  async getEnterprise(id: string, tenantId: string): Promise<Enterprise> {
    const enterprise = await this.enterpriseRepo.findById(id, tenantId);
    if (!enterprise) {
      throw new EnterpriseNotFoundError(id, tenantId);
    }
    enterprise.assertTenant(tenantId);
    return enterprise;
  }

  async listEnterprises(tenantId: string): Promise<readonly Enterprise[]> {
    return this.enterpriseRepo.listByTenant(tenantId);
  }

  async updateEnterprise(
    id: string,
    tenantId: string,
    props: UpdateEnterpriseProps
  ): Promise<Enterprise> {
    const existing = await this.getEnterprise(id, tenantId);
    const updated = existing.update(props);
    await this.enterpriseRepo.save(updated);
    return updated;
  }

  async archiveEnterprise(id: string, tenantId: string): Promise<Enterprise> {
    const existing = await this.getEnterprise(id, tenantId);
    const archived = existing.archive();
    await this.enterpriseRepo.save(archived);
    return archived;
  }

  // ---------------------------------------------------------------------------
  // BusinessObjective Aggregate Methods
  // ---------------------------------------------------------------------------

  async createObjective(
    props: CreateBusinessObjectiveProps,
    traceId?: string
  ): Promise<BusinessObjective> {
    // Verify enterprise exists
    await this.getEnterprise(props.enterpriseId, props.tenantId);

    const objective = BusinessObjective.create(props);
    await this.objectiveRepo.save(objective);

    this.eventPublisher?.publish(
      createBusinessObjectiveCreatedEvent(
        objective.id,
        objective.tenantId,
        objective.enterpriseId,
        objective.title,
        objective.type,
        objective.ownerPrincipalId,
        traceId
      )
    );

    return objective;
  }

  async getObjective(id: string, tenantId: string): Promise<BusinessObjective> {
    const objective = await this.objectiveRepo.findById(id, tenantId);
    if (!objective) {
      throw new BusinessObjectiveNotFoundError(id, tenantId);
    }
    objective.assertTenant(tenantId);
    return objective;
  }

  async listObjectives(tenantId: string, enterpriseId?: string): Promise<readonly BusinessObjective[]> {
    if (enterpriseId) {
      return this.objectiveRepo.listByEnterprise(enterpriseId, tenantId);
    }
    return this.objectiveRepo.listByTenant(tenantId);
  }

  async updateObjective(
    id: string,
    tenantId: string,
    props: UpdateBusinessObjectiveProps
  ): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const updated = existing.update(props);
    await this.objectiveRepo.save(updated);
    return updated;
  }

  async activateObjective(id: string, tenantId: string, traceId?: string): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const fromState = existing.lifecycleState;
    const activated = existing.activate();
    await this.objectiveRepo.save(activated);

    this.eventPublisher?.publish(
      createBusinessObjectiveStateChangedEvent(id, tenantId, fromState, "ACTIVE", traceId)
    );

    return activated;
  }

  async markObjectiveAtRisk(
    id: string,
    tenantId: string,
    reason?: string,
    traceId?: string
  ): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const fromState = existing.lifecycleState;
    const atRisk = existing.markAtRisk(reason);
    await this.objectiveRepo.save(atRisk);

    this.eventPublisher?.publish(
      createBusinessObjectiveStateChangedEvent(id, tenantId, fromState, "AT_RISK", traceId)
    );

    return atRisk;
  }

  async markObjectiveAchieved(id: string, tenantId: string, traceId?: string): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const fromState = existing.lifecycleState;
    const achieved = existing.markAchieved();
    await this.objectiveRepo.save(achieved);

    this.eventPublisher?.publish(
      createBusinessObjectiveStateChangedEvent(id, tenantId, fromState, "ACHIEVED", traceId)
    );

    return achieved;
  }

  async markObjectiveMissed(id: string, tenantId: string, traceId?: string): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const fromState = existing.lifecycleState;
    const missed = existing.markMissed();
    await this.objectiveRepo.save(missed);

    this.eventPublisher?.publish(
      createBusinessObjectiveStateChangedEvent(id, tenantId, fromState, "MISSED", traceId)
    );

    return missed;
  }

  async cancelObjective(id: string, tenantId: string, traceId?: string): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const fromState = existing.lifecycleState;
    const cancelled = existing.cancel();
    await this.objectiveRepo.save(cancelled);

    this.eventPublisher?.publish(
      createBusinessObjectiveStateChangedEvent(id, tenantId, fromState, "CANCELLED", traceId)
    );

    return cancelled;
  }

  async archiveObjective(id: string, tenantId: string): Promise<BusinessObjective> {
    const existing = await this.getObjective(id, tenantId);
    const archived = existing.archive();
    await this.objectiveRepo.save(archived);
    return archived;
  }

  // ---------------------------------------------------------------------------
  // BusinessInitiative Aggregate Methods
  // ---------------------------------------------------------------------------

  async createInitiative(
    props: CreateBusinessInitiativeProps,
    traceId?: string
  ): Promise<BusinessInitiative> {
    // Verify enterprise and objective exist
    await this.getEnterprise(props.enterpriseId, props.tenantId);
    const objective = await this.getObjective(props.objectiveId, props.tenantId);

    const initiative = BusinessInitiative.create(props);
    await this.initiativeRepo.save(initiative);

    // Link initiative to objective
    const linkedObj = objective.linkInitiative(initiative.id);
    await this.objectiveRepo.save(linkedObj);

    this.eventPublisher?.publish(
      createBusinessInitiativeCreatedEvent(
        initiative.id,
        initiative.tenantId,
        initiative.enterpriseId,
        initiative.objectiveId,
        initiative.title,
        initiative.ownerPrincipalId,
        traceId
      )
    );

    return initiative;
  }

  async getInitiative(id: string, tenantId: string): Promise<BusinessInitiative> {
    const initiative = await this.initiativeRepo.findById(id, tenantId);
    if (!initiative) {
      throw new BusinessInitiativeNotFoundError(id, tenantId);
    }
    initiative.assertTenant(tenantId);
    return initiative;
  }

  async listInitiatives(
    tenantId: string,
    enterpriseId?: string,
    objectiveId?: string
  ): Promise<readonly BusinessInitiative[]> {
    if (objectiveId) {
      return this.initiativeRepo.listByObjective(objectiveId, tenantId);
    }
    if (enterpriseId) {
      return this.initiativeRepo.listByEnterprise(enterpriseId, tenantId);
    }
    return this.initiativeRepo.listByTenant(tenantId);
  }

  async updateInitiative(
    id: string,
    tenantId: string,
    props: UpdateBusinessInitiativeProps
  ): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(id, tenantId);
    const updated = existing.update(props);
    await this.initiativeRepo.save(updated);
    return updated;
  }

  async activateInitiative(id: string, tenantId: string, traceId?: string): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(id, tenantId);
    const fromState = existing.lifecycleState;
    const activated = existing.activate();
    await this.initiativeRepo.save(activated);

    this.eventPublisher?.publish(
      createBusinessInitiativeStateChangedEvent(id, tenantId, fromState, "ACTIVE", traceId)
    );

    return activated;
  }

  async blockInitiative(
    id: string,
    tenantId: string,
    reason?: string,
    traceId?: string
  ): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(id, tenantId);
    const fromState = existing.lifecycleState;
    const blocked = existing.block(reason);
    await this.initiativeRepo.save(blocked);

    this.eventPublisher?.publish(
      createBusinessInitiativeStateChangedEvent(id, tenantId, fromState, "BLOCKED", traceId)
    );

    return blocked;
  }

  async completeInitiative(
    id: string,
    tenantId: string,
    actualOutcome?: string,
    traceId?: string
  ): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(id, tenantId);
    const fromState = existing.lifecycleState;
    const completed = existing.complete(actualOutcome);
    await this.initiativeRepo.save(completed);

    this.eventPublisher?.publish(
      createBusinessInitiativeStateChangedEvent(id, tenantId, fromState, "COMPLETED", traceId)
    );

    return completed;
  }

  async cancelInitiative(
    id: string,
    tenantId: string,
    reason?: string,
    traceId?: string
  ): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(id, tenantId);
    const fromState = existing.lifecycleState;
    const cancelled = existing.cancel(reason);
    await this.initiativeRepo.save(cancelled);

    this.eventPublisher?.publish(
      createBusinessInitiativeStateChangedEvent(id, tenantId, fromState, "CANCELLED", traceId)
    );

    return cancelled;
  }

  async linkSolutionToInitiative(
    initiativeId: string,
    solutionId: string,
    tenantId: string
  ): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(initiativeId, tenantId);
    const linked = existing.linkSolution(solutionId);
    await this.initiativeRepo.save(linked);

    // Also link solution to parent objective
    const obj = await this.getObjective(existing.objectiveId, tenantId);
    const updatedObj = obj.linkSolution(solutionId);
    await this.objectiveRepo.save(updatedObj);

    return linked;
  }

  async linkWorkflowToInitiative(
    initiativeId: string,
    workflowId: string,
    tenantId: string
  ): Promise<BusinessInitiative> {
    const existing = await this.getInitiative(initiativeId, tenantId);
    const linked = existing.linkWorkflow(workflowId);
    await this.initiativeRepo.save(linked);

    // Also link workflow to parent objective
    const obj = await this.getObjective(existing.objectiveId, tenantId);
    const updatedObj = obj.linkWorkflow(workflowId);
    await this.objectiveRepo.save(updatedObj);

    return linked;
  }

  // ---------------------------------------------------------------------------
  // BusinessMetric / KPI Methods
  // ---------------------------------------------------------------------------

  async createMetric(props: CreateBusinessMetricProps, traceId?: string): Promise<BusinessMetric> {
    // Verify enterprise & objective exist
    await this.getEnterprise(props.enterpriseId, props.tenantId);
    await this.getObjective(props.objectiveId, props.tenantId);

    const metric = BusinessMetric.create(props);
    await this.metricRepo.save(metric);

    if (metric.currentValue !== undefined) {
      this.eventPublisher?.publish(
        createBusinessMetricUpdatedEvent(
          metric.id,
          metric.tenantId,
          metric.objectiveId,
          metric.name,
          metric.currentValue,
          metric.gap,
          metric.status,
          metric.source,
          traceId
        )
      );
    }

    return metric;
  }

  async getMetric(id: string, tenantId: string): Promise<BusinessMetric> {
    const metric = await this.metricRepo.findById(id, tenantId);
    if (!metric) {
      throw new BusinessMetricNotFoundError(id, tenantId);
    }
    metric.assertTenant(tenantId);
    return metric;
  }

  async listMetrics(
    tenantId: string,
    enterpriseId?: string,
    objectiveId?: string
  ): Promise<readonly BusinessMetric[]> {
    if (objectiveId) {
      return this.metricRepo.listByObjective(objectiveId, tenantId);
    }
    if (enterpriseId) {
      return this.metricRepo.listByEnterprise(enterpriseId, tenantId);
    }
    return this.metricRepo.listByTenant(tenantId);
  }

  async recordMetricMeasurement(
    id: string,
    tenantId: string,
    props: RecordMeasurementProps,
    traceId?: string
  ): Promise<BusinessMetric> {
    const existing = await this.getMetric(id, tenantId);
    const updated = existing.recordMeasurement(props);
    await this.metricRepo.save(updated);

    this.eventPublisher?.publish(
      createBusinessMetricUpdatedEvent(
        updated.id,
        updated.tenantId,
        updated.objectiveId,
        updated.name,
        updated.currentValue ?? 0,
        updated.gap,
        updated.status,
        updated.source,
        traceId
      )
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // ExecutiveDecisionRecord Methods
  // ---------------------------------------------------------------------------

  async recordDecision(
    props: CreateExecutiveDecisionRecordProps,
    traceId?: string
  ): Promise<ExecutiveDecisionRecord> {
    // Verify enterprise exists
    await this.getEnterprise(props.enterpriseId, props.tenantId);

    const decision = ExecutiveDecisionRecord.create(props);
    await this.decisionRepo.save(decision);

    this.eventPublisher?.publish(
      createExecutiveDecisionRecordedEvent(
        decision.id,
        decision.tenantId,
        decision.enterpriseId,
        decision.decisionMakerPrincipalId,
        decision.authorityScope,
        decision.decisionType,
        decision.targetType,
        decision.targetId,
        decision.rationale,
        traceId
      )
    );

    return decision;
  }

  async getDecision(id: string, tenantId: string): Promise<ExecutiveDecisionRecord> {
    const decision = await this.decisionRepo.findById(id, tenantId);
    if (!decision) {
      throw new ExecutiveDecisionNotFoundError(id, tenantId);
    }
    decision.assertTenant(tenantId);
    return decision;
  }

  async listDecisions(
    tenantId: string,
    enterpriseId?: string,
    targetId?: string
  ): Promise<readonly ExecutiveDecisionRecord[]> {
    if (targetId) {
      return this.decisionRepo.listByTarget(targetId, tenantId);
    }
    if (enterpriseId) {
      return this.decisionRepo.listByEnterprise(enterpriseId, tenantId);
    }
    return this.decisionRepo.listByTenant(tenantId);
  }

  // ---------------------------------------------------------------------------
  // BusinessOperatingContext Aggregation
  // ---------------------------------------------------------------------------

  async getBusinessOperatingContext(
    enterpriseId: string,
    tenantId: string
  ): Promise<BusinessOperatingContext> {
    const enterprise = await this.getEnterprise(enterpriseId, tenantId);
    const objectives = await this.objectiveRepo.listByEnterprise(enterpriseId, tenantId);
    const initiatives = await this.initiativeRepo.listByEnterprise(enterpriseId, tenantId);
    const metrics = await this.metricRepo.listByEnterprise(enterpriseId, tenantId);
    const recentDecisions = await this.decisionRepo.listByEnterprise(enterpriseId, tenantId);

    return {
      enterprise,
      objectives,
      initiatives,
      metrics,
      recentDecisions,
      generatedAt: new Date(),
    };
  }
}
