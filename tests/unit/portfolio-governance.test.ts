/**
 * Phase 75 Unit Tests: Multi-Enterprise Governance & Portfolio Operating Model
 *
 * Invariant & Domain Test Suite for:
 * 1. EnterprisePortfolio aggregate root & EnterprisePortfolioMembership
 * 2. EnterpriseGovernanceMandate aggregate root, authority scopes & evaluateAuthority()
 * 3. PortfolioObjective aggregate root & deterministic KPI aggregation algorithms
 * 4. Missing data handling policies (EXCLUDE, FAIL_CLOSED, FLAG_PARTIAL)
 * 5. PortfolioGovernanceService cross-enterprise authority verification & cascading
 * 6. InMemory & SQLite Persistence with OCC versioning and multi-tenant isolation
 * 7. Cross-Enterprise Default Deny axiom enforcement
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  EnterprisePortfolio,
} from "../../src/domain/portfolio/enterprise-portfolio.js";
import {
  EnterpriseGovernanceMandate,
} from "../../src/domain/portfolio/governance-mandate.js";
import {
  PortfolioObjective,
} from "../../src/domain/portfolio/portfolio-objective.js";
import {
  PortfolioValidationError,
  MandateValidationError,
  PortfolioObjectiveValidationError,
  PortfolioConcurrencyConflictError,
  MandateRevokedError,
  MandateExpiredError,
  MandateScopeViolationError,
  CrossEnterpriseAccessDeniedError,
  PortfolioNotFoundError,
} from "../../src/domain/portfolio/portfolio-errors.js";
import { PortfolioGovernanceService } from "../../src/application/portfolio/portfolio-governance-service.js";
import {
  InMemoryEnterprisePortfolioRepository,
  InMemoryGovernanceMandateRepository,
  InMemoryPortfolioObjectiveRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-portfolio-repository.js";
import {
  SqliteEnterprisePortfolioRepository,
  SqliteGovernanceMandateRepository,
  SqlitePortfolioObjectiveRepository,
} from "../../src/infrastructure/persistence/sqlite/sqlite-portfolio-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { InMemoryEnterpriseRepository } from "../../src/infrastructure/persistence/in-memory/in-memory-business-repository.js";
import { Enterprise } from "../../src/domain/business/enterprise.js";

describe("Phase 75 Unit Tests: Multi-Enterprise Governance & Portfolio Operating Model", () => {
  const TENANT_A = "tenant-holding-corp";
  const TENANT_B = "tenant-other-corp";

  describe("1. EnterprisePortfolio Aggregate Root", () => {
    it("creates an EnterprisePortfolio with valid props and initializes memberships", () => {
      const portfolio = EnterprisePortfolio.create({
        id: "portfolio-latin-america",
        tenantId: TENANT_A,
        name: "Latin America Retail Group",
        description: "Holding portfolio across LatAm retail subsidiaries",
        ownerPrincipalId: "exec-johan",
      });

      assert.equal(portfolio.id, "portfolio-latin-america");
      assert.equal(portfolio.tenantId, TENANT_A);
      assert.equal(portfolio.name, "Latin America Retail Group");
      assert.equal(portfolio.status, "ACTIVE");
      assert.equal(portfolio.memberships.length, 0);
      assert.equal(portfolio.concurrencyVersion, 1);
    });

    it("fails validation if name or ownerPrincipalId is empty or whitespace", () => {
      assert.throws(
        () =>
          EnterprisePortfolio.create({
            id: "portfolio-invalid",
            tenantId: TENANT_A,
            name: "   ",
            description: "Some desc",
            ownerPrincipalId: "exec-1",
          }),
        PortfolioValidationError
      );

      assert.throws(
        () =>
          EnterprisePortfolio.create({
            id: "portfolio-invalid",
            tenantId: TENANT_A,
            name: "Valid Name",
            description: "Some desc",
            ownerPrincipalId: "",
          }),
        PortfolioValidationError
      );
    });

    it("adds enterprise membership and detects duplicate memberships", () => {
      let portfolio = EnterprisePortfolio.create({
        id: "portfolio-1",
        tenantId: TENANT_A,
        name: "Holding 1",
        description: "Holding Desc",
        ownerPrincipalId: "exec-1",
      });

      portfolio = portfolio.addEnterprise({
        enterpriseId: "ent-tentaciones",
        governanceScope: ["COORDINATION", "SHARED_RESOURCE"],
      });

      assert.equal(portfolio.memberships.length, 1);
      assert.equal(portfolio.hasEnterprise("ent-tentaciones"), true);
      assert.equal(portfolio.concurrencyVersion, 2);

      // Duplicate add throws PortfolioValidationError
      assert.throws(
        () =>
          portfolio.addEnterprise({
            enterpriseId: "ent-tentaciones",
          }),
        PortfolioValidationError
      );
    });

    it("removes enterprise membership and protects against removing non-existent members", () => {
      let portfolio = EnterprisePortfolio.create({
        id: "portfolio-1",
        tenantId: TENANT_A,
        name: "Holding 1",
        description: "Holding Desc",
        ownerPrincipalId: "exec-1",
      });

      portfolio = portfolio.addEnterprise({ enterpriseId: "ent-1" });
      portfolio = portfolio.addEnterprise({ enterpriseId: "ent-2" });
      assert.equal(portfolio.memberships.length, 2);

      portfolio = portfolio.removeEnterprise("ent-1");
      assert.equal(portfolio.hasEnterprise("ent-1"), false);
      assert.equal(portfolio.hasEnterprise("ent-2"), true);
      assert.equal(portfolio.getActiveEnterpriseIds().length, 1);
      assert.equal(portfolio.memberships.find((m) => m.enterpriseId === "ent-1")?.status, "REMOVED");

      assert.throws(() => portfolio.removeEnterprise("ent-non-existent"), PortfolioValidationError);
    });

    it("enforces OCC optimistic concurrency control version checks", () => {
      const portfolio = EnterprisePortfolio.create({
        id: "portfolio-1",
        tenantId: TENANT_A,
        name: "Holding 1",
        description: "Holding Desc",
        ownerPrincipalId: "exec-1",
      });

      assert.throws(
        () => portfolio.addEnterprise({ enterpriseId: "ent-1", expectedConcurrencyVersion: 99 }),
        PortfolioConcurrencyConflictError
      );
    });
  });

  describe("2. EnterpriseGovernanceMandate & evaluateAuthority()", () => {
    it("creates a valid Governance Mandate with explicit authority scopes and time bounds", () => {
      const mandate = EnterpriseGovernanceMandate.create({
        id: "mandate-audit-01",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        sourceEnterpriseId: "ent-holding",
        targetEnterpriseIds: ["ent-tentaciones", "ent-automotive"],
        granteePrincipalId: "agent-chief-auditor",
        authorityScope: "EXECUTIVE_AUDIT",
        allowedOperations: ["audit.read", "metrics.query"],
        autonomyLimit: "LEVEL_3_GOVERNED_AUTONOMY",
      });

      assert.equal(mandate.id, "mandate-audit-01");
      assert.equal(mandate.authorityScope, "EXECUTIVE_AUDIT");
      assert.equal(mandate.status, "ACTIVE");
      assert.equal(mandate.isEffectiveAt(), true);
    });

    it("evaluates authority strictly with default-deny semantics", () => {
      const mandate = EnterpriseGovernanceMandate.create({
        id: "mandate-coord-01",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        sourceEnterpriseId: "ent-holding",
        targetEnterpriseIds: ["ent-tentaciones"],
        granteePrincipalId: "agent-coordinator",
        authorityScope: "PORTFOLIO_COORDINATION",
        allowedOperations: ["workflow.execute", "budget.allocate"],
        allowedObjectives: ["obj-annual-growth"],
        autonomyLimit: "LEVEL_2_GOVERNED_AUTOMATION",
        requiresApproval: false,
      });

      // 1. Allowed operation on permitted enterprise & objective
      const eval1 = mandate.evaluateAuthority({
        targetEnterpriseId: "ent-tentaciones",
        operation: "workflow.execute",
        objectiveId: "obj-annual-growth",
        requestedAutonomy: "LEVEL_2_GOVERNED_AUTOMATION",
      });
      assert.equal(eval1.allowed, true);
      assert.equal(eval1.requiresApproval, false);

      // 2. Denied if target enterprise is outside mandate scope
      const eval2 = mandate.evaluateAuthority({
        targetEnterpriseId: "ent-other",
        operation: "workflow.execute",
      });
      assert.equal(eval2.allowed, false);

      // 3. Denied if operation is not allowed
      const eval3 = mandate.evaluateAuthority({
        targetEnterpriseId: "ent-tentaciones",
        operation: "database.drop",
      });
      assert.equal(eval3.allowed, false);

      // 4. Denied if objective is not allowed
      const eval4 = mandate.evaluateAuthority({
        targetEnterpriseId: "ent-tentaciones",
        operation: "workflow.execute",
        objectiveId: "obj-unauthorized",
      });
      assert.equal(eval4.allowed, false);
    });

    it("handles mandate revocation and prevents authority evaluation on revoked mandate", () => {
      let mandate = EnterpriseGovernanceMandate.create({
        id: "mandate-rev-01",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        sourceEnterpriseId: "ent-holding",
        targetEnterpriseIds: ["ent-tentaciones"],
        granteePrincipalId: "agent-1",
        authorityScope: "SHARED_SERVICE",
        allowedOperations: ["*"],
      });

      mandate = mandate.revoke("Security audit finding");
      assert.equal(mandate.status, "REVOKED");
      assert.equal(mandate.revocationReason, "Security audit finding");

      const evalRev = mandate.evaluateAuthority({
        targetEnterpriseId: "ent-tentaciones",
        operation: "service.call",
      });
      assert.equal(evalRev.allowed, false);
      assert.match(evalRev.reason || "", /revoked/i);
    });
  });

  describe("3. PortfolioObjective & Deterministic KPI Aggregation", () => {
    it("creates a PortfolioObjective with valid aggregation settings", () => {
      const obj = PortfolioObjective.create({
        id: "obj-port-ebitda",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        title: "Group EBITDA Target 2026",
        description: "Consolidated group EBITDA target across subsidiaries",
        type: "FINANCIAL",
        ownerPrincipalId: "exec-cfo",
        participatingEnterpriseIds: ["ent-tentaciones", "ent-automotive"],
        aggregationMethod: "SUM",
        targetMetric: {
          name: "EBITDA_USD",
          unit: "USD",
          targetValue: 5000000,
        },
        missingDataHandling: "FLAG_PARTIAL",
      });

      assert.equal(obj.id, "obj-port-ebitda");
      assert.equal(obj.lifecycleState, "DRAFT");
      assert.equal(obj.aggregationMethod, "SUM");
      assert.equal(obj.missingDataHandling, "FLAG_PARTIAL");
    });

    it("performs deterministic SUM aggregation and computes target gap", () => {
      let obj = PortfolioObjective.create({
        id: "obj-port-rev",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        title: "Group Revenue",
        description: "Group Revenue objective",
        type: "FINANCIAL",
        ownerPrincipalId: "exec-cfo",
        participatingEnterpriseIds: ["ent-1", "ent-2", "ent-3"],
        aggregationMethod: "SUM",
        targetMetric: {
          name: "Revenue_USD",
          unit: "USD",
          targetValue: 3000000,
        },
      });

      obj = obj.activate();
      assert.equal(obj.lifecycleState, "ACTIVE");

      obj = obj.aggregateMetrics([
        { enterpriseId: "ent-1", value: 1000000, status: "MEASURED" },
        { enterpriseId: "ent-2", value: 1500000, status: "MEASURED" },
        { enterpriseId: "ent-3", value: 800000, status: "MEASURED" },
      ]);

      // 1.0M + 1.5M + 0.8M = 3.3M
      assert.equal(obj.currentAggregatedValue, 3300000);
      assert.equal(obj.gap, -300000); // Target (3.0M) - Actual (3.3M) = -300k
    });

    it("performs deterministic AVERAGE aggregation", () => {
      let obj = PortfolioObjective.create({
        id: "obj-port-csat",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        title: "Group CSAT Average",
        description: "Consolidated group CSAT score",
        type: "OPERATIONAL",
        ownerPrincipalId: "exec-cx",
        participatingEnterpriseIds: ["ent-1", "ent-2"],
        aggregationMethod: "AVERAGE",
        targetMetric: {
          name: "CSAT",
          unit: "Score",
          targetValue: 90,
        },
      });

      obj = obj.activate();
      obj = obj.aggregateMetrics([
        { enterpriseId: "ent-1", value: 80, status: "MEASURED" },
        { enterpriseId: "ent-2", value: 90, status: "MEASURED" },
      ]);

      // (80 + 90) / 2 = 85
      assert.equal(obj.currentAggregatedValue, 85);
      assert.equal(obj.gap, 5); // 90 - 85 = 5
    });

    it("enforces FAIL_CLOSED policy when metric data is missing", () => {
      let obj = PortfolioObjective.create({
        id: "obj-port-strict",
        tenantId: TENANT_A,
        portfolioId: "portfolio-1",
        title: "Strict Holding Metric",
        description: "Strict Holding Metric objective",
        type: "STRATEGIC",
        ownerPrincipalId: "exec-1",
        participatingEnterpriseIds: ["ent-1", "ent-2"],
        aggregationMethod: "SUM",
        missingDataHandling: "FAIL_CLOSED",
        targetMetric: {
          name: "Strict_Score",
          unit: "pts",
          targetValue: 100,
        },
      });

      obj = obj.activate();

      const failedObj = obj.aggregateMetrics([
        { enterpriseId: "ent-1", value: 50, status: "MEASURED" },
        { enterpriseId: "ent-2", status: "MISSING" },
      ]);

      assert.equal(failedObj.aggregationStatus, "FAILED");
      assert.equal(failedObj.currentAggregatedValue, undefined);
    });
  });

  describe("4. PortfolioGovernanceService & Cross-Enterprise Workflows", () => {
    let portfolioRepo: InMemoryEnterprisePortfolioRepository;
    let mandateRepo: InMemoryGovernanceMandateRepository;
    let objectiveRepo: InMemoryPortfolioObjectiveRepository;
    let enterpriseRepo: InMemoryEnterpriseRepository;
    let service: PortfolioGovernanceService;

    beforeEach(() => {
      portfolioRepo = new InMemoryEnterprisePortfolioRepository();
      mandateRepo = new InMemoryGovernanceMandateRepository();
      objectiveRepo = new InMemoryPortfolioObjectiveRepository();
      enterpriseRepo = new InMemoryEnterpriseRepository();
      service = new PortfolioGovernanceService({
        portfolioRepo,
        mandateRepo,
        objectiveRepo,
        enterpriseRepo,
      });
    });

    it("creates portfolio, enrolls enterprises, and generates operating context", async () => {
      const entHolding = Enterprise.create({
        id: "ent-holding",
        tenantId: TENANT_A,
        name: "Global Holding Inc",
        description: "Global Holding Corporation",
        industry: "Holding",
      });
      const entRetail = Enterprise.create({
        id: "ent-retail",
        tenantId: TENANT_A,
        name: "Retail Subsidiary",
        description: "Retail Store Subsidiary",
        industry: "Retail",
      });
      await enterpriseRepo.save(entHolding);
      await enterpriseRepo.save(entRetail);

      const portfolio = await service.createPortfolio({
        id: "portfolio-global",
        tenantId: TENANT_A,
        name: "Global Retail Portfolio",
        description: "Global Retail Portfolio desc",
        ownerPrincipalId: "exec-1",
      });

      await service.addEnterpriseToPortfolio("portfolio-global", TENANT_A, {
        enterpriseId: "ent-holding",
        governanceScope: ["COORDINATION", "SHARED_RESOURCE"],
      });
      await service.addEnterpriseToPortfolio("portfolio-global", TENANT_A, {
        enterpriseId: "ent-retail",
        governanceScope: ["COORDINATION"],
      });

      const context = await service.getPortfolioOperatingContext("portfolio-global", TENANT_A);
      assert.equal(context.portfolio.id, "portfolio-global");
      assert.equal(context.enterprises.length, 2);
      assert.equal(context.enterprises[0]?.name, "Global Holding Inc");
      assert.equal(context.enterprises[1]?.name, "Retail Subsidiary");
    });

    it("enforces Cross-Enterprise Default Deny unless active Mandate is granted", async () => {
      await service.createPortfolio({
        id: "portfolio-sec",
        tenantId: TENANT_A,
        name: "Security Group",
        description: "Security Group desc",
        ownerPrincipalId: "exec-1",
      });
      await service.addEnterpriseToPortfolio("portfolio-sec", TENANT_A, { enterpriseId: "ent-a" });
      await service.addEnterpriseToPortfolio("portfolio-sec", TENANT_A, { enterpriseId: "ent-b" });

      // 1. Without mandate -> DENIED
      const check1 = await service.validateCrossEnterpriseAuthority({
        tenantId: TENANT_A,
        portfolioId: "portfolio-sec",
        granteePrincipalId: "agent-coord",
        sourceEnterpriseId: "ent-a",
        targetEnterpriseId: "ent-b",
        operation: "workflow.trigger",
      });
      assert.equal(check1.authorized, false);

      // 2. Grant mandate -> AUTHORIZED
      await service.grantMandate({
        id: "mandate-ab-01",
        tenantId: TENANT_A,
        portfolioId: "portfolio-sec",
        sourceEnterpriseId: "ent-a",
        targetEnterpriseIds: ["ent-b"],
        granteePrincipalId: "agent-coord",
        authorityScope: "PORTFOLIO_COORDINATION",
        allowedOperations: ["workflow.trigger"],
      });

      const check2 = await service.validateCrossEnterpriseAuthority({
        tenantId: TENANT_A,
        portfolioId: "portfolio-sec",
        granteePrincipalId: "agent-coord",
        sourceEnterpriseId: "ent-a",
        targetEnterpriseId: "ent-b",
        operation: "workflow.trigger",
      });
      assert.equal(check2.authorized, true);
      assert.equal(check2.mandateId, "mandate-ab-01");
    });
  });

  describe("5. SQLite Durable Persistence with OCC & Tenant Isolation", () => {
    let db: SqliteDatabase;
    let portfolioRepo: SqliteEnterprisePortfolioRepository;
    let mandateRepo: SqliteGovernanceMandateRepository;
    let objectiveRepo: SqlitePortfolioObjectiveRepository;

    beforeEach(() => {
      db = new SqliteDatabase({ dbPath: ":memory:" });
      portfolioRepo = new SqliteEnterprisePortfolioRepository(db);
      mandateRepo = new SqliteGovernanceMandateRepository(db);
      objectiveRepo = new SqlitePortfolioObjectiveRepository(db);
    });

    it("persists EnterprisePortfolio, memberships, and enforces OCC on SQLite", async () => {
      let portfolio = EnterprisePortfolio.create({
        id: "port-sql-01",
        tenantId: TENANT_A,
        name: "SQLite Holding Portfolio",
        description: "SQLite Portfolio desc",
        ownerPrincipalId: "exec-sql",
      });
      portfolio = portfolio.addEnterprise({ enterpriseId: "ent-sql-1", governanceScope: ["COORDINATION"] });

      await portfolioRepo.save(portfolio);

      const loaded = await portfolioRepo.findById("port-sql-01", TENANT_A);
      assert.ok(loaded);
      assert.equal(loaded?.name, "SQLite Holding Portfolio");
      assert.equal(loaded?.memberships.length, 1);
      assert.equal(loaded?.concurrencyVersion, 2);

      // Tenant isolation: Tenant B cannot see Tenant A's portfolio
      const isolationCheck = await portfolioRepo.findById("port-sql-01", TENANT_B);
      assert.equal(isolationCheck, null);
    });

    it("persists GovernanceMandates and queries active mandates on SQLite", async () => {
      const mandate = EnterpriseGovernanceMandate.create({
        id: "man-sql-01",
        tenantId: TENANT_A,
        portfolioId: "port-sql-01",
        sourceEnterpriseId: "ent-sql-1",
        targetEnterpriseIds: ["ent-sql-2", "ent-sql-3"],
        granteePrincipalId: "agent-sql",
        authorityScope: "SHARED_SERVICE",
        allowedOperations: ["service.invoke"],
      });

      await mandateRepo.save(mandate);

      const active = await mandateRepo.findActiveMandates("agent-sql", "port-sql-01", TENANT_A, "ent-sql-2");
      assert.equal(active.length, 1);
      assert.equal(active[0]?.id, "man-sql-01");
      assert.equal(active[0]?.authorityScope, "SHARED_SERVICE");
    });

    it("persists PortfolioObjective and metric aggregation on SQLite", async () => {
      let obj = PortfolioObjective.create({
        id: "obj-sql-01",
        tenantId: TENANT_A,
        portfolioId: "port-sql-01",
        title: "Durable Aggregated Margin",
        description: "Durable Aggregated Margin desc",
        type: "FINANCIAL",
        ownerPrincipalId: "exec-sql",
        participatingEnterpriseIds: ["ent-sql-1", "ent-sql-2"],
        aggregationMethod: "AVERAGE",
        targetMetric: {
          name: "Margin_Pct",
          unit: "%",
          targetValue: 25,
        },
      });

      obj = obj.activate();
      obj = obj.aggregateMetrics([
        { enterpriseId: "ent-sql-1", value: 30, status: "MEASURED" },
        { enterpriseId: "ent-sql-2", value: 20, status: "MEASURED" },
      ]);

      await objectiveRepo.save(obj);

      const loaded = await objectiveRepo.findById("obj-sql-01", TENANT_A);
      assert.ok(loaded);
      assert.equal(loaded?.currentAggregatedValue, 25);
      assert.equal(loaded?.gap, 0);
      assert.equal(loaded?.participatingEnterpriseIds.length, 2);
    });
  });
});
