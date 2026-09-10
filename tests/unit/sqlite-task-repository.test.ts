import assert from "node:assert/strict";
import test from "node:test";
import { rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Task, TaskError } from "../../src/domain/task/task.js";
import { SqliteTaskRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-task-repository.js";
import { SqlitePersistenceError } from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

function getTempDbPath(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return join(tmpdir(), `ai-task-test-${Date.now()}-${rand}.db`);
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

test("SqliteTaskRepository Unit & Durability Suite", async (t) => {
  const createSampleTask = (id: string, agentId: string = "agent-unit-1") =>
    Task.create(
      id,
      `trace-${id}`,
      {
        agentId,
        input: { action: "unit-test", payload: 42 },
      },
      new Date("2026-09-08T12:00:00.000Z")
    );


  await t.test("1. Basic CRUD and projection queries", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const task = createSampleTask("task-crud-1");
    repo.save(task);

    const found = repo.findById("task-crud-1");
    assert.ok(found);
    assert.equal(found.id, "task-crud-1");
    assert.equal(found.status, "CREATED");
    assert.ok(found instanceof Task);
    assert.ok(Object.isFrozen(found));

    const proj = repo.findProjectionById("task-crud-1");
    assert.ok(proj);
    assert.equal(proj.id, "task-crud-1");
    assert.deepEqual(proj.request.input, { action: "unit-test", payload: 42 });

    const allProjections = repo.listProjections();
    assert.equal(allProjections.length, 1);
    assert.equal(allProjections[0]?.id, "task-crud-1");

    repo.close();
  });

  await t.test("2. Transitions: save updates status and completed result", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const task = createSampleTask("task-trans-1");
    repo.save(task);

    const queued = task.transition("QUEUED");
    repo.save(queued);
    assert.equal(repo.findById("task-trans-1")?.status, "QUEUED");

    const running = queued.transition("RUNNING");
    repo.save(running);
    assert.equal(repo.findById("task-trans-1")?.status, "RUNNING");

    const completed = running.complete(
      { success: true, score: 99 },
      new Date("2026-09-08T12:00:10.000Z")
    );
    repo.save(completed);

    const foundCompleted = repo.findById("task-trans-1");
    assert.ok(foundCompleted);
    assert.equal(foundCompleted.status, "COMPLETED");
    assert.ok(foundCompleted.result);
    assert.deepEqual(foundCompleted.result.output, { success: true, score: 99 });
    assert.ok(Object.isFrozen(foundCompleted.result.output));

    repo.close();
  });

  await t.test("3. Failure transition with TaskError", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const task = createSampleTask("task-fail-1");
    repo.save(task);

    const running = task.transition("QUEUED").transition("RUNNING");
    const error = new TaskError("ERR_CALC", "Calculation exploded");
    const failed = running.fail(error);
    repo.save(failed);

    const foundFailed = repo.findById("task-fail-1");
    assert.ok(foundFailed);
    assert.equal(foundFailed.status, "FAILED");
    assert.ok(foundFailed.error);
    assert.equal(foundFailed.error.code, "ERR_CALC");
    assert.equal(foundFailed.error.message, "Calculation exploded");

    repo.close();
  });

  await t.test("4. Restart Durability across separate connections", () => {
    const dbPath = getTempDbPath();
    try {
      // Process A
      const repoA = new SqliteTaskRepository({ dbPath });
      const task = createSampleTask("task-durable-1")
        .transition("QUEUED")
        .transition("RUNNING")
        .complete({ answer: "survived" }, new Date("2026-09-08T12:00:15.000Z"));
      repoA.save(task);
      repoA.close();

      // Process B
      const repoB = new SqliteTaskRepository({ dbPath });
      const rehydrated = repoB.findById("task-durable-1");
      assert.ok(rehydrated);
      assert.ok(rehydrated instanceof Task);
      assert.ok(Object.isFrozen(rehydrated));
      assert.ok(Object.isFrozen(rehydrated.result?.output));
      assert.equal(rehydrated.id, "task-durable-1");
      assert.equal(rehydrated.status, "COMPLETED");
      assert.deepEqual(rehydrated.result?.output, { answer: "survived" });
      assert.equal(rehydrated.result?.completedAt.toISOString(), "2026-09-08T12:00:15.000Z");

      repoB.close();
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  await t.test("5. Fail-Closed: corrupted JSON in tasks.input throws SqlitePersistenceError", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    // Directly insert corrupt JSON into database
    db.prepare(`
      INSERT INTO tasks (id, trace_id, agent_id, input, status, created_at)
      VALUES ('corrupt-json-task', 'trace-1', 'agent-1', '{ not valid json', 'CREATED', '2026-09-08T10:00:00.000Z');
    `).run();

    assert.throws(
      () => repo.findById("corrupt-json-task"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Malformed JSON")
    );

    repo.close();
  });

  await t.test("6. Fail-Closed: invalid date string throws SqlitePersistenceError", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    db.prepare(`
      INSERT INTO tasks (id, trace_id, agent_id, input, status, created_at)
      VALUES ('corrupt-date-task', 'trace-1', 'agent-1', '{"a":1}', 'CREATED', 'not-a-date');
    `).run();

    assert.throws(
      () => repo.findById("corrupt-date-task"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Invalid date")
    );

    repo.close();
  });

  await t.test("7. Fail-Closed: invalid status string throws SqlitePersistenceError", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    // Disable check constraint temporarily or inject via pragma
    db.exec("PRAGMA ignore_check_constraints = ON;");
    db.prepare(`
      INSERT INTO tasks (id, trace_id, agent_id, input, status, created_at)
      VALUES ('corrupt-status-task', 'trace-1', 'agent-1', '{"a":1}', 'INVALID_STATUS', '2026-09-08T10:00:00.000Z');
    `).run();
    db.exec("PRAGMA ignore_check_constraints = OFF;");

    assert.throws(
      () => repo.findById("corrupt-status-task"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Corrupted task status")
    );

    repo.close();
  });

  await t.test("8. Fail-Closed: COMPLETED status without output throws SqlitePersistenceError", () => {
    const repo = new SqliteTaskRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    db.prepare(`
      INSERT INTO tasks (id, trace_id, agent_id, input, status, created_at, completed_at)
      VALUES ('corrupt-completed-task', 'trace-1', 'agent-1', '{"a":1}', 'COMPLETED', '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:05.000Z');
    `).run();

    assert.throws(
      () => repo.findById("corrupt-completed-task"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("missing output")
    );

    repo.close();
  });
});
