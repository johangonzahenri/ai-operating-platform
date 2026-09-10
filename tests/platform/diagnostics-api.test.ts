import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";

function setupDiagnosticsServer() {
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
    operations: platform.operations,
    operationService: platform.operationService,
    eventStore: platform.eventStore,
    db: platform.db,
    diagnostics: platform.diagnostics,
  });

  const server = createHttpServer(service);
  return { platform, service, server };
}

function makeRequest(
  server: http.Server,
  path: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; raw: string }> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      const port = addr.port;
      const reqData = options.body ? JSON.stringify(options.body) : undefined;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method ?? "GET",
          headers: {
            ...(reqData ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(reqData) } : {}),
            ...(options.headers ?? {}),
          },
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            server.close();
            let body: any = null;
            try {
              body = JSON.parse(raw);
            } catch {
              body = raw;
            }
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body, raw });
          });
        }
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      if (reqData) req.write(reqData);
      req.end();
    });
  });
}

test("GET /api/v1/diagnostics/recovery/history returns empty recovery history initially", async () => {
  const { server } = setupDiagnosticsServer();
  const res = await makeRequest(server, "/api/v1/diagnostics/recovery/history");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.meta.count, 0);
});

test("GET /api/v1/diagnostics/traces/:traceId returns 404 when trace does not exist", async () => {
  const { server } = setupDiagnosticsServer();
  const res = await makeRequest(server, "/api/v1/diagnostics/traces/nonexistent-trace-id");
  assert.equal(res.status, 404);
  assert.equal(res.body.code, "NOT_FOUND");
});

test("GET /api/v1/diagnostics/traces/:traceId returns reconstructed trace after task execution", async () => {
  const { server, platform } = setupDiagnosticsServer();
  const traceId = "test-trace-12345";
  
  // Submit and execute task with explicit traceId and agentId
  await platform.submitTask.execute({
    agentId: "foundation-agent",
    input: { prompt: "hello" },
    traceId,
  });

  const res = await makeRequest(server, `/api/v1/diagnostics/traces/${traceId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.traceId, traceId);
  assert.ok(Array.isArray(res.body.timeline));
  assert.ok(res.body.timeline.length > 0);
  assert.ok(Array.isArray(res.body.causalChain));
});

test("GET /api/v1/diagnostics/tasks/:taskId/timeline returns timeline nodes for task", async () => {
  const { server, platform } = setupDiagnosticsServer();

  const submitted = await platform.submitTask.execute({
    agentId: "foundation-agent",
    input: { prompt: "test history" },
    traceId: "trace-task-history-1",
  });

  const taskId = submitted.task.id;
  const res = await makeRequest(server, `/api/v1/diagnostics/tasks/${taskId}/timeline`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length > 0);
  assert.equal(res.body.data[0].aggregateId, taskId);
});

test("GET /api/v1/diagnostics/traces/:traceId rejects invalid ID with 400", async () => {
  const { server } = setupDiagnosticsServer();
  const res = await makeRequest(server, "/api/v1/diagnostics/traces/invalid!id@char");
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "INVALID_ID");
});
