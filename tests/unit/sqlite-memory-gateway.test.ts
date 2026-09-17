import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createMemoryItem, MemoryValidationError } from "../../src/domain/memory/memory-gateway.js";
import { SqliteMemoryGateway } from "../../src/infrastructure/memory/sqlite-memory-gateway.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";

test("SqliteMemoryGateway: validates item scope and key", async () => {
  const gateway = new SqliteMemoryGateway(new SqliteDatabase({ dbPath: ":memory:" }));

  await assert.rejects(
    () => gateway.store(null as any),
    MemoryValidationError
  );

  await assert.rejects(
    () => gateway.retrieveMany(null as any),
    MemoryValidationError
  );

  await assert.rejects(
    () => gateway.retrieveMany({ scope: "test", limit: 0 }),
    MemoryValidationError
  );

  await assert.rejects(
    () => gateway.retrieveMany({ scope: "test", limit: 101 }),
    MemoryValidationError
  );
});

test("SqliteMemoryGateway: atomic upsert preserves id and advances updatedAt", async () => {
  const gateway = new SqliteMemoryGateway(new SqliteDatabase({ dbPath: ":memory:" }));

  const item1 = createMemoryItem("mem-1", "agent-context", "summary", { text: "Initial summary" });
  const stored1 = await gateway.store(item1);
  assert.equal(stored1.id, "mem-1");
  assert.deepEqual(stored1.value, { text: "Initial summary" });

  const item2 = createMemoryItem("mem-diff-id", "agent-context", "summary", { text: "Updated summary" });
  const stored2 = await gateway.store(item2);

  assert.equal(stored2.id, "mem-1"); // Preserves initial id on key match
  assert.deepEqual(stored2.value, { text: "Updated summary" });
  assert.ok(stored2.updatedAt.getTime() >= stored1.updatedAt.getTime());

  const retrieved = await gateway.retrieve("agent-context", "summary");
  assert.ok(retrieved);
  assert.equal(retrieved?.id, "mem-1");
  assert.deepEqual(retrieved?.value, { text: "Updated summary" });
});

test("SqliteMemoryGateway: persists data durably across database connection re-opens", async () => {
  const tmpDir = path.resolve(process.cwd(), "tmp_test_memory");
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, `test-mem-${Date.now()}.db`);

  try {
    const db1 = new SqliteDatabase({ dbPath: dbFile });
    const gateway1 = new SqliteMemoryGateway(db1);

    const itemA = createMemoryItem("id-a", "session-42", "last_user_prompt", { text: "¿Cómo está el inventario?" });
    const itemB = createMemoryItem("id-b", "session-42", "cart_state", { items: ["BP-1001", "OIL-5W30"] });
    await gateway1.store(itemA);
    await gateway1.store(itemB);

    db1.close();

    // Reopen database connection to verify durable SQLite persistence on disk
    const db2 = new SqliteDatabase({ dbPath: dbFile });
    const gateway2 = new SqliteMemoryGateway(db2);

    const reloadedA = await gateway2.retrieve("session-42", "last_user_prompt");
    assert.ok(reloadedA);
    assert.equal(reloadedA?.id, "id-a");
    assert.deepEqual(reloadedA?.value, { text: "¿Cómo está el inventario?" });

    const items = await gateway2.retrieveMany({ scope: "session-42" });
    assert.equal(items.length, 2);

    await gateway2.delete("session-42", "last_user_prompt");
    const afterDelete = await gateway2.retrieve("session-42", "last_user_prompt");
    assert.equal(afterDelete, undefined);

    db2.close();
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  }
});

test("SqliteMemoryGateway: scope isolation prevents cross-scope data leakage", async () => {
  const gateway = new SqliteMemoryGateway(new SqliteDatabase({ dbPath: ":memory:" }));

  await gateway.store(createMemoryItem("m1", "tenant-alpha", "config", { mode: "secure" }));
  await gateway.store(createMemoryItem("m2", "tenant-beta", "config", { mode: "permissive" }));

  const alphaConfig = await gateway.retrieve("tenant-alpha", "config");
  const betaConfig = await gateway.retrieve("tenant-beta", "config");

  assert.equal(alphaConfig?.value?.mode, "secure");
  assert.equal(betaConfig?.value?.mode, "permissive");

  const alphaItems = await gateway.retrieveMany({ scope: "tenant-alpha" });
  assert.equal(alphaItems.length, 1);
  assert.equal(alphaItems[0]?.key, "config");
  assert.equal(alphaItems[0]?.value?.mode, "secure");
});
