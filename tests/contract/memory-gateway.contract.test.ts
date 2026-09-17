import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryItem, MemoryGateway } from "../../src/domain/memory/memory-gateway.js";
import { InMemoryMemoryGateway } from "../../src/infrastructure/memory/in-memory-memory-gateway.js";
import { SqliteMemoryGateway } from "../../src/infrastructure/memory/sqlite-memory-gateway.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";

const memoryGatewayContract = (name: string, gateway: MemoryGateway): void => {
  test(`${name} stores, retrieves and deletes by scope and key`, async () => {
    const item = createMemoryItem("one", "scope", "key", { value: 1 }); await gateway.store(item); assert.equal((await gateway.retrieve("scope", "key"))?.id, "one"); await gateway.delete("scope", "key"); assert.equal(await gateway.retrieve("scope", "key"), undefined);
  });
  test(`${name} supports bounded deterministic retrieval`, async () => {
    await gateway.store(createMemoryItem("two", "scope", "two", { value: 2 }, {}, new Date("2026-01-02T00:00:00Z")));
    await gateway.store(createMemoryItem("three", "scope", "three", { value: 3 }, {}, new Date("2026-01-03T00:00:00Z")));
    assert.deepEqual((await gateway.retrieveMany?.({ scope: "scope", limit: 1 }))?.map((item) => item.key), ["three"]);
  });
};
memoryGatewayContract("InMemoryMemoryGateway", new InMemoryMemoryGateway());
memoryGatewayContract("SqliteMemoryGateway", new SqliteMemoryGateway(new SqliteDatabase({ dbPath: ":memory:" })));
