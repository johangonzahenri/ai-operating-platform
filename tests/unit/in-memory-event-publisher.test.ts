import assert from "node:assert/strict";
import test from "node:test";
import { event } from "../../src/domain/events/events.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";

test("a failing subscriber does not prevent other subscribers or event recording", () => {
  const failures: unknown[] = []; const publisher = new InMemoryEventPublisher((error) => failures.push(error)); let delivered = 0;
  publisher.subscribe(() => { throw new Error("logger unavailable"); }); publisher.subscribe(() => { delivered += 1; });
  const emitted = event("task.created", "trace-1", "task-1"); publisher.publish(emitted);
  assert.equal(publisher.events[0], emitted); assert.equal(delivered, 1); assert.equal(failures.length, 1);
  assert.ok(failures[0] instanceof Error);
});

test("a failing error observer does not break publication", () => {
  const publisher = new InMemoryEventPublisher(() => { throw new Error("observer unavailable"); }); let delivered = 0;
  publisher.subscribe(() => { throw new Error("subscriber unavailable"); }); publisher.subscribe(() => { delivered += 1; });
  publisher.publish(event("task.created", "trace-1", "task-1"));
  assert.equal(delivered, 1); assert.equal(publisher.events.length, 1);
});
