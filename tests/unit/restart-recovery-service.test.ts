import assert from "node:assert/strict";
import test from "node:test";
import { RestartRecoveryService } from "../../src/application/recovery/restart-recovery-service.js";
import { Execution } from "../../src/domain/execution/execution.js";
import { Task, TaskError } from "../../src/domain/task/task.js";
import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { DomainEvent, EventPublisher } from "../../src/domain/events/events.js";
import { InMemoryTaskRepository } from "../../src/infrastructure/persistence/in-memory-task-repository.js";
import { InMemoryExecutionRepository } from "../../src/infrastructure/persistence/in-memory-execution-repository.js";
import { InMemoryOperationRepository } from "../../src/infrastructure/persistence/in-memory-operation-repository.js";

class MockEventPublisher implements EventPublisher {
  readonly events: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.events.push(event);
  }
}

test("RestartRecoveryService Unit & Property Suite", async (t) => {
  const fixedNow = new Date("2026-09-09T10:00:00.000Z");
  const budget = AutonomyBudget.create({ maxSteps: 5, maxDurationMs: 60000, maxToolCalls: 10 });

  await t.test("Case A: Task QUEUED and Execution CREATED -> both reconciled to CANCELLED", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();
    const events = new MockEventPublisher();

    const task = Task.create("task-a", "trace-a", { agentId: "agent-1", input: { x: 1 } }).transition("QUEUED");
    const exec = Execution.create("exec-a", "task-a", "trace-a");

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      events,
      now: () => fixedNow,
    });

    const result = service.reconcile();

    assert.equal(result.inspectedTasks, 1);
    assert.equal(result.reconciledTasks, 1);
    assert.equal(result.inspectedExecutions, 1);
    assert.equal(result.reconciledExecutions, 1);

    const savedTask = tasks.findById("task-a");
    const savedExec = executions.findById("exec-a");

    assert.equal(savedTask?.status, "CANCELLED");
    assert.equal(savedExec?.status, "CANCELLED");
    assert.equal(savedExec?.completedAt?.toISOString(), fixedNow.toISOString());

    // Events emitted
    assert.ok(events.events.some((e) => e.type === "task.cancelled" && e.aggregateId === "task-a"));
    assert.ok(events.events.some((e) => e.type === "execution.cancelled" && e.aggregateId === "exec-a"));
  });

  await t.test("Case B: Task QUEUED and Execution RUNNING -> Execution FAILED, Task CANCELLED", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();
    const events = new MockEventPublisher();

    const task = Task.create("task-b", "trace-b", { agentId: "agent-1", input: { x: 1 } }).transition("QUEUED");
    const exec = Execution.create("exec-b", "task-b", "trace-b").start(new Date("2026-09-09T09:59:00.000Z"));

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      events,
      now: () => fixedNow,
    });

    const result = service.reconcile();

    assert.equal(result.reconciledTasks, 1);
    assert.equal(result.reconciledExecutions, 1);

    const savedTask = tasks.findById("task-b");
    const savedExec = executions.findById("exec-b");

    assert.equal(savedTask?.status, "CANCELLED");
    assert.equal(savedExec?.status, "FAILED");
    assert.equal(savedExec?.error?.code, "CRASH_RECOVERY");
  });

  await t.test("Case C: Task RUNNING and Execution RUNNING -> both reconciled to FAILED with CRASH_RECOVERY", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();
    const events = new MockEventPublisher();

    const task = Task.create("task-c", "trace-c", { agentId: "agent-1", input: { x: 1 } })
      .transition("QUEUED")
      .transition("RUNNING");
    const exec = Execution.create("exec-c", "task-c", "trace-c").start(new Date("2026-09-09T09:59:00.000Z"));

    tasks.save(task);
    executions.save(exec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      events,
      now: () => fixedNow,
    });

    const result = service.reconcile();

    assert.equal(result.reconciledTasks, 1);
    assert.equal(result.reconciledExecutions, 1);

    const savedTask = tasks.findById("task-c");
    const savedExec = executions.findById("exec-c");

    assert.equal(savedTask?.status, "FAILED");
    assert.equal(savedTask?.error?.code, "CRASH_RECOVERY");
    assert.equal(savedExec?.status, "FAILED");
    assert.equal(savedExec?.error?.code, "CRASH_RECOVERY");
  });

  await t.test("Case D & E: Terminal entities (COMPLETED, FAILED, CANCELLED) are untouched", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();
    const events = new MockEventPublisher();

    const completedTask = Task.create("task-d", "trace-d", { agentId: "agent-1", input: { x: 1 } })
      .transition("QUEUED")
      .transition("RUNNING")
      .complete({ res: "ok" });
    const completedExec = Execution.create("exec-d", "task-d", "trace-d")
      .start()
      .complete({ meta: 1 });

    const failedTask = Task.create("task-e", "trace-e", { agentId: "agent-1", input: { x: 1 } })
      .transition("QUEUED")
      .transition("RUNNING")
      .fail(new TaskError("ERR", "failed"));
    const failedExec = Execution.create("exec-e", "task-e", "trace-e")
      .start()
      .fail(new TaskError("ERR", "failed"));

    tasks.save(completedTask);
    executions.save(completedExec);
    tasks.save(failedTask);
    executions.save(failedExec);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      events,
      now: () => fixedNow,
    });

    const result = service.reconcile();

    assert.equal(result.inspectedTasks, 2);
    assert.equal(result.reconciledTasks, 0);
    assert.equal(result.alreadyTerminalTasks, 2);

    assert.equal(result.inspectedExecutions, 2);
    assert.equal(result.reconciledExecutions, 0);
    assert.equal(result.alreadyTerminalExecutions, 2);

    // No events should be emitted for terminal entities
    assert.equal(events.events.length, 0);
  });

  await t.test("Case F: AutonomousOperation SUBMITTED and RUNNING reconciled properly", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();
    const operations = new InMemoryOperationRepository();
    const events = new MockEventPublisher();

    const opSubmitted = AutonomousOperation.create({
      id: "op-sub",
      objective: "Obj 1",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    });

    const opRunning = AutonomousOperation.create({
      id: "op-run",
      objective: "Obj 2",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    }).start(fixedNow);

    const opCompleted = AutonomousOperation.create({
      id: "op-comp",
      objective: "Obj 3",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    }).start(fixedNow).complete({ ok: true }, fixedNow);

    operations.save(opSubmitted);
    operations.save(opRunning);
    operations.save(opCompleted);

    const service = new RestartRecoveryService({
      tasks,
      executions,
      operations,
      events,
      now: () => fixedNow,
    });

    const result = service.reconcile();

    assert.equal(result.inspectedOperations, 3);
    assert.equal(result.reconciledOperations, 2);
    assert.equal(result.alreadyTerminalOperations, 1);

    const savedSub = operations.findById("op-sub");
    const savedRun = operations.findById("op-run");
    const savedComp = operations.findById("op-comp");

    assert.equal(savedSub?.status, "CANCELLED");
    assert.equal(savedRun?.status, "FAILED");
    assert.equal(savedRun?.failureError?.code, "CRASH_RECOVERY_OPERATION_TERMINATED");
    assert.equal(savedComp?.status, "COMPLETED");

    assert.ok(events.events.some((e) => e.type === "operation.cancelled" && e.aggregateId === "op-sub"));
    assert.ok(events.events.some((e) => e.type === "operation.failed" && e.aggregateId === "op-run"));
  });

  await t.test("Case G: Orphan Executions and Tasks without counterparts", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();

    const orphanCreated = Execution.create("orphan-c", "non-existent-task-1", "trace-1");
    const orphanRunning = Execution.create("orphan-run", "non-existent-task-2", "trace-2").start();

    executions.save(orphanCreated);
    executions.save(orphanRunning);

    const service = new RestartRecoveryService({ tasks, executions });
    const result = service.reconcile();

    assert.equal(result.reconciledExecutions, 2);
    assert.equal(executions.findById("orphan-c")?.status, "CANCELLED");
    assert.equal(executions.findById("orphan-run")?.status, "FAILED");
    assert.equal(executions.findById("orphan-run")?.error?.code, "ORPHAN_EXECUTION");
  });

  await t.test("Idempotency: Repeated reconcile() on reconciled operations produces zero changes", () => {
    const tasks = new InMemoryTaskRepository();
    const executions = new InMemoryExecutionRepository();
    const operations = new InMemoryOperationRepository();

    operations.save(AutonomousOperation.create({
      id: "op-idem",
      objective: "Idempotency test",
      agentId: "agent-1",
      budget,
      createdAt: fixedNow,
    }).start(fixedNow));

    const service = new RestartRecoveryService({ tasks, executions, operations, now: () => fixedNow });

    const pass1 = service.reconcile();
    assert.equal(pass1.reconciledOperations, 1);
    assert.equal(pass1.alreadyTerminalOperations, 0);

    const pass2 = service.reconcile();
    assert.equal(pass2.reconciledOperations, 0);
    assert.equal(pass2.alreadyTerminalOperations, 1);
  });
});
