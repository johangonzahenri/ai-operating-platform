import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  CURRENT_SCHEMA_VERSION,
  initializeSchema,
  migrateV1ToV2,
  migrateV2ToV3,
  V1_CORE_DDL,
  V2_ADDITIONS_DDL,
} from "../../src/infrastructure/persistence/sqlite/sqlite-schema.js";
import {
  IncompatibleSchemaVersionError,
  SqlitePersistenceError,
} from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

test("SQLite Schema Migration V1 -> V2 -> V3 Suite", async (t) => {
  await t.test("1. Fresh Database: initializes directly to Schema V3", () => {
    const db = new DatabaseSync(":memory:");
    initializeSchema(db);

    const versionRow = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;

    assert.ok(versionRow);
    assert.equal(parseInt(versionRow.value, 10), 3);
    assert.equal(CURRENT_SCHEMA_VERSION, 3);

    // Verify all V1 tables exist
    for (const table of ["operations", "plans", "plan_steps", "observations", "decisions"]) {
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      assert.ok(tableCheck, `Expected V1 table '${table}' to exist`);
    }

    // Verify all V2 tables exist
    for (const table of ["agents", "tasks", "executions"]) {
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      assert.ok(tableCheck, `Expected V2 table '${table}' to exist`);
    }

    // Verify all V3 tables exist
    for (const table of ["events"]) {
      const tableCheck = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      assert.ok(tableCheck, `Expected V3 table '${table}' to exist`);
    }

    db.close();
  });

  await t.test("2. V1 Migration: existing V1 database preserves data and upgrades to V3", () => {
    const db = new DatabaseSync(":memory:");

    // Manually create a V1 database
    db.exec(V1_CORE_DDL);
    db.prepare(`
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', '1', '2026-09-08T10:00:00.000Z');
    `).run();

    // Populate realistic V1 data
    db.prepare(`
      INSERT INTO operations (
        id, agent_id, objective, status,
        budget_max_steps, budget_max_duration_ms, budget_max_tool_calls,
        created_at, version
      ) VALUES ('op-v1-1', 'agent-legacy', 'Preserve in migration', 'COMPLETED', 5, 5000, 2, '2026-09-08T10:00:00.000Z', 1);
    `).run();

    db.prepare(`
      INSERT INTO plans (id, operation_id, total_steps, created_at)
      VALUES ('plan-v1-1', 'op-v1-1', 1, '2026-09-08T10:00:01.000Z');
    `).run();

    db.prepare(`
      INSERT INTO plan_steps (id, plan_id, operation_id, step_order, action, input)
      VALUES ('step-v1-1', 'plan-v1-1', 'op-v1-1', 1, 'do_work', '{"val":1}');
    `).run();

    db.prepare(`
      INSERT INTO observations (observation_id, operation_id, step_id, status, duration_ms, created_at)
      VALUES ('obs-v1-1', 'op-v1-1', 'step-v1-1', 'SUCCESS', 12, '2026-09-08T10:00:02.000Z');
    `).run();

    db.prepare(`
      INSERT INTO decisions (operation_id, type, decided_at)
      VALUES ('op-v1-1', 'COMPLETE', '2026-09-08T10:00:03.000Z');
    `).run();

    // Execute schema initialization (triggers V1 -> V2 -> V3 migration)
    initializeSchema(db);

    // Verify schema metadata is now 3
    const versionRow = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    assert.ok(versionRow);
    assert.equal(parseInt(versionRow.value, 10), 3);

    // Verify all existing V1 rows are intact
    const op = db.prepare("SELECT * FROM operations WHERE id = 'op-v1-1'").get() as any;
    assert.ok(op);
    assert.equal(op.objective, "Preserve in migration");
    assert.equal(op.status, "COMPLETED");

    const plan = db.prepare("SELECT * FROM plans WHERE id = 'plan-v1-1'").get() as any;
    assert.ok(plan);
    assert.equal(plan.operation_id, "op-v1-1");

    const step = db.prepare("SELECT * FROM plan_steps WHERE id = 'step-v1-1'").get() as any;
    assert.ok(step);

    const obs = db.prepare("SELECT * FROM observations WHERE observation_id = 'obs-v1-1'").get() as any;
    assert.ok(obs);

    const dec = db.prepare("SELECT * FROM decisions WHERE operation_id = 'op-v1-1'").get() as any;
    assert.ok(dec);

    // Verify new V2 and V3 tables exist and are empty and ready
    for (const table of ["agents", "tasks", "executions", "events"]) {
      const count = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as { count: number };
      assert.equal(count.count, 0);
    }

    db.close();
  });

  await t.test("3. V2 Migration: existing V2 database preserves data and upgrades to V3", () => {
    const db = new DatabaseSync(":memory:");

    // Initialize V1 and V2
    db.exec(V1_CORE_DDL);
    db.exec(V2_ADDITIONS_DDL);
    db.prepare(`
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', '2', '2026-09-08T11:00:00.000Z');
    `).run();

    // Insert V2 data
    db.prepare(`
      INSERT INTO agents (id, name, description, model, instructions, tools, memory_scope, status, version, created_at, updated_at)
      VALUES ('agent-v2-1', 'V2 Agent', 'Desc', 'gpt-4o', 'Do work', '[]', 'TASK', 'ACTIVE', 1, '2026-09-08T11:00:00.000Z', '2026-09-08T11:00:00.000Z');
    `).run();

    db.prepare(`
      INSERT INTO tasks (id, trace_id, agent_id, input, status, created_at)
      VALUES ('task-v2-1', 'trace-v2-1', 'agent-v2-1', '{"prompt":"hello"}', 'QUEUED', '2026-09-08T11:00:01.000Z');
    `).run();

    db.prepare(`
      INSERT INTO executions (id, task_id, trace_id, status, created_at)
      VALUES ('exec-v2-1', 'task-v2-1', 'trace-v2-1', 'CREATED', '2026-09-08T11:00:02.000Z');
    `).run();

    // Execute schema initialization (triggers V2 -> V3 migration)
    initializeSchema(db);

    // Verify schema metadata is now 3
    const versionRow = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    assert.ok(versionRow);
    assert.equal(parseInt(versionRow.value, 10), 3);

    // Verify V2 records are intact
    const agent = db.prepare("SELECT * FROM agents WHERE id = 'agent-v2-1'").get() as any;
    assert.ok(agent);
    assert.equal(agent.name, "V2 Agent");

    const task = db.prepare("SELECT * FROM tasks WHERE id = 'task-v2-1'").get() as any;
    assert.ok(task);
    assert.equal(task.status, "QUEUED");

    const execution = db.prepare("SELECT * FROM executions WHERE id = 'exec-v2-1'").get() as any;
    assert.ok(execution);
    assert.equal(execution.status, "CREATED");

    // Verify events table exists and is empty
    const eventCount = db.prepare("SELECT count(*) as count FROM events").get() as { count: number };
    assert.equal(eventCount.count, 0);

    db.close();
  });

  await t.test("4. Idempotency: re-initializing an existing V3 database is a safe no-op", () => {
    const db = new DatabaseSync(":memory:");
    initializeSchema(db);

    const versionRow1 = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    assert.equal(parseInt(versionRow1!.value, 10), 3);

    // Re-initialize
    initializeSchema(db);

    const versionRow2 = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    assert.equal(parseInt(versionRow2!.value, 10), 3);

    db.close();
  });

  await t.test("5. Future Version: rejects database with schema_version > 3 fail-closed", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_metadata VALUES ('schema_version', '4', '2026-09-08T00:00:00.000Z');
    `);

    assert.throws(
      () => initializeSchema(db),
      (err: unknown) => {
        return err instanceof IncompatibleSchemaVersionError && err.foundVersion === 4 && err.expectedVersion === 3;
      }
    );

    db.close();
  });

  await t.test("6. Rollback: failure during V1 -> V2 migration rolls back transaction and preserves V1 metadata", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(V1_CORE_DDL);
    db.prepare(`
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', '1', '2026-09-08T10:00:00.000Z');
    `).run();

    // Trigger migration with intentionally broken SQL
    assert.throws(
      () => migrateV1ToV2(db, "CREATE TABLE invalid syntax error !!!;"),
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("Failed to migrate SQLite schema from v1 to v2");
      }
    );

    // Verify metadata still indicates version 1 (not upgraded to 2 or 3)
    const versionRow = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    assert.ok(versionRow);
    assert.equal(parseInt(versionRow.value, 10), 1);

    // Verify partial tables were not created
    const agentTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
      .get();
    assert.equal(agentTable, undefined);

    db.close();
  });

  await t.test("7. Rollback: failure during V2 -> V3 migration rolls back transaction and preserves V2 metadata", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(V1_CORE_DDL);
    db.exec(V2_ADDITIONS_DDL);
    db.prepare(`
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', '2', '2026-09-08T11:00:00.000Z');
    `).run();

    // Trigger migration with intentionally broken SQL
    assert.throws(
      () => migrateV2ToV3(db, "CREATE TABLE invalid syntax error !!!;"),
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("Failed to migrate SQLite schema from v2 to v3");
      }
    );

    // Verify metadata still indicates version 2
    const versionRow = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    assert.ok(versionRow);
    assert.equal(parseInt(versionRow.value, 10), 2);

    // Verify events table was not created
    const eventsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
      .get();
    assert.equal(eventsTable, undefined);

    db.close();
  });
});
