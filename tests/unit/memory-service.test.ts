import assert from "node:assert/strict";
import test from "node:test";
import { MemoryService } from "../../src/application/memory/memory-service.js";
import { ExecutionContext } from "../../src/domain/execution/execution-context.js";
import { createMemoryItem, MemoryGateway, MemoryStorageError, MemoryValidationError } from "../../src/domain/memory/memory-gateway.js";
import { PolicyDeniedError } from "../../src/domain/policy/policy.js";
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
test("memory sanitizes values and returns deterministic bounded retrieval", async () => {
 const gateway = new InMemoryMemoryGateway();
 await gateway.store(createMemoryItem("old", "scope", "old", { password: "hidden" }, {}, new Date("2026-01-01T00:00:00Z")));
 await gateway.store(createMemoryItem("new-a", "scope", "a", { value: 1 }, {}, new Date("2026-01-02T00:00:00Z")));
 await gateway.store(createMemoryItem("new-b", "scope", "b", { value: 2 }, {}, new Date("2026-01-02T00:00:00Z")));
 const service = new MemoryService(gateway, new InMemoryEventPublisher());
 assert.equal((await service.retrieve("scope", "old"))?.value.password, "[redacted]");
 assert.deepEqual((await service.retrieveMany({ scope: "scope", limit: 2 })).map((item) => item.key), ["b", "a"]);
 assert.deepEqual(await service.retrieveMany({ scope: "missing", limit: 2 }), []);
});

test("memory upsert preserves identity and creation timestamp while advancing updatedAt", async () => {
 const gateway = new InMemoryMemoryGateway();
 const first = createMemoryItem("first", "agent-one", "context", { value: 1 }, {}, new Date("2026-01-01T00:00:00Z"));
 const second = createMemoryItem("second", "agent-one", "context", { value: 2 }, {}, new Date("2026-01-01T00:00:00Z"));
 const created = await gateway.store(first);
 const updated = await gateway.store(second);
 assert.equal(updated.id, created.id);
 assert.equal(updated.createdAt.getTime(), created.createdAt.getTime());
 assert.ok(updated.updatedAt.getTime() > created.updatedAt.getTime());
 assert.equal(updated.value.value, 2);
});

test("memory policy authorizes reads, writes, and deletes at the application boundary", async () => {
 const denied = new MemoryService(new InMemoryMemoryGateway(), new InMemoryEventPublisher(), {
   authorize: ({ actorId, scope }) => {
     if (actorId !== "agent-one" || scope !== "agent-one") throw new PolicyDeniedError("memory-access", scope, "Memory scope denied");
   },
 });
 const item = createMemoryItem("one", "agent-one", "context", { value: 1 });
 await denied.store(item, context, "agent-one");
 await assert.rejects(() => denied.retrieve("agent-two", "context", context, "agent-one"), PolicyDeniedError);
 await assert.rejects(() => denied.delete("agent-one", "context", context, "agent-two"), PolicyDeniedError);
 await denied.delete("agent-one", "context", context, "agent-one");
 assert.equal(await denied.retrieve("agent-one", "context", context, "agent-one"), undefined);
});
