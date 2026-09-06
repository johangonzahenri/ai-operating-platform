import assert from "node:assert/strict";
import test from "node:test";
import { MemoryService } from "../../src/application/memory/memory-service.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { createMemoryItem, MemoryGateway, MemoryStorageError, MemoryValidationError } from "../../src/domain/memory/memory-gateway.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { InMemoryMemoryGateway } from "../../src/infrastructure/memory/in-memory-memory-gateway.js";
const context = ExecutionContext.create("trace", "execution", "task");
test("memory stores retrieves updates and deletes within an isolated scope", async () => {
 const events = new InMemoryEventPublisher(); const service = new MemoryService(new InMemoryMemoryGateway(), events); const item = createMemoryItem("one", "application-a", "preference", { theme: "dark" });
 await service.store(item, context); assert.deepEqual((await service.retrieve("application-a", "preference", context))?.value, { theme: "dark" }); assert.equal(await service.retrieve("application-b", "preference"), undefined);
 await service.store(createMemoryItem("one", "application-a", "preference", { theme: "light" }), context); assert.deepEqual((await service.retrieve("application-a", "preference"))?.value, { theme: "light" }); await service.delete("application-a", "preference", context); assert.equal(await service.retrieve("application-a", "preference"), undefined);
 assert.ok(events.events.every((event) => event.traceId === "trace" && event.executionId === "execution"));
});
test("memory validates data and classifies adapter failures", async () => {
 assert.throws(() => createMemoryItem("", "scope", "key", {}), MemoryValidationError);
 const failing: MemoryGateway = { store: async () => { throw new Error("offline"); }, retrieve: async () => undefined, delete: async () => undefined }; const service = new MemoryService(failing, new InMemoryEventPublisher());
 await assert.rejects(() => service.store(createMemoryItem("one", "scope", "key", {}), context), MemoryStorageError);
});
