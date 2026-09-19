/**
 * AI Operating Platform - ExecutiveOrchestratorService
 * 
 * Orchestrates the closed business loop:
 * OBSERVE -> ANALYZE -> PLAN -> GOVERN -> DECIDE -> EXECUTE -> VERIFY -> MEASURE -> ADAPT
 * 
 * Invariants:
 * - NO sovereign or unconstrained AI CEO.
 * - Bounded by Identity, Authority, PolicyGateway, TeamResourceBudget, Verification, and Human Oversight.
 * - All actions produce immutable snapshots, audit trails, and deterministic OCC updates.
 */

import {
  ExecutiveCycle,
  ExecutiveCycleStatus,
  CreateExecutiveCycleProps,
} from "../../domain/executive/executive-cycle.js";
import {
  ExecutiveSignal,
  ExecutiveSignalProps,
} from "../../domain/executive/executive-signal.js";
import {
  ExecutiveContextSnapshot,
  ObjectiveSnapshot,
  InitiativeSnapshot,
  MetricSnapshot,
  SolutionSnapshot,
  WorkflowDefinitionSnapshot,
} from "../../domain/executive/executive-context-snapshot.js";
import {
  ExecutiveAnalysis,
  RecommendedActionCategory,
} from "../../domain/executive/executive-analysis.js";
import {
  ExecutivePlan,
  ExecutivePlanAction,
} from "../../domain/executive/executive-plan.js";
import { ExecutivePlanValidator } from "../../domain/executive/executive-plan-validator.js";
import { ExecutiveGovernanceGate } from "../../domain/executive/executive-governance-gate.js";
import {
  ExecutiveResourceNotFoundError,
  ExecutiveCycleValidationError,
  ExecutiveGovernanceViolationError,
  ExecutivePlanValidationError,
} from "../../domain/executive/executive-errors.js";
import {
  ExecutiveCycleRepositoryPort,
  ExecutiveContextSnapshotRepositoryPort,
  ExecutiveAnalysisRepositoryPort,
  ExecutivePlanRepositoryPort,
} from "../ports/executive-repository-port.js";
import { EnterpriseOperatingService } from "../business/enterprise-operating-service.js";
import { WorkflowOrchestratorService } from "../workflow/workflow-orchestrator-service.js";
import { WorkflowVerificationService } from "../workflow/workflow-verification-service.js";
import { HumanOversightService } from "../workflow/human-oversight-service.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { EventPublisher } from "../../domain/events/events.js";
import { AutonomyLevel } from "../../domain/business/autonomy-level.js";
import {
  createExecutiveCycleStartedEvent,
  createExecutiveSignalDetectedEvent,
  createExecutiveAnalysisCreatedEvent,
  createExecutivePlanCreatedEvent,
  createExecutivePlanValidatedEvent,
  createExecutivePlanRejectedEvent,
  createExecutiveActionStartedEvent,
  createExecutiveActionCompletedEvent,
  createExecutiveReassessmentRequestedEvent,
  createExecutiveCycleCompletedEvent,
  createExecutiveCycleFailedEvent,
  createExecutiveCycleBlockedEvent,
} from "../../domain/executive/executive-events.js";

export interface ExecutiveOrchestratorServiceOptions {
  readonly cycleRepo: ExecutiveCycleRepositoryPort;
  readonly snapshotRepo: ExecutiveContextSnapshotRepositoryPort;
  readonly analysisRepo: ExecutiveAnalysisRepositoryPort;
  readonly planRepo: ExecutivePlanRepositoryPort;
  readonly enterpriseOperatingService: EnterpriseOperatingService;
  readonly workflowOrchestratorService?: WorkflowOrchestratorService | undefined;
  readonly workflowVerificationService?: WorkflowVerificationService | undefined;
  readonly humanOversightService?: HumanOversightService | undefined;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly eventPublisher?: EventPublisher | undefined;
}

export interface StartExecutiveCycleRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly autonomyLevel?: AutonomyLevel | undefined;
  readonly maxReplanningAttempts?: number | undefined;
}

