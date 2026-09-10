import assert from "node:assert/strict";
import test from "node:test";
import { DurableEventStore, DurableEventQueryPort } from "../../src/application/ports/durable-event-port.js";
import { InMemoryEventStore } from "../../src/infrastructure/persistence/in-memory-event-store.js";
import { SqliteEventStore } from "../../src/infrastructure/persistence/sqlite/sqlite-event-store.js";

type StoreFactory = () => (DurableEventStore & DurableEventQueryPort);

function runDurableEventStoreContractSuite(name: string, factory: StoreFactory) {
  test(`DurableEventStore Contract Suite (${name})`, async (t) => {
    await t.test("appends and retrieves single event", () => {
      const store = factory();
      const event = store.append({
        eventId: "e-1",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task-100",
        traceId: "trace-100",
        correlationId: "corr-100",
        causationId: "cause-100",
        payload: { initial: true },
      });

      assert.equal(event.sequenceNumber, 1);
      assert.equal(event.eventId, "e-1");
      assert.equal(event.eventType, "task.created");
      assert.equal(event.aggregateType, "task");
      assert.equal(event.aggregateId, "task-100");
      assert.equal(event.traceId, "trace-100");
      assert.equal(event.correlationId, "corr-100");
      assert.equal(event.causationId, "cause-100");
      assert.ok(event.occurredAt instanceof Date);
      assert.deepEqual(event.payload, { initial: true });
    });

    await t.test("strictly monotonic sequence numbers across multiple appends", () => {
      const store = factory();
      const e1 = store.append({
        eventId: "seq-1",
        eventType: "type.a",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });
      const e2 = store.append({
        eventId: "seq-2",
        eventType: "type.b",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });
      const e3 = store.append({
        eventId: "seq-3",
        eventType: "type.c",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });

      assert.equal(e1.sequenceNumber, 1);
      assert.equal(e2.sequenceNumber, 2);
      assert.equal(e3.sequenceNumber, 3);
    });

    await t.test("rejects duplicate event ID", () => {
      const store = factory();
      store.append({
        eventId: "unique-1",
        eventType: "type.a",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });

      assert.throws(() => {
        store.append({
          eventId: "unique-1",
          eventType: "type.b",
          aggregateType: "task",
          aggregateId: "t-1",
          traceId: "tr-1",
          correlationId: "cr-1",
          payload: {},
        });
      });
    });

    await t.test("queries events by task ID via aggregateId and payload", () => {
      const store = factory();
      store.append({
        eventId: "t-evt-1",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "target-task",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });
      store.append({
        eventId: "t-evt-2",
        eventType: "execution.created",
        aggregateType: "execution",
        aggregateId: "exec-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: { taskId: "target-task" },
      });
      store.append({
        eventId: "t-evt-3",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "other-task",
        traceId: "tr-2",
        correlationId: "cr-2",
        payload: {},
      });

      const events = store.getEventsByTask("target-task");
      assert.equal(events.length, 2);
      assert.ok(events[0]);
      assert.ok(events[1]);
      assert.equal(events[0].eventId, "t-evt-1");
      assert.equal(events[1].eventId, "t-evt-2");
    });

    await t.test("queries events by execution ID via aggregateId and payload", () => {
      const store = factory();
      store.append({
        eventId: "e-evt-1",
        eventType: "execution.started",
        aggregateType: "execution",
        aggregateId: "target-exec",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });
      store.append({
        eventId: "e-evt-2",
        eventType: "context.created",
        aggregateType: "context",
        aggregateId: "ctx-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: { executionId: "target-exec" },
      });
      store.append({
        eventId: "e-evt-3",
        eventType: "execution.started",
        aggregateType: "execution",
        aggregateId: "other-exec",
        traceId: "tr-2",
        correlationId: "cr-2",
        payload: {},
      });

      const events = store.getEventsByExecution("target-exec");
      assert.equal(events.length, 2);
      assert.ok(events[0]);
      assert.ok(events[1]);
      assert.equal(events[0].eventId, "e-evt-1");
      assert.equal(events[1].eventId, "e-evt-2");
    });

    await t.test("queries events by trace ID, correlation ID and event type", () => {
      const store = factory();
      store.append({
        eventId: "multi-1",
        eventType: "system.ping",
        aggregateType: "system",
        aggregateId: "sys",
        traceId: "trace-xyz",
        correlationId: "corr-123",
        payload: {},
      });
      store.append({
        eventId: "multi-2",
        eventType: "system.pong",
        aggregateType: "system",
        aggregateId: "sys",
        traceId: "trace-xyz",
        correlationId: "corr-456",
        payload: {},
      });

      const byTrace = store.getEventsByTrace("trace-xyz");
      assert.equal(byTrace.length, 2);

      const byCorr = store.getEventsByCorrelation("corr-123");
      assert.equal(byCorr.length, 1);
      assert.ok(byCorr[0]);
      assert.equal(byCorr[0].eventId, "multi-1");

      const byType = store.getEventsByType("system.pong");
      assert.equal(byType.length, 1);
      assert.ok(byType[0]);
      assert.equal(byType[0].eventId, "multi-2");
    });

    await t.test("immutable append-only contract: does not expose update or delete methods", () => {
      const store = factory();
      assert.equal((store as any).updateEvent, undefined);
      assert.equal((store as any).deleteEvent, undefined);
      assert.equal((store as any).update, undefined);
      assert.equal((store as any).delete, undefined);
    });
  });
}

runDurableEventStoreContractSuite("InMemoryEventStore", () => new InMemoryEventStore());
runDurableEventStoreContractSuite("SqliteEventStore", () => new SqliteEventStore({ dbPath: ":memory:" }));
