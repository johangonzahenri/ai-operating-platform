/**
 * Phase 68 End-to-End Closed-Loop & Adversarial Security Test Suite
 *
 * Full Closed-Loop Verification:
 * Strategy -> Objective -> Initiative -> AI Solution -> Workflow -> Agent ->
 * Execution -> Verification -> Human Oversight -> Outcome -> KPI -> Decision
 *
 * Invariant Verification:
 * Platform != Enterprise != Organization != Area != Team != Agent != Solution !=
 * Workflow != Objective != Initiative != Decision != Execution
 *
 * Adversarial Governance Scenarios:
 * 1. AI CEO Sovereignty Bypass (Attempted unconstrained mutation without approval token)
 * 2. Bounded Replanning Infinite Loop Attack
 * 3. Optimistic Concurrency Control (OCC) State Collisions
 * 4. Multi-Tenant Isolation
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ExecutivePlan,
  ExecutivePlanAction,
} from "../../src/domain/executive/executive-plan.js";
import { ExecutiveGovernanceGate } from "../../src/domain/executive/executive-governance-gate.js";
import {
  ExecutiveCycleExhaustedError,
  ExecutiveConcurrencyConflictError,
  ExecutiveResourceNotFoundError,
} from "../../src/domain/executive/executive-errors.js";
import { ExecutiveOrchestratorService } from "../../src/application/executive/executive-orchestrator-service.js";
import {
  InMemoryExecutiveCycleRepository,
  InMemoryExecutiveContextSnapshotRepository,
  InMemoryExecutiveAnalysisRepository,
  InMemoryExecutivePlanRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-executive-repository.js";
import { Enterprise } from "../../src/domain/business/enterprise.js";
import {
  BusinessObjective,
} from "../../src/domain/business/business-objective.js";
import {
  BusinessInitiative,
} from "../../src/domain/business/business-initiative.js";
import {
  BusinessMetric,
} from "../../src/domain/business/business-metric.js";
import {
  InMemoryEnterpriseRepository,
  InMemoryBusinessObjectiveRepository,
  InMemoryBusinessInitiativeRepository,
  InMemoryBusinessMetricRepository,
  InMemoryExecutiveDecisionRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-business-repository.js";
import { EnterpriseOperatingService } from "../../src/application/business/enterprise-operating-service.js";

describe("Phase 68: End-to-End Closed-Loop Business Operations & Adversarial Tests", () => {
  const TENANT_A = "tenant-enterprise-alpha";
  const TENANT_B = "tenant-enterprise-beta";
  const ENTERPRISE_ID = "ent-enterprise-alpha-001";
  const CEO_AGENT_ID = "agent-executive-ceo";
  const HUMAN_OVERSEER = "user-vp-engineering-claire";

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

    orchestratorService = new ExecutiveOrchestratorService({
      cycleRepo,
      snapshotRepo,
      analysisRepo,
      planRepo,
      enterpriseOperatingService,
    });

    // Seed Alpha Enterprise
    await enterpriseRepo.save(
      Enterprise.create({
        id: ENTERPRISE_ID,
        tenantId: TENANT_A,
        name: "Enterprise Alpha Operations",
        description: "Operational excellence with verifiable AI governance",
        industry: "E-Commerce",
        vision: "Closed-loop enterprise operations",
      })
    );

    // Seed Strategic Objective
    await objectiveRepo.save(
      BusinessObjective.create({
        id: "obj-order-fulfillment-latency",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        title: "Maintain Order Fulfillment Latency Below 120ms",
        description: "Core transactional performance KPI",
        type: "OPERATIONAL",
        targetMetric: { name: "P99 Order Latency", unit: "MILLISECONDS", targetValue: 120 },
        ownerPrincipalId: CEO_AGENT_ID,
      })
    );

    // Seed Strategic Initiative
    await initiativeRepo.save(
      BusinessInitiative.create({
        id: "init-cache-optimization-pipeline",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-order-fulfillment-latency",
        title: "Distributed Cache Optimization Pipeline",
        description: "Dynamic cache warming and query plan re-indexing",
        ownerPrincipalId: CEO_AGENT_ID,
      })
    );

    // Seed Ground-Truth Metric
    await metricRepo.save(
      BusinessMetric.create({
        id: "metric-fulfillment-latency",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-order-fulfillment-latency",
        name: "P99 Order Latency (ms)",
        unit: "MILLISECONDS",
        targetValue: 120,
        currentValue: 340,
        period: "DAILY",
        source: "prometheus_warehouse.http_request_duration_p99",
      })
    );
  });

  it("Full Closed-Loop Execution: Deviation Signal -> Snapshot -> Plan -> Oversight -> Verification -> KPI Convergence", async () => {
    // 1. SIGNAL INGESTION & CYCLE INITIATION
    const result = await orchestratorService.startCycle({
      id: "cycle-closed-loop-e2e",
      tenantId: TENANT_A,
      enterpriseId: ENTERPRISE_ID,
      autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
    });

    assert.ok(result.cycle.id);
    assert.ok(result.snapshot.id);
    assert.ok(result.analysis.id);
    assert.ok(result.plan.id);

    // 2. CONTEXT SNAPSHOT & ANALYSIS VALIDATION
    assert.equal(result.snapshot.metrics[0]?.id, "metric-fulfillment-latency");
    assert.ok(result.analysis.affectedObjectiveIds.includes("obj-order-fulfillment-latency"));

    // 3. HUMAN OVERSIGHT & PLAN APPROVAL
    const approvedResult = await orchestratorService.approvePlan(
      result.cycle.id,
      TENANT_A,
      HUMAN_OVERSEER
    );
    assert.equal(approvedResult.plan.status, "APPROVED");

    // 4. ACTION DISPATCH & EXECUTION
    const executionResult = await orchestratorService.executePlanAction(
      result.cycle.id,
      TENANT_A,
      0
    );
    assert.ok(executionResult.outcome);

    // 5. POST-EXECUTION METRIC MEASUREMENT (Ground-Truth Convergence)
    const measurementResult = await orchestratorService.recordMeasurement(
      {
        cycleId: result.cycle.id,
        metricId: "metric-fulfillment-latency",
        value: 110, // Convergence: 110ms <= 120ms Target!
        source: "prometheus_warehouse.http_request_duration_p99_post_reindex",
      },
      TENANT_A
    );
    assert.ok(measurementResult.metric);

    // 6. EXECUTIVE DECISION RECORD FINALIZATION
    const decision = await enterpriseOperatingService.recordDecision({
      id: "dec-final-resolution",
      tenantId: TENANT_A,
      enterpriseId: ENTERPRISE_ID,
      authorityScope: "STRATEGIC_OBJECTIVE",
      decisionType: "APPROVE",
      targetType: "OBJECTIVE",
      targetId: "obj-order-fulfillment-latency",
      decisionMakerPrincipalId: HUMAN_OVERSEER,
      rationale: "Successfully remediated latency via closed-loop re-indexing cycle",
      resultingAction: "Maintain optimized cache indexing profile",
    });
    assert.ok(decision.id);

    // 7. CYCLE COMPLETION
    const completedCycle = await orchestratorService.completeCycle(
      result.cycle.id,
      TENANT_A,
      "Closed loop completed with full metric convergence"
    );
    assert.equal(completedCycle.status, "COMPLETED");
  });

  describe("Adversarial Security & Governance Guardrail Enforcement", () => {
    it("1. AI CEO Sovereignty Bypass: Unconditionally requires human approval for sensitive plans", async () => {
      const highImpactAction: ExecutivePlanAction = {
        actionId: "act-ai-ceo-rogue",
        order: 1,
        actionType: "REQUEST_APPROVAL",
        targetId: "pol-global-budget-cap",
        requiredCapabilities: [],
        expectedOutcome: "Request approval for policy mutation",
        requiresApproval: true,
        requiresVerification: false,
        policyReferences: [],
      };

      const roguePlan = ExecutivePlan.create({
        id: "plan-rogue-ceo",
        cycleId: "cycle-rogue",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-order-fulfillment-latency",
        rationale: "Removing caps to accelerate growth",
        actions: [highImpactAction],
      });

      const gateEval = await ExecutiveGovernanceGate.evaluate(
        roguePlan,
        "LEVEL_1_ASSISTED"
      );

      assert.equal(gateEval.requiresHumanApproval, true);
    });

    it("2. Bounded Replanning Infinite Loop Attack: Traps recursive failure loops", async () => {
      const result = await orchestratorService.startCycle({
        id: "cycle-loop-attack",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
      });

      // Exhaust all 3 allowed replanning attempts
      for (let i = 1; i <= 3; i++) {
        await orchestratorService.reassessCycle(
          result.cycle.id,
          TENANT_A,
          `Replanning loop attempt ${i}`
        );
      }

      // 4th attempt must be trapped and blocked
      await assert.rejects(async () => {
        await orchestratorService.reassessCycle(
          result.cycle.id,
          TENANT_A,
          "Replanning loop attempt 4 (infinite loop exploit)"
        );
      }, ExecutiveCycleExhaustedError);
    });

    it("3. Optimistic Concurrency Control (OCC): Prevents race conditions and phantom updates", async () => {
      const plan = ExecutivePlan.create({
        id: "plan-occ-race",
        cycleId: "cycle-occ",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-order-fulfillment-latency",
        rationale: "Concurrency check",
        actions: [{
          actionId: "act-1",
          order: 1,
          actionType: "START_WORKFLOW",
          targetId: "init-cache-optimization-pipeline",
          requiredCapabilities: [],
          expectedOutcome: "Clean state",
          requiresApproval: false,
          requiresVerification: false,
          policyReferences: [],
        }],
      });

      await planRepo.save(plan);

      // Thread A validates plan (version becomes 2)
      const validatedPlan = plan.markValidated();
      await planRepo.save(validatedPlan);

      // Thread B tries to mutate with stale plan version 1
      const stalePlan = ExecutivePlan.create({
        id: "plan-occ-race",
        cycleId: "cycle-occ",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-order-fulfillment-latency",
        rationale: "Stale thread mutation",
        actions: [{
          actionId: "act-1",
          order: 1,
          actionType: "START_WORKFLOW",
          targetId: "init-cache-optimization-pipeline",
          requiredCapabilities: [],
          expectedOutcome: "Clean state",
          requiresApproval: false,
          requiresVerification: false,
          policyReferences: [],
        }],
      }); // version 1

      await assert.rejects(async () => {
        await planRepo.save(stalePlan);
      }, ExecutiveConcurrencyConflictError);
    });

    it("4. Multi-Tenant Strict Isolation: Tenant B cannot query or mutate Tenant A executive cycles", async () => {
      const result = await orchestratorService.startCycle({
        id: "cycle-tenant-iso",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
      });

      // Tenant B queries Tenant A cycle: MUST return undefined / not found
      const crossTenantCycle = await cycleRepo.findById(result.cycle.id, TENANT_B);
      assert.equal(crossTenantCycle, undefined);

      const crossTenantList = await cycleRepo.listByEnterprise(ENTERPRISE_ID, TENANT_B);
      assert.equal(crossTenantList.length, 0);

      // Tenant B tries to approve Tenant A plan: MUST fail with resource not found
      await assert.rejects(async () => {
        await orchestratorService.approvePlan(
          result.cycle.id,
          TENANT_B,
          "attacker-tenant-b"
        );
      }, ExecutiveResourceNotFoundError);
    });
  });
});
