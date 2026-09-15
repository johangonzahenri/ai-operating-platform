import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { SqliteDatabase } from "../../src/infrastructure/persistence/sqlite/sqlite-database.js";
import { NewDurableEvent } from "../../src/application/ports/durable-event-port.js";

const PORT = 3098;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function createTestServer(options: { withEvents?: boolean; dbPath?: string } = {}) {
  const platform = createPlatform({
    useDurablePersistence: Boolean(options.dbPath),
    dbPath: options.dbPath,
  });

  if (options.withEvents && platform.eventStore) {
    const seedEvents: NewDurableEvent[] = [
      {
        eventId: "evt-test-1",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task-100",
        traceId: "trace-100",
        correlationId: "corr-100",
        occurredAt: new Date("2026-09-09T10:00:00.000Z"),
        payload: { taskId: "task-100", agentId: "agent-1", status: "CREATED" },
      },
      {
        eventId: "evt-test-2",
        eventType: "execution.started",
        aggregateType: "execution",
        aggregateId: "exec-100",
        traceId: "trace-100",
        correlationId: "corr-100",
        causationId: "evt-test-1",
        occurredAt: new Date("2026-09-09T10:00:01.000Z"),
        payload: { taskId: "task-100", executionId: "exec-100", agentId: "agent-1", status: "RUNNING" },
      },
      {
        eventId: "evt-test-3",
        eventType: "task.completed",
        aggregateType: "task",
        aggregateId: "task-100",
        traceId: "trace-100",
        correlationId: "corr-100",
        causationId: "evt-test-2",
        occurredAt: new Date("2026-09-09T10:00:02.000Z"),
        payload: { taskId: "task-100", status: "COMPLETED", result: { output: 42 } },
      },
      {
        eventId: "evt-test-4",
        eventType: "policy.evaluated",
        aggregateType: "policy",
        aggregateId: "pol-1",
        traceId: "trace-200",
        correlationId: "corr-200",
        occurredAt: new Date("2026-09-09T10:05:00.000Z"),
        payload: { decision: "ALLOW", reason: "Standard policy check passed" },
      },
    ];
    platform.eventStore.appendBatch(seedEvents);
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
  return { platform, service, server };
}

test("Operational UI Platform API Suite", async (t) => {
  const { server } = createTestServer({ withEvents: true });

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  await t.test("1. GET /api/health: reports verified platform, sqlite, and event store health", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.status, "HEALTHY");
    assert.equal(data.version, "1.0.0");
    assert.ok(typeof data.uptimeSeconds === "number");
    assert.ok(data.timestamp);

    assert.equal(data.components.api.status, "ONLINE");
    assert.equal(data.components.sqlite.status, "ONLINE");
    assert.equal(data.components.eventStore.status, "ONLINE");
    assert.equal(data.components.runtime.status, "ONLINE");
    assert.equal(data.components.recovery.status, "READY");

    assert.equal(data.components.eventStore.persistedCount, 4);
    assert.equal(data.components.eventStore.queryableCount, 4);
    assert.ok(data.components.eventStore.lastEventOccurredAt);
  });

  await t.test("2. GET /api/v1/health: identical response under /api/v1/ routing prefix", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "HEALTHY");
    assert.equal(data.components.eventStore.persistedCount, 4);
  });

  await t.test("3. GET /api/events: retrieves all events with metadata envelope", async () => {
    const res = await fetch(`${BASE_URL}/api/events`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 4);
    assert.equal(body.meta.count, 4);
    assert.equal(body.meta.total, 4);

    const first = body.data[0];
    assert.equal(first.id, "evt-test-1");
    assert.equal(first.sequenceNumber, 1);
    assert.equal(first.type, "task.created");
    assert.equal(first.aggregateType, "task");
    assert.equal(first.aggregateId, "task-100");
    assert.equal(first.traceId, "trace-100");
    assert.equal(first.occurredAt, "2026-09-09T10:00:00.000Z");
    assert.equal(first.version, 1);
    assert.deepEqual(first.payload, { taskId: "task-100", agentId: "agent-1", status: "CREATED" });
    assert.equal(first.metadata.sequenceNumber, 1);
    assert.equal(first.metadata.traceId, "trace-100");
    assert.equal(first.metadata.correlationId, "corr-100");
    assert.equal(first.metadata.schemaVersion, 1);
  });

  await t.test("4. GET /api/events: filters by eventType", async () => {
    const res = await fetch(`${BASE_URL}/api/events?eventType=task.created`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, "evt-test-1");
    assert.equal(body.meta.count, 1);
    assert.equal(body.meta.total, 4);
  });

  await t.test("5. GET /api/events: filters by aggregateType and traceId", async () => {
    const res = await fetch(`${BASE_URL}/api/events?aggregateType=task&traceId=trace-100`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.data.length, 2);
    assert.ok(body.data.every((e: { aggregateType: string }) => e.aggregateType === "task"));
  });

  await t.test("6. GET /api/events: paginates with limit and afterSequence", async () => {
    const res = await fetch(`${BASE_URL}/api/events?limit=2&afterSequence=1`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].sequenceNumber, 2);
    assert.equal(body.data[1].sequenceNumber, 3);
    assert.equal(body.meta.afterSequence, 1);
  });

  await t.test("7. GET /api/events/:id: retrieves specific event details by eventId", async () => {
    const res = await fetch(`${BASE_URL}/api/events/evt-test-2`);
    assert.equal(res.status, 200);
    const event = await res.json();

    assert.equal(event.id, "evt-test-2");
    assert.equal(event.type, "execution.started");
    assert.equal(event.causationId, "evt-test-1");
    assert.equal(event.metadata.causationId, "evt-test-1");
  });

  await t.test("8. GET /api/events/:id: retrieves event by sequence number", async () => {
    const res = await fetch(`${BASE_URL}/api/events/3`);
    assert.equal(res.status, 200);
    const event = await res.json();

    assert.equal(event.id, "evt-test-3");
    assert.equal(event.sequenceNumber, 3);
  });

  await t.test("9. GET /api/events/:id: returns 404 for nonexistent event", async () => {
    const res = await fetch(`${BASE_URL}/api/events/nonexistent-event-id`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.status, 404);
    assert.equal(data.code, "NOT_FOUND");
    assert.ok(data.error.includes("not found"));
  });

  await t.test("10. GET /api/events: rejects invalid limit with 400 Bad Request", async () => {
    const res = await fetch(`${BASE_URL}/api/events?limit=0`);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, "INVALID_LIMIT");

    const resTooHigh = await fetch(`${BASE_URL}/api/events?limit=999`);
    assert.equal(resTooHigh.status, 400);

    const resNan = await fetch(`${BASE_URL}/api/events?limit=abc`);
    assert.equal(resNan.status, 400);
  });

  await t.test("11. GET /api/events: rejects invalid date with 400 Bad Request", async () => {
    const res = await fetch(`${BASE_URL}/api/events?from=invalid-date`);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, "INVALID_DATE");
  });

  await t.test("12. GET /api/audit: retrieves recorded audit observations", async () => {
    const res = await fetch(`${BASE_URL}/api/audit`);
    assert.equal(res.status, 200);
    const observations = await res.json();
    assert.ok(Array.isArray(observations));
  });
});

test("Operational UI Empty State & Failure Handling Suite", async (t) => {
  const { server } = createTestServer({ withEvents: false });

  const EMPTY_PORT = 3097;
  const EMPTY_URL = `http://127.0.0.1:${EMPTY_PORT}`;

  await new Promise<void>((resolve) => {
    server.listen(EMPTY_PORT, "127.0.0.1", () => resolve());
  });

  t.after(() => {
    server.close();
  });

  await t.test("Empty State: GET /api/events returns empty list cleanly without throwing", async () => {
    const res = await fetch(`${EMPTY_URL}/api/events`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.count, 0);
    assert.equal(body.meta.total, 0);
  });

  await t.test("Empty State: GET /api/health reports 0 events and undefined lastEventOccurredAt", async () => {
    const res = await fetch(`${EMPTY_URL}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.components.eventStore.persistedCount, 0);
    assert.equal(data.components.eventStore.queryableCount, 0);
    assert.equal(data.components.eventStore.lastEventOccurredAt, undefined);
  });
});
