import assert from "node:assert/strict";
import test from "node:test";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

test("Platform API Endpoints Suite", async (t) => {
  const service = new PlatformService();
  const server = createHttpServer(service);

  await new Promise<void>((resolve) => {
    server.listen(PORT, "localhost", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  await t.test("GET /api/status returns platform health and engine version", async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "HEALTHY");
    assert.equal(data.version, "0.7.0");
    assert.ok(typeof data.uptimeSeconds === "number");
    assert.ok(data.toolsCount >= 1);
  });

  await t.test("GET /api/tools lists registered tools", async () => {
    const res = await fetch(`${BASE_URL}/api/tools`);
    assert.equal(res.status, 200);
    const tools = await res.json();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some((t) => t.id === "calculator"));
  });

  let createdExecutionId = "";

  await t.test("POST /api/tasks submits and executes a task through CoreRuntime", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "foundation-agent",
        input: { prompt: "Test prompt execution" },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.task?.id);
    assert.equal(data.task.status, "COMPLETED");
    assert.ok(data.execution?.id);
    assert.equal(data.execution.status, "COMPLETED");
    createdExecutionId = data.execution.id;
  });

  await t.test("GET /api/executions lists persisted executions", async () => {
    const res = await fetch(`${BASE_URL}/api/executions`);
    assert.equal(res.status, 200);
    const execs = await res.json();
    assert.ok(Array.isArray(execs));
    assert.ok(execs.some((e) => e.id === createdExecutionId));
  });

  await t.test("GET /api/executions/:id/timeline reconstructs correlated event sequence", async () => {
    assert.ok(createdExecutionId, "Execution ID must exist");
    const res = await fetch(`${BASE_URL}/api/executions/${createdExecutionId}/timeline`);
    assert.equal(res.status, 200);
    const timeline = await res.json();
    assert.ok(Array.isArray(timeline));
    assert.ok(timeline.length > 0);
    assert.ok(timeline.every((ev) => ev.executionId === createdExecutionId));
  });

  await t.test("POST /api/orchestrate runs sequential orchestration with model and tool", async () => {
    const res = await fetch(`${BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operations: [
          {
            kind: "TOOL",
            id: "calc-1",
            toolId: "calculator",
            input: { left: 10, right: 20 },
          },
          {
            kind: "MODEL",
            id: "model-1",
            model: "stub-model",
            input: { prompt: "Result is:" },
            bindings: [{ targetKey: "sum", operationId: "calc-1", sourceKey: "value" }],
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "COMPLETED");
    assert.equal(data.operations.length, 2);
    assert.equal(data.operations[0].status, "COMPLETED");
    assert.equal(data.operations[1].status, "COMPLETED");
  });

  await t.test("GET /api/metrics reports system counters and sample collections", async () => {
    const res = await fetch(`${BASE_URL}/api/metrics`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.counters);
    assert.ok(typeof data.samplesCount === "number");
  });

  await t.test("GET /api/audit reports recorded audit observations", async () => {
    const res = await fetch(`${BASE_URL}/api/audit`);
    assert.equal(res.status, 200);
    const observations = await res.json();
    assert.ok(Array.isArray(observations));
    assert.ok(observations.length > 0);
  });
});
