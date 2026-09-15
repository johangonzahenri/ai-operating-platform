import test from "node:test";
import assert from "node:assert/strict";
import { HelloApplicationEngine } from "../src/engine.js";
import { HelloApplicationPlatformAdapter } from "../src/adapter.js";

test("HelloApplicationEngine: list items and retrieval", () => {
  const engine = new HelloApplicationEngine();
  const items = engine.listItems();
  assert.equal(items.length, 2);
  assert.equal(engine.getItem("item-1")?.name, "Sample Item A");
});

test("HelloApplicationPlatformAdapter: creates discovery task with mock client", async () => {
  const mockClient: any = {
    connect: async () => ({ status: "HEALTHY" }),
    createTask: async (input: any) => ({
      taskId: "task-mock-01",
      traceId: input.input.traceId,
      status: "COMPLETED",
      agentId: input.agentId,
      createdAt: new Date().toISOString(),
      input: input.input,
    }),
  };

  const adapter = new HelloApplicationPlatformAdapter({
    baseUrl: "http://localhost:3000",
    apiKey: "test-api-key",
    client: mockClient,
  });

  const task = await adapter.requestAiDiscovery("Find demo item");
  assert.equal(task.taskId, "task-mock-01");
  assert.equal(task.agentId, "foundation-agent");
  assert.equal(task.input.applicationId, "hello-ai-application");
});
