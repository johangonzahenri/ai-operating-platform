import assert from "node:assert/strict";
import test from "node:test";
import { SqliteEventStore } from "../../src/infrastructure/persistence/sqlite/sqlite-event-store.js";
import { SqlitePersistenceError } from "../../src/infrastructure/persistence/sqlite/sqlite-errors.js";

test("SqliteEventStore Unit Suite", async (t) => {
  await t.test("1. Append single event assigns strictly monotonic sequence number", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    const e1 = store.append({
      eventId: "evt-001",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-001",
      traceId: "trace-001",
      correlationId: "corr-001",
      payload: { status: "CREATED" },
    });

    const e2 = store.append({
      eventId: "evt-002",
      eventType: "task.started",
      aggregateType: "task",
      aggregateId: "task-001",
      traceId: "trace-001",
      correlationId: "corr-001",
      payload: { status: "RUNNING" },
    });

    assert.equal(e1.sequenceNumber, 1);
    assert.equal(e1.eventId, "evt-001");
    assert.equal(e1.eventType, "task.created");
    assert.equal(e1.aggregateType, "task");
    assert.equal(e1.aggregateId, "task-001");
    assert.equal(e1.traceId, "trace-001");
    assert.equal(e1.correlationId, "corr-001");
    assert.equal(e1.schemaVersion, 1);
    assert.deepEqual(e1.payload, { status: "CREATED" });

    assert.equal(e2.sequenceNumber, 2);
    assert.ok(e2.sequenceNumber > e1.sequenceNumber);
  });

  await t.test("2. Rejects duplicate event_id fail-closed", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    store.append({
      eventId: "dup-001",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-001",
      traceId: "trace-001",
      correlationId: "corr-001",
      payload: { step: 1 },
    });

    assert.throws(
      () => {
        store.append({
          eventId: "dup-001",
          eventType: "task.updated",
          aggregateType: "task",
          aggregateId: "task-001",
          traceId: "trace-001",
          correlationId: "corr-001",
          payload: { step: 2 },
        });
      },
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("dup-001");
      }
    );
  });

  await t.test("3. JSON payload serialization and defensive immutability", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    const inputPayload = { nested: { key: "value" }, arr: [1, 2, 3] };
    const saved = store.append({
      eventId: "payload-001",
      eventType: "task.completed",
      aggregateType: "task",
      aggregateId: "task-001",
      traceId: "trace-001",
      correlationId: "corr-001",
      payload: inputPayload,
    });

    assert.deepEqual(saved.payload, inputPayload);
    assert.ok(Object.isFrozen(saved.payload));

    // Mutating input object does not alter stored event
    (inputPayload.nested as any).key = "changed";
    const fetched = store.getEventsByTask("task-001");
    assert.ok(fetched[0]);
    assert.equal((fetched[0].payload as any).nested.key, "value");
  });

  await t.test("4. Fail-closed: corrupted JSON in database raises SqlitePersistenceError", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });
    store.append({
      eventId: "corrupt-001",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-001",
      traceId: "trace-001",
      correlationId: "corr-001",
      payload: { valid: true },
    });

    // Corrupt payload directly in SQLite
    (store as any).db.prepare("UPDATE events SET payload = 'NOT_JSON' WHERE event_id = 'corrupt-001'").run();

    assert.throws(
      () => store.getAllEvents(),
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("Failed to parse payload");
      }
    );
  });

  await t.test("5. Fail-closed: corrupted occurred_at raises SqlitePersistenceError", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });
    store.append({
      eventId: "corrupt-002",
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task-001",
      traceId: "trace-001",
      correlationId: "corr-001",
      payload: { valid: true },
    });

    (store as any).db.prepare("UPDATE events SET occurred_at = 'INVALID_DATE' WHERE event_id = 'corrupt-002'").run();

    assert.throws(
      () => store.getAllEvents(),
      (err: unknown) => {
        return err instanceof SqlitePersistenceError && err.message.includes("Corrupted occurred_at");
      }
    );
  });

  await t.test("6. Batch append executes atomically", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    const batch = [
      {
        eventId: "batch-1",
        eventType: "batch.1",
        aggregateType: "batch",
        aggregateId: "b-01",
        traceId: "t-01",
        correlationId: "c-01",
        payload: {},
      },
      {
        eventId: "batch-2",
        eventType: "batch.2",
        aggregateType: "batch",
        aggregateId: "b-01",
        traceId: "t-01",
        correlationId: "c-01",
        payload: {},
      },
    ];

    const results = store.appendBatch(batch);
    assert.equal(results.length, 2);
    assert.ok(results[0]);
    assert.ok(results[1]);
    assert.equal(results[0].sequenceNumber, 1);
    assert.equal(results[1].sequenceNumber, 2);

    const all = store.getAllEvents();
    assert.equal(all.length, 2);
  });

  await t.test("7. Batch append rollback: failure during batch rolls back all events in batch", () => {
    const store = new SqliteEventStore({ dbPath: ":memory:" });

    store.append({
      eventId: "existing-01",
      eventType: "prior",
      aggregateType: "task",
      aggregateId: "t-1",
      traceId: "tr-1",
      correlationId: "cr-1",
      payload: {},
    });

    const failingBatch = [
      {
        eventId: "batch-new-1",
        eventType: "batch.new",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      },
      {
        eventId: "existing-01", // Duplicate ID causes failure!
        eventType: "batch.fail",
        aggregateType: "task",
        aggregateId: "t-1",
        traceId: "tr-1",
        correlationId: "cr-1",
        payload: {},
      },
    ];

    assert.throws(() => store.appendBatch(failingBatch));

    // Only the prior event remains; batch-new-1 rolled back
    const all = store.getAllEvents();
    assert.equal(all.length, 1);
    assert.ok(all[0]);
    assert.equal(all[0].eventId, "existing-01");
  });
});
