import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryItem, MemoryGateway } from "../../src/domain/memory/memory-gateway.js";
import { InMemoryMemoryGateway } from "../../src/infrastructure/memory/in-memory-memory-gateway.js";
const memoryGatewayContract = (name: string, gateway: MemoryGateway): void => test(`${name} stores, retrieves and deletes by scope and key`, async () => {
 const item = createMemoryItem("one", "scope", "key", { value: 1 }); await gateway.store(item); assert.equal((await gateway.retrieve("scope", "key"))?.id, "one"); await gateway.delete("scope", "key"); assert.equal(await gateway.retrieve("scope", "key"), undefined);
});
memoryGatewayContract("InMemoryMemoryGateway", new InMemoryMemoryGateway());
