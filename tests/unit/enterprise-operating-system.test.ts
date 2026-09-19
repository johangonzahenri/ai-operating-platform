/**
 * Phase 67 Unit Tests: AI Enterprise Operating System & Executive Governance Foundation
 * 
 * Invariant & Adversarial Test Suite for:
 * 1. Enterprise Aggregate Root & Mission/Vision/Tenancy
 * 2. BusinessObjective Lifecycle FSM & OCC Concurrency
 * 3. BusinessInitiative State Transitions & Solution/Workflow Alignment
 * 4. BusinessMetric Mandatory Ground-Truth Source & Deterministic Gap Calculation
 * 5. ExecutiveDecisionRecord Authority & Policy Gating Auditability
 * 6. AutonomyLevel Guardrails & High-Impact Action Gating
 * 7. EnterpriseOperatingService Aggregate Operating Context
 * 8. SQLite WAL Multi-Tenant Persistence & OCC Enforcement
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Enterprise } from "../../src/domain/business/enterprise.js";
import {
  BusinessObjective,
  BusinessObjectiveType,
  BusinessObjectiveLifecycleState,
} from "../../src/domain/business/business-objective.js";
import {
  BusinessInitiative,
  BusinessInitiativeLifecycleState,
} from "../../src/domain/business/business-initiative.js";
import {
  BusinessMetric,
  MetricPeriod,
  MetricStatus,
} from "../../src/domain/business/business-metric.js";
import {
  ExecutiveDecisionRecord,
  DecisionAuthorityScope,
  ExecutiveDecisionType,
  DecisionTargetType,
} from "../../src/domain/business/executive-decision-record.js";
import {
  AutonomyLevel,
  isHighImpactAction,
  requiresHumanOversight,
} from "../../src/domain/business/autonomy-level.js";
import {
  BusinessValidationError,
  EnterpriseNotFoundError,
  BusinessObjectiveNotFoundError,
  BusinessInitiativeNotFoundError,
  BusinessMetricValidationError,
  BusinessMetricNotFoundError,
  ExecutiveDecisionNotFoundError,
  InvalidBusinessLifecycleTransitionError,
  UnauthorizedExecutiveDecisionError,
  AutonomyRestrictionError,
  BusinessConcurrencyConflictError,
  BusinessTenantMismatchError,
} from "../../src/domain/business/business-errors.js";
import { EnterpriseOperatingService } from "../../src/application/business/enterprise-operating-service.js";
import {
  InMemoryEnterpriseRepository,
  InMemoryBusinessObjectiveRepository,
  InMemoryBusinessInitiativeRepository,
  InMemoryBusinessMetricRepository,
  InMemoryExecutiveDecisionRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-business-repository.js";
import {
  SqliteEnterpriseRepository,
  SqliteBusinessObjectiveRepository,
  SqliteBusinessInitiativeRepository,
  SqliteBusinessMetricRepository,
  SqliteExecutiveDecisionRepository,
} from "../../src/infrastructure/persistence/sqlite/sqlite-business-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";

describe("Phase 67: AI Enterprise Operating System Unit Tests", () => {
  const tenantId = "tenant-enterprise-01";
  const otherTenantId = "tenant-competitor-99";
  const principalId = "principal-ceo-executive";

  describe("Enterprise Aggregate Root", () => {
    it("creates a valid Enterprise aggregate in ACTIVE status", () => {
      const enterprise = Enterprise.create({
        id: "ent-tentaciones-01",
        tenantId,
        name: "Tentaciones Holding Corp",
        description: "Autonomous digital gastronomy & commerce enterprise",
        industry: "Food & Beverage / AI Commerce",
        vision: "Pioneer autonomous governed culinary retail at global scale",
        strategicMission: "Deliver personalized high-quality culinary experiences via verifiable AI agents",
      });

      assert.equal(enterprise.id, "ent-tentaciones-01");
      assert.equal(enterprise.tenantId, tenantId);
      assert.equal(enterprise.name, "Tentaciones Holding Corp");
      assert.equal(enterprise.status, "ACTIVE");
      assert.equal(enterprise.concurrencyVersion, 1);
    });

    it("rejects creation with empty or missing mandatory fields", () => {
      assert.throws(
        () =>
          Enterprise.create({
            id: "",
            tenantId,
            name: "Holding",
            description: "Desc",
            industry: "Retail",
            vision: "Vision",
            strategicMission: "Mission",
          }),
        BusinessValidationError
      );

      assert.throws(
        () =>
          Enterprise.create({
            id: "ent-1",
            tenantId: "",
            name: "Holding",
            description: "Desc",
            industry: "Retail",
            vision: "Vision",
            strategicMission: "Mission",
          }),
        BusinessValidationError
      );
    });

    it("updates enterprise profile and increments concurrency version", () => {
      const enterprise = Enterprise.create({
        id: "ent-tentaciones-01",
        tenantId,
        name: "Tentaciones Holding Corp",
        description: "Old description",
        industry: "Retail",
        vision: "Old vision",
        strategicMission: "Old mission",
      });

      const updated = enterprise.update({
        description: "Updated corporate description",
        vision: "New 2030 vision",
      });

      assert.equal(updated.description, "Updated corporate description");
      assert.equal(updated.vision, "New 2030 vision");
      assert.equal(updated.concurrencyVersion, 2);
    });
  });

  describe("BusinessObjective Lifecycle FSM & Strategic Alignment", () => {
    it("creates a strategic business objective in DRAFT status", () => {
      const objective = BusinessObjective.create({
        id: "obj-revenue-2026",
        enterpriseId: "ent-tentaciones-01",
        tenantId,
        title: "Achieve $50M ARR via Autonomous Branches",
        description: "Expand autonomous branches across 5 regional markets",
        type: "STRATEGIC",
        ownerPrincipalId: principalId,
        targetMetric: {
          name: "ARR",
          unit: "USD",
          targetValue: 50000000,
        },
        linkedInitiativeIds: ["init-branch-expansion"],
        linkedSolutionIds: ["solution-branch-ops"],
        linkedWorkflowIds: ["wf-daily-reconciliation"],
      });

      assert.equal(objective.id, "obj-revenue-2026");
      assert.equal(objective.lifecycleState, "DRAFT");
      assert.equal(objective.type, "STRATEGIC");
      assert.equal(objective.linkedInitiativeIds.length, 1);
      assert.equal(objective.concurrencyVersion, 1);
    });

    it("transitions objective through valid lifecycle states: DRAFT -> ACTIVE -> AT_RISK -> ACHIEVED -> ARCHIVED", () => {
      let objective = BusinessObjective.create({
        id: "obj-growth",
        enterpriseId: "ent-tentaciones-01",
        tenantId,
        title: "Customer NPS > 85",
        description: "Maintain superior customer satisfaction",
        type: "OPERATIONAL",
        ownerPrincipalId: principalId,
      });

      objective = objective.activate();
      assert.equal(objective.lifecycleState, "ACTIVE");
      assert.equal(objective.concurrencyVersion, 2);

      objective = objective.markAtRisk("Supply chain bottleneck in region B");
      assert.equal(objective.lifecycleState, "AT_RISK");
      assert.equal(objective.concurrencyVersion, 3);

      objective = objective.markAchieved();
      assert.equal(objective.lifecycleState, "ACHIEVED");
      assert.equal(objective.concurrencyVersion, 4);

      objective = objective.archive();
      assert.equal(objective.lifecycleState, "ARCHIVED");
      assert.equal(objective.concurrencyVersion, 5);
    });

    it("rejects invalid lifecycle transitions according to strict FSM", () => {
      const objective = BusinessObjective.create({
        id: "obj-growth-strict",
        enterpriseId: "ent-tentaciones-01",
        tenantId,
        title: "Objective",
        description: "Description",
        type: "TACTICAL",
        ownerPrincipalId: principalId,
      });

      // Cannot jump from DRAFT to ACHIEVED directly
      assert.throws(
        () => objective.markAchieved(),
        InvalidBusinessLifecycleTransitionError
      );

      // Cannot update an ARCHIVED objective
      const archived = objective.cancel().archive();
      assert.throws(
        () => archived.update({ title: "Cannot update archived" }),
        InvalidBusinessLifecycleTransitionError
      );
    });
  });

  describe("BusinessInitiative Lifecycle & Alignment", () => {
    it("creates an initiative in PLANNED status linked to objective and solutions", () => {
      const initiative = BusinessInitiative.create({
        id: "init-latam-expansion",
        enterpriseId: "ent-tentaciones-01",
        objectiveId: "obj-revenue-2026",
        tenantId,
        title: "Deploy Automated Ordering in 100 Stores",
        description: "Full rollout of autonomous ordering agents and verification pipelines",
        ownerPrincipalId: principalId,
        linkedSolutionIds: ["solution-order-kiosk"],
        linkedWorkflowIds: ["wf-order-intake"],
        expectedOutcome: "Reduce queue wait time by 75% and increase throughput by 40%",
      });

      assert.equal(initiative.id, "init-latam-expansion");
      assert.equal(initiative.lifecycleState, "PLANNED");
      assert.equal(initiative.linkedSolutionIds.includes("solution-order-kiosk"), true);
      assert.equal(initiative.concurrencyVersion, 1);
    });

    it("transitions initiative status correctly: PLANNED -> ACTIVE -> BLOCKED -> ACTIVE -> COMPLETED", () => {
      let init = BusinessInitiative.create({
        id: "init-pilot",
        enterpriseId: "ent-tentaciones-01",
        objectiveId: "obj-growth",
        tenantId,
        title: "Pilot Store 01",
        description: "First pilot deployment",
        ownerPrincipalId: principalId,
        expectedOutcome: "Pass verification with zero high-risk anomalies",
      });

      init = init.activate();
      assert.equal(init.lifecycleState, "ACTIVE");

      init = init.block("Waiting for regulatory compliance approval");
      assert.equal(init.lifecycleState, "BLOCKED");

      init = init.activate();
      assert.equal(init.lifecycleState, "ACTIVE");

      init = init.complete("Zero anomalies recorded");
      assert.equal(init.lifecycleState, "COMPLETED");
      assert.equal(init.actualOutcome, "Zero anomalies recorded");
    });

    it("rejects illegal transitions from COMPLETED or CANCELLED states", () => {
      const init = BusinessInitiative.create({
        id: "init-completed-fsm",
        enterpriseId: "ent-tentaciones-01",
        objectiveId: "obj-growth",
        tenantId,
        title: "Init FSM",
        description: "Testing terminal states",
        ownerPrincipalId: principalId,
        expectedOutcome: "Delivery",
      })
        .activate()
        .complete("Done");

      assert.throws(
        () => init.activate(),
        InvalidBusinessLifecycleTransitionError
      );
    });
  });

  describe("BusinessMetric Ground-Truth Source & Deterministic Gap Calculation", () => {
    it("creates a business metric with mandatory ground-truth source definition", () => {
      const metric = BusinessMetric.create({
        id: "metric-arr-01",
        enterpriseId: "ent-tentaciones-01",
        objectiveId: "obj-revenue-2026",
        tenantId,
        name: "Annual Recurring Revenue",
        unit: "USD",
        targetValue: 50000000,
        currentValue: 35000000,
        period: "DAILY",
        source: "BillingLedgerService:finance.arr.audited",
      });

      assert.equal(metric.id, "metric-arr-01");
      assert.equal(metric.targetValue, 50000000);
      assert.equal(metric.currentValue, 35000000);
      assert.equal(metric.gap, 15000000);
      assert.equal(metric.source, "BillingLedgerService:finance.arr.audited");
    });

    it("rejects metric creation when mandatory source is missing or empty", () => {
      assert.throws(
        () =>
          BusinessMetric.create({
            id: "metric-invalid-source",
            enterpriseId: "ent-1",
            objectiveId: "obj-1",
            tenantId,
            name: "Invalid Metric",
            unit: "points",
            targetValue: 100,
            source: "",
          }),
        BusinessMetricValidationError
      );
    });

    it("records ground-truth measurement and updates status deterministically", () => {
      let metric = BusinessMetric.create({
        id: "metric-csat-rate",
        enterpriseId: "ent-tentaciones-01",
        objectiveId: "obj-revenue-2026",
        tenantId,
        name: "Customer Satisfaction Rate",
        unit: "%",
        targetValue: 100,
        source: "FeedbackSubsystem:csat.score.average",
      });

      assert.equal(metric.status, "MISSING");

      // Record on-track measurement
      metric = metric.recordMeasurement({
        value: 100,
        source: "FeedbackSubsystem:csat.score.average",
      });
      assert.equal(metric.currentValue, 100);
      assert.equal(metric.gap, 0);
      assert.equal(metric.status, "ON_TRACK");

      // Record at-risk measurement (85%)
      metric = metric.recordMeasurement({
        value: 85,
        source: "FeedbackSubsystem:csat.score.average",
      });
      assert.equal(metric.currentValue, 85);
      assert.equal(metric.gap, 15);
      assert.equal(metric.status, "AT_RISK");

      // Record off-track measurement (50%)
      metric = metric.recordMeasurement({
        value: 50,
        source: "FeedbackSubsystem:csat.score.average",
      });
      assert.equal(metric.currentValue, 50);
      assert.equal(metric.gap, 50);
      assert.equal(metric.status, "OFF_TRACK");
    });
  });

  describe("ExecutiveDecisionRecord & Governance Auditing", () => {
    it("records a governed executive decision with authority and policy reference", () => {
      const decision = ExecutiveDecisionRecord.create({
        id: "dec-reallocate-budget-01",
        enterpriseId: "ent-tentaciones-01",
        tenantId,
        decisionMakerPrincipalId: principalId,
        authorityScope: "BUDGET_ADJUSTMENT",
        decisionType: "APPROVE",
        targetType: "BUDGET",
        targetId: "budget-logistics-team",
        rationale: "Mitigate delivery latency KPI off-track status in Region B",
        policyContext: "policy-budget-reallocation-threshold",
        resultingAction: "Transferred $200k compute quota from marketing to logistics team",
      });

      assert.equal(decision.id, "dec-reallocate-budget-01");
      assert.equal(decision.decisionType, "APPROVE");
      assert.equal(decision.authorityScope, "BUDGET_ADJUSTMENT");
      assert.equal(decision.policyContext, "policy-budget-reallocation-threshold");
    });

    it("rejects executive decision creation missing mandatory governance provenance", () => {
      assert.throws(
        () =>
          ExecutiveDecisionRecord.create({
            id: "dec-invalid",
            enterpriseId: "ent-1",
            tenantId,
            decisionMakerPrincipalId: "",
            authorityScope: "POLICY_EXCEPTION",
            decisionType: "OVERRIDE",
            targetType: "POLICY",
            targetId: "policy-1",
            rationale: "Because AI decided so",
          }),
        UnauthorizedExecutiveDecisionError
      );
    });
  });

  describe("AutonomyLevel Guardrails & High-Impact Action Gating", () => {
    it("identifies high impact strategic actions requiring human oversight", () => {
      assert.equal(isHighImpactAction("STRATEGIC_OBJECTIVE_MUTATION"), true);
      assert.equal(isHighImpactAction("FINANCIAL_TRANSFER"), true);
      assert.equal(isHighImpactAction("POLICY_MUTATION"), true);
      assert.equal(isHighImpactAction("ROUTINE_METRIC_MEASUREMENT"), false);
      assert.equal(isHighImpactAction("AGENT_TASK_HEARTBEAT"), false);
    });

    it("enforces human oversight requirement based on autonomy level", () => {
      // High impact actions always require human oversight across all autonomy levels
      assert.equal(requiresHumanOversight("STRATEGIC_OBJECTIVE_MUTATION", "LEVEL_0_MANUAL"), true);
      assert.equal(requiresHumanOversight("FINANCIAL_TRANSFER", "LEVEL_1_ASSISTED"), true);
      assert.equal(requiresHumanOversight("POLICY_MUTATION", "LEVEL_2_GOVERNED_AUTOMATION"), true);
      assert.equal(requiresHumanOversight("FINANCIAL_TRANSFER", "LEVEL_3_GOVERNED_AUTONOMY"), true);
      
      // Low impact actions in governed autonomy do not require manual blocking
      assert.equal(requiresHumanOversight("ROUTINE_METRIC_MEASUREMENT", "LEVEL_3_GOVERNED_AUTONOMY"), false);
      assert.equal(requiresHumanOversight("ROUTINE_METRIC_MEASUREMENT", "LEVEL_0_MANUAL"), true);
    });
  });

  describe("EnterpriseOperatingService Application Operations", () => {
    let enterpriseRepo: InMemoryEnterpriseRepository;
    let objectiveRepo: InMemoryBusinessObjectiveRepository;
    let initiativeRepo: InMemoryBusinessInitiativeRepository;
    let metricRepo: InMemoryBusinessMetricRepository;
    let decisionRepo: InMemoryExecutiveDecisionRepository;
    let service: EnterpriseOperatingService;

    beforeEach(() => {
      enterpriseRepo = new InMemoryEnterpriseRepository();
      objectiveRepo = new InMemoryBusinessObjectiveRepository();
      initiativeRepo = new InMemoryBusinessInitiativeRepository();
      metricRepo = new InMemoryBusinessMetricRepository();
      decisionRepo = new InMemoryExecutiveDecisionRepository();

      service = new EnterpriseOperatingService({
        enterpriseRepo,
        objectiveRepo,
        initiativeRepo,
        metricRepo,
        decisionRepo,
      });
    });

    it("builds an end-to-end strategic alignment operating context", async () => {
      const ent = await service.createEnterprise({
        id: "ent-corp-01",
        tenantId,
        name: "Tentaciones Autonomous Corp",
        description: "AI Operating Enterprise",
        industry: "Autonomous Retail",
        vision: "Autonomous Retail 2030",
        strategicMission: "Excellence in customer satisfaction",
      });

      const obj = await service.createObjective({
        id: "obj-arr-10m",
        enterpriseId: ent.id,
        tenantId,
        title: "Achieve $10M ARR",
        description: "Grow ARR to $10M",
        type: "STRATEGIC",
        ownerPrincipalId: principalId,
      });

      const init = await service.createInitiative({
        id: "init-kiosks",
        enterpriseId: ent.id,
        objectiveId: obj.id,
        tenantId,
        title: "Launch 50 Kiosks",
        description: "Deploy autonomous kiosks",
        ownerPrincipalId: principalId,
        expectedOutcome: "50 active kiosks",
      });

      const metric = await service.createMetric({
        id: "metric-active-kiosks",
        enterpriseId: ent.id,
        objectiveId: obj.id,
        tenantId,
        name: "Active Kiosks Count",
        unit: "count",
        targetValue: 50,
        source: "DeviceManagementSubsystem:devices.active.count",
      });

      const decision = await service.recordDecision({
        id: "dec-approve-kiosk-procurement",
        enterpriseId: ent.id,
        tenantId,
        decisionMakerPrincipalId: principalId,
        authorityScope: "SOLUTION_AUTHORIZATION",
        decisionType: "APPROVE",
        targetType: "INITIATIVE",
        targetId: init.id,
        rationale: "Fulfill Initiative Launch 50 Kiosks",
        policyContext: "policy-capital-expenditure-standard",
        resultingAction: "Procured 50 terminal devices",
      });

      const context = await service.getBusinessOperatingContext(ent.id, tenantId);
      assert.equal(context.enterprise.id, ent.id);
      assert.equal(context.objectives.length, 1);
      assert.equal(context.initiatives.length, 1);
      assert.equal(context.metrics.length, 1);
      assert.equal(context.recentDecisions.length, 1);
    });

    it("enforces tenant isolation across all enterprise queries", async () => {
      await service.createEnterprise({
        id: "ent-tenant-1",
        tenantId,
        name: "Tenant 1 Corp",
        description: "Desc",
        industry: "Tech",
        vision: "Vision",
        strategicMission: "Mission",
      });

      await service.createEnterprise({
        id: "ent-tenant-2",
        tenantId: otherTenantId,
        name: "Tenant 2 Corp",
        description: "Desc",
        industry: "Tech",
        vision: "Vision",
        strategicMission: "Mission",
      });

      const tenant1List = await service.listEnterprises(tenantId);
      assert.equal(tenant1List.length, 1);
      assert.equal(tenant1List[0]?.id, "ent-tenant-1");

      const tenant2List = await service.listEnterprises(otherTenantId);
      assert.equal(tenant2List.length, 1);
      assert.equal(tenant2List[0]?.id, "ent-tenant-2");
    });

    it("enforces OCC conflict detection on objective update", async () => {
      const ent = await service.createEnterprise({
        id: "ent-1",
        tenantId,
        name: "Corp",
        description: "Desc",
        industry: "Retail",
        vision: "Vision",
        strategicMission: "Mission",
      });

      const obj = await service.createObjective({
        id: "obj-occ-test",
        enterpriseId: ent.id,
        tenantId,
        title: "OCC Objective",
        description: "Testing OCC",
        type: "OPERATIONAL",
        ownerPrincipalId: principalId,
      });

      assert.equal(obj.concurrencyVersion, 1);

      // Update with correct expected version
      const updated = await service.updateObjective(obj.id, tenantId, {
        title: "Updated Title",
        expectedConcurrencyVersion: 1,
      });
      assert.equal(updated.concurrencyVersion, 2);

      // Attempt update with outdated expected version -> conflict error
      await assert.rejects(
        () =>
          service.updateObjective(obj.id, tenantId, {
            title: "Conflicting Title",
            expectedConcurrencyVersion: 1, // Outdated version!
          }),
        BusinessConcurrencyConflictError
      );
    });
  });

  describe("SQLite WAL Multi-Tenant Persistence & OCC Enforcement", () => {
    let db: SqliteDatabase;
    let entRepo: SqliteEnterpriseRepository;
    let objRepo: SqliteBusinessObjectiveRepository;
    let initRepo: SqliteBusinessInitiativeRepository;
    let metricRepo: SqliteBusinessMetricRepository;
    let decRepo: SqliteExecutiveDecisionRepository;

    beforeEach(() => {
      db = new SqliteDatabase({ dbPath: ":memory:" });
      entRepo = new SqliteEnterpriseRepository(db);
      objRepo = new SqliteBusinessObjectiveRepository(db);
      initRepo = new SqliteBusinessInitiativeRepository(db);
      metricRepo = new SqliteBusinessMetricRepository(db);
      decRepo = new SqliteExecutiveDecisionRepository(db);
    });

    it("persists and retrieves enterprises with multi-tenant filtering", async () => {
      const enterprise = Enterprise.create({
        id: "ent-sqlite-01",
        tenantId,
        name: "SQLite Enterprise",
        description: "Persisted Enterprise",
        industry: "AI Systems",
        vision: "Autonomous Future",
        strategicMission: "Reliable AI Platform",
      });

      await entRepo.save(enterprise);

      const retrieved = await entRepo.findById("ent-sqlite-01", tenantId);
      assert.ok(retrieved);
      assert.equal(retrieved.name, "SQLite Enterprise");

      // Verify cross-tenant isolation in SQLite
      const crossTenant = await entRepo.findById("ent-sqlite-01", otherTenantId);
      assert.equal(crossTenant, undefined);
    });

    it("persists and updates business metrics with measurements in SQLite", async () => {
      let metric = BusinessMetric.create({
        id: "metric-sqlite-01",
        enterpriseId: "ent-sqlite-01",
        objectiveId: "obj-sqlite-01",
        tenantId,
        name: "Customer Retention",
        unit: "%",
        targetValue: 95,
        period: "MONTHLY",
        source: "CRMSubsystem:crm.retention.rate",
      });

      await metricRepo.save(metric);

      metric = metric.recordMeasurement({
        value: 96.5,
        source: "CRMSubsystem:crm.retention.rate",
      });
      await metricRepo.save(metric);

      const saved = await metricRepo.findById("metric-sqlite-01", tenantId);
      assert.ok(saved);
      assert.equal(saved.currentValue, 96.5);
      assert.equal(saved.status, "ON_TRACK");
      assert.equal(saved.concurrencyVersion, 2);
    });

    it("enforces OCC optimistic locking in SQLite repository updates", async () => {
      const objective = BusinessObjective.create({
        id: "obj-sqlite-occ",
        enterpriseId: "ent-sqlite-01",
        tenantId,
        title: "SQLite OCC Objective",
        description: "Desc",
        type: "TACTICAL",
        ownerPrincipalId: principalId,
      });

      await objRepo.save(objective);

      // Stale entity with concurrencyVersion 1
      const staleEntity = BusinessObjective.create({
        id: "obj-sqlite-occ",
        enterpriseId: "ent-sqlite-01",
        tenantId,
        title: "Stale Objective",
        description: "Desc",
        type: "TACTICAL",
        ownerPrincipalId: principalId,
      });

      // Update in DB advances version to 2
      const updated = objective.activate();
      await objRepo.save(updated);

      // Saving stale entity must fail with OCC conflict
      await assert.rejects(
        () => objRepo.save(staleEntity),
        BusinessConcurrencyConflictError
      );
    });
  });
});
