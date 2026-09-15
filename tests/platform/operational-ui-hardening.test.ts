import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { PLATFORM_VERSION } from "../../src/platform/version.js";
import { NewDurableEvent } from "../../src/application/ports/durable-event-port.js";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function createTestServer(options: { withEvents?: boolean; eventCount?: number } = {}) {
  const platform = createPlatform({ useDurablePersistence: false });

  if (options.withEvents && platform.eventStore) {
    const count = options.eventCount ?? 15;
    for (let i = 1; i <= count; i++) {
      const evt: NewDurableEvent = {
        eventId: `evt-hardened-${i}`,
        eventType: i % 2 === 0 ? "task.completed" : "task.created",
        aggregateType: "task",
        aggregateId: `task-${100 + i}`,
        traceId: `trace-${100 + i}`,
        correlationId: `corr-${100 + i}`,
        occurredAt: new Date(Date.now() + i * 1000),
        payload: {
          step: i,
          status: i % 2 === 0 ? "COMPLETED" : "CREATED",
          xssProbe: "<script>alert(1)</script>",
        },
      };
      platform.eventStore.append(evt);
    }
  }

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
  return { server, platform, service };
}

test("Operational UI Hardening & Version Consistency Suite", async (t) => {
  const { server } = createTestServer({ withEvents: true, eventCount: 15 });

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  await t.test("1. Version Consistency: PLATFORM_VERSION is single source of truth across API and package.json", async () => {
    assert.equal(PLATFORM_VERSION, "1.0.0");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    assert.equal(pkg.version, PLATFORM_VERSION, "package.json version must match PLATFORM_VERSION");

    const resV1 = await fetch(`${BASE_URL}/api/v1/health`);
    const healthV1 = await resV1.json();
    assert.equal(healthV1.version, PLATFORM_VERSION);

    const resStatus = await fetch(`${BASE_URL}/api/v1/status`);
    const statusData = await resStatus.json();
    assert.equal(statusData.version, PLATFORM_VERSION);
  });

  await t.test("2. Static Web Assets: Serves live files from src/platform/web", async () => {
    const resHtml = await fetch(`${BASE_URL}/`);
    assert.equal(resHtml.status, 200);
    const htmlText = await resHtml.text();
    assert.ok(htmlText.includes('data-tab="platform-operations"'));
    assert.ok(htmlText.includes('id="events-pagination-bar"'));
    assert.ok(htmlText.includes('id="events-prev-btn"'));
    assert.ok(htmlText.includes('id="events-next-btn"'));
    assert.ok(htmlText.includes('No audit records available.'));

    const resJs = await fetch(`${BASE_URL}/app.js`);
    assert.equal(resJs.status, 200);
    const jsText = await resJs.text();
    assert.ok(jsText.includes("setupRefresh()"));
    assert.ok(jsText.includes("updatePaginationControls("));
  });

  await t.test("3. Backend Pagination: Correctly pages events with limit and afterSequence", async () => {
    // Page 1: 5 items
    const resPage1 = await fetch(`${BASE_URL}/api/v1/events?limit=5`);
    assert.equal(resPage1.status, 200);
    const page1 = await resPage1.json();
    assert.equal(page1.data.length, 5);
    assert.equal(page1.meta.count, 5);
    assert.equal(page1.meta.total, 15);
    const lastSeq = page1.data[4].sequenceNumber;

    // Page 2: next 5 items using afterSequence
    const resPage2 = await fetch(`${BASE_URL}/api/v1/events?limit=5&afterSequence=${lastSeq}`);
    assert.equal(resPage2.status, 200);
    const page2 = await resPage2.json();
    assert.equal(page2.data.length, 5);
    assert.equal(page2.data[0].sequenceNumber, lastSeq + 1);
  });

  await t.test("4. Error Isolation: Corrupted or missing event ID yields 404 without crashing router", async () => {
    const resNotFound = await fetch(`${BASE_URL}/api/v1/events/non-existent-uuid`);
    assert.equal(resNotFound.status, 404);
    const errData = await resNotFound.json();
    assert.equal(errData.code, "NOT_FOUND");

    // Ensure server remains responsive
    const resHealth = await fetch(`${BASE_URL}/api/v1/health`);
    assert.equal(resHealth.status, 200);
  });

  await t.test("5. XSS Safety: Malicious payload strings in event payloads are stored as plain strings", async () => {
    const resEvents = await fetch(`${BASE_URL}/api/v1/events?limit=1`);
    const data = await resEvents.json();
    assert.equal(data.data[0].payload.xssProbe, "<script>alert(1)</script>");
  });
});
