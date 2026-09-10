import assert from "node:assert/strict";
import test from "node:test";
import { Task, TaskError, TaskRepository } from "../../src/domain/task/task.js";
import { TaskQueryPort } from "../../src/application/ports/query-ports.js";
import { InMemoryTaskRepository } from "../../src/infrastructure/persistence/in-memory-task-repository.js";
import { SqliteTaskRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-task-repository.js";

/**
 * Reusable contract test suite for any implementation of TaskRepository.
 * Ensures InMemoryTaskRepository and SqliteTaskRepository adhere to identical semantics.
 */
export function runTaskRepositoryContractTests(
  adapterName: string,
  factory: () => TaskRepository & { list(): readonly Task[] }
): void {
  test(`${adapterName} - TaskRepository Contract Suite`, async (t) => {
    const createSampleTask = (id: string, agentId: string = "agent-1") =>
      Task.create(
        id,
        `trace-${id}`,
        {
          agentId,
          input: { query: `Execute task ${id}` },
        },
        new Date("2026-09-08T12:00:00.000Z")
      );


    await t.test("1. Basic Identity Persistence: saves and retrieves by ID", () => {
      const repo = factory();
      const task = createSampleTask("task-contract-1");

      assert.equal(repo.findById("task-contract-1"), undefined);
      assert.equal(repo.list().length, 0);

      repo.save(task);

      const retrieved = repo.findById("task-contract-1");
      assert.ok(retrieved);
      assert.equal(retrieved.id, "task-contract-1");
      assert.equal(retrieved.traceId, "trace-task-contract-1");
      assert.equal(retrieved.request.agentId, "agent-1");
      assert.deepEqual(retrieved.request.input, { query: "Execute task task-contract-1" });
      assert.equal(retrieved.status, "CREATED");
      assert.equal(retrieved.result, undefined);
      assert.equal(retrieved.error, undefined);
    });

    await t.test("2. Non-existent IDs: returns undefined gracefully", () => {
      const repo = factory();
      assert.equal(repo.findById("non-existent-task"), undefined);
    });

    await t.test("3. Lifecycle State Updates: transitions from CREATED -> QUEUED -> RUNNING -> COMPLETED", () => {
      const repo = factory();
      const task = createSampleTask("task-lifecycle-1");
      repo.save(task);

      // CREATED -> QUEUED
      const queued = task.transition("QUEUED");
      repo.save(queued);

      let found = repo.findById("task-lifecycle-1");
      assert.ok(found);
      assert.equal(found.status, "QUEUED");

      // QUEUED -> RUNNING
      const running = queued.transition("RUNNING");
      repo.save(running);

      found = repo.findById("task-lifecycle-1");
      assert.ok(found);
      assert.equal(found.status, "RUNNING");

      // RUNNING -> COMPLETED
      const completed = running.complete({ resultValue: 100 }, new Date("2026-09-08T12:00:10.000Z"));
      repo.save(completed);

      found = repo.findById("task-lifecycle-1");
      assert.ok(found);
      assert.equal(found.status, "COMPLETED");
      assert.ok(found.result);
      assert.deepEqual(found.result.output, { resultValue: 100 });
      assert.equal(found.error, undefined);
    });

    await t.test("4. Failure Lifecycle: transitions to FAILED with TaskError", () => {
      const repo = factory();
      const task = createSampleTask("task-failed-1");
      repo.save(task);

      const running = task.transition("QUEUED").transition("RUNNING");
      repo.save(running);

      const error = new TaskError("TIMEOUT", "Task timed out after 30s");
      const failed = running.fail(error);
      repo.save(failed);

      const found = repo.findById("task-failed-1");
      assert.ok(found);
      assert.equal(found.status, "FAILED");
      assert.ok(found.error);
      assert.equal(found.error.code, "TIMEOUT");
      assert.equal(found.error.message, "Task timed out after 30s");
      assert.equal(found.result, undefined);
    });

    await t.test("5. Listing: lists all tasks", () => {
      const repo = factory();
      const taskA = createSampleTask("task-list-a");
      const taskB = createSampleTask("task-list-b");

      repo.save(taskA);
      repo.save(taskB);

      const list = repo.list();
      assert.equal(list.length, 2);
      assert.ok(list.some((t) => t.id === "task-list-a"));
      assert.ok(list.some((t) => t.id === "task-list-b"));
    });
  });
}

// Execute against InMemoryTaskRepository
runTaskRepositoryContractTests(
  "InMemoryTaskRepository",
  () => new InMemoryTaskRepository()
);

// Execute against SqliteTaskRepository
runTaskRepositoryContractTests(
  "SqliteTaskRepository",
  () => new SqliteTaskRepository({ dbPath: ":memory:" })
);
