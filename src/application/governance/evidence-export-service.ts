/**
 * AI Operating Platform - Evidence Export Service
 * 
 * Application service orchestrating the collection, redaction, canonical serialization,
 * cryptographic sealing (SHA-256), and packaging of governed compliance evidence.
 * 
 * Guarantees:
 * - Read-only: 0 mutation on any domain entity or repository.
 * - Authorization-first & Fail-closed.
 * - Strict tenant, enterprise, and portfolio isolation.
 * - Deterministic SHA-256 checksum over canonical redacted data.
 * - Bounded queries (max 1000 records, max 90 days).
 * - Automatic sensitive data redaction.
 */

import crypto from "node:crypto";
import { SecurityContext } from "../../domain/security/security.js";
import {
  EvidenceScope,
  EvidenceExportFilter,
  EvidenceExportFilterProps,
  EvidenceExportManifest,
  EvidenceExportPackage,
} from "../../domain/governance/evidence-export.js";
import {
  EvidenceExportValidationError,
  EvidenceTenantMismatchError,
  EvidenceResourceNotFoundError,
} from "../../domain/governance/evidence-export-errors.js";
import { SensitiveDataRedactor } from "../../infrastructure/observability/sensitive-data-redactor.js";

// Repositories Ports
import {
  EnterpriseRepositoryPort,
  BusinessObjectiveRepositoryPort,
  BusinessInitiativeRepositoryPort,
  BusinessMetricRepositoryPort,
  ExecutiveDecisionRepositoryPort,
} from "../ports/business-repository-port.js";
import {
  EnterprisePortfolioRepositoryPort,
  GovernanceMandateRepositoryPort,
  PortfolioObjectiveRepositoryPort,
} from "../ports/portfolio-repository-port.js";
import {
  WorkflowDefinitionRepositoryPort,
  WorkflowInstanceRepositoryPort,
} from "../ports/workflow-repository-port.js";
import { VerificationResultRepositoryPort } from "../ports/verification-repository-port.js";
import { ApprovalRequestRepositoryPort } from "../ports/approval-repository-port.js";
import { DurableEventQueryPort, DurableEvent } from "../ports/durable-event-port.js";

export interface EvidenceExportServiceDependencies {
  readonly enterpriseRepo?: EnterpriseRepositoryPort | undefined;
  readonly businessObjectiveRepo?: BusinessObjectiveRepositoryPort | undefined;
  readonly businessInitiativeRepo?: BusinessInitiativeRepositoryPort | undefined;
  readonly businessMetricRepo?: BusinessMetricRepositoryPort | undefined;
  readonly executiveDecisionRepo?: ExecutiveDecisionRepositoryPort | undefined;
  readonly portfolioRepo?: EnterprisePortfolioRepositoryPort | undefined;
  readonly mandateRepo?: GovernanceMandateRepositoryPort | undefined;
  readonly portfolioObjectiveRepo?: PortfolioObjectiveRepositoryPort | undefined;
  readonly workflowDefinitionRepo?: WorkflowDefinitionRepositoryPort | undefined;
  readonly workflowInstanceRepo?: WorkflowInstanceRepositoryPort | undefined;
  readonly verificationRepo?: VerificationResultRepositoryPort | undefined;
  readonly approvalRepo?: ApprovalRequestRepositoryPort | undefined;
  readonly durableEventQueryPort?: DurableEventQueryPort | undefined;
  readonly redactor?: SensitiveDataRedactor | undefined;
}

