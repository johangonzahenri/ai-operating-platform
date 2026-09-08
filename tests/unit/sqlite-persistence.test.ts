import assert from "node:assert/strict";
import test from "node:test";
import { rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AutonomousOperation } from "../../src/domain/autonomy/autonomous-operation.js";
import { AutonomyBudget } from "../../src/domain/autonomy/autonomy-budget.js";
import { AutonomyConsumption } from "../../src/domain/autonomy/autonomy-consumption.js";
import { Decision } from "../../src/domain/autonomy/decision.js";
import { Observation } from "../../src/domain/autonomy/observation.js";
import { Plan, PlanStep } from "../../src/domain/autonomy/plan.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import {
  CURRENT_SCHEMA_VERSION,
  initializeSchema,
} from "../../src/infrastructure/persistence/sqlite/sqlite-schema.js";
import {
  IncompatibleSchemaVersionError,
  OptimisticConcurrencyError,
  SqlitePersistenceError,
} from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";
import { SqliteOperationRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-operation-repository.js";

function getTempDbPath(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return join(tmpdir(), `ai-op-test-${Date.now()}-${rand}.db`);
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

test("SQLite Durable Persistence Infrastructure Suite", async (t) => {
  const createSampleBudget = () =>
    AutonomyBudget.create({
      maxSteps: 10,
      maxDurationMs: 30000,
      maxToolCalls: 5,
      maxTokens: 8000,
    });

  const createSampleOperation = (id: string, agentId: string = "agent-unit-1") =>
    AutonomousOperation.create({
      id,
      agentId,
      objective: `Unit test execution for ${id}`,
      budget: createSampleBudget(),
      createdAt: new Date("2026-09-08T12:00:00.000Z"),
    });

  // --------------------------------------------------------------------------
  // 1. Schema Lifecycle & Versioning
  // --------------------------------------------------------------------------
  await t.test("Schema: bootstrap on empty database sets schema_version to CURRENT_SCHEMA_VERSION", () => {
    const db = new DatabaseSync(":memory:");
    initializeSchema(db);

    const row = db
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;

    assert.ok(row);
    assert.equal(parseInt(row.value, 10), CURRENT_SCHEMA_VERSION);
    db.close();
  });

  await t.test("Schema: re-initializing existing database is non-destructive", () => {
    const db = new DatabaseSync(":memory:");
    initializeSchema(db);

    // Insert dummy record
    db.exec(`
      INSERT INTO operations (
        id, agent_id, objective, status,
        budget_max_steps, budget_max_duration_ms, budget_max_tool_calls,
        consumption_steps_used, consumption_elapsed_ms, consumption_tool_calls_used,
        created_at, version
      ) VALUES (
        'op-preserve-1', 'agent-1', 'Do not drop', 'SUBMITTED',
        5, 5000, 2,
        0, 0, 0,
        '2026-09-08T12:00:00.000Z', 1
      );
    `);

    // Re-run schema initialization
    initializeSchema(db);

    // Verify row still exists
    const row = db.prepare("SELECT id FROM operations WHERE id = 'op-preserve-1'").get();
    assert.ok(row);
    db.close();
  });

  await t.test("Schema: rejects database with future/incompatible schema version", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_metadata VALUES ('schema_version', '99', '2026-09-08T00:00:00.000Z');
    `);

    assert.throws(
      () => initializeSchema(db),
      (err: unknown) => {
        return err instanceof IncompatibleSchemaVersionError && err.foundVersion === 99;
      }
    );
    db.close();
  });

  // --------------------------------------------------------------------------
  // 2. Restart Durability (Disk Persistence Round-Trip)
  // --------------------------------------------------------------------------
  await t.test("Durability: saves to disk DB, closes connection, reopens in new instance, asserts identical state", () => {
    const dbPath = getTempDbPath();

    try {
      // 1. Instance A writes
      const repoA = new SqliteOperationRepository({ dbPath });
      const op = createSampleOperation("op-durable-1")
        .start(new Date("2026-09-08T12:00:02.000Z"))
        .recordStep({ elapsedMs: 150, toolCalls: 1, tokens: 450 })
        .complete({ answer: 42 }, new Date("2026-09-08T12:00:05.000Z"));

      const plan = Plan.create({
        id: "plan-durable-1",
        operationId: "op-durable-1",
        steps: [
          PlanStep.create({
            id: "step-d-1",
            order: 1,
            action: "compute_answer",
            input: { query: "meaning of life" },
            metadata: { priority: "high" },
          }),
        ],
      });

      const obs = Observation.create({
        observationId: "obs-d-1",
        operationId: "op-durable-1",
        stepId: "step-d-1",
        status: "SUCCESS",
        durationMs: 150,
        toolCalls: 1,
        output: { answer: 42 },
      });

      const dec = Decision.create({
        operationId: "op-durable-1",
        type: "COMPLETE",
        output: { answer: 42 },
        rationale: "Answer computed",
        decidedAt: new Date("2026-09-08T12:00:05.000Z"),
      });

      repoA.save(op, {
        plan,
        observations: [obs],
        decisions: [dec],
      });

      // Close instance A
      repoA.close();

      // 2. Instance B reopens and verifies
      const repoB = new SqliteOperationRepository({ dbPath });
      const loadedOp = repoB.findById("op-durable-1");
      assert.ok(loadedOp);
      assert.equal(loadedOp.id, "op-durable-1");
      assert.equal(loadedOp.status, "COMPLETED");
      assert.equal(loadedOp.consumption.stepsUsed, 1);
      assert.equal(loadedOp.consumption.elapsedMs, 150);
      assert.equal(loadedOp.consumption.toolCallsUsed, 1);
      assert.equal(loadedOp.consumption.tokensUsed, 450);
      assert.deepEqual(loadedOp.resultOutput, { answer: 42 });

      const loadedRecord = repoB.findRecordById("op-durable-1");
      assert.ok(loadedRecord);
      assert.ok(loadedRecord.plan);
      assert.equal(loadedRecord.plan.id, "plan-durable-1");
      assert.equal(loadedRecord.plan.steps.length, 1);
      assert.equal(loadedRecord.plan.steps[0]?.action, "compute_answer");
      assert.deepEqual(loadedRecord.plan.steps[0]?.metadata, { priority: "high" });

      assert.equal(loadedRecord.observations.length, 1);
      assert.equal(loadedRecord.observations[0]?.observationId, "obs-d-1");
      assert.equal(loadedRecord.observations[0]?.status, "SUCCESS");

      assert.equal(loadedRecord.decisions.length, 1);
      assert.equal(loadedRecord.decisions[0]?.type, "COMPLETE");

      repoB.close();
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Transaction Rollback Integrity
  // --------------------------------------------------------------------------
  await t.test("Transactions: multi-table mutation rolls back cleanly upon exception", () => {
    const repo = new SqliteOperationRepository({ dbPath: ":memory:" });
    const op = createSampleOperation("op-rollback-1");
    repo.save(op);

    // Initial state check
    assert.equal(repo.findById("op-rollback-1")?.status, "SUBMITTED");
    assert.equal(repo.findRecordById("op-rollback-1")?.observations.length, 0);

    const advanced = op.start();

    // Create an observation that violates foreign key by referencing non-existent step or invalid data
    const validObs = Observation.create({
      observationId: "obs-valid-1",
      operationId: "op-rollback-1",
      stepId: "step-1",
      status: "SUCCESS",
      durationMs: 10,
    });

    // Mock an error during child persistence inside transaction
    const db = repo.getDatabase();

    // Force an error inside a transactional execution
    assert.throws(
      () => {
        const dbManager = (repo as unknown as { dbManager: SqliteDatabase }).dbManager;
        dbManager.transaction(() => {
          // 1. Mutate operation
          db.prepare("UPDATE operations SET status = 'RUNNING' WHERE id = ?").run("op-rollback-1");
          // 2. Insert valid observation
          db.prepare(`
            INSERT INTO observations (
              observation_id, operation_id, step_id, status, duration_ms, tool_calls, created_at
            ) VALUES ('obs-valid-1', 'op-rollback-1', 'step-1', 'SUCCESS', 10, 0, '2026-09-08T12:00:00.000Z')
          `).run();
          // 3. Throw simulated mid-transaction failure
          throw new Error("Simulated transient storage failure");
        });
      },
      /Simulated transient storage failure/
    );

    // Verify database state was rolled back completely
    const revertedOp = repo.findById("op-rollback-1");
    assert.ok(revertedOp);
    assert.equal(revertedOp.status, "SUBMITTED"); // Still SUBMITTED!
    assert.equal(repo.findRecordById("op-rollback-1")?.observations.length, 0); // No orphan observation!

    repo.close();
  });

  // --------------------------------------------------------------------------
  // 4. Optimistic Concurrency Control (OCC)
  // --------------------------------------------------------------------------
  await t.test("OCC: updates increment version and detect stale concurrency conflicts", () => {
    const repo = new SqliteOperationRepository({ dbPath: ":memory:" });
    const op = createSampleOperation("op-occ-1");
    repo.save(op);

    assert.equal(repo.getVersion("op-occ-1"), 1);

    // First update with expectedVersion: 1 -> succeeds, increments to version 2
    const running = op.start();
    repo.save(running, { expectedVersion: 1 });
    assert.equal(repo.getVersion("op-occ-1"), 2);
    assert.equal(repo.findById("op-occ-1")?.status, "RUNNING");

    // Second update trying to use stale version 1 -> throws OptimisticConcurrencyError
    const failedAttempt = running.complete({ done: true });
    assert.throws(
      () => {
        repo.save(failedAttempt, { expectedVersion: 1 });
      },
      (err: unknown) => {
        return (
          err instanceof OptimisticConcurrencyError &&
          err.operationId === "op-occ-1" &&
          err.expectedVersion === 1 &&
          err.currentVersion === 2
        );
      }
    );

    // Verify database state is still RUNNING, not completed by the stale attempt
    assert.equal(repo.findById("op-occ-1")?.status, "RUNNING");
    assert.equal(repo.getVersion("op-occ-1"), 2);

    // Updating with valid expectedVersion: 2 -> succeeds, increments to version 3
    repo.save(failedAttempt, { expectedVersion: 2 });
    assert.equal(repo.getVersion("op-occ-1"), 3);
    assert.equal(repo.findById("op-occ-1")?.status, "COMPLETED");

    repo.close();
  });

  // --------------------------------------------------------------------------
  // 5. Idempotency & Duplicate Prevention
  // --------------------------------------------------------------------------
  await t.test("Idempotency: repeated saves do not duplicate child records or corrupt state", () => {
    const repo = new SqliteOperationRepository({ dbPath: ":memory:" });
    const op = createSampleOperation("op-idempotent-1");

    const plan = Plan.create({
      id: "plan-idem-1",
      operationId: "op-idempotent-1",
      steps: [
        PlanStep.create({
          id: "step-idem-1",
          order: 1,
          action: "task_a",
          input: { a: 1 },
        }),
      ],
    });

    const obs = Observation.create({
      observationId: "obs-idem-1",
      operationId: "op-idempotent-1",
      stepId: "step-idem-1",
      status: "SUCCESS",
      durationMs: 50,
    });

    const dec = Decision.create({
      operationId: "op-idempotent-1",
      type: "COMPLETE",
      rationale: "Goal done",
      decidedAt: new Date("2026-09-08T12:00:00.000Z"),
    });

    // Save initial state
    repo.save(op, {
      plan,
      observations: [obs],
      decisions: [dec],
    });

    // Re-save exact same state
    repo.save(op, {
      plan,
      observations: [obs],
      decisions: [dec],
    });

    // Verify record has exactly 1 plan step, 1 observation, 1 decision
    const record = repo.findRecordById("op-idempotent-1");
    assert.ok(record);
    assert.equal(record.plan?.steps.length, 1);
    assert.equal(record.observations.length, 1);
    assert.equal(record.decisions.length, 1);

    repo.close();
  });

  // --------------------------------------------------------------------------
  // 6. Null & Undefined Field Normalization
  // --------------------------------------------------------------------------
  await t.test("Type Safety: optional/undefined fields round-trip cleanly without NaN or null bleed", () => {
    const repo = new SqliteOperationRepository({ dbPath: ":memory:" });
    const op = createSampleOperation("op-nullable-1");
    repo.save(op);

    const loaded = repo.findById("op-nullable-1");
    assert.ok(loaded);
    assert.equal(loaded.startedAt, undefined);
    assert.equal(loaded.completedAt, undefined);
    assert.equal(loaded.terminationReason, undefined);
    assert.equal(loaded.failureError, undefined);
    assert.equal(loaded.resultOutput, undefined);
    assert.equal(loaded.budget.maxTokens, 8000);
    assert.equal(loaded.consumption.tokensUsed, undefined);

    repo.close();
  });
});
