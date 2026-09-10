import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { RestartRecoveryService } from "../../src/application/recovery/restart-recovery-service.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { Task, TaskError } from "../../src/domain/task/task.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteExecutionRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-execution-repository.js";
import { SqliteTaskRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-task-repository.js";
import { SqliteTransactionRunner } from "../../src/infrastructure/persistence/sqlite/sqlite-transaction-runner.js";
import { createPlatform } from "../../src/interfaces/composition.js";

const TEST_DB_PATH = resolve(process.cwd(), "data/test-crash-recovery.db");

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

test("SQLite Crash Recovery & Restart Reconciliation Integration Suite", async (t) => {
  t.beforeEach(() => cleanTestDb());
  t.afterEach(() => cleanTestDb());

  await t.test("Test 1: Execution CREATED abandonado is reconciled to CANCELLED", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const task = Task.create("t-created", "tr-1", { agentId: "a1", input: { a: 1 } }).transition("QUEUED");
    const exec = Execution.create("e-created", "t-created", "tr-1");

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledTasks, 1);
    assert.equal(result.reconciledExecutions, 1);

    const savedExec = executions.findById("e-created");
    assert.equal(savedExec?.status, "CANCELLED");
    assert.ok(savedExec?.completedAt);

    dbManager.close();
  });

  await t.test("Test 2: Execution RUNNING abandonado is reconciled to FAILED with CRASH_RECOVERY", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const task = Task.create("t-run", "tr-2", { agentId: "a1", input: { a: 1 } }).transition("QUEUED");
    const exec = Execution.create("e-run", "t-run", "tr-2").start();

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledExecutions, 1);

    const savedExec = executions.findById("e-run");
    assert.equal(savedExec?.status, "FAILED");
    assert.equal(savedExec?.error?.code, "CRASH_RECOVERY");

    dbManager.close();
  });

  await t.test("Test 3: Task RUNNING abandonado is reconciled to FAILED with CRASH_RECOVERY", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const task = Task.create("t-running", "tr-3", { agentId: "a1", input: { a: 1 } })
      .transition("QUEUED")
      .transition("RUNNING");
    const exec = Execution.create("e-running", "t-running", "tr-3").start();

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledTasks, 1);
    assert.equal(result.reconciledExecutions, 1);

    const savedTask = tasks.findById("t-running");
    assert.equal(savedTask?.status, "FAILED");
    assert.equal(savedTask?.error?.code, "CRASH_RECOVERY");

    dbManager.close();
  });

  await t.test("Test 4: Task + Execution in terminal states remain completely untouched", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const task = Task.create("t-term", "tr-4", { agentId: "a1", input: { a: 1 } })
      .transition("QUEUED")
      .transition("RUNNING")
      .complete({ res: "done" });
    const exec = Execution.create("e-term", "t-term", "tr-4")
      .start()
      .complete({ m: 1 });

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const result = service.reconcile();
    assert.equal(result.alreadyTerminalTasks, 1);
    assert.equal(result.alreadyTerminalExecutions, 1);
    assert.equal(result.reconciledTasks, 0);
    assert.equal(result.reconciledExecutions, 0);

    assert.equal(tasks.findById("t-term")?.status, "COMPLETED");
    assert.equal(executions.findById("e-term")?.status, "COMPLETED");

    dbManager.close();
  });

  await t.test("Test 5: Orphan Execution without associated Task is reconciled properly", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const orphanCreated = Execution.create("e-orph-c", "ghost-task-1", "tr-5a");
    const orphanRunning = Execution.create("e-orph-r", "ghost-task-2", "tr-5b").start();

    executions.save(orphanCreated);
    executions.save(orphanRunning);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledExecutions, 2);

    assert.equal(executions.findById("e-orph-c")?.status, "CANCELLED");
    const savedRunning = executions.findById("e-orph-r");
    assert.equal(savedRunning?.status, "FAILED");
    assert.equal(savedRunning?.error?.code, "ORPHAN_EXECUTION");

    dbManager.close();
  });

  await t.test("Test 6: Orphan Task without Execution is reconciled properly", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    const orphanTaskQ = Task.create("t-orph-q", "tr-6a", { agentId: "a1", input: { x: 1 } }).transition("QUEUED");
    const orphanTaskR = Task.create("t-orph-r", "tr-6b", { agentId: "a1", input: { x: 1 } })
      .transition("QUEUED")
      .transition("RUNNING");

    tasks.save(orphanTaskQ);
    tasks.save(orphanTaskR);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const result = service.reconcile();
    assert.equal(result.reconciledTasks, 2);

    assert.equal(tasks.findById("t-orph-q")?.status, "CANCELLED");
    assert.equal(tasks.findById("t-orph-r")?.status, "FAILED");

    dbManager.close();
  });

  await t.test("Test 7: Recovery run twice produces identical state with zero duplicate mutations (Idempotency)", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);

    tasks.save(Task.create("t-idem", "tr-7", { agentId: "a1", input: { a: 1 } }).transition("QUEUED"));
    executions.save(Execution.create("e-idem", "t-idem", "tr-7"));

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    const pass1 = service.reconcile();
    assert.equal(pass1.reconciledTasks, 1);
    assert.equal(pass1.reconciledExecutions, 1);

    const taskSnapshot1 = tasks.findById("t-idem");
    const execSnapshot1 = executions.findById("e-idem");

    const pass2 = service.reconcile();
    assert.equal(pass2.reconciledTasks, 0);
    assert.equal(pass2.reconciledExecutions, 0);
    assert.equal(pass2.alreadyTerminalTasks, 1);
    assert.equal(pass2.alreadyTerminalExecutions, 1);

    const taskSnapshot2 = tasks.findById("t-idem");
    const execSnapshot2 = executions.findById("e-idem");

    assert.equal(taskSnapshot1?.status, taskSnapshot2?.status);
    assert.equal(execSnapshot1?.status, execSnapshot2?.status);
    assert.equal(execSnapshot1?.completedAt?.getTime(), execSnapshot2?.completedAt?.getTime());

    dbManager.close();
  });

  await t.test("Test 8: Corrupted database row halts recovery fail-closed", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);
    const runner = new SqliteTransactionRunner(dbManager);
    const db = dbManager.getDatabase();

    // Insert a corrupted JSON input row directly in SQLite
    db.prepare(`
      INSERT INTO tasks (id, trace_id, agent_id, input, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run("corrupt-task", "tr-8", "a1", "MALFORMED_JSON_{{{", "RUNNING", new Date().toISOString());

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: runner,
    });

    assert.throws(
      () => service.reconcile(),
      /SqlitePersistenceError|InvalidTaskInputError/,
      "Corrupted row must throw fail-closed error"
    );

    dbManager.close();
  });

  await t.test("Test 9: Recovery rolls back atomic transaction if a persistence error occurs", () => {
    const dbManager = new SqliteDatabase({ dbPath: TEST_DB_PATH });
    const tasks = new SqliteTaskRepository(dbManager);
    const executions = new SqliteExecutionRepository(dbManager);

    const task = Task.create("t-rb", "tr-9", { agentId: "a1", input: { a: 1 } }).transition("QUEUED");
    tasks.save(task);

    // Failing runner that throws an error inside the transaction
    const failingRunner = {
      run: <T>(fn: () => T): T => {
        return dbManager.transaction(() => {
          fn();
          throw new Error("Simulated sudden transaction abort");
        });
      },
    };

    const service = new RestartRecoveryService({
      tasks,
      executions,
      transactionRunner: failingRunner,
    });

    assert.throws(() => service.reconcile(), /Simulated sudden transaction abort/);

    // Confirm task is still QUEUED because the transaction rolled back!
    const uncommittedTask = tasks.findById("t-rb");
    assert.equal(uncommittedTask?.status, "QUEUED", "Transaction rollback must preserve pre-reconciliation state");

    dbManager.close();
  });

  await t.test("Test 10: Real Restart: Connection A persists -> close -> Connection B automatically recovers upon platform creation -> asserts durable state", () => {
    // Process A: Opens connection, creates and starts tasks, then dies/closes
    {
      const platformA = createPlatform({
        useDurablePersistence: true,
        dbPath: TEST_DB_PATH,
        skipRecovery: true,
      });

      const taskA = Task.create("t-restart", "tr-restart", { agentId: "foundation-agent", input: { test: true } })
        .transition("QUEUED")
        .transition("RUNNING");
      const execA = Execution.create("e-restart", "t-restart", "tr-restart").start();

      platformA.tasks.save(taskA);
      platformA.executions.save(execA);

      // Abrupt process exit simulation: close database connection
      platformA.db?.close();
    }

    // Process B: Restart! Reconnects to the same database.
    // createPlatform automatically executes RestartRecoveryService on startup!
    {
      const platformB = createPlatform({
        useDurablePersistence: true,
        dbPath: TEST_DB_PATH,
      });

      // Verify recoveryResult on platform startup
      assert.ok(platformB.recoveryResult);
      assert.equal(platformB.recoveryResult.reconciledTasks, 1);
      assert.equal(platformB.recoveryResult.reconciledExecutions, 1);

      // Verify aggregates in database
      const reconciledTask = platformB.tasks.findById("t-restart");
      const reconciledExec = platformB.executions.findById("e-restart");

      assert.equal(reconciledTask?.status, "FAILED");
      assert.equal(reconciledTask?.error?.code, "CRASH_RECOVERY");
      assert.equal(reconciledExec?.status, "FAILED");
      assert.equal(reconciledExec?.error?.code, "CRASH_RECOVERY");

      // Double-execution protection: verify that attempting to execute a terminal task fails domain validation
      assert.throws(
        () => reconciledTask!.transition("RUNNING"),
        /InvalidTaskTransitionError/,
        "Double execution must be impossible: terminal task cannot transition to RUNNING"
      );

      platformB.db?.close();
    }

    // Process C: Subsequent restart asserts that state remains permanently reconciled and durable
    {
      const platformC = createPlatform({
        useDurablePersistence: true,
        dbPath: TEST_DB_PATH,
      });

      assert.ok(platformC.recoveryResult);
      assert.equal(platformC.recoveryResult.reconciledTasks, 0);
      assert.equal(platformC.recoveryResult.alreadyTerminalTasks, 1);
      assert.equal(platformC.recoveryResult.reconciledExecutions, 0);
      assert.equal(platformC.recoveryResult.alreadyTerminalExecutions, 1);

      platformC.db?.close();
    }
  });
});