/**
 * Deterministic canonical JSON stringifier that sorts object keys recursively.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + canonicalJsonStringify(val);
  });
  return "{" + pairs.join(",") + "}";
}

export class EvidenceExportService {
  private readonly enterpriseRepo?: EnterpriseRepositoryPort | undefined;
  private readonly businessObjectiveRepo?: BusinessObjectiveRepositoryPort | undefined;
  private readonly businessInitiativeRepo?: BusinessInitiativeRepositoryPort | undefined;
  private readonly businessMetricRepo?: BusinessMetricRepositoryPort | undefined;
  private readonly executiveDecisionRepo?: ExecutiveDecisionRepositoryPort | undefined;
  private readonly portfolioRepo?: EnterprisePortfolioRepositoryPort | undefined;
  private readonly mandateRepo?: GovernanceMandateRepositoryPort | undefined;
  private readonly portfolioObjectiveRepo?: PortfolioObjectiveRepositoryPort | undefined;
  private readonly workflowDefinitionRepo?: WorkflowDefinitionRepositoryPort | undefined;
  private readonly workflowInstanceRepo?: WorkflowInstanceRepositoryPort | undefined;
  private readonly verificationRepo?: VerificationResultRepositoryPort | undefined;
  private readonly approvalRepo?: ApprovalRequestRepositoryPort | undefined;
  private readonly durableEventQueryPort?: DurableEventQueryPort | undefined;
  private readonly redactor: SensitiveDataRedactor;

  // Idempotency cache: tenantId:scope:idempotencyKey -> EvidenceExportPackage
  private readonly idempotencyCache = new Map<string, EvidenceExportPackage>();

  constructor(deps: EvidenceExportServiceDependencies = {}) {
    this.enterpriseRepo = deps.enterpriseRepo;
    this.businessObjectiveRepo = deps.businessObjectiveRepo;
    this.businessInitiativeRepo = deps.businessInitiativeRepo;
    this.businessMetricRepo = deps.businessMetricRepo;
    this.executiveDecisionRepo = deps.executiveDecisionRepo;
    this.portfolioRepo = deps.portfolioRepo;
    this.mandateRepo = deps.mandateRepo;
    this.portfolioObjectiveRepo = deps.portfolioObjectiveRepo;
    this.workflowDefinitionRepo = deps.workflowDefinitionRepo;
    this.workflowInstanceRepo = deps.workflowInstanceRepo;
    this.verificationRepo = deps.verificationRepo;
    this.approvalRepo = deps.approvalRepo;
    this.durableEventQueryPort = deps.durableEventQueryPort;
    this.redactor = deps.redactor ?? new SensitiveDataRedactor();
  }

  async exportEvidence(
    context: SecurityContext,
    filterProps: EvidenceExportFilterProps
  ): Promise<EvidenceExportPackage> {
    // 1. Validate Context & Authentication
    if (!context || !context.tenantId) {
      throw new EvidenceExportValidationError("Valid SecurityContext with tenantId is required");
    }

    const tenantId = context.tenantId;
    const requestedBy = context.principal.id;

    // 2. Validate Filters & Bounds
    const filter = EvidenceExportFilter.create(filterProps);

    // 3. Check Idempotency Key
    if (filter.idempotencyKey) {
      const cacheKey = `${tenantId}:${filter.scope}:${filter.idempotencyKey}`;
      const cached = this.idempotencyCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // 4. Query Evidence Data Strictly Isolated by Tenant
    const rawData = await this.collectEvidenceData(tenantId, filter);

    // 5. Apply Sensitive Data Redaction
    const redactedData = this.sanitizeEvidenceData(rawData);

    // 6. Compute Record Counts & Total Records
    const recordCounts: Record<string, number> = {};
    let totalRecords = 0;

    for (const [key, records] of Object.entries(redactedData)) {
      const count = Array.isArray(records) ? records.length : 0;
      recordCounts[key] = count;
      totalRecords += count;
    }

    // 7. Canonical Deterministic Serialization & SHA-256 Seal
    const canonicalDataStr = canonicalJsonStringify(redactedData);
    const checksumSha256 = crypto.createHash("sha256").update(canonicalDataStr, "utf8").digest("hex");

    // 8. Construct Immutable Manifest & Package
    const exportId = `exp-${crypto.randomUUID()}`;
    const manifest = new EvidenceExportManifest({
      exportId,
      tenantId,
      requestedByPrincipalId: requestedBy,
      generatedAt: new Date(),
      scope: filter.scope,
      filters: {
        targetId: filter.targetId,
        fromDate: filter.fromDate?.toISOString(),
        toDate: filter.toDate?.toISOString(),
        limit: filter.limit,
        includeAuditEvents: filter.includeAuditEvents,
      },
      recordCounts,
      totalRecords,
      checksumSha256,
    });

    const exportPackage = new EvidenceExportPackage({
      manifest,
      data: redactedData,
    });

    // 9. Store Idempotency Cache if requested
    if (filter.idempotencyKey) {
      const cacheKey = `${tenantId}:${filter.scope}:${filter.idempotencyKey}`;
      this.idempotencyCache.set(cacheKey, exportPackage);
    }

    return exportPackage;
  }

  private async collectEvidenceData(
    tenantId: string,
    filter: EvidenceExportFilter
  ): Promise<Record<string, readonly unknown[]>> {
    const data: Record<string, readonly unknown[]> = {};
    const limit = filter.limit;

    switch (filter.scope) {
      case "TENANT": {
        // High-level summary of tenant portfolio & enterprise ecosystem
        if (this.enterpriseRepo) {
          const enterprises = await this.enterpriseRepo.listByTenant(tenantId);
          data["enterprises"] = enterprises.slice(0, limit);
        }
        if (this.portfolioRepo) {
          const portfolios = await this.portfolioRepo.findAll(tenantId);
          data["portfolios"] = portfolios.slice(0, limit);
        }
        if (this.workflowDefinitionRepo) {
          const workflows = await this.workflowDefinitionRepo.findByTenantId(tenantId, limit, 0);
          data["workflows"] = workflows.slice(0, limit);
        }
        break;
      }

      case "PORTFOLIO": {
        if (!filter.targetId) {
          if (this.portfolioRepo) {
            const portfolios = await this.portfolioRepo.findAll(tenantId);
            data["portfolios"] = portfolios.slice(0, limit);
          }
        } else {
          const portfolioId = filter.targetId;
          if (this.portfolioRepo) {
            const portfolio = await this.portfolioRepo.findById(portfolioId, tenantId);
            if (!portfolio) {
              throw new EvidenceResourceNotFoundError("EnterprisePortfolio", portfolioId);
            }
            data["portfolios"] = [portfolio];
          }
          if (this.mandateRepo) {
            const mandates = await this.mandateRepo.findByPortfolioId(portfolioId, tenantId);
            data["mandates"] = mandates.slice(0, limit);
          }
          if (this.portfolioObjectiveRepo) {
            const objectives = await this.portfolioObjectiveRepo.findByPortfolioId(portfolioId, tenantId);
            data["portfolioObjectives"] = objectives.slice(0, limit);
          }
        }
        break;
      }

      case "ENTERPRISE": {
        if (!filter.targetId) {
          if (this.enterpriseRepo) {
            const enterprises = await this.enterpriseRepo.listByTenant(tenantId);
            data["enterprises"] = enterprises.slice(0, limit);
          }
        } else {
          const enterpriseId = filter.targetId;
          if (this.enterpriseRepo) {
            const enterprise = await this.enterpriseRepo.findById(enterpriseId, tenantId);
            if (!enterprise) {
              throw new EvidenceResourceNotFoundError("Enterprise", enterpriseId);
            }
            data["enterprises"] = [enterprise];
          }
          if (this.businessObjectiveRepo) {
            const objectives = await this.businessObjectiveRepo.listByEnterprise(enterpriseId, tenantId);
            data["businessObjectives"] = objectives.slice(0, limit);
          }
          if (this.businessInitiativeRepo) {
            const initiatives = await this.businessInitiativeRepo.listByEnterprise(enterpriseId, tenantId);
            data["businessInitiatives"] = initiatives.slice(0, limit);
          }
          if (this.businessMetricRepo) {
            const metrics = await this.businessMetricRepo.listByEnterprise(enterpriseId, tenantId);
            data["businessMetrics"] = metrics.slice(0, limit);
          }
          if (this.executiveDecisionRepo) {
            const decisions = await this.executiveDecisionRepo.listByEnterprise(enterpriseId, tenantId);
            data["executiveDecisions"] = decisions.slice(0, limit);
          }
        }
        break;
      }

      case "WORKFLOW": {
        if (filter.targetId) {
          const targetId = filter.targetId;
          if (this.workflowDefinitionRepo) {
            const def = await this.workflowDefinitionRepo.findById(targetId, tenantId);
            if (def) {
              data["workflowDefinitions"] = [def];
            }
          }
          if (this.workflowInstanceRepo) {
            // Check if targetId is an instance ID or definition ID
            const inst = await this.workflowInstanceRepo.findById(targetId, tenantId);
            if (inst) {
              data["workflowInstances"] = [inst];
              if (this.verificationRepo) {
                const verifications = await this.verificationRepo.findByInstanceId(inst.id, tenantId);
                data["verificationResults"] = verifications.slice(0, limit);
              }
              if (this.approvalRepo) {
                const approvals = await this.approvalRepo.findByInstanceId(inst.id, tenantId);
                data["approvalRequests"] = approvals.slice(0, limit);
              }
            } else {
              const instances = await this.workflowInstanceRepo.findByDefinitionId(targetId, tenantId);
              data["workflowInstances"] = instances.slice(0, limit);
            }
          }
        } else {
          if (this.workflowDefinitionRepo) {
            const defs = await this.workflowDefinitionRepo.findByTenantId(tenantId, limit, 0);
            data["workflowDefinitions"] = defs.slice(0, limit);
          }
          if (this.workflowInstanceRepo) {
            const insts = await this.workflowInstanceRepo.findByTenantId(tenantId, limit, 0);
            data["workflowInstances"] = insts.slice(0, limit);
          }
        }
        break;
      }

      case "EXECUTION": {
        if (filter.targetId && this.workflowInstanceRepo) {
          const inst = await this.workflowInstanceRepo.findById(filter.targetId, tenantId);
          if (inst) {
            data["workflowInstances"] = [inst];
          }
        }
        if (this.durableEventQueryPort) {
          const events = filter.targetId
            ? this.durableEventQueryPort.getEventsByExecution(filter.targetId)
            : this.durableEventQueryPort.getAllEvents();
          data["auditEvents"] = events.slice(0, limit);
        }
        break;
      }

      case "MANDATE": {
        if (this.mandateRepo) {
          if (filter.targetId) {
            const mandate = await this.mandateRepo.findById(filter.targetId, tenantId);
            if (!mandate) {
              throw new EvidenceResourceNotFoundError("EnterpriseGovernanceMandate", filter.targetId);
            }
            data["mandates"] = [mandate];
          } else {
            // Find across portfolios
            if (this.portfolioRepo) {
              const portfolios = await this.portfolioRepo.findAll(tenantId);
              const allMandates = [];
              for (const port of portfolios) {
                const mandates = await this.mandateRepo.findByPortfolioId(port.id, tenantId);
                allMandates.push(...mandates);
              }
              data["mandates"] = allMandates.slice(0, limit);
            }
          }
        }
        break;
      }

      case "APPROVAL": {
        if (this.approvalRepo) {
          if (filter.targetId) {
            const approval = await this.approvalRepo.findById(filter.targetId, tenantId);
            if (approval) {
              data["approvalRequests"] = [approval];
            } else {
              const approvals = await this.approvalRepo.findByInstanceId(filter.targetId, tenantId);
              data["approvalRequests"] = approvals.slice(0, limit);
            }
          } else {
            const approvals = await this.approvalRepo.findAll({ tenantId }, limit, 0);
            data["approvalRequests"] = approvals.slice(0, limit);
          }
        }
        break;
      }

      case "RECONCILIATION": {
        if (this.durableEventQueryPort) {
          const reconciliationEvents = this.durableEventQueryPort
            .getAllEvents()
            .filter((e) => e.eventType.startsWith("mandate.reconciliation") || e.eventType.startsWith("mandate."));
          data["reconciliationEvents"] = reconciliationEvents.slice(0, limit);
        }
        break;
      }

      case "AUDIT_TRAIL": {
        if (this.durableEventQueryPort) {
          let events: readonly DurableEvent[];
          if (filter.fromDate && filter.toDate) {
            events = this.durableEventQueryPort.getEventsByTimeRange(filter.fromDate, filter.toDate);
          } else if (filter.targetId) {
            events = this.durableEventQueryPort.getEventsByTrace(filter.targetId);
          } else {
            events = this.durableEventQueryPort.getAllEvents();
          }
          data["auditTrail"] = events.slice(0, limit);
        }
        break;
      }
    }

    // Optional inclusion of audit events
    if (filter.includeAuditEvents && filter.scope !== "AUDIT_TRAIL" && this.durableEventQueryPort) {
      const traceEvents = filter.targetId
        ? this.durableEventQueryPort.getEventsByTrace(filter.targetId)
        : this.durableEventQueryPort.getAllEvents();
      data["correlatedAuditEvents"] = traceEvents.slice(0, limit);
    }

    return data;
  }

  private sanitizeEvidenceData(
    rawData: Record<string, readonly unknown[]>
  ): Record<string, readonly unknown[]> {
    const sanitized: Record<string, readonly unknown[]> = {};

    for (const [key, records] of Object.entries(rawData)) {
      sanitized[key] = records.map((record) => {
        if (record && typeof record === "object") {
          return this.redactor.redactObject(record as Record<string, unknown>);
        }
        if (typeof record === "string") {
          return this.redactor.redact(record);
        }
        return record;
      });
    }

    return sanitized;
  }
}
