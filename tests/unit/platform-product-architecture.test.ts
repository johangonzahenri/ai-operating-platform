import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createPlatformClient, PlatformClientError } from "../../src/platform-client/index.js";

test("Web Architecture Isolation: Web platform scripts have ZERO imports from internal domain, infrastructure or runtime", () => {
  const webDir = "src/platform/web";
  const files = fs.readdirSync(webDir).filter(f => f.endsWith(".js"));
  assert.ok(files.length > 0, "Web directory must contain client scripts");

  for (const file of files) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes("from \"../../domain"), false, `${file} must not import from domain`);
    assert.equal(content.includes("from '../../domain"), false, `${file} must not import from domain`);
    assert.equal(content.includes("from \"../../infrastructure"), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes("from '../../infrastructure"), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes("from \"../../application/runtime"), false, `${file} must not import from runtime`);
  }
});

test("PlatformClient: communicates via public API contract (/api/v1) and unrolls standard data envelopes", async () => {
  const mockFetch = async (url: RequestInfo | URL) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/api/v1/health")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          status: "HEALTHY",
          version: "0.8.0",
          uptimeSeconds: 120,
          timestamp: new Date().toISOString(),
          components: {
            api: { status: "ONLINE" },
            coreRuntime: { status: "ONLINE" },
            persistence: { status: "ONLINE" },
            eventStore: { status: "ONLINE" },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (urlStr.endsWith("/api/v1/agents")) {
      return new Response(JSON.stringify({
        success: true,
        data: [
          { id: "agent-1", name: "Catalog Agent", capabilities: ["catalog:search"], status: "ACTIVE" },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  };

  const client = createPlatformClient({
    baseUrl: "http://localhost:3000",
    fetch: mockFetch as unknown as typeof globalThis.fetch,
  });

  const health = await client.health.get();
  assert.equal(health.status, "HEALTHY");
  assert.equal(health.version, "0.8.0");

  const agents = await client.agents.list();
  assert.equal(agents.length, 1);
  const agent0 = agents[0];
  assert.ok(agent0);
  assert.equal(agent0.id, "agent-1");
});

test("PlatformClient: maps HTTP error responses into typed PlatformClientError with requestId and traceId", async () => {
  const mockFetch = async () => {
    return new Response(JSON.stringify({
      code: "SECURITY_UNAUTHORIZED",
      error: "Authentication token missing or invalid",
      traceId: "trace-err-1",
    }), {
      status: 401,
      headers: { "Content-Type": "application/json", "X-Request-Id": "req-err-1" },
    });
  };

  const client = createPlatformClient({
    baseUrl: "http://localhost:3000",
    fetch: mockFetch as unknown as typeof globalThis.fetch,
  });

  await assert.rejects(
    async () => {
      await client.tasks.get("task-123");
    },
    (err: unknown) => {
      assert.ok(err instanceof PlatformClientError);
      assert.equal(err.code, "SECURITY_UNAUTHORIZED");
      assert.equal(err.status, 401);
      assert.equal(err.requestId, "req-err-1");
      assert.equal(err.traceId, "trace-err-1");
      return true;
    }
  );
});

test("Platform Shell: index.html contains required Enterprise Navigation sections and theme support", () => {
  const html = fs.readFileSync("src/platform/web/index.html", "utf8");
  assert.ok(html.includes("data-tab=\"dashboard\""), "Must include Dashboard nav");
  assert.ok(html.includes("data-tab=\"agents\""), "Must include Agents nav");
  assert.ok(html.includes("data-tab=\"tools\""), "Must include Tools nav");
  assert.ok(html.includes("data-tab=\"applications\""), "Must include Applications nav");
  assert.ok(html.includes("id=\"theme-toggle-btn\""), "Must include Theme toggle button");
});

test("Design System: styles.css defines Light Theme as default root canvas", () => {
  const css = fs.readFileSync("src/platform/web/styles.css", "utf8");
  assert.ok(css.includes(":root"), "Must define root variables");
  assert.ok(css.includes("--bg-primary: #f8fafc;"), "Default root theme must be light canvas");
  assert.ok(css.includes("--text-primary: #0f172a;"), "Default root text must be dark on light canvas");
  assert.ok(css.includes("[data-theme=\"dark\"]"), "Must support dark theme alternative");
});
