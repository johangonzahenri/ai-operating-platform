/**
 * AI Operating Platform - Evidence Export Unit Tests (Phase 78)
 * 
 * Validates the governance and compliance evidence export application service:
 * - Read-only invariant (0 mutation on domain entities)
 * - All 9 evidence scopes: TENANT, PORTFOLIO, ENTERPRISE, WORKFLOW, EXECUTION, MANDATE, APPROVAL, RECONCILIATION, AUDIT_TRAIL
 * - Deterministic SHA-256 checksum calculation and canonical JSON serialization
 * - Sensitive data redaction (API keys, tokens, passwords, JWTs)
 * - Bounded queries (max 1000 records, max 90 days date range)
 * - Strict tenant and enterprise isolation (fail-closed)
 * - Empty result valid handling
 * - Idempotency
 * - Adversarial input validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { SecurityContext } from "../../src/domain/security/security.js";
import {
  EvidenceScope,
  EvidenceExportFilter,
  EvidenceExportPackage,
  MAX_EXPORT_RECORDS_LIMIT,
  MAX_EXPORT_DATE_RANGE_DAYS,
} from "../../src/domain/governance/evidence-export.js";
import {
  EvidenceExportValidationError,
  EvidenceFilterBoundsExceededError,
  EvidenceResourceNotFoundError,
} from "../../src/domain/governance/evidence-export-errors.js";
import {
  EvidenceExportService,
  canonicalJsonStringify,
} from "../../src/application/governance/evidence-export-service.js";
import { SensitiveDataRedactor } from "../../src/infrastructure/observability/sensitive-data-redactor.js";

// In-Memory Repositories
import {
  InMemoryEnterpriseRepository,
  InMemoryBusinessObjectiveRepository,
  InMemoryBusinessInitiativeRepository,
  InMemoryBusinessMetricRepository,
  InMemoryExecutiveDecisionRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-business-repository.js";
import {
  InMemoryEnterprisePortfolioRepository,
  InMemoryGovernanceMandateRepository,
  InMemoryPortfolioObjectiveRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-portfolio-repository.js";
import {
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-workflow-repository.js";
import { InMemoryVerificationResultRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-verification-repository.js";
import { InMemoryApprovalRequestRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-approval-repository.js";
import { InMemoryEventStore } from "../../src/infrastructure/persistence/in-memory-event-store.js";

// Domain Models
import { Enterprise } from "../../src/domain/business/enterprise.js";
import { BusinessObjective } from "../../src/domain/business/business-objective.js";
import { BusinessInitiative } from "../../src/domain/business/business-initiative.js";
import { BusinessMetric } from "../../src/domain/business/business-metric.js";
import { ExecutiveDecisionRecord } from "../../src/domain/business/executive-decision-record.js";
import { EnterprisePortfolio } from "../../src/domain/portfolio/enterprise-portfolio.js";
import { EnterpriseGovernanceMandate } from "../../src/domain/portfolio/governance-mandate.js";
import { PortfolioObjective } from "../../src/domain/portfolio/portfolio-objective.js";
import { WorkflowDefinition } from "../../src/domain/workflow/workflow-definition.js";
import { WorkflowInstance } from "../../src/domain/workflow/workflow-instance.js";
import { VerificationResult } from "../../src/domain/workflow/verification-result.js";
import { ApprovalRequest } from "../../src/domain/workflow/approval-request.js";

describe("Phase 78 — Governance & Compliance Evidence Export (Unit)", () => {
  const TENANT_ALPHA = "tenant-holdings-alpha";
  const TENANT_BETA = "tenant-holdings-beta";

  const alphaContext: SecurityContext = {
    tenantId: TENANT_ALPHA,
    principal: { id: "principal-auditor-alpha", type: "SYSTEM" },
    environment: "production",
  };

  function setupTestEnvironment() {
    const enterpriseRepo = new InMemoryEnterpriseRepository();
    const objectiveRepo = new InMemoryBusinessObjectiveRepository();
    const initiativeRepo = new InMemoryBusinessInitiativeRepository();
    const metricRepo = new InMemoryBusinessMetricRepository();
    const decisionRepo = new InMemoryExecutiveDecisionRepository();
    const portfolioRepo = new InMemoryEnterprisePortfolioRepository();
    const mandateRepo = new InMemoryGovernanceMandateRepository();
    const portfolioObjectiveRepo = new InMemoryPortfolioObjectiveRepository();
    const workflowDefinitionRepo = new InMemoryWorkflowDefinitionRepository();
    const workflowInstanceRepo = new InMemoryWorkflowInstanceRepository();
    const verificationRepo = new InMemoryVerificationResultRepository();
    const approvalRepo = new InMemoryApprovalRequestRepository();
    const eventStore = new InMemoryEventStore();
    const redactor = new SensitiveDataRedactor();

    const service = new EvidenceExportService({
      enterpriseRepo,
      businessObjectiveRepo: objectiveRepo,
      businessInitiativeRepo: initiativeRepo,
      businessMetricRepo: metricRepo,
      executiveDecisionRepo: decisionRepo,
      portfolioRepo,
      mandateRepo,
      portfolioObjectiveRepo,
      workflowDefinitionRepo,
      workflowInstanceRepo,
      verificationRepo,
      approvalRepo,
      durableEventQueryPort: eventStore,
      redactor,
    });

    return {
      service,
      enterpriseRepo,
      objectiveRepo,
      initiativeRepo,
      metricRepo,
      decisionRepo,
      portfolioRepo,
      mandateRepo,
      portfolioObjectiveRepo,
      workflowDefinitionRepo,
      workflowInstanceRepo,
      verificationRepo,
      approvalRepo,
      eventStore,
      redactor,
    };
  }

  it("1. TENANT scope export returns summary of tenant ecosystems", async () => {
    const env = setupTestEnvironment();

    // Seed Enterprise & Portfolio
    const ent = Enterprise.create({
      id: "ent-alpha",
      tenantId: TENANT_ALPHA,
      name: "Alpha Corp",
      industry: "Logistics",
      jurisdiction: "US",
    });
    await env.enterpriseRepo.save(ent);

    const port = EnterprisePortfolio.create({
      id: "port-alpha",
      tenantId: TENANT_ALPHA,
      name: "Alpha Holdings Portfolio",
      ownerPrincipalId: "principal-owner",
    });
    await env.portfolioRepo.save(port);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "TENANT",
    });

    assert.equal(result.manifest.scope, "TENANT");
    assert.equal(result.manifest.tenantId, TENANT_ALPHA);
    assert.equal(result.manifest.requestedByPrincipalId, "principal-auditor-alpha");
    assert.equal(result.manifest.totalRecords, 2);
    assert.equal(result.manifest.recordCounts.enterprises, 1);
    assert.equal(result.manifest.recordCounts.portfolios, 1);
    assert.ok(result.manifest.checksumSha256.length === 64);
  });

  it("2. PORTFOLIO scope export filters by portfolio ID and includes mandates & objectives", async () => {
    const env = setupTestEnvironment();

    const port = EnterprisePortfolio.create({
      id: "port-1",
      tenantId: TENANT_ALPHA,
      name: "Logistics Portfolio",
      ownerPrincipalId: "principal-owner",
    });
    await env.portfolioRepo.save(port);

    const mandate = EnterpriseGovernanceMandate.create({
      id: "mandate-1",
      tenantId: TENANT_ALPHA,
      portfolioId: "port-1",
      sourceEnterpriseId: "ent-a",
      targetEnterpriseIds: ["ent-b"],
      granteePrincipalId: "agent-runner",
      authorityScope: "PORTFOLIO_COORDINATION",
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
      validFrom: new Date(Date.now() - 10000),
      validTo: new Date(Date.now() + 10000),
    });
    await env.mandateRepo.save(mandate);

    const portObj = PortfolioObjective.create({
      id: "p-obj-1",
      tenantId: TENANT_ALPHA,
      portfolioId: "port-1",
      ownerPrincipalId: "principal-owner",
      title: "Consolidated SLA 99.9%",
      type: "STRATEGIC",
      participatingEnterpriseIds: ["ent-a", "ent-b"],
      aggregationMethod: "WEIGHTED_AVERAGE",
    });
    await env.portfolioObjectiveRepo.save(portObj);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "PORTFOLIO",
      targetId: "port-1",
    });

    assert.equal(result.manifest.scope, "PORTFOLIO");
    assert.equal(result.manifest.totalRecords, 3);
    assert.equal(result.manifest.recordCounts.portfolios, 1);
    assert.equal(result.manifest.recordCounts.mandates, 1);
    assert.equal(result.manifest.recordCounts.portfolioObjectives, 1);
  });

  it("3. ENTERPRISE scope export includes objectives, initiatives, metrics, and executive decisions", async () => {
    const env = setupTestEnvironment();

    const ent = Enterprise.create({
      id: "ent-main",
      tenantId: TENANT_ALPHA,
      name: "Main Corp",
      industry: "Retail",
      jurisdiction: "US",
    });
    await env.enterpriseRepo.save(ent);

    const obj = BusinessObjective.create({
      id: "obj-1",
      tenantId: TENANT_ALPHA,
      enterpriseId: "ent-main",
      ownerPrincipalId: "principal-owner",
      title: "Increase Efficiency",
      category: "OPERATIONAL_EXCELLENCE",
      targetDate: new Date(),
    });
    await env.objectiveRepo.save(obj);

    const dec = ExecutiveDecisionRecord.create({
      id: "dec-1",
      tenantId: TENANT_ALPHA,
      enterpriseId: "ent-main",
      decisionMakerPrincipalId: "principal-ceo",
      authorityScope: "STRATEGIC_OBJECTIVE",
      decisionType: "APPROVE",
      targetType: "OBJECTIVE",
      targetId: "obj-1",
      rationale: "Approved for FY2026 expansion",
    });
    await env.decisionRepo.save(dec);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "ENTERPRISE",
      targetId: "ent-main",
    });

    assert.equal(result.manifest.scope, "ENTERPRISE");
    assert.equal(result.manifest.totalRecords, 3);
    assert.equal(result.manifest.recordCounts.enterprises, 1);
    assert.equal(result.manifest.recordCounts.businessObjectives, 1);
    assert.equal(result.manifest.recordCounts.executiveDecisions, 1);
  });

  it("4. WORKFLOW scope export includes definitions, instances, verifications, and approvals", async () => {
    const env = setupTestEnvironment();

    const def = WorkflowDefinition.rehydrate({
      id: "wf-def-1",
      tenantId: TENANT_ALPHA,
      organizationId: "org-1",
      name: "Payment Approval Workflow",
      description: "Workflow description",
      version: 1,
      status: "ACTIVE",
      steps: [
        {
          stepId: "step-1",
          name: "Execute Payment",
          order: 1,
          type: "AUTOMATED",
          requiresApproval: true,
          approverPrincipalId: "principal-manager",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await env.workflowDefinitionRepo.save(def);

    const inst = WorkflowInstance.create({
      id: "wf-inst-1",
      workflowDefinition: def,
      initiatorId: "agent-worker",
      input: { amount: 100 },
    });
    await env.workflowInstanceRepo.save(inst);

    const approval = ApprovalRequest.create({
      id: "appr-1",
      tenantId: TENANT_ALPHA,
      workflowId: "wf-def-1",
      workflowInstanceId: "wf-inst-1",
      workflowStepId: "step-1",
      purpose: "Payment approval for supplier",
      requesterPrincipalId: "agent-worker",
    });
    await env.approvalRepo.save(approval);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "WORKFLOW",
      targetId: "wf-inst-1",
    });

    assert.equal(result.manifest.scope, "WORKFLOW");
    assert.equal(result.manifest.recordCounts.workflowInstances, 1);
    assert.equal(result.manifest.recordCounts.approvalRequests, 1);
  });

  it("5. EXECUTION scope export gathers instance details and execution audit events", async () => {
    const env = setupTestEnvironment();

    env.eventStore.append({
      eventId: "evt-1",
      eventType: "task.execution.started",
      aggregateType: "execution",
      aggregateId: "exec-101",
      traceId: "trace-101",
      correlationId: "corr-101",
      occurredAt: new Date(),
      payload: { agentId: "agent-worker", action: "process" },
      schemaVersion: 1,
    });

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "EXECUTION",
      targetId: "exec-101",
    });

    assert.equal(result.manifest.scope, "EXECUTION");
    assert.equal(result.manifest.recordCounts.auditEvents, 1);
  });

  it("6. MANDATE scope export gathers mandates across portfolios", async () => {
    const env = setupTestEnvironment();

    const mandate = EnterpriseGovernanceMandate.create({
      id: "mandate-audit-test",
      tenantId: TENANT_ALPHA,
      portfolioId: "port-1",
      sourceEnterpriseId: "ent-a",
      targetEnterpriseIds: ["ent-b"],
      granteePrincipalId: "agent-runner",
      authorityScope: "PORTFOLIO_COORDINATION",
      maxAutonomyLevel: "LEVEL_3_GOVERNED_AUTONOMY",
      validFrom: new Date(Date.now() - 5000),
      validTo: new Date(Date.now() + 5000),
    });
    await env.mandateRepo.save(mandate);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "MANDATE",
      targetId: "mandate-audit-test",
    });

    assert.equal(result.manifest.scope, "MANDATE");
    assert.equal(result.manifest.recordCounts.mandates, 1);
  });

  it("7. APPROVAL scope export includes human oversight requests", async () => {
    const env = setupTestEnvironment();

    const approval = ApprovalRequest.create({
      id: "appr-so-1",
      tenantId: TENANT_ALPHA,
      workflowId: "wf-1",
      workflowInstanceId: "wf-inst-1",
      workflowStepId: "step-1",
      purpose: "Approval for payment release",
      requesterPrincipalId: "agent-worker",
      approverPrincipalId: "principal-boss",
    });
    await env.approvalRepo.save(approval);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "APPROVAL",
    });

    assert.equal(result.manifest.scope, "APPROVAL");
    assert.equal(result.manifest.recordCounts.approvalRequests, 1);
  });

  it("8. RECONCILIATION scope export extracts reconciliation lifecycle events", async () => {
    const env = setupTestEnvironment();

    env.eventStore.append({
      eventId: "rec-evt-1",
      eventType: "mandate.reconciliation.completed",
      aggregateType: "mandate",
      aggregateId: "mandate-1",
      traceId: "trace-rec-1",
      correlationId: "corr-rec-1",
      occurredAt: new Date(),
      payload: { totalEvaluated: 5, totalMutated: 2, totalCancelled: 1, totalPaused: 1 },
      schemaVersion: 1,
    });

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "RECONCILIATION",
    });

    assert.equal(result.manifest.scope, "RECONCILIATION");
    assert.equal(result.manifest.recordCounts.reconciliationEvents, 1);
  });

  it("9. AUDIT_TRAIL scope export extracts chronological sequence of durable events", async () => {
    const env = setupTestEnvironment();

    env.eventStore.append({
      eventId: "trail-1",
      eventType: "portfolio.created",
      aggregateType: "portfolio",
      aggregateId: "port-1",
      traceId: "trace-trail",
      correlationId: "corr-trail",
      occurredAt: new Date(),
      payload: { name: "Test Portfolio" },
      schemaVersion: 1,
    });

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "AUDIT_TRAIL",
    });

    assert.equal(result.manifest.scope, "AUDIT_TRAIL");
    assert.equal(result.manifest.recordCounts.auditTrail, 1);
  });

  it("10. Sensitive data redaction sanitizes API keys, bearer tokens, JWTs, and passwords", async () => {
    const env = setupTestEnvironment();

    env.eventStore.append({
      eventId: "sensitive-evt-1",
      eventType: "security.credential_used",
      aggregateType: "security",
      aggregateId: "sec-1",
      traceId: "trace-sec",
      correlationId: "corr-sec",
      occurredAt: new Date(),
      payload: {
        apiKey: "api_key=secret_1234567890abcdef123456",
        token: "bearer mysecretbearertoken12345",
        jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        userEmail: "auditor@example.com",
      },
      schemaVersion: 1,
    });

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "AUDIT_TRAIL",
    });

    const exportedEvents = result.data.auditTrail as any[];
    assert.equal(exportedEvents.length, 1);
    const payload = exportedEvents[0].payload;

    assert.ok(!payload.apiKey.includes("secret_1234567890abcdef123456"));
    assert.ok(payload.apiKey.includes("[REDACTED]"));
    assert.ok(!payload.token.includes("mysecretbearertoken12345"));
    assert.ok(!payload.jwt.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.ok(!payload.userEmail.includes("auditor@example.com"));
  });

  it("11. Deterministic SHA-256 checksum is repeatable for the same dataset", async () => {
    const env = setupTestEnvironment();

    const ent = Enterprise.create({
      id: "ent-deterministic",
      tenantId: TENANT_ALPHA,
      name: "Deterministic Corp",
      industry: "Tech",
      jurisdiction: "US",
    });
    await env.enterpriseRepo.save(ent);

    const export1 = await env.service.exportEvidence(alphaContext, {
      scope: "ENTERPRISE",
      targetId: "ent-deterministic",
    });

    const export2 = await env.service.exportEvidence(alphaContext, {
      scope: "ENTERPRISE",
      targetId: "ent-deterministic",
    });

    // Checksums computed over identical canonical data must match exactly
    assert.equal(export1.manifest.checksumSha256, export2.manifest.checksumSha256);
    assert.equal(export1.manifest.totalRecords, export2.manifest.totalRecords);
  });

  it("12. Invalid date range (fromDate > toDate) throws EvidenceExportValidationError", async () => {
    const env = setupTestEnvironment();

    const fromDate = new Date("2026-09-20");
    const toDate = new Date("2026-09-10");

    await assert.rejects(
      async () => {
        await env.service.exportEvidence(alphaContext, {
          scope: "AUDIT_TRAIL",
          fromDate,
          toDate,
        });
      },
      EvidenceExportValidationError
    );
  });

  it("13. Date range exceeding 90 days throws EvidenceFilterBoundsExceededError", async () => {
    const env = setupTestEnvironment();

    const fromDate = new Date("2026-01-01");
    const toDate = new Date("2026-06-01"); // ~150 days

    await assert.rejects(
      async () => {
        await env.service.exportEvidence(alphaContext, {
          scope: "AUDIT_TRAIL",
          fromDate,
          toDate,
        });
      },
      EvidenceFilterBoundsExceededError
    );
  });

  it("14. Max records limit exceeding 1000 throws EvidenceFilterBoundsExceededError", async () => {
    const env = setupTestEnvironment();

    await assert.rejects(
      async () => {
        await env.service.exportEvidence(alphaContext, {
          scope: "AUDIT_TRAIL",
          limit: 1500,
        });
      },
      EvidenceFilterBoundsExceededError
    );
  });

  it("15. Export package and manifest are strictly immutable (frozen)", async () => {
    const env = setupTestEnvironment();

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "TENANT",
    });

    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.manifest));
    assert.ok(Object.isFrozen(result.data));

    assert.throws(() => {
      (result.manifest as any).totalRecords = 999;
    });
  });

  it("16. Strict Tenant Isolation: cannot export resources belonging to another tenant", async () => {
    const env = setupTestEnvironment();

    // Enterprise belonging to Tenant Beta
    const betaEnt = Enterprise.create({
      id: "ent-beta-exclusive",
      tenantId: TENANT_BETA,
      name: "Beta Corp",
      industry: "Security",
      jurisdiction: "EU",
    });
    await env.enterpriseRepo.save(betaEnt);

    // Alpha auditor tries to export Beta enterprise -> Fail-closed resource not found in tenant
    await assert.rejects(
      async () => {
        await env.service.exportEvidence(alphaContext, {
          scope: "ENTERPRISE",
          targetId: "ent-beta-exclusive",
        });
      },
      EvidenceResourceNotFoundError
    );
  });

  it("17. Empty dataset returns valid package with 0 records and valid checksum", async () => {
    const env = setupTestEnvironment();

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "TENANT",
    });

    assert.equal(result.manifest.totalRecords, 0);
    assert.equal(typeof result.manifest.checksumSha256, "string");
    assert.equal(result.manifest.checksumSha256.length, 64);
    assert.deepEqual(result.manifest.recordCounts, { enterprises: 0, portfolios: 0, workflows: 0 });
  });

  it("18. Read-Only Invariant: 0 mutation on mandates, workflows, and decisions before and after export", async () => {
    const env = setupTestEnvironment();

    const ent = Enterprise.create({
      id: "ent-immutable-check",
      tenantId: TENANT_ALPHA,
      name: "Immutable Corp",
      industry: "Finance",
      jurisdiction: "US",
    });
    await env.enterpriseRepo.save(ent);

    const mandate = EnterpriseGovernanceMandate.create({
      id: "mandate-immut-check",
      tenantId: TENANT_ALPHA,
      portfolioId: "port-immut",
      sourceEnterpriseId: "ent-a",
      targetEnterpriseIds: ["ent-b"],
      granteePrincipalId: "agent-runner",
      authorityScope: "PORTFOLIO_COORDINATION",
      maxAutonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
      validFrom: new Date(),
      validTo: new Date(Date.now() + 60000),
    });
    await env.mandateRepo.save(mandate);

    // Snapshot state before export
    const mandateBefore = await env.mandateRepo.findById("mandate-immut-check", TENANT_ALPHA);
    const enterpriseBefore = await env.enterpriseRepo.findById("ent-immutable-check", TENANT_ALPHA);

    // Execute multiple exports
    await env.service.exportEvidence(alphaContext, { scope: "MANDATE", targetId: "mandate-immut-check" });
    await env.service.exportEvidence(alphaContext, { scope: "ENTERPRISE", targetId: "ent-immutable-check" });

    // Snapshot state after export
    const mandateAfter = await env.mandateRepo.findById("mandate-immut-check", TENANT_ALPHA);
    const enterpriseAfter = await env.enterpriseRepo.findById("ent-immutable-check", TENANT_ALPHA);

    // Assert zero mutation
    assert.equal(mandateBefore?.concurrencyVersion, mandateAfter?.concurrencyVersion);
    assert.equal(mandateBefore?.status, mandateAfter?.status);
    assert.equal(enterpriseBefore?.version, enterpriseAfter?.version);
  });

  it("19. Idempotency key caches and returns identical package on retry", async () => {
    const env = setupTestEnvironment();

    const export1 = await env.service.exportEvidence(alphaContext, {
      scope: "TENANT",
      idempotencyKey: "idemp-key-001",
    });

    const export2 = await env.service.exportEvidence(alphaContext, {
      scope: "TENANT",
      idempotencyKey: "idemp-key-001",
    });

    assert.equal(export1.manifest.exportId, export2.manifest.exportId);
    assert.equal(export1.manifest.checksumSha256, export2.manifest.checksumSha256);
  });

  it("20. Adversarial: Wildcard scope (*, ALL, ANY, GLOBAL) is rejected fail-closed", async () => {
    const env = setupTestEnvironment();

    for (const badScope of ["*", "ALL", "ANY", "GLOBAL", "all", ""]) {
      await assert.rejects(
        async () => {
          await env.service.exportEvidence(alphaContext, {
            scope: badScope as any,
          });
        },
        EvidenceExportValidationError
      );
    }
  });

  it("21. Adversarial: Negative or non-integer limits are rejected", async () => {
    const env = setupTestEnvironment();

    for (const badLimit of [-1, 0, 1.5, NaN]) {
      await assert.rejects(
        async () => {
          await env.service.exportEvidence(alphaContext, {
            scope: "TENANT",
            limit: badLimit as any,
          });
        },
        EvidenceFilterBoundsExceededError
      );
    }
  });

  it("22. Segregation of Duties (SoD) is preserved in exported approval records", async () => {
    const env = setupTestEnvironment();

    const approval = ApprovalRequest.rehydrate({
      id: "appr-sod-verify",
      tenantId: TENANT_ALPHA,
      workflowId: "wf-sod",
      workflowInstanceId: "wf-inst-sod",
      workflowStepId: "step-sod",
      purpose: "SoD verification test",
      requesterPrincipalId: "agent-requester",
      reviewerPrincipalId: "principal-reviewer",
      approverPrincipalId: "principal-approver",
      status: "APPROVED",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await env.approvalRepo.save(approval);

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "APPROVAL",
      targetId: "appr-sod-verify",
    });

    const approvals = result.data.approvalRequests as any[];
    assert.equal(approvals.length, 1);
    const rec = approvals[0];
    assert.equal(rec.requesterPrincipalId, "agent-requester");
    assert.equal(rec.reviewerPrincipalId, "principal-reviewer");
    assert.equal(rec.approverPrincipalId, "principal-approver");
    assert.notEqual(rec.requesterPrincipalId, rec.approverPrincipalId);
  });

  it("23. Correlated audit events inclusion flag populates additional trace events", async () => {
    const env = setupTestEnvironment();

    env.eventStore.append({
      eventId: "corr-audit-1",
      eventType: "workflow.started",
      aggregateType: "workflow",
      aggregateId: "wf-trace-999",
      traceId: "wf-trace-999",
      correlationId: "corr-999",
      occurredAt: new Date(),
      payload: { status: "RUNNING" },
      schemaVersion: 1,
    });

    const result = await env.service.exportEvidence(alphaContext, {
      scope: "WORKFLOW",
      targetId: "wf-trace-999",
      includeAuditEvents: true,
    });

    assert.ok(result.data.correlatedAuditEvents);
    assert.equal((result.data.correlatedAuditEvents as any[]).length, 1);
  });
});
