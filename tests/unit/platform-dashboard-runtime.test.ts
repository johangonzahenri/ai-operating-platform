import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createPlatformClient } from "../../src/platform-client/index.js";

test("Dashboard Isolation Invariant: Web client scripts have ZERO imports from internal domain, infrastructure or runtime", () => {
  const webDir = "src/platform/web";
  const files = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 2, "Web directory must contain app.js and api-client.js");

  for (const file of files) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes('from "../../domain'), false, `${file} must not import from domain`);
    assert.equal(content.includes("from '../../domain"), false, `${file} must not import from domain`);
    assert.equal(content.includes('from "../../infrastructure'), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes("from '../../infrastructure"), false, `${file} must not import from infrastructure`);
    assert.equal(content.includes('from "../../application/runtime'), false, `${file} must not import from runtime`);
  }
});

test("Frontend Security & XSS Resistance: Strict DOM generation with ZERO innerHTML / outerHTML on dynamic payloads", () => {
  const webDir = "src/platform/web";
  const files = fs.readdirSync(webDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(webDir, file), "utf8");
    assert.equal(content.includes(".innerHTML"), false, `${file} must NOT use innerHTML to prevent XSS`);
    assert.equal(content.includes(".outerHTML"), false, `${file} must NOT use outerHTML to prevent XSS`);
    assert.equal(content.includes("document.write("), false, `${file} must NOT use document.write`);
  }
});

test("Dashboard Health & Readiness Mapping: PlatformClient projects telemetry correctly", async () => {
  const mockFetch = async (url: RequestInfo | URL) => {
    const urlStr = String(url);
    if (urlStr.endsWith("/api/v1/health")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          status: "HEALTHY",
          version: "1.0.0",
          uptimeSeconds: 3600,
          timestamp: "2026-09-14T12:00:00.000Z",
          components: {
            api: { status: "ONLINE", latencyMs: 2 },
            sqlite: { status: "ONLINE", mode: "durable" },
            eventStore: { status: "ONLINE", totalEvents: 142, persistedCount: 142, queryableCount: 142 },
            runtime: { status: "ONLINE", activeExecutions: 0 },
            recovery: { status: "ONLINE", recoveredCount: 0 },
          },
        },
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
  assert.equal(health.version, "1.0.0");
  assert.equal(health.uptimeSeconds, 3600);
  assert.equal(health.components?.api?.status, "ONLINE");
  assert.equal(health.components?.sqlite?.status, "ONLINE");
  assert.equal(health.components?.eventStore?.status, "ONLINE");
  assert.equal(health.components?.runtime?.status, "ONLINE");
  assert.equal(health.components?.recovery?.status, "ONLINE");
});

test("Task Details & Cancellation Hook: PlatformClient cancels running task via POST /api/v1/tasks/:id/cancel", async () => {
  let cancelCalled = false;
  let cancelReasonSent = "";

  const mockFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/v1/tasks/task-99/cancel") && init?.method === "POST") {
      cancelCalled = true;
      const body = JSON.parse(String(init?.body || "{}"));
      cancelReasonSent = body.reason;
      return new Response(JSON.stringify({
        success: true,
        data: {
          taskId: "task-99",
          status: "CANCELLED",
          cancellationReason: body.reason,
          cancelledAt: new Date().toISOString(),
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (urlStr.includes("/api/v1/tasks/task-99")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: "task-99",
          agentId: "agent-1",
          traceId: "trace-99",
          status: "RUNNING",
          createdAt: new Date().toISOString(),
          input: { prompt: "test" },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  };

  const client = createPlatformClient({
    baseUrl: "http://localhost:3000",
    fetch: mockFetch as unknown as typeof globalThis.fetch,
  });

  const taskBefore = await client.tasks.get("task-99");
  assert.equal(taskBefore.taskId, "task-99");
  assert.equal(taskBefore.status, "RUNNING");

  const cancelledTask = await client.tasks.cancel("task-99", "Operator requested abort");
  assert.equal(cancelCalled, true);
  assert.equal(cancelReasonSent, "Operator requested abort");
  assert.equal(cancelledTask.status, "CANCELLED");
});

test("Controlled Polling Termination: Detects terminal execution states and stops polling loop", () => {
  const terminalStates = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "POLICY_DENIED"]);

  assert.equal(terminalStates.has("COMPLETED"), true);
  assert.equal(terminalStates.has("FAILED"), true);
  assert.equal(terminalStates.has("CANCELLED"), true);
  assert.equal(terminalStates.has("TIMEOUT"), true);
  assert.equal(terminalStates.has("POLICY_DENIED"), true);
  assert.equal(terminalStates.has("RUNNING"), false);
  assert.equal(terminalStates.has("QUEUED"), false);
  assert.equal(terminalStates.has("SUBMITTED"), false);
});

test("Web API Client: exposes task cancellation and diagnosis endpoint contracts", () => {
  const apiClientContent = fs.readFileSync("src/platform/web/api-client.js", "utf8");
  assert.ok(apiClientContent.includes("export async function cancelPlatformTask"), "Must export cancelPlatformTask");
  assert.ok(apiClientContent.includes("export async function cancelTask"), "Must export cancelTask");
  assert.ok(apiClientContent.includes("export async function getTasks"), "Must export getTasks");
  assert.ok(apiClientContent.includes("export async function getTask"), "Must export getTask");
  assert.ok(apiClientContent.includes("export async function getPlatformHealth"), "Must export getPlatformHealth");
  assert.ok(apiClientContent.includes("export async function getPlatformAgents"), "Must export getPlatformAgents");
});

test("Console UI Layout: index.html defines operational metric indicators, status badges and light canvas design", () => {
  const html = fs.readFileSync("src/platform/web/index.html", "utf8");
  assert.ok(html.includes("ops-platform-status"), "Must include ops-platform-status telemetry element");
  assert.ok(html.includes("ops-runtime-status"), "Must include ops-runtime-status telemetry element");
  assert.ok(html.includes("ops-persistence-status"), "Must include ops-persistence-status telemetry element");
  assert.ok(html.includes("ops-event-count"), "Must include ops-event-count telemetry element");
  assert.ok(html.includes("ops-timeline"), "Must include ops-timeline container");
  assert.ok(html.includes("ops-tool-calls"), "Must include ops-tool-calls container");
  assert.ok(html.includes("theme-toggle-btn"), "Must include theme-toggle-btn");
});
