import assert from "node:assert/strict";
import test from "node:test";
import { rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Execution } from "../../src/domain/execution/execution.js";
import { TaskError } from "../../src/domain/task/task.js";
import { SqliteExecutionRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-execution-repository.js";
import { SqlitePersistenceError } from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

function getTempDbPath(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return join(tmpdir(), `ai-exec-test-${Date.now()}-${rand}.db`);
}

function cleanupTempDb(dbPath: string): void {
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (existsSync(p)) {
        unlinkSync(p);
      }
    } catch {
      // Ignored if locked temporarily by OS
    }
  }
}

test("SqliteExecutionRepository Unit & Durability Suite", async (t) => {
  const createSampleExecution = (id: string, taskId: string = "task-arbitrary-1") =>
    Execution.create(id, taskId, `trace-${id}`, new Date("2026-09-08T10:00:00.000Z"));

  await t.test("1. Basic CRUD, projection queries, and isolated task persistence", () => {
    const repo = new SqliteExecutionRepository({ dbPath: ":memory:" });
    // Saving execution with completely arbitrary task ID must succeed without FK error
    const exec = createSampleExecution("exec-crud-1", "task-does-not-exist");
    repo.save(exec);

    const found = repo.findById("exec-crud-1");
    assert.ok(found);
    assert.equal(found.id, "exec-crud-1");
    assert.equal(found.taskId, "task-does-not-exist");
    assert.equal(found.status, "CREATED");
    assert.ok(found instanceof Execution);
    assert.ok(Object.isFrozen(found));

    const proj = repo.findProjectionById("exec-crud-1");
    assert.ok(proj);
    assert.equal(proj.id, "exec-crud-1");
    assert.equal(proj.taskId, "task-does-not-exist");
    assert.equal(proj.status, "CREATED");

    const allProjections = repo.listProjections();
    assert.equal(allProjections.length, 1);
    assert.equal(allProjections[0]?.id, "exec-crud-1");

    repo.close();
  });

  await t.test("2. Transitions: start and complete with metadata", () => {
    const repo = new SqliteExecutionRepository({ dbPath: ":memory:" });
    const exec = createSampleExecution("exec-trans-1");
    repo.save(exec);

    const started = exec.start(new Date("2026-09-08T10:00:02.000Z"));
    repo.save(started);

    let found = repo.findById("exec-trans-1");
    assert.ok(found);
    assert.equal(found.status, "RUNNING");
    assert.equal(found.startedAt?.toISOString(), "2026-09-08T10:00:02.000Z");

    const completed = started.complete(
      { toolCalls: 2, durationMs: 500 },
      new Date("2026-09-08T10:00:05.000Z")
    );
    repo.save(completed);

    found = repo.findById("exec-trans-1");
    assert.ok(found);
    assert.equal(found.status, "COMPLETED");
    assert.equal(found.completedAt?.toISOString(), "2026-09-08T10:00:05.000Z");
    assert.deepEqual(found.resultMetadata, { toolCalls: 2, durationMs: 500 });
    assert.ok(Object.isFrozen(found.resultMetadata));

    repo.close();
  });

  await t.test("3. Failure and Cancellation transitions", () => {
    const repo = new SqliteExecutionRepository({ dbPath: ":memory:" });

    // Failure
    const execFail = createSampleExecution("exec-fail-1").start(new Date("2026-09-08T10:00:01.000Z"));
    const error = new TaskError("MODEL_TIMEOUT", "Model failed to respond");
    const failed = execFail.fail(error, new Date("2026-09-08T10:00:05.000Z"));
    repo.save(failed);

    const foundFailed = repo.findById("exec-fail-1");
    assert.ok(foundFailed);
    assert.equal(foundFailed.status, "FAILED");
    assert.equal(foundFailed.error?.code, "MODEL_TIMEOUT");

    // Cancellation
    const execCancel = createSampleExecution("exec-cancel-1").start(new Date("2026-09-08T10:00:01.000Z"));
    const cancelled = execCancel.cancel(new Date("2026-09-08T10:00:03.000Z"));
    repo.save(cancelled);

    const foundCancelled = repo.findById("exec-cancel-1");
    assert.ok(foundCancelled);
    assert.equal(foundCancelled.status, "CANCELLED");

    repo.close();
  });

  await t.test("4. Restart Durability across separate connections", () => {
    const dbPath = getTempDbPath();
    try {
      // Process A
      const repoA = new SqliteExecutionRepository({ dbPath });
      const exec = createSampleExecution("exec-durable-1")
        .start(new Date("2026-09-08T10:00:02.000Z"))
        .complete({ answer: 42 }, new Date("2026-09-08T10:00:06.000Z"));
      repoA.save(exec);
      repoA.close();

      // Process B
      const repoB = new SqliteExecutionRepository({ dbPath });
      const rehydrated = repoB.findById("exec-durable-1");
      assert.ok(rehydrated);
      assert.ok(rehydrated instanceof Execution);
      assert.ok(Object.isFrozen(rehydrated));
      assert.ok(Object.isFrozen(rehydrated.resultMetadata));
      assert.equal(rehydrated.id, "exec-durable-1");
      assert.equal(rehydrated.status, "COMPLETED");
      assert.equal(rehydrated.startedAt?.toISOString(), "2026-09-08T10:00:02.000Z");
      assert.equal(rehydrated.completedAt?.toISOString(), "2026-09-08T10:00:06.000Z");
      assert.deepEqual(rehydrated.resultMetadata, { answer: 42 });

      repoB.close();
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  await t.test("5. Fail-Closed: corrupted JSON in result_metadata throws SqlitePersistenceError", () => {
    const repo = new SqliteExecutionRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    db.prepare(`
      INSERT INTO executions (id, task_id, trace_id, status, created_at, completed_at, result_metadata)
      VALUES ('corrupt-meta-exec', 'task-1', 'trace-1', 'COMPLETED', '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:05.000Z', '{ invalid json');
    `).run();

    assert.throws(
      () => repo.findById("corrupt-meta-exec"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Malformed JSON")
    );

    repo.close();
  });

  await t.test("6. Fail-Closed: invalid date string throws SqlitePersistenceError", () => {
    const repo = new SqliteExecutionRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    db.prepare(`
      INSERT INTO executions (id, task_id, trace_id, status, created_at)
      VALUES ('corrupt-date-exec', 'task-1', 'trace-1', 'CREATED', 'garbage-date');
    `).run();

    assert.throws(
      () => repo.findById("corrupt-date-exec"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Invalid date")
    );

    repo.close();
  });
});
