import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CoreRuntime } from "../../src/application/runtime/core-runtime.js";
import { RestartRecoveryService } from "../../src/application/recovery/restart-recovery-service.js";
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

function createTestAgent(): AgentDefinition {
  return {
    id: "agent-test",
    name: "Test Agent",
    capabilities: ["execute"],
    model: "test-model",
    instructions: "instructions",
    tools: [],
    memoryScope: "TASK",
  };
}

test("Durable Event & Audit Infrastructure Integration Suite", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-op-durable-events-"));

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  await t.test("Case A: Rollback atomicity — failure before commit leaves neither aggregate nor durable event", () => {
    const dbPath = path.join(tempDir, "case-a.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);

    const task = Task.create("task-a", "trace-a", { agentId: "agent-test", input: { val: 1 } });

    // Simulate atomic operation failing before commit
    assert.throws(() => {
      txRunner.run(() => {
        tasks.save(task);
        eventStore.append({
          eventId: "evt-case-a",
          eventType: "task.created",
          aggregateType: "task",
          aggregateId: task.id,
          traceId: task.traceId,
          correlationId: task.traceId,
          payload: { status: task.status },
        });
        throw new Error("Simulated crash before transaction commit");
      });
    });

    // Verify neither task nor event exists
    assert.equal(tasks.findById("task-a"), undefined);
    const taskEvents = eventStore.getEventsByTask("task-a");
    assert.equal(taskEvents.length, 0);

    dbManager.close();
  });

  await t.test("Case B: Commit atomicity — aggregate state mutation and durable event are both committed", () => {
    const dbPath = path.join(tempDir, "case-b.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);

    const task = Task.create("task-b", "trace-b", { agentId: "agent-test", input: { val: 2 } });

    txRunner.run(() => {
      tasks.save(task);
      eventStore.append({
        eventId: "evt-case-b",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: task.id,
        traceId: task.traceId,
        correlationId: task.traceId,
        payload: { status: task.status },
      });
    });

    // Close and reopen connection (restart simulation)
    dbManager.close();

    const dbManagerRestart = new SqliteDatabase({ dbPath });
    const tasksRestart = new SqliteTaskRepository({ dbManager: dbManagerRestart });
    const eventStoreRestart = new SqliteEventStore({ dbManager: dbManagerRestart });

    const persistedTask = tasksRestart.findById("task-b");
    assert.ok(persistedTask);
    assert.equal(persistedTask.id, "task-b");

    const events = eventStoreRestart.getEventsByTask("task-b");
    assert.equal(events.length, 1);
    assert.ok(events[0]);
    assert.equal(events[0].eventId, "evt-case-b");
    assert.equal(events[0].eventType, "task.created");
    assert.deepEqual(events[0].payload, { status: "CREATED" });

    dbManagerRestart.close();
  });

  await t.test("Case C: Failure during event append rolls back aggregate state mutation", () => {
    const dbPath = path.join(tempDir, "case-c.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);

    // Pre-seed an event with ID "dup-event-c"
    eventStore.append({
      eventId: "dup-event-c",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "prior-task",
      traceId: "prior-trace",
      correlationId: "prior-trace",
      payload: {},
    });

    const task = Task.create("task-c", "trace-c", { agentId: "agent-test", input: { val: 3 } });

    // Try to mutate task and append an event that collides on unique eventId
    assert.throws(() => {
      txRunner.run(() => {
        tasks.save(task);
        eventStore.append({
          eventId: "dup-event-c", // duplicate causes failure!
          eventType: "task.created",
          aggregateType: "task",
          aggregateId: task.id,
          traceId: task.traceId,
          correlationId: task.traceId,
          payload: { status: task.status },
        });
      });
    });

    // Verify task-c was NOT saved (rolled back)
    assert.equal(tasks.findById("task-c"), undefined);

    dbManager.close();
  });

  await t.test("Case D: Duplicate event_id insertion is rejected fail-closed", () => {
    const dbPath = path.join(tempDir, "case-d.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const eventStore = new SqliteEventStore({ dbManager });

    eventStore.append({
      eventId: "unique-d",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-d",
      traceId: "trace-d",
      correlationId: "trace-d",
      payload: { step: 1 },
    });

    assert.throws(() => {
      eventStore.append({
        eventId: "unique-d",
        eventType: "task.updated",
        aggregateType: "task",
        aggregateId: "task-d",
        traceId: "trace-d",
        correlationId: "trace-d",
        payload: { step: 2 },
      });
    });

    dbManager.close();
  });

  await t.test("Case E: Full runtime lifecycle generates complete, durable, queryable audit trail surviving restart", async () => {
    const dbPath = path.join(tempDir, "case-e.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);
    const publisher: EventPublisher = { publish: () => {} };

    const strategy: ExecutionStrategy = {
      execute: async (_ctx, _task, _agent) => {
        return { output: { result: "success-case-e" }, metadata: { duration: 42 } };
      },
    };

    const runtime = new CoreRuntime(
      tasks,
      executions,
      strategy,
      publisher,
      undefined,
      undefined,
      eventStore,
      txRunner
    );

    const task = Task.create("task-lifecycle-e", "trace-lifecycle-e", { agentId: "agent-test", input: { query: "hello" } });
    const agent = createTestAgent();

    const runtimeResult = await runtime.execute(task, agent);
    assert.equal(runtimeResult.task.status, "COMPLETED");
    assert.equal(runtimeResult.execution.status, "COMPLETED");

    // Close database to simulate process shutdown
    dbManager.close();

    // Re-open on a fresh connection
    const dbManagerRestart = new SqliteDatabase({ dbPath });
    const eventStoreRestart = new SqliteEventStore({ dbManager: dbManagerRestart });

    // Query audit history by Task
    const taskAudit = eventStoreRestart.getEventsByTask("task-lifecycle-e");
    assert.ok(taskAudit.length >= 2, "Expected at least task created and completed events");
    assert.ok(taskAudit[0]);
    const lastTaskEvent = taskAudit[taskAudit.length - 1];
    assert.ok(lastTaskEvent);
    assert.equal(taskAudit[0].eventType, "task.created");
    assert.equal(lastTaskEvent.eventType, "task.completed");

    // Query audit history by Execution
    const execAudit = eventStoreRestart.getEventsByExecution(runtimeResult.execution.id);
    assert.ok(execAudit.length >= 2, "Expected at least execution created/started and completed");

    // Query audit history by Trace
    const traceAudit = eventStoreRestart.getEventsByTrace("trace-lifecycle-e");
    assert.ok(traceAudit.length >= 4);

    // Verify all sequence numbers are strictly monotonic and greater than zero
    for (let i = 1; i < traceAudit.length; i++) {
      const prev = traceAudit[i - 1];
      const curr = traceAudit[i];
      assert.ok(prev);
      assert.ok(curr);
      assert.ok(
        curr.sequenceNumber > prev.sequenceNumber,
        `Sequence numbers must be monotonic: ${curr.sequenceNumber} > ${prev.sequenceNumber}`
      );
    }

    dbManagerRestart.close();
  });

  await t.test("Recovery Integration: crash recovery reconciliation generates durable audit events surviving restart", () => {
    const dbPath = path.join(tempDir, "recovery.db");
    const dbManager = new SqliteDatabase({ dbPath });
    const tasks = new SqliteTaskRepository({ dbManager });
    const executions = new SqliteExecutionRepository({ dbManager });
    const eventStore = new SqliteEventStore({ dbManager });
    const txRunner = new SqliteTransactionRunner(dbManager);

    // Seed an interrupted running task and execution (simulated crash)
    const task = Task.create("task-crash-rec", "trace-crash-rec", { agentId: "agent-test", input: { run: true } })
      .transition("QUEUED")
      .transition("RUNNING");
    tasks.save(task);

    const execution = Execution.create("exec-crash-rec", "task-crash-rec", "trace-crash-rec", new Date())
      .start(new Date());
    executions.save(execution);

    // Simulate process crash: close database
    dbManager.close();

    // Restart: instantiate recovery service
    const dbManagerRecovery = new SqliteDatabase({ dbPath });
    const tasksRecovery = new SqliteTaskRepository({ dbManager: dbManagerRecovery });
    const executionsRecovery = new SqliteExecutionRepository({ dbManager: dbManagerRecovery });
    const eventStoreRecovery = new SqliteEventStore({ dbManager: dbManagerRecovery });
    const txRunnerRecovery = new SqliteTransactionRunner(dbManagerRecovery);

    const recoveryService = new RestartRecoveryService({
      tasks: tasksRecovery,
      executions: executionsRecovery,
      eventStore: eventStoreRecovery,
      transactionRunner: txRunnerRecovery,
    });

    const result = recoveryService.reconcile();
    assert.equal(result.reconciledTasks, 1);
    assert.equal(result.reconciledExecutions, 1);

    // Reconciled entities must be in terminal states
    const reconciledTask = tasksRecovery.findById("task-crash-rec");
    assert.equal(reconciledTask?.status, "FAILED");

    const reconciledExec = executionsRecovery.findById("exec-crash-rec");
    assert.equal(reconciledExec?.status, "FAILED");

    // Close and reopen again to verify recovery audit events survive subsequent restart
    dbManagerRecovery.close();

    const dbManagerPostRecovery = new SqliteDatabase({ dbPath });
    const eventStorePostRecovery = new SqliteEventStore({ dbManager: dbManagerPostRecovery });

    const recoveryEvents = eventStorePostRecovery.getEventsByTrace("trace-crash-rec");
    assert.ok(recoveryEvents.length >= 2, "Expected recovery events for execution and task");

    const execFailedEvent = recoveryEvents.find((e) => e.eventType === "execution.failed");
    assert.ok(execFailedEvent);
    assert.equal((execFailedEvent.payload as any).code, "CRASH_RECOVERY");

    const taskFailedEvent = recoveryEvents.find((e) => e.eventType === "task.failed");
    assert.ok(taskFailedEvent);
    assert.equal((taskFailedEvent.payload as any).code, "CRASH_RECOVERY");

    dbManagerPostRecovery.close();
  });
});
