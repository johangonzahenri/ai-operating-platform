import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";

test("SQLite Durable Persistence - CoreRuntime Integration Suite", async (t) => {
  await t.test("executes SubmitTask through CoreRuntime with durable SQLite repositories under PRAGMA foreign_keys = ON", async () => {
    const platform = createPlatform({
      useDurablePersistence: true,
      dbPath: ":memory:",
    });

    const db = platform.db?.getDatabase();
    assert.ok(db, "Expected platform.db to be initialized");

    // Verify PRAGMA foreign_keys is ON
    const fkPragma = db.prepare("PRAGMA foreign_keys;").get() as { foreign_keys: number };
    assert.equal(fkPragma.foreign_keys, 1, "PRAGMA foreign_keys must be active");

    // Submit task: CoreRuntime will execute:
    // 1. saveExecution (Execution CREATED)
    // 2. saveTask (Task QUEUED)
    // 3. saveExecution (Execution RUNNING)
    // 4. saveTask (Task RUNNING)
    // 5. Strategy execution -> saveExecution (COMPLETED) -> saveTask (COMPLETED)
    const response = await platform.submitTask.execute({
      agentId: "foundation-agent",
      input: { expression: "5 * 5" },
    });

    assert.ok(response);
    assert.equal(response.task.status, "COMPLETED");
    assert.equal(response.execution.status, "COMPLETED");

    // Verify directly from SQLite repositories
    const persistedTask = platform.tasks.findById(response.task.id);
    assert.ok(persistedTask);
    assert.equal(persistedTask.id, response.task.id);
    assert.equal(persistedTask.status, "COMPLETED");

    const persistedExec = platform.executions.findById(response.execution.id);
    assert.ok(persistedExec);
    assert.equal(persistedExec.id, response.execution.id);
    assert.equal(persistedExec.taskId, response.task.id);
    assert.equal(persistedExec.status, "COMPLETED");

    // Verify raw SQLite rows
    const taskRow = db.prepare("SELECT * FROM tasks WHERE id = ?").get(response.task.id) as any;
    assert.ok(taskRow);
    assert.equal(taskRow.status, "COMPLETED");

    const execRow = db.prepare("SELECT * FROM executions WHERE id = ?").get(response.execution.id) as any;
    assert.ok(execRow);
    assert.equal(execRow.task_id, response.task.id);
    assert.equal(execRow.status, "COMPLETED");

    platform.db?.close();
  });
});
