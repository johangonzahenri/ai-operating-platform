import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { createPlatform } from "../../src/interfaces/composition.js";
import { PlatformService } from "../../src/platform/api/platform-service.js";
import { createHttpServer } from "../../src/platform/api/http-router.js";
import { createPlatformClient } from "../../src/platform-client/index.js";
import { ApiKeyRecord } from "../../src/domain/security/authentication.js";
import { EventStreamAdapter, sanitizePayload } from "../../src/application/observability/event-stream-adapter.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { InMemoryEventStore } from "../../src/infrastructure/persistence/in-memory-event-store.js";
import { DurableEvent } from "../../src/application/ports/durable-event-port.js";

const PORT = 3118;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function setupServer() {
  const platform = createPlatform();

  // Create API keys for testing
  const serviceKeyRaw = ApiKeyRecord.create({
    id: "key-service-stream",
    principalId: "service-worker-1",
    principalType: "SERVICE",
    keyHash: ApiKeyRecord.hashSecret("stream-secret-123"),
    roles: ["service", "operator"],
    tenantId: "tenant-primary",
  });
  await platform.apiKeyRepository.save(serviceKeyRaw);
  const validServiceApiKey = "key-service-stream.stream-secret-123";

  const foreignKeyRaw = ApiKeyRecord.create({
    id: "key-foreign-stream",
    principalId: "service-worker-foreign",
    principalType: "SERVICE",
    keyHash: ApiKeyRecord.hashSecret("foreign-secret-123"),
    roles: ["service"],
    tenantId: "tenant-foreign",
  });
  await platform.apiKeyRepository.save(foreignKeyRaw);
  const foreignApiKey = "key-foreign-stream.foreign-secret-123";

  const service = new PlatformService({
    tasks: platform.tasks,
    taskRepository: platform.taskRepository,
    executions: platform.executions,
    audit: platform.audit,
    metrics: platform.metrics,
    tools: platform.tools,
    models: platform.modelRegistry,
    agents: platform.agents,
    agentService: platform.agentService,
    submitTask: platform.submitTask,
    executeOrchestration: platform.executeOrchestration,
    eventStore: platform.eventStore,
    diagnostics: platform.diagnostics,
    eventStream: platform.eventStream,
  });

  const server = createHttpServer(service, {
    authService: platform.authenticationService,
    authzEvaluator: platform.rbacEvaluator,
    roleRepository: platform.roleRepository,
    apiKeyRepository: platform.apiKeyRepository,
    enforceSecurity: true,
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve());
  });

  return {
    platform,
    service,
    server,
    validServiceApiKey,
    foreignApiKey,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("Phase 59 - Reactive Operational Streaming (SSE)", async (t) => {
  const ctx = await setupServer();

  t.after(async () => {
    await ctx.close();
  });

  await t.test("Unit: sanitizePayload redacts sensitive authorization tokens and passwords", () => {
    const raw = {
      user: "alice",
      token: "secret-token-12345",
      apiKey: "key-live-999",
      nested: {
        password: "super-secret-pass",
        publicData: 42,
      },
      list: [
        { authorization: "Bearer xyz" },
        { label: "regular item" },
      ],
    };

    const sanitized = sanitizePayload(raw) as any;
    assert.equal(sanitized.user, "alice");
    assert.equal(sanitized.token, "[REDACTED]");
    assert.equal(sanitized.apiKey, "[REDACTED]");
    assert.equal(sanitized.nested.password, "[REDACTED]");
    assert.equal(sanitized.nested.publicData, 42);
    assert.equal(sanitized.list[0].authorization, "[REDACTED]");
    assert.equal(sanitized.list[1].label, "regular item");
  });

  await t.test("Unit: EventStreamAdapter handles client registration, heartbeats and backpressure", async () => {
    const publisher = new InMemoryEventPublisher();
    const eventStore = new InMemoryEventStore();
    const adapter = new EventStreamAdapter(publisher, eventStore, {
      heartbeatIntervalMs: 50,
      maxQueueSize: 2,
    });

    const writes: string[] = [];
    const mockRes = {
      writeHead: () => mockRes,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      on: () => mockRes,
      writableEnded: false,
      destroyed: false,
    } as unknown as http.ServerResponse;

    const result = adapter.handleClientConnection(mockRes, {
      tenantId: "tenant-a",
    });

    assert.equal(result.ok, true);
    assert.equal(adapter.getStats().activeConnections, 1);

    // Wait for at least one heartbeat
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(writes.some((w) => w.includes(": heartbeat")));

    // Disconnect cleanup
    adapter.disconnectAll();
    assert.equal(adapter.getStats().activeConnections, 0);
  });

  await t.test("Unit: EventStreamAdapter replays events from Last-Event-ID", () => {
    const publisher = new InMemoryEventPublisher();
    const eventStore = new InMemoryEventStore();

    // Store dummy events
    eventStore.append({
      eventId: "e-1",
      eventType: "task.created",
      aggregateType: "Task",
      aggregateId: "task-1",
      traceId: "trace-1",
      correlationId: "corr-1",
      occurredAt: new Date(),
      payload: { tenantId: "tenant-a", name: "Task 1" },
    });
    eventStore.append({
      eventId: "e-2",
      eventType: "task.started",
      aggregateType: "Task",
      aggregateId: "task-1",
      traceId: "trace-1",
      correlationId: "corr-1",
      occurredAt: new Date(),
      payload: { tenantId: "tenant-a", name: "Task 1" },
    });
    eventStore.append({
      eventId: "e-3",
      eventType: "task.created",
      aggregateType: "Task",
      aggregateId: "task-2",
      traceId: "trace-2",
      correlationId: "corr-2",
      occurredAt: new Date(),
      payload: { tenantId: "tenant-b", name: "Task 2 (Foreign)" },
    });

    const adapter = new EventStreamAdapter(publisher, eventStore);
    const writes: string[] = [];
    const mockRes = {
      writeHead: () => mockRes,
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
      on: () => mockRes,
      writableEnded: false,
      destroyed: false,
    } as unknown as http.ServerResponse;

    // Connect with Last-Event-ID = 1 for tenant-a
    adapter.handleClientConnection(mockRes, {
      tenantId: "tenant-a",
      lastEventId: 1,
    });

    // Replayed message should contain sequenceNumber 2 for tenant-a, NOT sequenceNumber 3 (tenant-b)
    const combinedWrites = writes.join("");
    assert.ok(combinedWrites.includes("task.started"), "Must replay event 2");
    assert.ok(!combinedWrites.includes("tenant-b"), "Strict isolation: foreign tenant must not be replayed");

    adapter.disconnectAll();
  });

  await t.test("Integration: GET /api/v1/events/stream enforces authentication fail-closed", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/events/stream`, {
      headers: {
        Accept: "text/event-stream",
      },
    });

    assert.equal(res.status, 401, "Unauthenticated stream request must return 401 Unauthorized");
  });

  await t.test("Integration: GET /api/v1/events/stream rejects cross-tenant mismatch", async () => {
    // Authenticated with validServiceApiKey (bound to tenant-primary), but requesting tenant-foreign
    const res = await fetch(`${BASE_URL}/api/v1/events/stream?tenantId=tenant-foreign`, {
      headers: {
        Accept: "text/event-stream",
        "X-API-Key": ctx.validServiceApiKey,
      },
    });

    assert.equal(res.status, 403, "Cross-tenant stream request must return 403 Forbidden");
  });

  await t.test("Integration: PlatformClient connects and receives live SSE stream and replays", async () => {
    // 1. Seed an event in durable event store
    const durableEventStore = ctx.platform.eventStore;
    durableEventStore.append({
      eventId: "hist-10",
      eventType: "execution.created",
      aggregateType: "Execution",
      aggregateId: "exec-10",
      traceId: "trace-stream-1",
      correlationId: "corr-stream-1",
      occurredAt: new Date(),
      payload: { tenantId: "tenant-primary", status: "CREATED" },
    });

    const client = createPlatformClient({
      baseUrl: BASE_URL,
      apiKey: ctx.validServiceApiKey,
    });

    const receivedEvents: any[] = [];
    let opened = false;

    const streamHandle = client.events.stream(
      {
        lastEventId: 0,
      },
      {
        onOpen: () => {
          opened = true;
        },
        onEvent: (evt) => {
          receivedEvents.push(evt);
        },
      }
    );

    // Give time for SSE handshake and replay
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(opened, "SSE stream must open successfully");
    assert.ok(receivedEvents.length >= 1, "Must receive at least 1 replayed event");
    assert.equal(receivedEvents[0].data?.eventType, "execution.created");

    // 2. Publish a live domain event
    ctx.platform.events.publish({
      id: "live-event-99",
      type: "execution.started",
      aggregateId: "exec-10",
      traceId: "trace-stream-1",
      occurredAt: new Date(),
      payload: { tenantId: "tenant-primary", status: "RUNNING" },
    });

    await new Promise((r) => setTimeout(r, 200));
    assert.ok(receivedEvents.length >= 2, "Must receive the live published event");
    assert.equal(receivedEvents[1].data?.eventType, "execution.started");

    streamHandle.close();
  });

  await t.test("Integration: GET /api/platform/v1/events/stream aliases /api/v1/events/stream", async () => {
    const ac = new AbortController();
    const res = await fetch(`${BASE_URL}/api/platform/v1/events/stream`, {
      headers: {
        Accept: "text/event-stream",
        "X-API-Key": ctx.validServiceApiKey,
      },
      signal: ac.signal,
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));
    assert.ok(res.headers.get("cache-control")?.includes("no-cache"));
    assert.equal(res.headers.get("connection"), "keep-alive");
    ac.abort();
  });
});