export interface IngestMeasurementRequest {
  readonly cycleId: string;
  readonly metricId: string;
  readonly value: number;
  readonly source: string;
}

export class ExecutiveOrchestratorService {
  private readonly cycleRepo: ExecutiveCycleRepositoryPort;
  private readonly snapshotRepo: ExecutiveContextSnapshotRepositoryPort;
  private readonly analysisRepo: ExecutiveAnalysisRepositoryPort;
  private readonly planRepo: ExecutivePlanRepositoryPort;
  private readonly enterpriseOperatingService: EnterpriseOperatingService;
  private readonly workflowOrchestratorService?: WorkflowOrchestratorService | undefined;
  private readonly workflowVerificationService?: WorkflowVerificationService | undefined;
  private readonly humanOversightService?: HumanOversightService | undefined;
  private readonly policyGateway?: PolicyGateway | undefined;
  private readonly eventPublisher?: EventPublisher | undefined;

  constructor(options: ExecutiveOrchestratorServiceOptions) {
    this.cycleRepo = options.cycleRepo;
    this.snapshotRepo = options.snapshotRepo;
    this.analysisRepo = options.analysisRepo;
    this.planRepo = options.planRepo;
    this.enterpriseOperatingService = options.enterpriseOperatingService;
    this.workflowOrchestratorService = options.workflowOrchestratorService;
    this.workflowVerificationService = options.workflowVerificationService;
    this.humanOversightService = options.humanOversightService;
    this.policyGateway = options.policyGateway;
    this.eventPublisher = options.eventPublisher;
  }

  // ---------------------------------------------------------------------------
  // 1. OBSERVE & START CYCLE
  // ---------------------------------------------------------------------------

