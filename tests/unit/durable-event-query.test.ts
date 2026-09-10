import assert from "node:assert/strict";
import test from "node:test";
import { SqliteEventStore } from "../../src/infrastructure/persistence/sqlite/sqlite-event-store.js";
import { SqlitePersistenceError } from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

test("SqliteEventStore Multi-Criteria Audit Query & Pagination Suite", async (t) => {
  await t.test("queries by time range with from and to bounds", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    const t1 = new Date("2026-09-09T10:00:00.000Z");
    const t2 = new Date("2026-09-09T10:05:00.000Z");
    const t3 = new Date("2026-09-09T10:10:00.000Z");

    store.append({
      eventId: "e-time-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t-1",
      traceId: "tr-1",
      correlationId: "cr-1",
      occurredAt: t1,
      payload: {},
    });

    store.append({
      eventId: "e-time-2",
      eventType: "task.started",
      aggregateType: "task",
      aggregateId: "t-1",
      traceId: "tr-1",
      correlationId: "cr-1",
      occurredAt: t2,
      payload: {},
    });

    store.append({
      eventId: "e-time-3",
      eventType: "task.completed",
      aggregateType: "task",
      aggregateId: "t-1",
      traceId: "tr-1",
      correlationId: "cr-1",
      occurredAt: t3,
      payload: {},
    });

    // Query range covering t1 and t2 only
    const range1 = store.getEventsByTimeRange(
      new Date("2026-09-09T09:59:00.000Z"),
      new Date("2026-09-09T10:06:00.000Z")
    );
    assert.equal(range1.length, 2);
    assert.equal(range1[0]?.eventId, "e-time-1");
    assert.equal(range1[1]?.eventId, "e-time-2");

    // Query range covering t2 and t3 only
    const range2 = store.query({
      from: new Date("2026-09-09T10:04:00.000Z"),
      to: new Date("2026-09-09T10:11:00.000Z"),
    });
    assert.equal(range2.length, 2);
    assert.equal(range2[0]?.eventId, "e-time-2");
    assert.equal(range2[1]?.eventId, "e-time-3");
  });

  await t.test("deterministic sequence-based pagination with afterSequence and limit", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    for (let i = 1; i <= 7; i++) {
      store.append({
        eventId: `page-evt-${i}`,
        eventType: "metric.sample",
        aggregateType: "metric",
        aggregateId: `m-${i}`,
        traceId: "trace-pages",
        correlationId: "corr-pages",
        payload: { index: i },
      });
    }

    // Page 1: limit 3
    const page1 = store.query({ limit: 3 });
    assert.equal(page1.length, 3);
    assert.equal(page1[0]?.sequenceNumber, 1);
    assert.equal(page1[2]?.sequenceNumber, 3);

    // Page 2: afterSequence = 3, limit 3
    const lastSeqPage1 = page1[page1.length - 1]!.sequenceNumber;
    const page2 = store.query({ afterSequence: lastSeqPage1, limit: 3 });
    assert.equal(page2.length, 3);
    assert.equal(page2[0]?.sequenceNumber, 4);
    assert.equal(page2[2]?.sequenceNumber, 6);

    // Page 3: afterSequence = 6, limit 3
    const lastSeqPage2 = page2[page2.length - 1]!.sequenceNumber;
    const page3 = store.query({ afterSequence: lastSeqPage2, limit: 3 });
    assert.equal(page3.length, 1);
    assert.equal(page3[0]?.sequenceNumber, 7);

    // Page 4: afterSequence = 7, limit 3 (empty)
    const page4 = store.query({ afterSequence: 7, limit: 3 });
    assert.equal(page4.length, 0);
  });

  await t.test("multi-criteria filtering combination", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    store.append({
      eventId: "multi-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t-100",
      traceId: "tr-target",
      correlationId: "cr-target",
      payload: {},
    });

    store.append({
      eventId: "multi-2",
      eventType: "execution.created",
      aggregateType: "execution",
      aggregateId: "ex-100",
      traceId: "tr-target",
      correlationId: "cr-target",
      payload: { taskId: "t-100" },
    });

    store.append({
      eventId: "multi-3",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t-200",
      traceId: "tr-other",
      correlationId: "cr-other",
      payload: {},
    });

    const results = store.query({
      traceId: "tr-target",
      aggregateType: "task",
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.eventId, "multi-1");
  });

  await t.test("fail-closed on corrupted payload row during audit query", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    store.append({
      eventId: "valid-1",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t-1",
      traceId: "tr-1",
      correlationId: "cr-1",
      payload: {},
    });

    // Corrupt in SQLite
    (store as any).db.prepare("UPDATE events SET payload = 'INVALID_JSON_HERE' WHERE event_id = 'valid-1'").run();

    assert.throws(
      () => store.query({ traceId: "tr-1" }),
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("Failed to parse payload");
      }
    );
  });
});
