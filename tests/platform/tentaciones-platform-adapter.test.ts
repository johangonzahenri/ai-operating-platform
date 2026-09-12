import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { TentacionesPlatformAdapter } from "../../src/application/platform/tentaciones-platform-adapter.js";

test("Tentaciones adapter sends product discovery identity through the public client", async () => {
  let createRequest: Record<string, unknown> | undefined;
  const adapter = new TentacionesPlatformAdapter({
    applicationVersion: "1.4.0",
    traceIdFactory: () => "trace-tentaciones-1",
    client: {
      tasks: {
        async create(request) {
          createRequest = request as unknown as Record<string, unknown>;
          return {
            taskId: "task-1",
            traceId: "trace-tentaciones-1",
            agentId: "foundation-agent",
            status: "CREATED",
            createdAt: "2026-09-11T00:00:00.000Z",
            input: request.input,
          };
        },
        async get() {
          return {
            taskId: "task-1",
            traceId: "trace-tentaciones-1",
            agentId: "foundation-agent",
            status: "CREATED",
            createdAt: "2026-09-11T00:00:00.000Z",
            input: { userMessage: "existing task" },
          };
        },
        async execute() {
          return {
            executionId: "execution-1",
            taskId: "task-1",
            traceId: "trace-tentaciones-1",
            status: "RUNNING",
            completedSteps: [],
          };
        },
      },
      executions: {
        async get() {
          return {
            executionId: "execution-1",
            taskId: "task-1",
            traceId: "trace-tentaciones-1",
            status: "COMPLETED",
            completedSteps: ["product-discovery"],
            result: { products: [{ id: "shoe-1" }] },
          };
        },
        async events() { return []; },
      },
      health: { async get() { return { status: "HEALTHY" } as never; } },
    },
  });

  const result = await adapter.discoverProducts("Quiero zapatillas negras para correr");
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.executionId, "execution-1");
  assert.equal(result.fallback, "NONE");
  assert.deepEqual(createRequest?.metadata, {
    application: "tentaciones",
    applicationVersion: "1.4.0",
    capability: "product.discovery",
    source: "shopping-agent",
  });
});

test("Tentaciones adapter degrades gracefully when Platform API is unavailable", async () => {
  const adapter = new TentacionesPlatformAdapter({
    applicationVersion: "1.4.0",
    client: {
      tasks: {
        async create() { throw new Error("connection refused"); },
        async get() { throw new Error("not used"); },
        async execute() { throw new Error("not used"); },
      },
      executions: { async get() { throw new Error("not used"); }, async events() { throw new Error("not used"); } },
      health: { async get() { throw new Error("connection refused"); } },
    },
  });

  const result = await adapter.discoverProducts("Buscar zapatos");
  assert.equal(result.status, "PLATFORM_UNAVAILABLE");
  assert.equal(result.fallback, "TRADITIONAL_COMMERCE");
  assert.equal(result.error?.code, "PLATFORM_ERROR");
});

test("Tentaciones adapter completes a deterministic SDK to API flow", async (t) => {
  const platform = createPlatform();
  const service = new PlatformService({
    tasks: platform.tasks,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
  });
  const server = createHttpServer(service);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const adapter = new TentacionesPlatformAdapter({
    applicationVersion: "1.4.0",
    client: createPlatformClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      apiPrefix: "/api/platform/v1",
    }),
  });
  const result = await adapter.discoverProducts("Quiero zapatillas negras para correr", "trace-e2e-tentaciones");

  assert.equal(result.status, "COMPLETED");
  assert.ok(result.taskId);
  assert.ok(result.executionId);
  assert.equal(result.traceId, "trace-e2e-tentaciones");
  assert.deepEqual(result.result, {
    capability: "product.discovery",
    query: "Quiero zapatillas negras para correr",
    intent: { terms: ["zapatillas", "negras", "correr"] },
    candidates: [],
    products: [],
    count: 0,
  });
  const events = await adapter.getExecutionEvents(result.executionId!);
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.traceId === result.traceId));
});
