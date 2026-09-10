import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CoreRuntime } from "../../src/application/runtime/core-runtime.js";
import { RestartRecoveryService } from "../../src/application/recovery/restart-recovery-service.js";
import { RuntimeDiagnosticsService } from "../../src/application/diagnostics/runtime-diagnostics.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { SqliteTaskRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-task-repository.js";
import { SqliteExecutionRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-execution-repository.js";
import { SqliteEventStore } from "../../src/infrastructure/persistence/sqlite/sqlite-event-store.js";
import { SqliteTransactionRunner } from "../../src/infrastructure/persistence/sqlite/sqlite-transaction-runner.js";
import { Task } from "../../src/domain/task/task.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { AgentDefinition } from "../../src/domain/agent/agent.js";
import { ExecutionStrategy } from "../../src/domain/execution/execution-strategy.js";
import { EventPublisher } from "../../src/domain/events/events.js";
import { SqlitePersistenceError } from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

function createTestAgent(): AgentDefinition {
  return {
    id: "agent-obs",
    name: "Observability Agent",
    capabilities: ["execute"],
    model: "test-model",
    instructions: "instructions",
    tools: [],
    memoryScope: "TASK",
  };
}

test("Observability, Audit Query & Runtime Diagnostics Integration Suite", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-op-diagnostics-"));

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  await t.test("TEST A & B: Query by Task and Execution across complete lifecycle", async () => {
    const dbPath = path.join(tempDir, "test-ab.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);
    const publisher: EventPublisher = { publish: () => {} };

    const strategy: ExecutionStrategy = {
      execute: async () => ({ output: { ok: true }, metadata: { duration: 10 } }),
    };

    const runtime = new CoreRuntime(tasks, executions, strategy, publisher, undefined, undefined, eventStore, txRunner);
    const task = Task.create("task-ab-1", "trace-ab-1", { agentId: "agent-obs", input: { query: "test" } });
    const result = await runtime.execute(task, createTestAgent());

    // Query by Task
    const taskEvents = eventStore.getEventsByTask("task-ab-1");
    assert.ok(taskEvents.length >= 2);
    assert.equal(taskEvents[0]?.eventType, "task.created");
    assert.equal(taskEvents[taskEvents.length - 1]?.eventType, "task.completed");

    // Query by Execution
    const execEvents = eventStore.getEventsByExecution(result.execution.id);
    assert.ok(execEvents.length >= 2);
    assert.equal(execEvents[0]?.eventType, "execution.created");
    assert.equal(execEvents[execEvents.length - 1]?.eventType, "execution.completed");

    // Verify ordering
    for (let i = 1; i < execEvents.length; i++) {
      assert.ok(execEvents[i]!.sequenceNumber > execEvents[i - 1]!.sequenceNumber);
    }

    dbManager.close();
  });

  await t.test("TEST C & D: Query by Trace and Correlation reconstructing operational diagnostics", async () => {
    const dbPath = path.join(tempDir, "test-cd.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);
    const publisher: EventPublisher = { publish: () => {} };

    const strategy: ExecutionStrategy = {
      execute: async () => ({ output: { answer: 42 }, metadata: { steps: 1 } }),
    };

    const runtime = new CoreRuntime(tasks, executions, strategy, publisher, undefined, undefined, eventStore, txRunner);
    const task = Task.create("task-cd-1", "trace-cd-shared", { agentId: "agent-obs", input: { n: 1 } });
    await runtime.execute(task, createTestAgent());

    const diagnosticsService = new RuntimeDiagnosticsService(eventStore);
    const traceDiag = diagnosticsService.getTraceDiagnostics("trace-cd-shared");

    assert.ok(traceDiag);
    assert.equal(traceDiag.traceId, "trace-cd-shared");
    assert.equal(traceDiag.status, "COMPLETED");
    assert.equal(traceDiag.rootTaskId, "task-cd-1");
    assert.equal(traceDiag.isCrashRecovered, false);
    assert.ok(traceDiag.durationMs !== undefined && traceDiag.durationMs >= 0);
    assert.ok(traceDiag.causalChain.length >= 1);

    // Query by correlation ID
    const correlatedEvents = eventStore.getEventsByCorrelation("trace-cd-shared");
    assert.ok(correlatedEvents.length >= 4);

    dbManager.close();
  });

  await t.test("TEST G: Monotonic sequence ordering across SQLite connection restarts", () => {
    const dbPath = path.join(tempDir, "test-g.db");

    // Session 1: insert initial event
    const db1 = new SqliteDatabase({ dbPath });
    const store1 = new SqliteEventStore({ dbManager: db1 });
    const e1 = store1.append({
      eventId: "e-g-1",
      eventType: "init",
      aggregateType: "sys",
      aggregateId: "sys",
      traceId: "tr-g",
      correlationId: "cr-g",
      payload: {},
    });
    db1.close();

    // Session 2: reopen connection and insert next event
    const db2 = new SqliteDatabase({ dbPath });
    const store2 = new SqliteEventStore({ dbManager: db2 });
    const e2 = store2.append({
      eventId: "e-g-2",
      eventType: "continuation",
      aggregateType: "sys",
      aggregateId: "sys",
      traceId: "tr-g",
      correlationId: "cr-g",
      payload: {},
    });
    db2.close();

    assert.ok(e2.sequenceNumber > e1.sequenceNumber);
    assert.equal(e1.sequenceNumber, 1);
    assert.equal(e2.sequenceNumber, 2);
  });

  await t.test("TEST J: Corrupted event payload fails closed", () => {
    const dbPath = path.join(tempDir, "test-j.db");
    const db = new SqliteDatabase({ dbPath });
    const store = new SqliteEventStore({ dbManager: db });

    store.append({
      eventId: "e-j-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t-j",
      traceId: "tr-j",
      correlationId: "cr-j",
      payload: { valid: true },
    });

    // Directly corrupt payload in SQLite
    db.open().prepare("UPDATE events SET payload = 'NOT_VALID_JSON' WHERE event_id = 'e-j-1'").run();

    assert.throws(
      () => store.getEventsByTask("t-j"),
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("Failed to parse payload");
      }
    );

    db.close();
  });

  await t.test("TEST K: Restart audit durability", () => {
    const dbPath = path.join(tempDir, "test-k.db");

    // Write events in initial process
    const dbInit = new SqliteDatabase({ dbPath });
    const storeInit = new SqliteEventStore({ dbManager: dbInit });
    storeInit.append({
      eventId: "e-k-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t-k",
      traceId: "tr-k",
      correlationId: "cr-k",
      payload: { field: "survives" },
    });
    dbInit.close();

    // Reopen in simulated fresh process
    const dbRestart = new SqliteDatabase({ dbPath });
    const storeRestart = new SqliteEventStore({ dbManager: dbRestart });
    const results = storeRestart.getEventsByTask("t-k");

    assert.equal(results.length, 1);
    assert.equal(results[0]?.eventId, "e-k-1");
    assert.equal((results[0]?.payload as any).field, "survives");

    dbRestart.close();
  });

  await t.test("TEST L: Crash recovery reconciliation audit and diagnostics", () => {
    const dbPath = path.join(tempDir, "test-l.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);

    // Seed in-flight RUNNING task and execution (simulated crash)
    const task = Task.create("task-l", "trace-l-crash", { agentId: "agent-obs", input: { run: true } })
      .transition("QUEUED")
      .transition("RUNNING");
    tasks.save(task);

    const execution = Execution.create("exec-l", "task-l", "trace-l-crash", new Date()).start(new Date());
    executions.save(execution);

    // Simulate crash (close DB)
    dbManager.close();

    // Restart: instantiate recovery service
    const dbRestart = new SqliteDatabase({ dbPath });
    const tasksRec = new SqliteTaskRepository({ dbManager: dbRestart });
    const executionsRec = new SqliteExecutionRepository({ dbManager: dbRestart });
    const eventStoreRec = new SqliteEventStore({ dbManager: dbRestart });
    const txRunnerRec = new SqliteTransactionRunner(dbRestart);

    const recoveryService = new RestartRecoveryService({
      tasks: tasksRec,
      executions: executionsRec,
      eventStore: eventStoreRec,
      transactionRunner: txRunnerRec,
    });

    const recoveryResult = recoveryService.reconcile();
    assert.equal(recoveryResult.reconciledTasks, 1);
    assert.equal(recoveryResult.reconciledExecutions, 1);

    // Run diagnostics over recovery audit trail
    const diagnosticsService = new RuntimeDiagnosticsService(eventStoreRec);
    const recoveryAudit = diagnosticsService.getCrashRecoveryDiagnostics();

    assert.ok(recoveryAudit.length >= 2);
    const execRecovery = recoveryAudit.find((r) => r.aggregateType === "execution");
    assert.ok(execRecovery);
    assert.equal(execRecovery.code, "CRASH_RECOVERY");
    assert.equal(execRecovery.reason, "crash_recovery");
    assert.equal(execRecovery.terminalStatus, "FAILED");

    const traceDiag = diagnosticsService.getTraceDiagnostics("trace-l-crash");
    assert.ok(traceDiag);
    assert.equal(traceDiag.isCrashRecovered, true);
    assert.equal(traceDiag.status, "FAILED");
    assert.equal(traceDiag.failureCode, "CRASH_RECOVERY");

    dbRestart.close();
  });
});
