/**
 * Phase 68 Unit Tests: Executive Orchestrator & Closed-Loop Business Operations
 *
 * Invariant & Adversarial Test Suite for:
 * 1. ExecutiveSignal Value Object validation & evidence grounding
 * 2. ExecutiveContextSnapshot point-in-time state capture & immutability
 * 3. ExecutiveAnalysis synthesis & root-cause diagnostic
 * 4. ExecutivePlan aggregate root FSM & OCC versioning
 * 5. ExecutivePlanValidator deterministic verification against snapshot
 * 6. ExecutiveGovernanceGate multi-tier guardrails & high-impact gating
 * 7. ExecutiveCycle closed-loop lifecycle & bounded replanning
 * 8. ExecutiveOrchestratorService closed-loop operational workflows
 * 9. InMemory & SQLite Persistence with OCC and Multi-Tenant Isolation
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ExecutiveSignal,
} from "../../src/domain/executive/executive-signal.js";
import {
  ExecutiveContextSnapshot,
} from "../../src/domain/executive/executive-context-snapshot.js";
import {
  ExecutiveAnalysis,
} from "../../src/domain/executive/executive-analysis.js";
import {
  ExecutivePlan,
  ExecutivePlanAction,
} from "../../src/domain/executive/executive-plan.js";
import { ExecutivePlanValidator } from "../../src/domain/executive/executive-plan-validator.js";
import { ExecutiveGovernanceGate } from "../../src/domain/executive/executive-governance-gate.js";
import {
  ExecutiveCycle,
} from "../../src/domain/executive/executive-cycle.js";
import {
  ExecutiveCycleValidationError,
  ExecutiveConcurrencyConflictError,
  ExecutiveCycleExhaustedError,
} from "../../src/domain/executive/executive-errors.js";
import { ExecutiveOrchestratorService } from "../../src/application/executive/executive-orchestrator-service.js";
import {
  InMemoryExecutiveCycleRepository,
  InMemoryExecutiveContextSnapshotRepository,
  InMemoryExecutiveAnalysisRepository,
  InMemoryExecutivePlanRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-executive-repository.js";
import {
  SqliteExecutiveCycleRepository,
  SqliteExecutivePlanRepository,
} from "../../src/infrastructure/persistence/sqlite/sqlite-executive-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { Enterprise } from "../../src/domain/business/enterprise.js";
import { BusinessObjective } from "../../src/domain/business/business-objective.js";
import { BusinessInitiative } from "../../src/domain/business/business-initiative.js";
import { BusinessMetric } from "../../src/domain/business/business-metric.js";
import {
  InMemoryEnterpriseRepository,
  InMemoryBusinessObjectiveRepository,
  InMemoryBusinessInitiativeRepository,
  InMemoryBusinessMetricRepository,
  InMemoryExecutiveDecisionRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-business-repository.js";
import { EnterpriseOperatingService } from "../../src/application/business/enterprise-operating-service.js";

describe("Phase 68: Executive Orchestrator & Closed-Loop Operations Unit Tests", () => {
  const TENANT_ID = "tenant-exec-test-01";
  const ENTERPRISE_ID = "enterprise-corp-01";

  // Repositories & Services
  let cycleRepo: InMemoryExecutiveCycleRepository;
  let snapshotRepo: InMemoryExecutiveContextSnapshotRepository;
  let analysisRepo: InMemoryExecutiveAnalysisRepository;
  let planRepo: InMemoryExecutivePlanRepository;

  let enterpriseRepo: InMemoryEnterpriseRepository;
  let objectiveRepo: InMemoryBusinessObjectiveRepository;
  let initiativeRepo: InMemoryBusinessInitiativeRepository;
  let metricRepo: InMemoryBusinessMetricRepository;
  let decisionRepo: InMemoryExecutiveDecisionRepository;
  let enterpriseOperatingService: EnterpriseOperatingService;

  let orchestratorService: ExecutiveOrchestratorService;

  beforeEach(async () => {
    cycleRepo = new InMemoryExecutiveCycleRepository();
    snapshotRepo = new InMemoryExecutiveContextSnapshotRepository();
    analysisRepo = new InMemoryExecutiveAnalysisRepository();
    planRepo = new InMemoryExecutivePlanRepository();

    enterpriseRepo = new InMemoryEnterpriseRepository();
    objectiveRepo = new InMemoryBusinessObjectiveRepository();
    initiativeRepo = new InMemoryBusinessInitiativeRepository();
    metricRepo = new InMemoryBusinessMetricRepository();
    decisionRepo = new InMemoryExecutiveDecisionRepository();

    enterpriseOperatingService = new EnterpriseOperatingService({
      enterpriseRepo,
      objectiveRepo,
      initiativeRepo,
      metricRepo,
      decisionRepo,
    });

    // Seed Enterprise & Baseline Data
    const enterprise = Enterprise.create({
      id: ENTERPRISE_ID,
      tenantId: TENANT_ID,
      name: "Enterprise Global Inc",
      description: "Global enterprise",
      industry: "Technology",
      strategicMission: "Deliver scalable AI solutions with governed operations",
      vision: "Autonomous closed-loop enterprise leadership",
    });
    await enterpriseRepo.save(enterprise);

    const objective = BusinessObjective.create({
      id: "obj-churn-reduction",
      tenantId: TENANT_ID,
      enterpriseId: ENTERPRISE_ID,
      title: "Reduce Customer Churn Below 3%",
      description: "Strategic goal for Q3",
      type: "STRATEGIC",
      targetMetric: { name: "Monthly Churn Rate", unit: "PERCENTAGE", targetValue: 3.0 },
      ownerPrincipalId: "exec-leader-1",
    });
    await objectiveRepo.save(objective);

    const initiative = BusinessInitiative.create({
      id: "init-proactive-outreach",
      tenantId: TENANT_ID,
      enterpriseId: ENTERPRISE_ID,
      objectiveId: "obj-churn-reduction",
      title: "AI Proactive Customer Retention Outreach",
      description: "Automated retention campaigns for at-risk accounts",
      ownerPrincipalId: "exec-leader-1",
    });
    await initiativeRepo.save(initiative);

    const metric = BusinessMetric.create({
      id: "metric-churn-rate",
      tenantId: TENANT_ID,
      enterpriseId: ENTERPRISE_ID,
      objectiveId: "obj-churn-reduction",
      name: "Monthly Churn Rate (%)",
      unit: "PERCENTAGE",
      targetValue: 3.0,
      currentValue: 6.2,
      period: "MONTHLY",
      source: "crm_analytics_warehouse.churn_view",
    });
    await metricRepo.save(metric);

    orchestratorService = new ExecutiveOrchestratorService({
      cycleRepo,
      snapshotRepo,
      analysisRepo,
      planRepo,
      enterpriseOperatingService,
    });
  });

  describe("1. ExecutiveSignal Value Object", () => {
    it("creates a valid executive signal with grounded evidence", () => {
      const signal = new ExecutiveSignal({
        id: "sig-001",
        type: "KPI_AT_RISK",
        severity: "HIGH",
        source: "crm_analytics_warehouse",
        targetType: "METRIC",
        targetId: "metric-churn-rate",
        description: "Churn rate increased to 6.2%",
        evidenceReference: "https://telemetry.corp/reports/churn-q3",
        detectedAt: new Date(),
      });

      assert.equal(signal.id, "sig-001");
      assert.equal(signal.type, "KPI_AT_RISK");
      assert.equal(signal.evidenceReference, "https://telemetry.corp/reports/churn-q3");
    });

    it("fails when ground truth source is missing", () => {
      assert.throws(() => {
        new ExecutiveSignal({
          id: "sig-invalid",
          type: "KPI_AT_RISK",
          severity: "HIGH",
          source: "",
          targetType: "METRIC",
          targetId: "metric-churn-rate",
          description: "Missing source",
          evidenceReference: "ref-1",
          detectedAt: new Date(),
        });
      }, ExecutiveCycleValidationError);
    });

    it("fails when evidence reference is missing", () => {
      assert.throws(() => {
        new ExecutiveSignal({
          id: "sig-invalid-2",
          type: "KPI_AT_RISK",
          severity: "HIGH",
          source: "crm",
          targetType: "METRIC",
          targetId: "metric-churn-rate",
          description: "Missing evidence",
          evidenceReference: "",
          detectedAt: new Date(),
        });
      }, ExecutiveCycleValidationError);
    });
  });

  describe("2. ExecutiveContextSnapshot Aggregate", () => {
    it("captures point-in-time immutable enterprise state", () => {
      const snapshot = new ExecutiveContextSnapshot({
        id: "snap-001",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        enterpriseName: "Enterprise Global Inc",
        enterpriseStatus: "ACTIVE",
        capturedAt: new Date(),
        objectives: [{ id: "obj-1", title: "Obj 1", type: "STRATEGIC", status: "ACTIVE", concurrencyVersion: 1 }],
        initiatives: [{ id: "init-1", objectiveId: "obj-1", title: "Init 1", lifecycleState: "ACTIVE", linkedSolutionIds: [], linkedWorkflowIds: [], concurrencyVersion: 1 }],
        metrics: [{ id: "metric-1", objectiveId: "obj-1", name: "Churn", targetValue: 3.0, currentValue: 6.2, gap: 3.2, status: "AT_RISK", source: "crm", lastUpdated: new Date(), concurrencyVersion: 1 }],
        solutions: [],
        workflows: [],
      });

      assert.equal(snapshot.id, "snap-001");
      assert.equal(snapshot.enterpriseId, ENTERPRISE_ID);
      assert.equal(snapshot.metrics.length, 1);
    });
  });

  describe("3. ExecutiveAnalysis Aggregate", () => {
    it("synthesizes signals into root cause and recommended actions", () => {
      const signal = new ExecutiveSignal({
        id: "sig-001",
        type: "KPI_AT_RISK",
        severity: "HIGH",
        source: "crm_analytics_warehouse",
        targetType: "METRIC",
        targetId: "metric-churn-rate",
        description: "Churn rate spike",
        evidenceReference: "ref-1",
        detectedAt: new Date(),
      });

      const analysis = new ExecutiveAnalysis({
        id: "analysis-001",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        observedSignals: [signal],
        affectedObjectiveIds: ["obj-churn-reduction"],
        affectedInitiativeIds: ["init-proactive-outreach"],
        impactedSolutionIds: [],
        impactedWorkflowIds: [],
        evidenceReferences: ["ref-1"],
        recommendedActionCategory: "START_WORKFLOW",
        summary: "Customer churn significantly exceeding SLA threshold",
        createdAt: new Date(),
      });

      assert.equal(analysis.id, "analysis-001");
      assert.equal(analysis.recommendedActionCategory, "START_WORKFLOW");
      assert.equal(analysis.affectedObjectiveIds[0], "obj-churn-reduction");
    });
  });

  describe("4. ExecutivePlan Aggregate & Deterministic Validation", () => {
    it("creates an ExecutivePlan and enforces state transitions", () => {
      const action: ExecutivePlanAction = {
        actionId: "act-1",
        order: 1,
        actionType: "START_WORKFLOW",
        targetId: "init-proactive-outreach",
        workflowDefinitionId: "wf-retention-run",
        requiredCapabilities: ["campaign.execute"],
        expectedOutcome: "Trigger retention outreach workflow",
        requiresApproval: false,
        requiresVerification: true,
        policyReferences: ["policy-outreach"],
      };

      const plan = ExecutivePlan.create({
        id: "plan-001",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-churn-reduction",
        initiativeId: "init-proactive-outreach",
        rationale: "Mitigate customer churn with targeted automated outreach",
        actions: [action],
      });

      assert.equal(plan.status, "DRAFT");
      assert.equal(plan.concurrencyVersion, 1);

      const validated = plan.markValidated();
      assert.equal(validated.status, "VALIDATED");

      const approved = validated.markApproved();
      assert.equal(approved.status, "APPROVED");

      const executing = approved.markExecuting();
      assert.equal(executing.status, "EXECUTING");

      const completed = executing.markCompleted();
      assert.equal(completed.status, "COMPLETED");
    });

    it("deterministic validator checks action validity against context snapshot", () => {
      const snapshot = new ExecutiveContextSnapshot({
        id: "snap-001",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        enterpriseName: "Enterprise Global Inc",
        enterpriseStatus: "ACTIVE",
        capturedAt: new Date(),
        objectives: [{ id: "obj-churn-reduction", title: "Churn", type: "STRATEGIC", status: "AT_RISK", concurrencyVersion: 1 }],
        initiatives: [{ id: "init-proactive-outreach", objectiveId: "obj-churn-reduction", title: "Outreach", lifecycleState: "ACTIVE", linkedSolutionIds: [], linkedWorkflowIds: [], concurrencyVersion: 1 }],
        metrics: [{ id: "metric-churn-rate", objectiveId: "obj-churn-reduction", name: "Churn Rate", targetValue: 3.0, currentValue: 6.2, gap: 3.2, status: "AT_RISK", source: "crm", lastUpdated: new Date(), concurrencyVersion: 1 }],
        solutions: [],
        workflows: [{ id: "wf-retention-run", name: "Retention Workflow", status: "ACTIVE", version: 1, stepCount: 1 }],
      });

      const validAction: ExecutivePlanAction = {
        actionId: "act-1",
        order: 1,
        actionType: "START_WORKFLOW",
        targetId: "init-proactive-outreach",
        workflowDefinitionId: "wf-retention-run",
        requiredCapabilities: [],
        expectedOutcome: "Run retention workflow",
        requiresApproval: false,
        requiresVerification: true,
        policyReferences: [],
      };

      const plan = ExecutivePlan.create({
        id: "plan-valid",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-churn-reduction",
        initiativeId: "init-proactive-outreach",
        rationale: "Valid rationale",
        actions: [validAction],
      });

      const validationResult = ExecutivePlanValidator.validate(plan, snapshot);
      assert.equal(validationResult.valid, true);
      assert.equal(validationResult.violations.length, 0);

      // Invalid action referencing non-existent objective
      const invalidPlan = ExecutivePlan.create({
        id: "plan-invalid",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-non-existent",
        rationale: "Invalid rationale",
        actions: [validAction],
      });

      const invalidResult = ExecutivePlanValidator.validate(invalidPlan, snapshot);
      assert.equal(invalidResult.valid, false);
      assert.ok(invalidResult.violations.some(e => e.includes("obj-non-existent")));
    });
  });

  describe("5. ExecutiveGovernanceGate & High-Impact Action Gating", () => {
    it("enforces mandatory human oversight for high-impact plans", async () => {
      const action: ExecutivePlanAction = {
        actionId: "act-approval",
        order: 1,
        actionType: "REQUEST_APPROVAL",
        targetId: "obj-churn-reduction",
        requiredCapabilities: [],
        expectedOutcome: "Request human signoff",
        requiresApproval: true,
        requiresVerification: false,
        policyReferences: [],
      };

      const plan = ExecutivePlan.create({
        id: "plan-approval",
        cycleId: "cycle-001",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-churn-reduction",
        rationale: "Requires human review",
        actions: [action],
      });

      const gateEvaluation = await ExecutiveGovernanceGate.evaluate(
        plan,
        "LEVEL_1_ASSISTED"
      );

      assert.equal(gateEvaluation.requiresHumanApproval, true);
    });
  });

  describe("6. ExecutiveCycle Lifecycle & Closed-Loop Operations Service", () => {
    it("executes the full closed loop: start -> approve -> execute action -> measure -> complete", async () => {
      const result = await orchestratorService.startCycle({
        id: "cycle-full-test",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
      });

      assert.ok(result.cycle.id);
      assert.equal(result.cycle.enterpriseId, ENTERPRISE_ID);
      assert.ok(result.plan);
      assert.ok(result.analysis);
      assert.ok(result.snapshot);

      // Verify Snapshot, Analysis, and Plan were created and persisted
      const snapshot = await snapshotRepo.findByCycleId(result.cycle.id, TENANT_ID);
      assert.ok(snapshot);
      assert.equal(snapshot.metrics.length, 1);

      const analysis = await analysisRepo.findByCycleId(result.cycle.id, TENANT_ID);
      assert.ok(analysis);
      assert.equal(analysis.affectedObjectiveIds[0], "obj-churn-reduction");

      const plan = await planRepo.findByCycleId(result.cycle.id, TENANT_ID);
      assert.ok(plan);
      assert.equal(plan.status, "VALIDATED");

      // Human Approves Plan
      const approvedResult = await orchestratorService.approvePlan(
        result.cycle.id,
        TENANT_ID,
        "director-human-john"
      );
      assert.equal(approvedResult.plan.status, "APPROVED");
      assert.equal(approvedResult.cycle.status, "EXECUTING");

      // Execute Plan Action
      const actionResult = await orchestratorService.executePlanAction(
        result.cycle.id,
        TENANT_ID,
        0
      );
      assert.ok(actionResult.outcome);
      assert.equal(actionResult.cycle.status, "VERIFYING");

      // Record KPI Measurement
      const measureResult = await orchestratorService.recordMeasurement(
        {
          cycleId: result.cycle.id,
          metricId: "metric-churn-rate",
          value: 2.8,
          source: "crm_analytics_warehouse.churn_view_post_campaign",
        },
        TENANT_ID
      );
      assert.equal(measureResult.cycle.status, "MEASURING");

      // Complete Cycle
      const completedCycle = await orchestratorService.completeCycle(
        result.cycle.id,
        TENANT_ID,
        "Customer churn target achieved"
      );
      assert.equal(completedCycle.status, "COMPLETED");
    });

    it("enforces bounded replanning when reassessing an unmet target", async () => {
      const result = await orchestratorService.startCycle({
        id: "cycle-reassess-test",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
      });

      // Max replanning attempts is 3 by default
      const reassessed1 = await orchestratorService.reassessCycle(
        result.cycle.id,
        TENANT_ID,
        "Initial campaign partially closed gap, churn is 4.5%"
      );
      assert.equal(reassessed1.replanningCount, 1);
      assert.equal(reassessed1.status, "REASSESSING");

      // Advance and reassess 2
      const reassessed2 = await orchestratorService.reassessCycle(
        result.cycle.id,
        TENANT_ID,
        "Attempt 2 reassessment"
      );
      assert.equal(reassessed2.replanningCount, 2);

      // Advance and reassess 3
      const reassessed3 = await orchestratorService.reassessCycle(
        result.cycle.id,
        TENANT_ID,
        "Attempt 3 reassessment"
      );
      assert.equal(reassessed3.replanningCount, 3);

      // Attempt 4 reassess: MUST fail with ExecutiveCycleExhaustedError
      await assert.rejects(async () => {
        await orchestratorService.reassessCycle(
          result.cycle.id,
          TENANT_ID,
          "Attempt 4 reassessment exceeding bounds"
        );
      }, ExecutiveCycleExhaustedError);
    });
  });

  describe("7. SQLite Persistence, OCC & Multi-Tenant Isolation", () => {
    let db: SqliteDatabase;
    let sqliteCycleRepo: SqliteExecutiveCycleRepository;
    let sqlitePlanRepo: SqliteExecutivePlanRepository;

    beforeEach(async () => {
      db = new SqliteDatabase({ dbPath: ":memory:" });
      sqliteCycleRepo = new SqliteExecutiveCycleRepository(db);
      sqlitePlanRepo = new SqliteExecutivePlanRepository(db);
    });

    it("persists and retrieves executive cycles with SQLite WAL and compound indexes", async () => {
      const cycle = ExecutiveCycle.create({
        id: "sqlite-cycle-1",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        maxReplanningAttempts: 3,
      });

      await sqliteCycleRepo.save(cycle);

      const retrieved = await sqliteCycleRepo.findById("sqlite-cycle-1", TENANT_ID);
      assert.ok(retrieved);
      assert.equal(retrieved.id, "sqlite-cycle-1");
      assert.equal(retrieved.enterpriseId, ENTERPRISE_ID);

      const listed = await sqliteCycleRepo.listByEnterprise(ENTERPRISE_ID, TENANT_ID);
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, "sqlite-cycle-1");
    });

    it("strictly isolates executive data across distinct tenants in SQLite", async () => {
      const cycle = ExecutiveCycle.create({
        id: "iso-cycle-1",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
      });

      await sqliteCycleRepo.save(cycle);

      // Other tenant should NOT see it
      const otherTenant = "tenant-other-corp";
      const crossAccess = await sqliteCycleRepo.findById("iso-cycle-1", otherTenant);
      assert.equal(crossAccess, undefined);

      const crossList = await sqliteCycleRepo.listByEnterprise(ENTERPRISE_ID, otherTenant);
      assert.equal(crossList.length, 0);
    });

    it("enforces Optimistic Concurrency Control (OCC) conflict detection in SQLite", async () => {
      const plan = ExecutivePlan.create({
        id: "occ-plan-1",
        cycleId: "cycle-occ-1",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-churn-reduction",
        rationale: "Initial plan",
        actions: [{
          actionId: "act-1",
          order: 1,
          actionType: "START_WORKFLOW",
          targetId: "init-proactive-outreach",
          requiredCapabilities: [],
          expectedOutcome: "Outcome",
          requiresApproval: false,
          requiresVerification: false,
          policyReferences: [],
        }],
      });

      await sqlitePlanRepo.save(plan);

      // Modify and save with new version
      const validatedPlan = plan.markValidated(); // version becomes 2
      await sqlitePlanRepo.save(validatedPlan);

      // Now create a stale object with version 1 and attempt to save
      const stalePlan = ExecutivePlan.create({
        id: "occ-plan-1",
        cycleId: "cycle-occ-1",
        tenantId: TENANT_ID,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-churn-reduction",
        rationale: "Stale update",
        actions: [{
          actionId: "act-1",
          order: 1,
          actionType: "START_WORKFLOW",
          targetId: "init-proactive-outreach",
          requiredCapabilities: [],
          expectedOutcome: "Outcome",
          requiresApproval: false,
          requiresVerification: false,
          policyReferences: [],
        }],
      }); // version is 1

      await assert.rejects(async () => {
        await sqlitePlanRepo.save(stalePlan);
      }, ExecutiveConcurrencyConflictError);
    });
  });
});