  async startCycle(
    req: StartExecutiveCycleRequest,
    traceId = "trace-executive-cycle"
  ): Promise<{
    cycle: ExecutiveCycle;
    snapshot: ExecutiveContextSnapshot;
    analysis: ExecutiveAnalysis;
    plan: ExecutivePlan;
  }> {
    const existing = await this.cycleRepo.findById(req.id, req.tenantId);
    if (existing) {
      throw new ExecutiveCycleValidationError(
        `ExecutiveCycle with id '${req.id}' already exists in tenant '${req.tenantId}'`
      );
    }

    let cycle = ExecutiveCycle.create({
      id: req.id,
      tenantId: req.tenantId,
      enterpriseId: req.enterpriseId,
      maxReplanningAttempts: req.maxReplanningAttempts,
    });
    await this.cycleRepo.save(cycle);
    this.publish(createExecutiveCycleStartedEvent(cycle.id, cycle.tenantId, cycle.enterpriseId, traceId));

    // A. Gather Operating Context & Capture Snapshot
    const bizContext = await this.enterpriseOperatingService.getBusinessOperatingContext(
      req.enterpriseId,
      req.tenantId
    );

    const snapshotId = `snap_${cycle.id}`;
    const snapshot = new ExecutiveContextSnapshot({
      id: snapshotId,
      cycleId: cycle.id,
      tenantId: req.tenantId,
      enterpriseId: req.enterpriseId,
      enterpriseName: bizContext.enterprise.name,
      enterpriseStatus: bizContext.enterprise.status,
      capturedAt: new Date(),
      objectives: bizContext.objectives.map((o) => ({
        id: o.id,
        title: o.title,
        type: o.type,
        status: o.lifecycleState,
        concurrencyVersion: o.concurrencyVersion,
      })),
      initiatives: bizContext.initiatives.map((i) => ({
        id: i.id,
        objectiveId: i.objectiveId,
        title: i.title,
        lifecycleState: i.lifecycleState,
        linkedSolutionIds: i.linkedSolutionIds,
        linkedWorkflowIds: i.linkedWorkflowIds,
        concurrencyVersion: i.concurrencyVersion,
      })),
      metrics: bizContext.metrics.map((m) => ({
        id: m.id,
        objectiveId: m.objectiveId,
        name: m.name,
        targetValue: m.targetValue,
        currentValue: m.currentValue,
        gap: m.gap,
        status: m.status,
        source: m.source,
        lastUpdated: m.lastUpdated,
        concurrencyVersion: m.concurrencyVersion,
      })),
      solutions: [],
      workflows: [],
    });
    await this.snapshotRepo.save(snapshot);

    cycle = cycle.startObserving(snapshot.id);
    await this.cycleRepo.save(cycle);

    // B. Detect Signals
    const signals: ExecutiveSignal[] = [];
    for (const metric of snapshot.metrics) {
      if (metric.status === "OFF_TRACK" || metric.status === "AT_RISK") {
        const sig = new ExecutiveSignal({
          id: `sig_metric_${metric.id}_${Date.now()}`,
          type: metric.status === "OFF_TRACK" ? "KPI_OFF_TRACK" : "KPI_AT_RISK",
          severity: metric.status === "OFF_TRACK" ? "HIGH" : "MEDIUM",
          source: metric.source,
          targetType: "METRIC",
          targetId: metric.id,
          description: `Metric '${metric.name}' is ${metric.status} (current: ${metric.currentValue ?? "none"}, target: ${metric.targetValue}, gap: ${metric.gap ?? "unknown"})`,
          evidenceReference: `metric://${metric.id}#source=${metric.source}`,
          detectedAt: new Date(),
        });
        signals.push(sig);
        this.publish(createExecutiveSignalDetectedEvent(cycle.id, sig.id, sig.type, sig.targetId, traceId));
      }
    }

    for (const obj of snapshot.objectives) {
      if (obj.status === "AT_RISK" || obj.status === "MISSED") {
        const sig = new ExecutiveSignal({
          id: `sig_obj_${obj.id}_${Date.now()}`,
          type: obj.status === "AT_RISK" ? "OBJECTIVE_AT_RISK" : "OBJECTIVE_MISSED",
          severity: obj.status === "MISSED" ? "CRITICAL" : "HIGH",
          source: "BusinessObjectiveAggregate",
          targetType: "OBJECTIVE",
          targetId: obj.id,
          description: `Business Objective '${obj.title}' is ${obj.status}`,
          evidenceReference: `objective://${obj.id}#status=${obj.status}`,
          detectedAt: new Date(),
        });
        signals.push(sig);
        this.publish(createExecutiveSignalDetectedEvent(cycle.id, sig.id, sig.type, sig.targetId, traceId));
      }
    }

    // C. Generate Analysis
    const analysisId = `analysis_${cycle.id}`;
    let recommendedAction: RecommendedActionCategory = "NO_ACTION";
    let targetObjectiveId = snapshot.objectives[0]?.id ?? "obj-default";

    if (signals.length > 0) {
      recommendedAction = "START_WORKFLOW";
      const targetSignal = signals[0]!;
      if (targetSignal.targetType === "OBJECTIVE") {
        targetObjectiveId = targetSignal.targetId;
      } else if (targetSignal.targetType === "METRIC") {
        const m = snapshot.metrics.find((x) => x.id === targetSignal.targetId);
        if (m) targetObjectiveId = m.objectiveId;
      }
    }

    const analysis = new ExecutiveAnalysis({
      id: analysisId,
      cycleId: cycle.id,
      tenantId: req.tenantId,
      enterpriseId: req.enterpriseId,
      observedSignals: signals,
      affectedObjectiveIds: [targetObjectiveId],
      affectedInitiativeIds: snapshot.initiatives.filter((i) => i.objectiveId === targetObjectiveId).map((i) => i.id),
      impactedSolutionIds: [],
      impactedWorkflowIds: [],
      evidenceReferences: signals.map((s) => s.evidenceReference),
      recommendedActionCategory: recommendedAction,
      summary: `Analyzed ${signals.length} operational signals. Recommended strategy: ${recommendedAction}.`,
      createdAt: new Date(),
    });
    await this.analysisRepo.save(analysis);

    cycle = cycle.startAnalyzing(analysis.id);
    await this.cycleRepo.save(cycle);
    this.publish(createExecutiveAnalysisCreatedEvent(cycle.id, analysis.id, analysis.recommendedActionCategory, traceId));

    // D. Construct Declarative Plan
    const planId = `plan_${cycle.id}`;
    const matchingInitiative = snapshot.initiatives.find((i) => i.objectiveId === targetObjectiveId);
    const candidateWorkflowId = matchingInitiative?.linkedWorkflowIds[0] ?? snapshot.workflows[0]?.id;
    const canStartWorkflow = recommendedAction === "START_WORKFLOW" && !!candidateWorkflowId && snapshot.workflows.some(w => w.id === candidateWorkflowId && w.status === "ACTIVE");

    const defaultAction: ExecutivePlanAction = {
      actionId: `act_${cycle.id}_01`,
      order: 1,
      actionType: canStartWorkflow ? "START_WORKFLOW" : (recommendedAction === "START_WORKFLOW" ? "REQUEST_APPROVAL" : "NO_ACTION"),
      targetId: matchingInitiative?.id ?? targetObjectiveId,
      workflowDefinitionId: canStartWorkflow ? candidateWorkflowId : undefined,
      solutionId: matchingInitiative?.linkedSolutionIds[0] ?? undefined,
      requiredCapabilities: ["order.process", "verification.verify"],
      expectedOutcome: "Restore metrics and progress objective toward ACHIEVED status.",
      requiresApproval: !canStartWorkflow && recommendedAction === "START_WORKFLOW",
      requiresVerification: true,
      policyReferences: ["policy-operational-safety-v1"],
    };

    let plan = ExecutivePlan.create({
      id: planId,
      cycleId: cycle.id,
      tenantId: req.tenantId,
      enterpriseId: req.enterpriseId,
      objectiveId: targetObjectiveId,
      initiativeId: matchingInitiative?.id,
      rationale: analysis.summary,
      actions: [defaultAction],
    });

    cycle = cycle.startPlanning(plan.id);
    await this.cycleRepo.save(cycle);
    this.publish(createExecutivePlanCreatedEvent(cycle.id, plan.id, plan.actions.length, traceId));

    // E. Plan Validation
    const validation = ExecutivePlanValidator.validate(plan, snapshot);
    if (!validation.valid) {
      plan = plan.markRejected("Validation failed against context snapshot", validation.violations);
      await this.planRepo.save(plan);
      cycle = cycle.fail(plan.rejectionReason!);
      await this.cycleRepo.save(cycle);
      this.publish(createExecutivePlanRejectedEvent(cycle.id, plan.id, plan.rejectionReason!, traceId));
      return { cycle, snapshot, analysis, plan };
    }

    plan = plan.markValidated();
    await this.planRepo.save(plan);
    this.publish(createExecutivePlanValidatedEvent(cycle.id, plan.id, traceId));

    // F. Governance Gate Evaluation
    const autonomyLevel = req.autonomyLevel ?? "LEVEL_2_GOVERNED_AUTOMATION";
    const govResult = await ExecutiveGovernanceGate.evaluate(
      plan,
      autonomyLevel,
      this.policyGateway
    );

    if (!govResult.allowed) {
      plan = plan.markRejected(govResult.reasons.join("; "));
      await this.planRepo.save(plan);
      cycle = cycle.block(govResult.reasons.join("; "));
      await this.cycleRepo.save(cycle);
      this.publish(createExecutiveCycleBlockedEvent(cycle.id, govResult.reasons.join("; "), traceId));
      return { cycle, snapshot, analysis, plan };
    }

    if (govResult.requiresHumanApproval) {
      // Create Approval Request via HumanOversightService if available
      let approvalRequestId = `appr_${cycle.id}`;
      if (this.humanOversightService) {
        const reqResult = await this.humanOversightService.requestApproval({
          id: approvalRequestId,
          tenantId: req.tenantId,
          workflowId: plan.objectiveId,
          workflowInstanceId: cycle.id,
          workflowStepId: plan.actions[0]?.actionId ?? "step-1",
          requesterPrincipalId: "executive-orchestrator",
          producerPrincipalId: "executive-orchestrator",
          purpose: `Executive Plan Human Oversight: ${plan.rationale}`,
        }, traceId);
        approvalRequestId = reqResult.id;
      }
      cycle = cycle.awaitApproval(approvalRequestId);
      await this.cycleRepo.save(cycle);
    }

    return { cycle, snapshot, analysis, plan };
  }

