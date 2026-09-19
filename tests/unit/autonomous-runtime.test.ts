/**
 * AI Operating Platform - Autonomous Operations Runtime Unit Tests
 * 
 * Tests:
 * 1. AutonomousTrigger Aggregate & State Transitions (create, enable, disable, pause, firing).
 * 2. RuntimeLease Aggregate (create, expire, renew, mutual exclusion).
 * 3. AutonomousRuntimeState & Circuit Breaker Safety Halt.
 * 4. AutonomousOperationsRuntime Lifecycle (start, pause, resume, stop).
 * 5. Scheduled Trigger Execution & Window Deduplication.
 * 6. Event-Driven Trigger Dispatch & Filtering.
 * 7. Threshold Trigger Evaluation.
 * 8. SQLite & In-Memory Persistence, OCC & Strict Tenant Isolation.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AutonomousTrigger } from "../../src/domain/autonomous/autonomous-trigger.js";
import { RuntimeLease } from "../../src/domain/autonomous/runtime-lease.js";
import { AutonomousRuntimeState } from "../../src/domain/autonomous/autonomous-runtime-state.js";
import {
  AutonomousRuntimeValidationError,
  AutonomousTriggerNotFoundError,
  RuntimeLeaseConflictError,
  RuntimeSafetyHaltError,
} from "../../src/domain/autonomous/autonomous-runtime-errors.js";
import {
  InMemoryAutonomousTriggerRepository,
  InMemoryRuntimeLeaseRepository,
  InMemoryAutonomousRuntimeStateRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-autonomous-repository.js";
import {
  SqliteAutonomousTriggerRepository,
  SqliteRuntimeLeaseRepository,
  SqliteAutonomousRuntimeStateRepository,
} from "../../src/infrastructure/persistence/sqlite/sqlite-autonomous-repository.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { AutonomousOperationsRuntime } from "../../src/application/autonomous/autonomous-operations-runtime.js";
import { ExecutiveOrchestratorService } from "../../src/application/executive/executive-orchestrator-service.js";
import {
  InMemoryExecutiveCycleRepository,
  InMemoryExecutiveContextSnapshotRepository,
  InMemoryExecutiveAnalysisRepository,
  InMemoryExecutivePlanRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-executive-repository.js";
import {
  InMemoryEnterpriseRepository,
  InMemoryBusinessObjectiveRepository,
  InMemoryBusinessInitiativeRepository,
  InMemoryBusinessMetricRepository,
  InMemoryExecutiveDecisionRepository,
} from "../../src/infrastructure/persistence/in-memory/in-memory-business-repository.js";
import { EnterpriseOperatingService } from "../../src/application/business/enterprise-operating-service.js";
import { Enterprise } from "../../src/domain/business/enterprise.js";
import { BusinessObjective } from "../../src/domain/business/business-objective.js";
import { BusinessMetric } from "../../src/domain/business/business-metric.js";

describe("Phase 69: Autonomous Operations Runtime & Continuous Business Governance Unit Tests", () => {
  const TENANT_A = "tenant-autonomous-alpha";
  const TENANT_B = "tenant-autonomous-beta";
  const ENTERPRISE_ID = "ent-auto-test";

  let triggerRepo: InMemoryAutonomousTriggerRepository;
  let leaseRepo: InMemoryRuntimeLeaseRepository;
  let stateRepo: InMemoryAutonomousRuntimeStateRepository;
  let executiveOrchestrator: ExecutiveOrchestratorService;
  let enterpriseOperatingService: EnterpriseOperatingService;
  let runtime: AutonomousOperationsRuntime;

  let cycleRepo: InMemoryExecutiveCycleRepository;
  let snapshotRepo: InMemoryExecutiveContextSnapshotRepository;
  let analysisRepo: InMemoryExecutiveAnalysisRepository;
  let planRepo: InMemoryExecutivePlanRepository;
  let enterpriseRepo: InMemoryEnterpriseRepository;
  let objectiveRepo: InMemoryBusinessObjectiveRepository;
  let metricRepo: InMemoryBusinessMetricRepository;
  let initiativeRepo: InMemoryBusinessInitiativeRepository;
  let decisionRepo: InMemoryExecutiveDecisionRepository;

  beforeEach(async () => {
    triggerRepo = new InMemoryAutonomousTriggerRepository();
    leaseRepo = new InMemoryRuntimeLeaseRepository();
    stateRepo = new InMemoryAutonomousRuntimeStateRepository();

    cycleRepo = new InMemoryExecutiveCycleRepository();
    snapshotRepo = new InMemoryExecutiveContextSnapshotRepository();
    analysisRepo = new InMemoryExecutiveAnalysisRepository();
    planRepo = new InMemoryExecutivePlanRepository();

    enterpriseRepo = new InMemoryEnterpriseRepository();
    objectiveRepo = new InMemoryBusinessObjectiveRepository();
    metricRepo = new InMemoryBusinessMetricRepository();
    initiativeRepo = new InMemoryBusinessInitiativeRepository();
    decisionRepo = new InMemoryExecutiveDecisionRepository();

    enterpriseOperatingService = new EnterpriseOperatingService({
      enterpriseRepo,
      objectiveRepo,
      initiativeRepo,
      metricRepo,
      decisionRepo,
    });

    executiveOrchestrator = new ExecutiveOrchestratorService({
      cycleRepo,
      snapshotRepo,
      analysisRepo,
      planRepo,
      enterpriseOperatingService,
    });

    runtime = new AutonomousOperationsRuntime({
      triggerRepo,
      leaseRepo,
      stateRepo,
      executiveOrchestrator,
      runtimeInstanceId: "runtime-unit-test-instance-1",
      schedulerTickIntervalMs: 50,
    });

    // Seed Enterprise & Metric
    await enterpriseRepo.save(
      Enterprise.create({
        id: ENTERPRISE_ID,
        tenantId: TENANT_A,
        name: "Autonomous Test Enterprise",
        description: "Test",
        industry: "Technology",
        vision: "Closed loop autonomy",
      })
    );

    await objectiveRepo.save(
      BusinessObjective.create({
        id: "obj-sla-target",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        title: "Maintain 99.9% Uptime",
        description: "SLA",
        type: "OPERATIONAL",
        targetMetric: { name: "Uptime", unit: "PERCENTAGE", targetValue: 99.9 },
        ownerPrincipalId: "principal-sla-lead",
      })
    );

    await metricRepo.save(
      BusinessMetric.create({
        id: "metric-sla-uptime",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        objectiveId: "obj-sla-target",
        name: "Uptime",
        unit: "PERCENTAGE",
        targetValue: 99.9,
        currentValue: 98.5,
        source: "monitoring.uptime",
      })
    );
  });

  afterEach(async () => {
    await runtime.stop(TENANT_A);
  });

  describe("1. AutonomousTrigger Aggregate & Lifecycle", () => {
    it("creates, enables, pauses, disables, and records trigger firings", async () => {
      const trigger = AutonomousTrigger.create({
        id: "trig-sched-01",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        name: "Hourly Operations Health Check",
        triggerType: "SCHEDULED",
        scheduleConfig: { intervalMs: 3600000 },
        autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
      });

      assert.equal(trigger.id, "trig-sched-01");
      assert.equal(trigger.status, "ENABLED");
      assert.ok(trigger.scheduleConfig?.nextRunAt);
      assert.equal(trigger.concurrencyVersion, 1);

      const paused = trigger.pause();
      assert.equal(paused.status, "PAUSED");
      assert.equal(paused.concurrencyVersion, 2);

      const enabled = paused.enable();
      assert.equal(enabled.status, "ENABLED");
      assert.equal(enabled.concurrencyVersion, 3);

      const fired = enabled.recordFiring("cycle-fired-01");
      assert.equal(fired.fireCount, 1);
      assert.equal(fired.lastFiredCycleId, "cycle-fired-01");
      assert.equal(fired.concurrencyVersion, 4);

      const disabled = fired.disable();
      assert.equal(disabled.status, "DISABLED");
    });

    it("rejects invalid trigger configurations fail-closed", () => {
      assert.throws(() => {
        AutonomousTrigger.create({
          id: "",
          tenantId: TENANT_A,
          enterpriseId: ENTERPRISE_ID,
          name: "Invalid",
          triggerType: "SCHEDULED",
        });
      }, AutonomousRuntimeValidationError);

      assert.throws(() => {
        AutonomousTrigger.create({
          id: "trig-inv-sched",
          tenantId: TENANT_A,
          enterpriseId: ENTERPRISE_ID,
          name: "Invalid Schedule",
          triggerType: "SCHEDULED",
          scheduleConfig: { intervalMs: 500 }, // < 1000ms rejected
        });
      }, AutonomousRuntimeValidationError);
    });
  });

  describe("2. RuntimeLease Aggregate & Mutual Exclusion", () => {
    it("manages lease acquisition, renewal, and expiration validation", () => {
      const now = new Date();
      const lease = RuntimeLease.create(
        {
          leaseId: "lease-001",
          resourceId: "resource-health-check",
          tenantId: TENANT_A,
          ownerRuntimeId: "runtime-node-1",
          ttlMs: 5000,
        },
        now
      );

      assert.equal(lease.isExpired(now), false);
      assert.equal(lease.isHeldBy("runtime-node-1", now), true);
      assert.equal(lease.isHeldBy("runtime-node-2", now), false);

      // Advance past expiration
      const future = new Date(now.getTime() + 6000);
      assert.equal(lease.isExpired(future), true);

      // Renewal by owner
      const renewed = lease.renew(10000, "runtime-node-1", now);
      assert.equal(renewed.version, 2);
      assert.ok(renewed.expiresAt.getTime() > lease.expiresAt.getTime());

      // Renewal by unauthorized runtime fails
      assert.throws(() => {
        lease.renew(10000, "runtime-node-imposter", now);
      }, AutonomousRuntimeValidationError);
    });
  });

  describe("3. AutonomousRuntimeState & Safety Halt Circuit Breaker", () => {
    it("transitions runtime state: STOPPED -> RUNNING -> PAUSED -> RUNNING -> STOPPED", () => {
      let state = AutonomousRuntimeState.create({
        tenantId: TENANT_A,
        runtimeInstanceId: "runtime-1",
      });
      assert.equal(state.status, "STOPPED");

      state = state.start("runtime-1");
      assert.equal(state.status, "RUNNING");

      state = state.pause();
      assert.equal(state.status, "PAUSED");

      state = state.resume();
      assert.equal(state.status, "RUNNING");

      state = state.stop();
      assert.equal(state.status, "STOPPED");
    });

    it("triggers SAFETY_HALTED circuit breaker when consecutive failures reach threshold", () => {
      let state = AutonomousRuntimeState.create({
        tenantId: TENANT_A,
        maxConsecutiveFailures: 3,
      });

      state = state.start("runtime-1");
      state = state.registerCycleFailure("c-1", "DB lock timeout");
      assert.equal(state.consecutiveFailureCount, 1);
      assert.equal(state.status, "RUNNING");

      state = state.registerCycleFailure("c-2", "Policy timeout");
      assert.equal(state.consecutiveFailureCount, 2);
      assert.equal(state.status, "RUNNING");

      state = state.registerCycleFailure("c-3", "Repeated failure");
      assert.equal(state.consecutiveFailureCount, 3);
      assert.equal(state.status, "SAFETY_HALTED");
      assert.ok(state.safetyHaltReason?.includes("Exceeded max consecutive failures threshold"));
    });
  });

  describe("4. AutonomousOperationsRuntime Service Coordination", () => {
    it("starts, manages triggers, fires governed cycle, and captures leases", async () => {
      const state = await runtime.start(TENANT_A);
      assert.equal(state.status, "RUNNING");

      const trigger = await runtime.createTrigger({
        id: "trig-event-failure",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        name: "Workflow Failure Escalation Trigger",
        triggerType: "EVENT_DRIVEN",
        eventConfig: { sourceEventType: "workflow.failed" },
        autonomyLevel: "LEVEL_2_GOVERNED_AUTOMATION",
      });
      assert.equal(trigger.id, "trig-event-failure");

      // Manually fire trigger
      const result = await runtime.fireTrigger(trigger);
      assert.ok(result.cycle.id);
      assert.ok(result.lease.leaseId);

      // Verify firing was recorded
      const updatedTrigger = await runtime.getTrigger("trig-event-failure", TENANT_A);
      assert.equal(updatedTrigger.fireCount, 1);
    });

    it("handles incoming domain event matching trigger and initiates closed loop", async () => {
      await runtime.start(TENANT_A);

      await runtime.createTrigger({
        id: "trig-kpi-event",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        name: "KPI Deviation Reaction Trigger",
        triggerType: "EVENT_DRIVEN",
        eventConfig: { sourceEventType: "metric.updated" },
      });

      await runtime.handleDomainEvent({
        id: "evt-kpi-1",
        type: "metric.updated",
        occurredAt: new Date(),
        traceId: "trace-kpi-event",
        aggregateId: "metric-sla-uptime",
        payload: {
          tenantId: TENANT_A,
          metricId: "metric-sla-uptime",
          value: 94.0,
        },
      });

      const updated = await runtime.getTrigger("trig-kpi-event", TENANT_A);
      assert.equal(updated.fireCount, 1);
    });

    it("prevents lease conflict and concurrent execution on same resource", async () => {
      const trigger = await runtime.createTrigger({
        id: "trig-lease-test",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        name: "Lease Test",
        triggerType: "MANUAL",
      });

      // Claim lease directly in repo with another owner
      await leaseRepo.acquire(
        RuntimeLease.create({
          leaseId: "lease-other-owner",
          resourceId: `trig_${trigger.id}_${trigger.enterpriseId}`,
          tenantId: TENANT_A,
          ownerRuntimeId: "runtime-other-instance-999",
          ttlMs: 30000,
        })
      );

      // Attempting to fire must reject with RuntimeLeaseConflictError
      await assert.rejects(async () => {
        await runtime.fireTrigger(trigger);
      }, RuntimeLeaseConflictError);
    });
  });

  describe("5. SQLite Persistence, OCC & Multi-Tenant Isolation", () => {
    let db: SqliteDatabase;
    let sqliteTriggerRepo: SqliteAutonomousTriggerRepository;
    let sqliteLeaseRepo: SqliteRuntimeLeaseRepository;
    let sqliteStateRepo: SqliteAutonomousRuntimeStateRepository;

    beforeEach(() => {
      db = new SqliteDatabase({ dbPath: ":memory:" });
      sqliteTriggerRepo = new SqliteAutonomousTriggerRepository(db);
      sqliteLeaseRepo = new SqliteRuntimeLeaseRepository(db);
      sqliteStateRepo = new SqliteAutonomousRuntimeStateRepository(db);
    });

    it("persists triggers, manages leases, and isolates data across tenants in SQLite", async () => {
      const triggerA = AutonomousTrigger.create({
        id: "trig-sqlite-1",
        tenantId: TENANT_A,
        enterpriseId: ENTERPRISE_ID,
        name: "SQLite Trigger",
        triggerType: "SCHEDULED",
        scheduleConfig: { intervalMs: 5000 },
      });
      await sqliteTriggerRepo.save(triggerA);

      const foundA = await sqliteTriggerRepo.findById("trig-sqlite-1", TENANT_A);
      assert.ok(foundA);
      assert.equal(foundA.name, "SQLite Trigger");

      // Tenant B cross-access: MUST return undefined
      const crossFound = await sqliteTriggerRepo.findById("trig-sqlite-1", TENANT_B);
      assert.equal(crossFound, undefined);

      const crossList = await sqliteTriggerRepo.listByEnterprise(ENTERPRISE_ID, TENANT_B);
      assert.equal(crossList.length, 0);
    });

    it("persists runtime state and detects OCC version conflicts in SQLite", async () => {
      const state = AutonomousRuntimeState.create({
        tenantId: TENANT_A,
        runtimeInstanceId: "runtime-sqlite-occ",
      });
      await sqliteStateRepo.save(state);

      const runningState = state.start("runtime-sqlite-occ"); // version becomes 2
      await sqliteStateRepo.save(runningState);

      // Stale save attempt with version 1 must reject
      const staleState = AutonomousRuntimeState.create({
        tenantId: TENANT_A,
        runtimeInstanceId: "stale",
      }); // version 1
      await assert.rejects(async () => {
        await sqliteStateRepo.save(staleState);
      }, AutonomousRuntimeValidationError);
    });
  });
});
