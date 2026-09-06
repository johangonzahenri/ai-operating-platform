import assert from "node:assert/strict";
import test from "node:test";
import { DomainEvent, EventPublisher, event } from "../../src/domain/events/events.js";
import { InMemoryEventPublisher } from "../../src/infrastructure/events/in-memory-event-publisher.js";

const eventPublisherContract = (name: string, publisher: EventPublisher & { readonly events: DomainEvent[] }): void => test(`${name} accepts correlated execution events`, () => {
  const emitted = event("execution.created", "trace-1", "execution-1", {}, undefined, undefined, { taskId: "task-1", executionId: "execution-1" });
  publisher.publish(emitted); assert.equal(publisher.events[0]?.traceId, "trace-1"); assert.equal(publisher.events[0]?.executionId, "execution-1");
});
eventPublisherContract("InMemoryEventPublisher", new InMemoryEventPublisher());