  // ---------------------------------------------------------------------------
  // 2. APPROVE PLAN (HUMAN OVERSIGHT)
  // ---------------------------------------------------------------------------

  async approvePlan(
    cycleId: string,
    tenantId: string,
    approverPrincipalId: string,
    traceId = "trace-executive-approve"
  ): Promise<{ cycle: ExecutiveCycle; plan: ExecutivePlan }> {
    let cycle = await this.cycleRepo.findById(cycleId, tenantId);
    if (!cycle) throw new ExecutiveResourceNotFoundError("ExecutiveCycle", cycleId, tenantId);
    if (!cycle.planId) throw new ExecutiveCycleValidationError("Cycle does not have an active plan");

    let plan = await this.planRepo.findById(cycle.planId, tenantId);
    if (!plan) throw new ExecutiveResourceNotFoundError("ExecutivePlan", cycle.planId, tenantId);

    plan = plan.markApproved();
    await this.planRepo.save(plan);

    // Record Executive Decision
    const decision = await this.enterpriseOperatingService.recordDecision({
      id: `dec_${cycle.id}_${Date.now()}`,
      tenantId,
      enterpriseId: cycle.enterpriseId,
      decisionMakerPrincipalId: approverPrincipalId,
      authorityScope: "STRATEGIC_OBJECTIVE",
      decisionType: "APPROVE",
      targetType: "INITIATIVE",
      targetId: plan.initiativeId ?? plan.objectiveId,
      rationale: plan.rationale,
      resultingAction: "Execute approved executive plan actions",
    }, traceId);

    cycle = cycle.startExecuting(decision.id);
    await this.cycleRepo.save(cycle);

    return { cycle, plan };
  }

