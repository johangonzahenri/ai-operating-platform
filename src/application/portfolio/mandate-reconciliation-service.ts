/**
 * AI Operating Platform - MandateReconciliationService
 * 
 * Application service for governed mandate reconciliation and runtime consistency.
 * 
 * INVARIANTS:
 * 1. Zero Autonomous Authority: Purely deterministic execution based on explicit domain policies.
 * 2. Fail-Closed: Unresolved or ambiguous mandate changes result in safe cancellation or suspension.
 * 3. Default Deny: Cross-enterprise boundaries are strictly preserved.
 * 4. Historical Integrity: COMPLETED executions are never modified retroactively.
 * 5. OCC & Idempotency: All reconciliation runs are idempotent and concurrency-safe.
 */

import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { EnterpriseGovernanceMandate } from "../../domain/portfolio/governance-mandate.js";
import {
  EnterpriseGovernanceMandateRepositoryPort,
  EnterprisePortfolioRepositoryPort,
} from "../ports/portfolio-repository-port.js";
import {
  WorkflowInstanceRepositoryPort,
  WorkflowDefinitionRepositoryPort,
} from "../ports/workflow-repository-port.js";
import { WorkflowOrchestratorService } from "../workflow/workflow-orchestrator-service.js";
import { HumanOversightService } from "../workflow/human-oversight-service.js";
import {
  evaluateMandateReconciliation,
  ReconciliationTriggerType,
  ReconciliationDecision,
} from "../../domain/portfolio/mandate-reconciliation-policy.js";
import {
  createMandateReconciliationStartedEvent,
  createMandateReconciliationCompletedEvent,
  createWorkflowReconciledEvent,
  createApprovalRequestReconciledEvent,
} from "../../domain/portfolio/mandate-reconciliation-events.js";
import {
  ReconciliationValidationError,
  ReconciliationConcurrencyConflictError,
  ReconciliationEmergencyHaltActiveError,
} from "../../domain/portfolio/mandate-reconciliation-errors.js";
import { MandateNotFoundError } from "../../domain/portfolio/portfolio-errors.js";

export interface ReconcileMandateParams {
  readonly mandateId: string;
  readonly tenantId: string;
  readonly triggerType: ReconciliationTriggerType;
  readonly expectedMandateConcurrencyVersion?: number | undefined;
  readonly reason?: string | undefined;
  readonly actorPrincipalId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly traceId?: string | undefined;
}

export interface ReconciledEntitySummary {
  readonly entityType: string;
  readonly entityId: string;
  readonly previousStatus: string;
  readonly resultingStatus: string;
  readonly actionApplied: string;
  readonly reason: string;
}

export interface MandateReconciliationReport {
  readonly reconciliationId: string;
  readonly tenantId: string;
  readonly mandateId: string;
  readonly mandateVersion: number;
  readonly triggerType: ReconciliationTriggerType;
  readonly status: "COMPLETED" | "NO_OP" | "FAILED";
  readonly summary: {
    readonly totalEvaluated: number;
    readonly totalMutated: number;
    readonly totalCancelled: number;
    readonly totalPaused: number;
    readonly totalSkipped: number;
  };
  readonly reconciledEntities: readonly ReconciledEntitySummary[];
  readonly executedAt: Date;
  readonly traceId: string;
  readonly idempotencyKey?: string | undefined;
}

export interface MandateReconciliationServiceDependencies {
  readonly mandateRepo: EnterpriseGovernanceMandateRepositoryPort;
  readonly portfolioRepo?: EnterprisePortfolioRepositoryPort | undefined;
  readonly workflowInstanceRepo?: WorkflowInstanceRepositoryPort | undefined;
  readonly workflowDefRepo?: WorkflowDefinitionRepositoryPort | undefined;
  readonly workflowService?: WorkflowOrchestratorService | undefined;
  readonly humanOversightService?: HumanOversightService | undefined;
  readonly events?: EventPublisher | undefined;
  readonly eventPublisher?: EventPublisher | undefined;
  readonly isEmergencyHaltActive?: (() => boolean) | undefined;
}

