import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createPlatformClient } from "../../src/platform-client/index.js";

test("Prompt 84 - V1.1 Product Demo: End-to-End Golden Journey via PlatformClient SDK", async () => {
  const platform = createPlatform();
  const service = new (await import("../../src/platform/api/platform-service.js")).PlatformService({
    ...platform,
    models: platform.modelRegistry,
  });
  const server = createHttpServer(service);



  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as import("node:net").AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const client = createPlatformClient({
    baseUrl,
    apiKey: "key-tentaciones:secret-tentaciones-live",
  });



  try {
    // 1. Health & Platform metadata check
    const health = await client.health();
    assert.equal(health.status, "HEALTHY");

    // 2. SaaS Control Plane querying via SDK
    const tenants = await client.tenants.list();
    assert.ok(tenants.length >= 3);
    const tenantDashboard = await client.tenants.dashboard("tenant-tentaciones");
    assert.equal(tenantDashboard.tenantId, "tenant-tentaciones");

    const usage = await client.usage.get();
    assert.equal(typeof usage.totalTasks, "number");

    const capabilities = await client.capabilities.list();
    assert.ok(capabilities.length >= 7);

    // 3. Golden Journey: Create real task through SDK
    const task = await client.createTask({
      agentId: "foundation-agent",
      input: {
        objective: "Quiero unas zapatillas negras para correr y ver como me quedan",
        category: "footwear",
        gender: "neutral",
        size: 42,
      },
      traceId: "trace-golden-demo-v1.1",
    });

    assert.ok(task.taskId);
    assert.equal(task.traceId, "trace-golden-demo-v1.1");
    assert.ok(["QUEUED", "COMPLETED"].includes(task.status));

    // 4. Execute the task if not already completed synchronously
    const execution = await client.tasks.execute(task.taskId);
    assert.ok(execution.executionId);
    assert.equal(execution.status, "COMPLETED");


    // 5. Query verified audit events for Golden Journey
    const taskEvents = await client.tasks.events(task.taskId);
    assert.ok(taskEvents.length > 0);
    assert.ok(taskEvents.some((e) => e.eventType === "task.created"));
    assert.ok(taskEvents.some((e) => e.eventType === "task.completed"));
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