  // ---------------------------------------------------------------------------
  // 3. EXECUTE ACTION
  // ---------------------------------------------------------------------------

  async executePlanAction(
    cycleId: string,
    tenantId: string,
    actionIndex = 0,
    traceId = "trace-executive-exec"
  ): Promise<{ cycle: ExecutiveCycle; outcome: string }> {
    let cycle = await this.cycleRepo.findById(cycleId, tenantId);
    if (!cycle) throw new ExecutiveResourceNotFoundError("ExecutiveCycle", cycleId, tenantId);
    if (!cycle.planId) throw new ExecutiveCycleValidationError("Cycle has no active plan");

    const plan = await this.planRepo.findById(cycle.planId, tenantId);
    if (!plan) throw new ExecutiveResourceNotFoundError("ExecutivePlan", cycle.planId, tenantId);

    const action = plan.actions[actionIndex];
    if (!action) {
      throw new ExecutiveCycleValidationError(`No action found at index ${actionIndex}`);
    }

    this.publish(createExecutiveActionStartedEvent(cycle.id, action.actionId, action.actionType, traceId));

    let outcome = "Action executed successfully";
    let workflowInstanceId: string | undefined = undefined;

    if (action.actionType === "START_WORKFLOW" && action.workflowDefinitionId && this.workflowOrchestratorService) {
      const { instance } = await this.workflowOrchestratorService.startWorkflow({
        id: `wfi_${cycle.id}_${Date.now()}`,
        definitionId: action.workflowDefinitionId,
        tenantId,
        input: action.inputPayload ?? {},
      }, traceId);
      workflowInstanceId = instance.id;
      outcome = `Workflow instance '${instance.id}' launched for definition '${action.workflowDefinitionId}'`;
    }

    cycle = cycle.startVerifying(workflowInstanceId);
    await this.cycleRepo.save(cycle);

    this.publish(createExecutiveActionCompletedEvent(cycle.id, action.actionId, outcome, traceId));
    return { cycle, outcome };
  }


  // ---------------------------------------------------------------------------
  // 4. VERIFY & MEASURE
  // ---------------------------------------------------------------------------