export class MandateReconciliationService {
  private readonly mandateRepo: EnterpriseGovernanceMandateRepositoryPort;
  private readonly portfolioRepo?: EnterprisePortfolioRepositoryPort | undefined;
  private readonly workflowInstanceRepo?: WorkflowInstanceRepositoryPort | undefined;
  private readonly workflowDefRepo?: WorkflowDefinitionRepositoryPort | undefined;
  private readonly workflowService?: WorkflowOrchestratorService | undefined;
  private readonly humanOversightService?: HumanOversightService | undefined;
  private readonly events?: EventPublisher | undefined;
  private readonly isEmergencyHaltActive?: (() => boolean) | undefined;

  // In-memory idempotency cache: idempotencyKey -> MandateReconciliationReport
  private readonly idempotencyCache = new Map<string, MandateReconciliationReport>();

  constructor(deps: MandateReconciliationServiceDependencies) {
    if (!deps || !deps.mandateRepo) {
      throw new ReconciliationValidationError("mandateRepo is required for MandateReconciliationService");
    }
    this.mandateRepo = deps.mandateRepo;
    this.portfolioRepo = deps.portfolioRepo;
    this.workflowInstanceRepo = deps.workflowInstanceRepo;
    this.workflowDefRepo = deps.workflowDefRepo;
    this.workflowService = deps.workflowService;
    this.humanOversightService = deps.humanOversightService;
    this.events = deps.events ?? deps.eventPublisher;
    this.isEmergencyHaltActive = deps.isEmergencyHaltActive;
  }

