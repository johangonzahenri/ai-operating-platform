import { ExecuteTask } from "../application/execute-task.js";
import { InMemoryEventPublisher } from "../infrastructure/events/in-memory-event-publisher.js";
import { StubModelGateway } from "../infrastructure/model/stub-model-gateway.js";
import { StructuredEventLogger, StructuredLogger } from "../infrastructure/observability/structured-event-logger.js";
import { InMemoryTaskRepository } from "../infrastructure/persistence/in-memory-task-repository.js";

/** Composition root: the only place v0.1 binds domain ports to adapters. */
export const createPlatform = (logger: StructuredLogger = { info: (entry) => console.info(JSON.stringify(entry)) }) => {
  const events = new InMemoryEventPublisher();
  const eventLogger = new StructuredEventLogger(logger);
  events.subscribe(eventLogger.handle.bind(eventLogger));
  const tasks = new InMemoryTaskRepository();
  return { tasks, events, executeTask: new ExecuteTask(tasks, new StubModelGateway(), events) };
};