  async recordMeasurement(
    req: IngestMeasurementRequest,
    tenantId: string,
    traceId = "trace-executive-measure"
  ): Promise<{ cycle: ExecutiveCycle; metric: any }> {
    let cycle = await this.cycleRepo.findById(req.cycleId, tenantId);
    if (!cycle) throw new ExecutiveResourceNotFoundError("ExecutiveCycle", req.cycleId, tenantId);

    const updatedMetric = await this.enterpriseOperatingService.recordMetricMeasurement(
      req.metricId,
      tenantId,
      {
        value: req.value,
        source: req.source,
      },
      traceId
    );

    cycle = cycle.startMeasuring();
    await this.cycleRepo.save(cycle);

    return { cycle, metric: updatedMetric };
  }

  // ---------------------------------------------------------------------------
  // 5. REASSESS & ADAPT
  // ---------------------------------------------------------------------------

  async reassessCycle(
    cycleId: string,
    tenantId: string,
    reason: string,
    traceId = "trace-executive-reassess"
  ): Promise<ExecutiveCycle> {
    let cycle = await this.cycleRepo.findById(cycleId, tenantId);
    if (!cycle) throw new ExecutiveResourceNotFoundError("ExecutiveCycle", cycleId, tenantId);

    cycle = cycle.requestReassessment(reason);
    await this.cycleRepo.save(cycle);

    this.publish(createExecutiveReassessmentRequestedEvent(cycle.id, cycle.replanningCount, reason, traceId));
    return cycle;
  }

  // ---------------------------------------------------------------------------
  // 6. COMPLETE CYCLE
  // ---------------------------------------------------------------------------

  async completeCycle(
    cycleId: string,
    tenantId: string,
    outcomeSummary: string,
    traceId = "trace-executive-complete"
  ): Promise<ExecutiveCycle> {
    let cycle = await this.cycleRepo.findById(cycleId, tenantId);
    if (!cycle) throw new ExecutiveResourceNotFoundError("ExecutiveCycle", cycleId, tenantId);

    cycle = cycle.complete(outcomeSummary);
    await this.cycleRepo.save(cycle);

    this.publish(createExecutiveCycleCompletedEvent(cycle.id, outcomeSummary, traceId));
    return cycle;
  }

  // ---------------------------------------------------------------------------
  // Query Methods
  // ---------------------------------------------------------------------------

  async getCycle(id: string, tenantId: string): Promise<ExecutiveCycle> {
    const cycle = await this.cycleRepo.findById(id, tenantId);
    if (!cycle) throw new ExecutiveResourceNotFoundError("ExecutiveCycle", id, tenantId);
    return cycle;
  }

  async listCycles(tenantId: string, enterpriseId?: string): Promise<readonly ExecutiveCycle[]> {
    if (enterpriseId) {
      return this.cycleRepo.listByEnterprise(enterpriseId, tenantId);
    }
    return this.cycleRepo.listByTenant(tenantId);
  }

  async getContextSnapshot(cycleId: string, tenantId: string): Promise<ExecutiveContextSnapshot> {
    const snap = await this.snapshotRepo.findByCycleId(cycleId, tenantId);
    if (!snap) throw new ExecutiveResourceNotFoundError("ExecutiveContextSnapshot for cycle", cycleId, tenantId);
    return snap;
  }

  async getAnalysis(cycleId: string, tenantId: string): Promise<ExecutiveAnalysis> {
    const analysis = await this.analysisRepo.findByCycleId(cycleId, tenantId);
    if (!analysis) throw new ExecutiveResourceNotFoundError("ExecutiveAnalysis for cycle", cycleId, tenantId);
    return analysis;
  }

  async getPlan(cycleId: string, tenantId: string): Promise<ExecutivePlan> {
    const plan = await this.planRepo.findByCycleId(cycleId, tenantId);
    if (!plan) throw new ExecutiveResourceNotFoundError("ExecutivePlan for cycle", cycleId, tenantId);
    return plan;
  }

  private publish(event: any): void {
    if (this.eventPublisher) {
      this.eventPublisher.publish(event);
    }
  }
}
