import { ExecuteTask } from "../application/execute-task.js";
import { CoreRuntime } from "../application/runtime/core-runtime.js";
import { ModelExecutionStrategy } from "../application/runtime/model-execution-strategy.js";
import { MemoryService } from "../application/memory/memory-service.js";
import { RegistryToolGateway } from "../application/tools/tool-gateway.js";
import { InMemoryEventPublisher } from "../infrastructure/events/in-memory-event-publisher.js";
import { StubModelGateway } from "../infrastructure/model/stub-model-gateway.js";
import { StructuredEventLogger, StructuredLogger } from "../infrastructure/observability/structured-event-logger.js";
import { InMemoryTaskRepository } from "../infrastructure/persistence/in-memory-task-repository.js";
import { InMemoryExecutionRepository } from "../infrastructure/persistence/in-memory-execution-repository.js";
import { InMemoryMemoryGateway } from "../infrastructure/memory/in-memory-memory-gateway.js";
import { InMemoryAuditLog } from "../infrastructure/observability/in-memory-audit-log.js";
import { InMemoryMetricsCollector } from "../infrastructure/observability/in-memory-metrics-collector.js";
import { EventObservabilitySubscriber } from "../infrastructure/observability/event-observability-subscriber.js";
import { InMemoryPolicyGateway } from "../infrastructure/policy/in-memory-policy-gateway.js";
import { InMemoryToolRegistry } from "../infrastructure/tools/in-memory-tool-registry.js";
import { CalculatorTool } from "../infrastructure/tools/calculator-tool.js";

/** Composition root: the only place v0.2 binds domain ports to adapters. */
export const createPlatform = (logger: StructuredLogger = { info: (entry) => console.info(JSON.stringify(entry)) }) => {
  const events = new InMemoryEventPublisher();
  const eventLogger = new StructuredEventLogger(logger);
  events.subscribe(eventLogger.handle.bind(eventLogger));
  const audit = new InMemoryAuditLog(); const metrics = new InMemoryMetricsCollector();
  const observability = new EventObservabilitySubscriber(audit, metrics);
  events.subscribe(observability.handle.bind(observability));
  const tasks = new InMemoryTaskRepository();
  const executions = new InMemoryExecutionRepository();
  const memory = new InMemoryMemoryGateway(); const memoryService = new MemoryService(memory, events);
  const policy = new InMemoryPolicyGateway();
  const tools = new InMemoryToolRegistry(); tools.register(new CalculatorTool());
  const toolGateway = new RegistryToolGateway(tools, events);
  const runtime = new CoreRuntime(tasks, executions, new ModelExecutionStrategy(new StubModelGateway(), events), events);
  return { tasks, executions, events, audit, metrics, policy, memory, memoryService, tools, toolGateway, runtime, executeTask: new ExecuteTask(runtime) };
};
