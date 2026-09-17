import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform } from "../../src/interfaces/composition.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";

test("API Surface Convergence: /api/platform/v1/* emits RFC 8594 deprecation headers, /api/v1/* does not", async () => {
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

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as { port: number };
  const port = addr.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Request legacy alias route
    const legacyRes = await fetch(`${baseUrl}/api/platform/v1/status`);
    assert.equal(legacyRes.status, 200);
    assert.equal(legacyRes.headers.get("deprecation"), "true");
    assert.equal(legacyRes.headers.get("sunset"), "Thu, 31 Dec 2026 23:59:59 GMT");
    assert.equal(legacyRes.headers.get("link"), '</api/v1/status>; rel="successor-version"');

    // 2. Request canonical route
    const canonicalRes = await fetch(`${baseUrl}/api/v1/status`);
    assert.equal(canonicalRes.status, 200);
    assert.equal(canonicalRes.headers.get("deprecation"), null);
    assert.equal(canonicalRes.headers.get("sunset"), null);
    assert.equal(canonicalRes.headers.get("link"), null);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
