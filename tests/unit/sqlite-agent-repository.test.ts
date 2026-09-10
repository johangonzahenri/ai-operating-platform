import assert from "node:assert/strict";
import test from "node:test";
import { rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  Agent,
  AgentAlreadyExistsError,
  AgentNotFoundError,
} from "../../src/domain/agent/agent.js";
import { SqliteAgentRepository } from "../../src/infrastructure/persistence/sqlite/sqlite-agent-repository.js";
import {
  OptimisticConcurrencyError,
  SqlitePersistenceError,
} from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

function getTempDbPath(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return join(tmpdir(), `ai-agent-test-${Date.now()}-${rand}.db`);
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

test("SqliteAgentRepository Unit, OCC & Durability Suite", async (t) => {
  const createSampleAgent = (id: string = "agent-unit-1") =>
    Agent.create({
      id,
      name: "Unit Agent",
      description: "Testing SQLite agent repository",
      model: "stub-model",
      instructions: "Perform unit tests",
      tools: ["calculator", "search"],
      memoryScope: `scope-${id}`,
    });

  await t.test("1. Basic registration, finding, and projections", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-crud-1");

    repo.register(agent);

    const found = repo.findById("agent-crud-1");
    assert.ok(found);
    assert.equal(found.id, "agent-crud-1");
    assert.equal(found.name, "Unit Agent");
    assert.equal(found.model, "stub-model");
    assert.equal(found.status, "ACTIVE");
    assert.equal(found.version, 1);
    assert.deepEqual(found.tools, ["calculator", "search"]);
    assert.ok(found instanceof Agent);
    assert.ok(Object.isFrozen(found));
    assert.ok(Object.isFrozen(found.tools));

    const proj = repo.findProjectionById("agent-crud-1");
    assert.ok(proj);
    assert.equal(proj.id, "agent-crud-1");
    assert.equal(proj.name, "Unit Agent");
    assert.equal(proj.version, 1);

    const allProjections = repo.listProjections();
    assert.equal(allProjections.length, 1);
    assert.equal(allProjections[0]?.id, "agent-crud-1");

    repo.close();
  });

  await t.test("2. Rejects duplicate registration with AgentAlreadyExistsError", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-dup-1");

    repo.register(agent);
    assert.throws(
      () => repo.register(agent),
      (err: unknown) => err instanceof AgentAlreadyExistsError && err.agentId === "agent-dup-1"
    );

    repo.close();
  });

  await t.test("3. Update unknown agent throws AgentNotFoundError", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-ghost");

    assert.throws(
      () => repo.update(agent),
      (err: unknown) => err instanceof AgentNotFoundError && err.agentId === "agent-ghost"
    );

    repo.close();
  });

  await t.test("4. OCC: normal update advances version and succeeds", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-occ-1");
    repo.register(agent);

    const updated = agent.update({ name: "Updated Unit Agent", tools: ["calculator", "bash"] });
    assert.equal(updated.version, 2);

    repo.update(updated);

    const found = repo.findById("agent-occ-1");
    assert.ok(found);
    assert.equal(found.name, "Updated Unit Agent");
    assert.equal(found.version, 2);
    assert.deepEqual(found.tools, ["calculator", "bash"]);

    repo.close();
  });

  await t.test("5. OCC: stale snapshot update throws OptimisticConcurrencyError", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-occ-conflict");
    repo.register(agent);

    // Concurrent branch A updates to version 2
    const branchA = agent.update({ name: "Branch A Update" });
    repo.update(branchA);
    assert.equal(repo.findById("agent-occ-conflict")?.version, 2);

    // Concurrent branch B (still on version 1 snapshot) tries to update
    const branchB = agent.update({ name: "Branch B Update" });
    // branchB.version is 2, but expected in DB is 1, whereas DB is now at version 2!
    assert.throws(
      () => repo.update(branchB),
      (err: unknown) => err instanceof OptimisticConcurrencyError
    );

    // Stale snapshot with explicit version 1 also fails
    assert.throws(
      () => repo.update(agent),
      (err: unknown) => err instanceof OptimisticConcurrencyError
    );

    repo.close();
  });

  await t.test("6. Activate / Deactivate preserve version and succeed atomically", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-state-trans");
    repo.register(agent);

    // Deactivate preserves version
    const deactivated = agent.deactivate();
    assert.equal(deactivated.version, 1);
    assert.equal(deactivated.status, "INACTIVE");
    repo.update(deactivated);

    let found = repo.findById("agent-state-trans");
    assert.ok(found);
    assert.equal(found.status, "INACTIVE");
    assert.equal(found.version, 1);

    // Activate preserves version
    const activated = deactivated.activate();
    assert.equal(activated.version, 1);
    assert.equal(activated.status, "ACTIVE");
    repo.update(activated);

    found = repo.findById("agent-state-trans");
    assert.ok(found);
    assert.equal(found.status, "ACTIVE");
    assert.equal(found.version, 1);

    repo.close();
  });

  await t.test("7. Delete removes agent from database", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const agent = createSampleAgent("agent-delete-1");
    repo.register(agent);

    assert.ok(repo.findById("agent-delete-1"));
    repo.delete("agent-delete-1");
    assert.equal(repo.findById("agent-delete-1"), undefined);
    assert.equal(repo.list().length, 0);

    repo.close();
  });

  await t.test("8. Restart Durability across separate connections", () => {
    const dbPath = getTempDbPath();
    try {
      // Process A
      const repoA = new SqliteAgentRepository({ dbPath });
      const agent = createSampleAgent("agent-durable-1").update({
        name: "Persisted Agent",
        tools: ["custom-tool", "calc"],
      });
      repoA.register(createSampleAgent("agent-durable-1"));
      repoA.update(agent);
      repoA.close();

      // Process B
      const repoB = new SqliteAgentRepository({ dbPath });
      const rehydrated = repoB.findById("agent-durable-1");
      assert.ok(rehydrated);
      assert.ok(rehydrated instanceof Agent);
      assert.ok(Object.isFrozen(rehydrated));
      assert.ok(Object.isFrozen(rehydrated.tools));
      assert.equal(rehydrated.id, "agent-durable-1");
      assert.equal(rehydrated.name, "Persisted Agent");
      assert.equal(rehydrated.version, 2);
      assert.deepEqual(rehydrated.tools, ["custom-tool", "calc"]);

      repoB.close();
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  await t.test("9. Fail-Closed: corrupted status throws SqlitePersistenceError", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    db.exec("PRAGMA ignore_check_constraints = ON;");
    db.prepare(`
      INSERT INTO agents (id, name, model, memory_scope, status, version, created_at, updated_at)
      VALUES ('corrupt-status-agent', 'Corrupt', 'stub', 'scope', 'UNKNOWN', 1, '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z');
    `).run();
    db.exec("PRAGMA ignore_check_constraints = OFF;");

    assert.throws(
      () => repo.findById("corrupt-status-agent"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Corrupted agent status")
    );

    repo.close();
  });

  await t.test("10. Fail-Closed: corrupted version throws SqlitePersistenceError", () => {
    const repo = new SqliteAgentRepository({ dbPath: ":memory:" });
    const db = repo.getDatabase();

    db.exec("PRAGMA ignore_check_constraints = ON;");
    db.prepare(`
      INSERT INTO agents (id, name, model, memory_scope, status, version, created_at, updated_at)
      VALUES ('corrupt-version-agent', 'Corrupt', 'stub', 'scope', 'ACTIVE', 0, '2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z');
    `).run();
    db.exec("PRAGMA ignore_check_constraints = OFF;");

    assert.throws(
      () => repo.findById("corrupt-version-agent"),
      (err: unknown) => err instanceof SqlitePersistenceError && err.message.includes("Corrupted agent version")
    );

    repo.close();
  });
});
