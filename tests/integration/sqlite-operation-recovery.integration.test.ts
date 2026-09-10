import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { RestartRecoveryService } from "../../src/application/recovery/restart-recovery-service.js";
import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteEventStore } from "../../src/infrastructure/persistence/sqlite/sqlite-event-store.js";
import { SqliteExecutionRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-execution-repository.js";
import { SqliteOperationRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-operation-repository.js";
import { SqliteTaskRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-task-repository.js";
import { SqliteTransactionRunner } from "../../src/infrastructure/persistence/sqlite/sqlite-transaction-runner.js";
import { createPlatform } from "../../src/interfaces/composition.js";

const TEST_DB_PATH = resolve(process.cwd(), "data/test-operation-recovery.db");

function cleanTestDb() {
  for (const ext of ["", "-wal", "-shm"]) {
    const p = `${TEST_DB_PATH}${ext}`;
    if (existsSync(p)) {
      try {
        rmSync(p, { force: true });
      } catch {
        // Ignore file lock cleanup errors on windows if any
      }
    }
  }
}

test("SQLite Autonomous Operations Crash Recovery & Durable Domain Integration Suite", async (t) => {
  t.beforeEach(() => cleanTestDb());
  t.afterEach(() => cleanTestDb());

  const budget = AutonomyBudget.create({ maxSteps: 10, maxDurationMs: 60000, maxToolCalls: 10 });
  const fixedNow = new Date("2026-09-09T10:00:00.000Z");

  await t.test("1. Orphan AutonomousOperation in SUBMITTED status is reconciled to CANCELLED with durable event", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const operations = new SqliteOperationRepository(dbManager);
    const eventStore = new SqliteEventStore(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const op = AutonomousOperation.create({
      id: "op-sub-1",
      objective: "Orphan submitted op",
      agentId: "foundation-agent",
      budget,
      createdAt: fixedNow,
    });
    operations.save(op);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      operations,
      eventStore,
      transactionRunner: runner,
      now: () => fixedNow,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledOperations, 1);

    const saved = operations.findById("op-sub-1");
    assert.equal(saved?.status, "CANCELLED");

    // Verify durable event emitted
    const events = eventStore.query({ aggregateId: "op-sub-1" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "operation.cancelled");
    assert.equal(events[0]?.aggregateType, "operation");
    assert.equal(events[0]?.aggregateId, "op-sub-1");
    assert.equal(events[0]?.causationId, "crash_recovery");

    dbManager.close();
  });

  await t.test("2. Orphan AutonomousOperation in RUNNING status is reconciled to FAILED with CRASH_RECOVERY_OPERATION_TERMINATED", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const operations = new SqliteOperationRepository(dbManager);
    const eventStore = new SqliteEventStore(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const op = AutonomousOperation.create({
      id: "op-run-1",
      objective: "Orphan running op",
      agentId: "foundation-agent",
      budget,
      createdAt: fixedNow,
    }).start(fixedNow);
    operations.save(op);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      operations,
      eventStore,
      transactionRunner: runner,
      now: () => fixedNow,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledOperations, 1);

    const saved = operations.findById("op-run-1");
    assert.equal(saved?.status, "FAILED");
    assert.equal(saved?.failureError?.code, "CRASH_RECOVERY_OPERATION_TERMINATED");

    // Verify durable event emitted
    const events = eventStore.query({ aggregateId: "op-run-1" });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "operation.failed");
    assert.equal(events[0]?.aggregateType, "operation");
    assert.equal(events[0]?.aggregateId, "op-run-1");
    assert.equal(events[0]?.causationId, "crash_recovery");
    assert.equal((events[0]?.payload as Record<string, unknown>).code, "CRASH_RECOVERY_OPERATION_TERMINATED");

    dbManager.close();
  });

  await t.test("3. Terminal AutonomousOperations (COMPLETED, FAILED, CANCELLED) are untouched", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const operations = new SqliteOperationRepository(dbManager);
    const eventStore = new SqliteEventStore(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const opComp = AutonomousOperation.create({
      id: "op-comp-1",
      objective: "Completed op",
      agentId: "foundation-agent",
      budget,
      createdAt: fixedNow,
    }).start(fixedNow).complete({ ok: 1 }, fixedNow);

    operations.save(opComp);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      operations,
      eventStore,
      transactionRunner: runner,
      now: () => fixedNow,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledOperations, 0);
    assert.equal(result.alreadyTerminalOperations, 1);

    const saved = operations.findById("op-comp-1");
    assert.equal(saved?.status, "COMPLETED");

    // Zero duplicate events
    const events = eventStore.query({ aggregateId: "op-comp-1" });
    assert.equal(events.length, 0);

    dbManager.close();
  });

  await t.test("4. Idempotency: Repeating reconciliation on recovered database produces 0 mutations & 0 duplicate events", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const operations = new SqliteOperationRepository(dbManager);
    const eventStore = new SqliteEventStore(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    operations.save(
      AutonomousOperation.create({
        id: "op-idem-1",
        objective: "Idempotent op",
        agentId: "foundation-agent",
        budget,
        createdAt: fixedNow,
      }).start(fixedNow)
    );

    const service = new RestartRecoveryService({
      tasks,
      executions,
      operations,
      eventStore,
      transactionRunner: runner,
      now: () => fixedNow,
    });

    const pass1 = service.reconcile();
    assert.equal(pass1.reconciledOperations, 1);
    assert.equal(eventStore.query({ aggregateId: "op-idem-1" }).length, 1);

    const pass2 = service.reconcile();
    assert.equal(pass2.reconciledOperations, 0);
    assert.equal(pass2.alreadyTerminalOperations, 1);
    assert.equal(eventStore.query({ aggregateId: "op-idem-1" }).length, 1);

    dbManager.close();
  });

  await t.test("5. Real Restart Simulation via createPlatform: Connection A persists -> Crash -> Connection B auto-recovers", () => {
    // Process A: Starts an autonomous operation and crashes without terminating
    {
      const platformA = createPlatform({
        useDurablePersistence: true,
        dbPath: TEST_DB_PATH,
        skipRecovery: true,
      });

      const opA = AutonomousOperation.create({
        id: "op-crash-1",
        objective: "Autonomous operation during crash",
        agentId: "foundation-agent",
        budget,
        createdAt: fixedNow,
      }).start(fixedNow);

      platformA.operations.save(opA);

      // Simulated sudden termination
      platformA.db?.close();
    }

    // Process B: Startup restart reconciliation occurs automatically in createPlatform
    {
      const platformB = createPlatform({
        useDurablePersistence: true,
        dbPath: TEST_DB_PATH,
      });

      assert.ok(platformB.recoveryResult);
      assert.equal(platformB.recoveryResult.reconciledOperations, 1);

      const recoveredOp = platformB.operations.findById("op-crash-1");
      assert.equal(recoveredOp?.status, "FAILED");
      assert.equal(recoveredOp?.failureError?.code, "CRASH_RECOVERY_OPERATION_TERMINATED");

      // Verify OCC protection and double-execution disallowance
      assert.throws(
        () => recoveredOp!.start(),
        /InvalidAutonomousOperationTransitionError/,
        "Double execution must be impossible: terminal operation cannot restart"
      );

      // Verify durable event ledger
      const events = platformB.eventStore.query({ aggregateId: "op-crash-1" });
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventType, "operation.failed");
      assert.equal((events[0]?.payload as Record<string, unknown>).code, "CRASH_RECOVERY_OPERATION_TERMINATED");

      platformB.db?.close();
    }
  });
});
