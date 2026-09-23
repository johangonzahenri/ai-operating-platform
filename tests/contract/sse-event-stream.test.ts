import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import { EventStreamAdapter, sanitizePayload } from "../../src/application/observability/event-stream-adapter.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";
import { DurableEvent, DurableEventQueryPort, DurableEventStore } from "../../src/application/ports/durable-event-port.js";
import { DomainEvent } from "../../src/domain/events/events.js";

class MockResponse extends EventEmitter {
  public headers: Record<string, string | string[]> = {};
  public statusCode = 0;
  public writtenChunks: string[] = [];
  public writableEnded = false;
  public destroyed = false;

  writeHead(status: number, headers: Record<string, string | string[]>): this {
    this.statusCode = status;
    this.headers = headers;
    return this;
  }

  write(chunk: string): boolean {
    if (this.writableEnded || this.destroyed) return false;
    this.writtenChunks.push(chunk);
    return true;
  }

  end(): this {
    this.writableEnded = true;
    this.emit("finish");
    return this;
  }

  destroy(): this {
    this.destroyed = true;
    this.emit("close");
    return this;
  }
}

class MockDurableEventStore implements DurableEventStore, DurableEventQueryPort {
  private events: DurableEvent[] = [];

  append(evt: DurableEvent): void {
    this.events.push(evt);
  }

  query(filter?: { afterSequence?: number; limit?: number }): readonly DurableEvent[] {
    let result = this.events;
    if (filter?.afterSequence !== undefined) {
      result = result.filter((e) => e.sequenceNumber > filter.afterSequence!);
    }
    if (filter?.limit !== undefined) {
      result = result.slice(0, filter.limit);
    }
    return result;
  }
}

test("EventStreamAdapter: Payload Sanitization Contract", () => {
  const sensitiveData = {
    apiKey: "aop_key_secret123",
    bearerToken: "Bearer sk-test-token-12345",
    password: "supersecretpassword",
    nested: {
      private_key: "private-rsa-key",
      normalField: "public-value",
    },
    items: [
      { secret: "hidden", name: "visible" },
    ],
  };

  const sanitized = sanitizePayload(sensitiveData) as Record<string, unknown>;
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.bearerToken, "[REDACTED]");
  assert.equal(sanitized.password, "[REDACTED]");
  const nested = sanitized.nested as Record<string, unknown>;
  assert.equal(nested.private_key, "[REDACTED]");
  assert.equal(nested.normalField, "public-value");
  const items = sanitized.items as Array<Record<string, unknown>>;
  assert.equal(items[0]?.secret, "[REDACTED]");
  assert.equal(items[0]?.name, "visible");
});

test("EventStreamAdapter: SSE Handshake and Heartbeat Contract", async () => {
  const publisher = new InMemoryEventPublisher();
  const adapter = new EventStreamAdapter(publisher, undefined, { heartbeatIntervalMs: 50 });
  const mockRes = new MockResponse() as unknown as http.ServerResponse;

  const result = adapter.handleClientConnection(mockRes, { tenantId: "tenant-1" });
  assert.ok(result.ok, "Connection handled successfully");

  const res = mockRes as unknown as MockResponse;
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(res.headers["Cache-Control"], "no-cache, no-transform, no-store");
  assert.equal(res.headers["Connection"], "keep-alive");
  assert.equal(res.headers["X-Accel-Buffering"], "no");

  assert.ok(res.writtenChunks.some((c) => c.startsWith(": stream connected")));

  // Wait for heartbeat
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.ok(res.writtenChunks.some((c) => c === ": heartbeat\n\n"), "Heartbeat was emitted");

  adapter.closeAll();
});

