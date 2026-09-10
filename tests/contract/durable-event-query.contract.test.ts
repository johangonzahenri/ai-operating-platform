import assert from "node:assert/strict";
import test from "node:test";
import { DurableEventStore, DurableEventQueryPort } from "../../src/application/ports/durable-event-port.js";
import { InMemoryEventStore } from "../../src/infrastructure/persistence/in-memory-event-store.js";
import { SqliteEventStore } from "../../src/infrastructure/persistence/sqlite/sqlite-event-store.js";

type StoreFactory = () => (DurableEventStore & DurableEventQueryPort);

function runDurableEventQueryContractSuite(name: string, factory: StoreFactory) {
  test(`DurableEventQuery Contract Suite (${name})`, async (t) => {
    await t.test("Test E: Query by event type", () => {
      const store = factory();
      store.append({
        eventId: "type-1",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });
      store.append({
        eventId: "type-2",
        eventType: "task.completed",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });
      store.append({
        eventId: "type-3",
        eventType: "execution.failed",
        aggregateType: "execution",
        aggregateId: "ex-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      });

      const createdEvents = store.getEventsByType("task.created");
      assert.equal(createdEvents.length, 1);
      assert.equal(createdEvents[0]?.eventId, "type-1");

      const completedEvents = store.getEventsByType("task.completed");
      assert.equal(completedEvents.length, 1);
      assert.equal(completedEvents[0]?.eventId, "type-2");

      const failedEvents = store.getEventsByType("execution.failed");
      assert.equal(failedEvents.length, 1);
      assert.equal(failedEvents[0]?.eventId, "type-3");
    });

    await t.test("Test F: Time range queries with exact boundaries", () => {
      const store = factory();
      const t1 = new Date("2026-09-09T08:00:00.000Z");
      const t2 = new Date("2026-09-09T08:10:00.000Z");
      const t3 = new Date("2026-09-09T08:20:00.000Z");

      store.append({
        eventId: "time-1",
        eventType: "step.1",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        occurredAt: t1,
        payload: {},
      });
      store.append({
        eventId: "time-2",
        eventType: "step.2",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        occurredAt: t2,
        payload: {},
      });
      store.append({
        eventId: "time-3",
        eventType: "step.3",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        occurredAt: t3,
        payload: {},
      });

      const window = store.getEventsByTimeRange(t1, t2);
      assert.equal(window.length, 2);
      assert.equal(window[0]?.eventId, "time-1");
      assert.equal(window[1]?.eventId, "time-2");
    });

    await t.test("Test H: Sequence pagination across multiple pages", () => {
      const store = factory();
      for (let i = 1; i <= 6; i++) {
        store.append({
          eventId: `p-evt-${i}`,
          eventType: "audit.action",
          aggregateType: "audit",
          aggregateId: "aud",
          traceId: "tr-p",
          correlationId: "cr-p",
          payload: { num: i },
        });
      }

      // Page 1: limit 2
      const page1 = store.query({ limit: 2 });
      assert.equal(page1.length, 2);
      assert.equal(page1[0]?.sequenceNumber, 1);
      assert.equal(page1[1]?.sequenceNumber, 2);

      // Page 2: afterSequence 2, limit 2
      const page2 = store.query({ afterSequence: 2, limit: 2 });
      assert.equal(page2.length, 2);
      assert.equal(page2[0]?.sequenceNumber, 3);
      assert.equal(page2[1]?.sequenceNumber, 4);

      // Page 3: afterSequence 4, limit 2
      const page3 = store.query({ afterSequence: 4, limit: 2 });
      assert.equal(page3.length, 2);
      assert.equal(page3[0]?.sequenceNumber, 5);
      assert.equal(page3[1]?.sequenceNumber, 6);

      // Ensure zero overlap and zero omitted records
      const allIds = [...page1, ...page2, ...page3].map((e) => e.eventId);
      assert.equal(new Set(allIds).size, 6);
    });

    await t.test("Test I: Read-only contract guarantee", () => {
      const store = factory();
      assert.equal((store as any).updateEvent, undefined);
      assert.equal((store as any).deleteEvent, undefined);
      assert.equal((store as any).truncate, undefined);
      assert.equal((store as any).truncateEvents, undefined);
      assert.equal((store as any).update, undefined);
      assert.equal((store as any).delete, undefined);
    });

    await t.test("payload immutability: returned payloads are frozen", () => {
      const store = factory();
      const event = store.append({
        eventId: "freeze-1",
        eventType: "frozen.type",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: { meta: "initial" },
      });

      assert.ok(Object.isFrozen(event.payload));
      const fetched = store.query({ eventType: "frozen.type" });
      assert.ok(fetched[0]);
      assert.ok(Object.isFrozen(fetched[0]?.payload));
    });
  });
}

runDurableEventQueryContractSuite("InMemoryEventStore", () => new InMemoryEventStore());
runDurableEventQueryContractSuite("SqliteEventStore", () => new SqliteEventStore({ dbPath: ":memory:" }));