  /**
   * Reconciles all in-flight and pending operations associated with a mandate.
   */
  async reconcileMandate(params: ReconcileMandateParams): Promise<MandateReconciliationReport> {
    const traceId = params.traceId ?? crypto.randomUUID();
    const reconciliationId = `rec-${crypto.randomUUID()}`;

    // 1. Emergency Halt Invariant Check
    if (this.isEmergencyHaltActive && this.isEmergencyHaltActive()) {
      throw new ReconciliationEmergencyHaltActiveError();
    }

    // 2. Validate mandatory parameters
    if (!params.mandateId || !params.mandateId.trim()) {
      throw new ReconciliationValidationError("mandateId is required for reconciliation");
    }
    if (!params.tenantId || !params.tenantId.trim()) {
      throw new ReconciliationValidationError("tenantId is required for reconciliation");
    }
    const mandateId = params.mandateId.trim();
    const tenantId = params.tenantId.trim();

    // 3. Idempotency Check
    if (params.idempotencyKey) {
      const cached = this.idempotencyCache.get(params.idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    // 4. Load governing mandate and check tenant isolation & OCC
    const mandate = await this.mandateRepo.findById(mandateId, tenantId);
    if (!mandate) {
      throw new MandateNotFoundError(mandateId, tenantId);
    }

    if (
      params.expectedMandateConcurrencyVersion !== undefined &&
      params.expectedMandateConcurrencyVersion !== mandate.concurrencyVersion
    ) {
      throw new ReconciliationConcurrencyConflictError(
        mandate.id,
        params.expectedMandateConcurrencyVersion,
        mandate.concurrencyVersion
      );
    }

    // 5. Emit reconciliation started domain event
    if (this.events) {
      this.events.publish(
        createMandateReconciliationStartedEvent(
          reconciliationId,
          tenantId,
          mandate.id,
          params.triggerType,
          mandate.portfolioId,
          traceId
        )
      );
    }

    // 6. Impact Analysis & Resource Discovery
    const reconciledEntities: ReconciledEntitySummary[] = [];
    let totalEvaluated = 0;
    let totalMutated = 0;
    let totalCancelled = 0;
    let totalPaused = 0;
    let totalSkipped = 0;

    if (this.workflowInstanceRepo) {
      const instances = await this.workflowInstanceRepo.findByTenantId(tenantId, 500, 0);

      for (const instance of instances) {
        // Find workflow definition to inspect multi-enterprise parameters
        let defSourceEnterpriseId = "";
        let defTargetEnterpriseId = "";
        let defRequestedAutonomy = undefined;

        if (this.workflowDefRepo) {
          const def = await this.workflowDefRepo.findById(instance.workflowDefinitionId, tenantId);
          if (def) {
            defSourceEnterpriseId = def.sourceEnterpriseId ?? "";
            defTargetEnterpriseId = def.targetEnterpriseId ?? "";
            defRequestedAutonomy = def.requestedAutonomy;

            // Also check steps if definition level is empty
            if (!defSourceEnterpriseId || !defTargetEnterpriseId) {
              for (const s of def.steps) {
                if (s.sourceEnterpriseId && !defSourceEnterpriseId) defSourceEnterpriseId = s.sourceEnterpriseId;
                if (s.targetEnterpriseId && !defTargetEnterpriseId) defTargetEnterpriseId = s.targetEnterpriseId;
                if (s.requestedAutonomy && !defRequestedAutonomy) defRequestedAutonomy = s.requestedAutonomy;
              }
            }
          }
        }

        // Check if instance relates to this mandate's source or target enterprises
        const isRelated =
          (defSourceEnterpriseId === "" || defSourceEnterpriseId === mandate.sourceEnterpriseId) &&
          (defTargetEnterpriseId === "" || mandate.targetEnterpriseIds.includes(defTargetEnterpriseId) || mandate.targetEnterpriseIds.includes("*"));

        if (!isRelated && defSourceEnterpriseId !== "" && defTargetEnterpriseId !== "") {
          continue; // Unrelated to this mandate
        }

        totalEvaluated++;

        const decision: ReconciliationDecision = evaluateMandateReconciliation(
          {
            triggerType: params.triggerType,
            entityType: "WORKFLOW_INSTANCE",
            entityId: instance.id,
            currentStatus: instance.status,
            sourceEnterpriseId: defSourceEnterpriseId || mandate.sourceEnterpriseId,
            targetEnterpriseId: defTargetEnterpriseId || mandate.targetEnterpriseIds[0] || "",
            requestedAutonomy: defRequestedAutonomy,
          },
          mandate
        );

        if (decision.action === "NO_OP" || decision.action === "CONTINUE") {
          totalSkipped++;
          reconciledEntities.push({
            entityType: "WORKFLOW_INSTANCE",
            entityId: instance.id,
            previousStatus: instance.status,
            resultingStatus: instance.status,
            actionApplied: decision.action,
            reason: decision.reason,
          });
          continue;
        }

        if (decision.action === "CANCEL") {
          if (!instance.isTerminal()) {
            if (this.workflowService) {
              await this.workflowService.cancelWorkflow(
                instance.id,
                tenantId,
                `Reconciled: ${decision.reason}`,
                traceId
              );
            } else if (this.workflowInstanceRepo) {
              const cancelled = instance.cancel(`Reconciled: ${decision.reason}`);
              await this.workflowInstanceRepo.save(cancelled);
            }
            totalMutated++;
            totalCancelled++;
            reconciledEntities.push({
              entityType: "WORKFLOW_INSTANCE",
              entityId: instance.id,
              previousStatus: instance.status,
              resultingStatus: "CANCELLED",
              actionApplied: "CANCEL",
              reason: decision.reason,
            });

            if (this.events) {
              this.events.publish(
                createWorkflowReconciledEvent(
                  instance.id,
                  tenantId,
                  mandate.id,
                  instance.status,
                  "CANCELLED",
                  decision.reason,
                  "CANCEL",
                  traceId
                )
              );
            }
          }
        } else if (decision.action === "PAUSE" || decision.action === "REAUTHORIZATION_REQUIRED") {
          if (instance.status === "RUNNING") {
            if (this.workflowService) {
              await this.workflowService.pauseWorkflow(
                instance.id,
                tenantId,
                `Reconciled: ${decision.reason}`,
                traceId
              );
            } else if (this.workflowInstanceRepo) {
              const paused = instance.pause(`Reconciled: ${decision.reason}`);
              await this.workflowInstanceRepo.save(paused);
            }
            totalMutated++;
            totalPaused++;
            reconciledEntities.push({
              entityType: "WORKFLOW_INSTANCE",
              entityId: instance.id,
              previousStatus: instance.status,
              resultingStatus: "PAUSED",
              actionApplied: decision.action,
              reason: decision.reason,
            });

            if (this.events) {
              this.events.publish(
                createWorkflowReconciledEvent(
                  instance.id,
                  tenantId,
                  mandate.id,
                  instance.status,
                  "PAUSED",
                  decision.reason,
                  decision.action,
                  traceId
                )
              );
            }
          } else {
            totalSkipped++;
            reconciledEntities.push({
              entityType: "WORKFLOW_INSTANCE",
              entityId: instance.id,
              previousStatus: instance.status,
              resultingStatus: instance.status,
              actionApplied: decision.action,
              reason: decision.reason,
            });
          }
        }
      }
    }

    // 7. Reconcile In-flight Human Oversight / Approvals if available
    if (this.humanOversightService) {
      const pendingApprovals = await this.humanOversightService.listPendingRequests(tenantId);
      for (const req of pendingApprovals) {
        totalEvaluated++;
        const decision = evaluateMandateReconciliation(
          {
            triggerType: params.triggerType,
            entityType: "APPROVAL_REQUEST",
            entityId: req.id,
            currentStatus: req.status,
            sourceEnterpriseId: mandate.sourceEnterpriseId,
            targetEnterpriseId: mandate.targetEnterpriseIds[0] || "",
          },
          mandate
        );

        if (decision.action === "REJECT_APPROVAL" || decision.action === "CANCEL") {
          try {
            await this.humanOversightService.rejectApproval(
              {
                requestId: req.id,
                tenantId,
                reviewerPrincipalId: "system:reconciliation-engine",
                reason: `Mandate governance changed: ${decision.reason}`,
              },
              traceId
            );
            totalMutated++;
            totalCancelled++;
            reconciledEntities.push({
              entityType: "APPROVAL_REQUEST",
              entityId: req.id,
              previousStatus: req.status,
              resultingStatus: "REJECTED",
              actionApplied: decision.action,
              reason: decision.reason,
            });

            if (this.events) {
              this.events.publish(
                createApprovalRequestReconciledEvent(
                  req.id,
                  tenantId,
                  mandate.id,
                  req.status,
                  "REJECTED",
                  decision.reason,
                  traceId
                )
              );
            }
          } catch {
            // Gracefully ignore if already transitioned
          }
        } else {
          totalSkipped++;
        }
      }
    }

    // 8. Build reconciliation report
    const report: MandateReconciliationReport = {
      reconciliationId,
      tenantId,
      mandateId: mandate.id,
      mandateVersion: mandate.concurrencyVersion,
      triggerType: params.triggerType,
      status: totalMutated > 0 ? "COMPLETED" : "NO_OP",
      summary: {
        totalEvaluated,
        totalMutated,
        totalCancelled,
        totalPaused,
        totalSkipped,
      },
      reconciledEntities,
      executedAt: new Date(),
      traceId,
      idempotencyKey: params.idempotencyKey,
    };

    // 9. Cache report if idempotency key was supplied
    if (params.idempotencyKey) {
      this.idempotencyCache.set(params.idempotencyKey, report);
    }

    // 10. Emit completion event
    if (this.events) {
      this.events.publish(
        createMandateReconciliationCompletedEvent(
          reconciliationId,
          tenantId,
          mandate.id,
          params.triggerType,
          mandate.portfolioId,
          report.summary,
          traceId
        )
      );
    }

    return report;
  }

  /**
   * Scans for all expired mandates in a tenant and triggers reconciliation for each.
   */
  async reconcileExpiredMandates(tenantId: string, traceId: string = crypto.randomUUID()): Promise<readonly MandateReconciliationReport[]> {
    if (!tenantId || !tenantId.trim()) {
      throw new ReconciliationValidationError("tenantId is required to scan expired mandates");
    }
    const cleanTenantId = tenantId.trim();
    const reports: MandateReconciliationReport[] = [];

    // Query active mandates
    let activeMandates: readonly EnterpriseGovernanceMandate[] = [];
    if (typeof this.mandateRepo.findByTenantId === "function") {
      activeMandates = await this.mandateRepo.findByTenantId(cleanTenantId);
    } else if (this.portfolioRepo) {
      const portfolios = await this.portfolioRepo.findAll(cleanTenantId);
      const list: EnterpriseGovernanceMandate[] = [];
      for (const p of portfolios) {
        const mandates = await this.mandateRepo.findByPortfolioId(p.id, cleanTenantId);
        list.push(...mandates);
      }
      activeMandates = list;
    }
    const now = new Date();

    for (const mandate of activeMandates) {
      if (mandate.status === "EXPIRED" || (mandate.validTo && now > mandate.validTo)) {
        // Transition mandate to EXPIRED if still ACTIVE
        if (mandate.status === "ACTIVE") {
          const expired = mandate.expire();
          await this.mandateRepo.save(expired);
        }

        const report = await this.reconcileMandate({
          mandateId: mandate.id,
          tenantId: cleanTenantId,
          triggerType: "MANDATE_EXPIRED",
          reason: "Scheduled scan detected expired validity date",
          traceId,
        });
        reports.push(report);
      }
    }

    return reports;
  }
}
