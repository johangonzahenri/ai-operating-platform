import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";

function setupPaginationServer() {
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

test("GET /api/v1/paginated/tasks returns paginated structure", async () => {
  const { server, platform } = setupPaginationServer();
  await platform.submitTask.execute({ agentId: "foundation-agent", input: { action: "calc" } });
  await platform.submitTask.execute({ agentId: "foundation-agent", input: { action: "calc" } });

  const res = await makeRequest(server, "/api/v1/paginated/tasks?limit=1&offset=0");
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.meta.limit, 1);
  assert.equal(res.body.meta.offset, 0);
  assert.ok(res.body.meta.total >= 2);
});

test("GET /api/v1/paginated/agents returns paginated structure with status filter", async () => {
  const { server } = setupPaginationServer();
  const res = await makeRequest(server, "/api/v1/paginated/agents?limit=10&offset=0&status=ACTIVE");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 1);
  assert.equal(res.body.data[0].status, "ACTIVE");
});

test("GET /api/v1/paginated/operations returns paginated operations list", async () => {
  const { server, platform } = setupPaginationServer();
  if (platform.operationService) {
    await platform.operationService.executeOperation({
      id: "op-page-1",
      agentId: "foundation-agent",
      objective: "Pagination test 1",
      budget: { maxSteps: 3, maxDurationMs: 5000, maxToolCalls: 5 },
    });
  }

  const res = await makeRequest(server, "/api/v1/paginated/operations?limit=5&offset=0");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.meta.limit, 5);
});

test("GET /api/v1/paginated/tasks rejects invalid limit and offset", async () => {
  const { server } = setupPaginationServer();
  const resInvalidLimit = await makeRequest(server, "/api/v1/paginated/tasks?limit=9999");
  assert.equal(resInvalidLimit.status, 400);
  assert.equal(resInvalidLimit.body.code, "INVALID_LIMIT");

  const resInvalidOffset = await makeRequest(server, "/api/v1/paginated/tasks?offset=-5");
  assert.equal(resInvalidOffset.status, 400);
  assert.equal(resInvalidOffset.body.code, "INVALID_OFFSET");
});