test("EventStreamAdapter: Strict Multi-Tenant and Application Isolation", () => {
  const publisher = new InMemoryEventPublisher();
  const adapter = new EventStreamAdapter(publisher);

  const resTenantA = new MockResponse() as unknown as http.ServerResponse;
  const resTenantB = new MockResponse() as unknown as http.ServerResponse;
  const resApp1 = new MockResponse() as unknown as http.ServerResponse;

  adapter.handleClientConnection(resTenantA, { tenantId: "tenant-alpha" });
  adapter.handleClientConnection(resTenantB, { tenantId: "tenant-beta" });
  adapter.handleClientConnection(resApp1, { tenantId: "tenant-alpha", applicationId: "app-orders" });

  const eventA: DomainEvent = {
    id: "evt-1",
    type: "task.created",
    aggregateId: "task-1",
    traceId: "trace-1",
    occurredAt: new Date(),
    payload: { tenantId: "tenant-alpha", applicationId: "app-orders", description: "Order created" },
  };

  const eventB: DomainEvent = {
    id: "evt-2",
    type: "task.completed",
    aggregateId: "task-2",
    traceId: "trace-2",
    occurredAt: new Date(),
    payload: { tenantId: "tenant-beta", applicationId: "app-inventory", description: "Item stocked" },
  };

  publisher.publish(eventA);
  publisher.publish(eventB);

  const chunksA = (resTenantA as unknown as MockResponse).writtenChunks;
  const chunksB = (resTenantB as unknown as MockResponse).writtenChunks;
  const chunksApp1 = (resApp1 as unknown as MockResponse).writtenChunks;

  // Tenant A receives eventA, NOT eventB
  assert.ok(chunksA.some((c) => c.includes("task.created") && c.includes("tenant-alpha")));
  assert.ok(!chunksA.some((c) => c.includes("tenant-beta")));

  // Tenant B receives eventB, NOT eventA
  assert.ok(chunksB.some((c) => c.includes("task.completed") && c.includes("tenant-beta")));
  assert.ok(!chunksB.some((c) => c.includes("tenant-alpha")));

  // App1 (orders) receives eventA, NOT eventB
  assert.ok(chunksApp1.some((c) => c.includes("app-orders")));
  assert.ok(!chunksApp1.some((c) => c.includes("app-inventory")));

  adapter.closeAll();
});

test("EventStreamAdapter: Last-Event-ID Deterministic Historical Replay", () => {
  const store = new MockDurableEventStore();
  store.append({
    sequenceNumber: 1,
    eventId: "e1",
    eventType: "task.created",
    aggregateType: "Task",
    aggregateId: "t1",
    traceId: "tr1",
    occurredAt: new Date(),
    payload: { tenantId: "tenant-1", message: "first" },
  });
  store.append({
    sequenceNumber: 2,
    eventId: "e2",
    eventType: "task.started",
    aggregateType: "Task",
    aggregateId: "t1",
    traceId: "tr1",
    occurredAt: new Date(),
    payload: { tenantId: "tenant-1", message: "second" },
  });
  store.append({
    sequenceNumber: 3,
    eventId: "e3",
    eventType: "task.completed",
    aggregateType: "Task",
    aggregateId: "t1",
    traceId: "tr1",
    occurredAt: new Date(),
    payload: { tenantId: "tenant-1", message: "third" },
  });

  const adapter = new EventStreamAdapter(undefined, store);
  const mockRes = new MockResponse() as unknown as http.ServerResponse;

  // Reconnect with lastEventId: 1 -> should replay 2 and 3
  const res = adapter.handleClientConnection(mockRes, { tenantId: "tenant-1", lastEventId: 1 });
  assert.ok(res.ok);

  const chunks = (mockRes as unknown as MockResponse).writtenChunks;
  const replayedChunks = chunks.filter((c) => c.includes('"replayed":true'));
  assert.equal(replayedChunks.length, 2, "Replayed 2 events after sequence 1");
  assert.ok(replayedChunks.some((c) => c.includes("task.started")));
  assert.ok(replayedChunks.some((c) => c.includes("task.completed")));

  adapter.closeAll();
});

test("EventStreamAdapter: Connection Limits and Resource Protection", () => {
  const adapter = new EventStreamAdapter(undefined, undefined, {
    maxGlobalConnections: 3,
    maxTenantConnections: 2,
  });

  const res1 = new MockResponse() as unknown as http.ServerResponse;
  const res2 = new MockResponse() as unknown as http.ServerResponse;
  const res3 = new MockResponse() as unknown as http.ServerResponse;

  assert.equal(adapter.handleClientConnection(res1, { tenantId: "tenant-A" }).ok, true);
  assert.equal(adapter.handleClientConnection(res2, { tenantId: "tenant-A" }).ok, true);

  // Tenant limit exceeded
  const resTenantLimit = adapter.handleClientConnection(res3, { tenantId: "tenant-A" });
  assert.equal(resTenantLimit.ok, false);
  if (!resTenantLimit.ok) {
    assert.equal(resTenantLimit.code, "TENANT_STREAM_LIMIT_EXCEEDED");
  }

  // Different tenant can connect
  assert.equal(adapter.handleClientConnection(res3, { tenantId: "tenant-B" }).ok, true);

  // Global limit reached (3/3)
  const res4 = new MockResponse() as unknown as http.ServerResponse;
  const resGlobalLimit = adapter.handleClientConnection(res4, { tenantId: "tenant-C" });
  assert.equal(resGlobalLimit.ok, false);
  if (!resGlobalLimit.ok) {
    assert.equal(resGlobalLimit.code, "CONNECTION_LIMIT_EXCEEDED");
  }

  adapter.closeAll();
});
