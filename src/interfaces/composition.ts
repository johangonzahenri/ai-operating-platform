import { ExecuteTask } from "../application/execute-task.js";
import { SubmitTask } from "../application/submit-task.js";
import { ExecuteOrchestration } from "../application/orchestration/execute-orchestration.js";
import { OrchestratedExecutionStrategy } from "../application/orchestration/orchestrated-execution-strategy.js";
import { SequentialOrchestrator } from "../application/orchestration/sequential-orchestrator.js";
import { Operation } from "../domain/orchestration/orchestration.js";
import { CoreRuntime } from "../application/runtime/core-runtime.js";
import { ModelExecutionStrategy } from "../application/runtime/model-execution-strategy.js";
import { AgentExecutionStrategy } from "../application/runtime/agent-execution-strategy.js";
import { AgentService } from "../application/agent/agent-service.js";
import { Agent } from "../domain/agent/agent.js";
import { AgentRegistry } from "../domain/agent/agent-registry.js";
import { InMemoryAgentRegistry } from "../infrastructure/agent/in-memory-agent-registry.js";
import { MemoryService } from "../application/memory/memory-service.js";
import { RegistryToolGateway } from "../application/tools/tool-gateway.js";
import { PolicyGateway } from "../domain/policy/policy.js";
import { InMemoryPolicyGateway } from "../infrastructure/policy/in-memory-policy-gateway.js";
import { InMemoryEventPublisher } from "../infrastructure/events/in-memory-event-publisher.js";
import { StubModelGateway } from "../infrastructure/model/stub-model-gateway.js";
import { InMemoryModelRegistry } from "../infrastructure/model/in-memory-model-registry.js";
import { StructuredEventLogger, StructuredLogger } from "../infrastructure/observability/structured-event-logger.js";
import { InMemoryTaskRepository } from "../infrastructure/persistence/in-memory-task-repository.js";
import { InMemoryExecutionRepository } from "../infrastructure/persistence/in-memory-execution-repository.js";
import { InMemoryMemoryGateway } from "../infrastructure/memory/in-memory-memory-gateway.js";
import { InMemoryAuditLog } from "../infrastructure/observability/in-memory-audit-log.js";
import { InMemoryMetricsCollector } from "../infrastructure/observability/in-memory-metrics-collector.js";
import { EventObservabilitySubscriber } from "../infrastructure/observability/event-observability-subscriber.js";
import { InMemoryToolRegistry } from "../infrastructure/tools/in-memory-tool-registry.js";
import { CalculatorTool } from "../infrastructure/tools/calculator-tool.js";
import { ModelQueryPort, OperationQueryPort } from "../application/ports/query-ports.js";
import { AutonomousOrchestrator } from "../application/autonomy/autonomous-orchestrator.js";
import { AutonomousOperationService } from "../application/autonomy/autonomous-operation-service.js";
import { PlannerPort } from "../domain/autonomy/planner-port.js";
import { DecisionEvaluatorPort, DeterministicDecisionEvaluator } from "../domain/autonomy/decision-evaluator.js";
import { OperationRepositoryPort } from "../domain/autonomy/operation-repository.js";
import { InMemoryOperationRepository } from "../infrastructure/persistence/in-memory-operation-repository.js";
import { StubPlanner } from "../infrastructure/autonomy/stub-planner.js";

export interface CreatePlatformOptions {
  readonly logger?: StructuredLogger | undefined;
  readonly policy?: PolicyGateway | undefined;
  readonly modelRegistry?: ModelQueryPort | undefined;
  readonly agentRegistry?: AgentRegistry | undefined;
  readonly planner?: PlannerPort | undefined;
  readonly evaluator?: DecisionEvaluatorPort | undefined;
  readonly operationRepository?: OperationRepositoryPort | undefined;
}

/** Composition root: wires domain ports to infrastructure adapters and exposes use cases. */
export const createPlatform = (
  optionsOrLogger: CreatePlatformOptions | StructuredLogger = { info: (entry) => console.info(JSON.stringify(entry)) }
) => {
  const isLogger = typeof (optionsOrLogger as StructuredLogger)?.info === "function";
  const logger: StructuredLogger = isLogger
    ? (optionsOrLogger as StructuredLogger)
    : (optionsOrLogger as CreatePlatformOptions).logger ?? { info: (entry) => console.info(JSON.stringify(entry)) };
  const policy: PolicyGateway = (!isLogger && (optionsOrLogger as CreatePlatformOptions).policy)
    ? (optionsOrLogger as CreatePlatformOptions).policy!
    : new InMemoryPolicyGateway();

  const events = new InMemoryEventPublisher();
  const eventLogger = new StructuredEventLogger(logger);
  events.subscribe(eventLogger.handle.bind(eventLogger));

  const audit = new InMemoryAuditLog();
  const metrics = new InMemoryMetricsCollector();
  const observability = new EventObservabilitySubscriber(audit, metrics);
  events.subscribe(observability.handle.bind(observability));

  const tasks = new InMemoryTaskRepository();
  const executions = new InMemoryExecutionRepository();
  const memory = new InMemoryMemoryGateway();
  const memoryService = new MemoryService(memory, events);

  const tools = new InMemoryToolRegistry();
  tools.register(new CalculatorTool());
  const toolGateway = new RegistryToolGateway(tools, events);
  const models = new StubModelGateway();

  const modelRegistry: ModelQueryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).modelRegistry)
    ? (optionsOrLogger as CreatePlatformOptions).modelRegistry!
    : new InMemoryModelRegistry([
        {
          id: "stub-model",
          provider: "stub",
          name: "Stub Deterministic Model",
          status: "connected",
          capabilities: ["text-generation", "structured-output"],
        },
      ]);

  // Agent capability runtime & registry
  const agents: InMemoryAgentRegistry = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentRegistry instanceof InMemoryAgentRegistry)
    ? (optionsOrLogger as CreatePlatformOptions).agentRegistry as InMemoryAgentRegistry
    : new InMemoryAgentRegistry();

  if (!agents.findById("foundation-agent")) {
    agents.register(
      Agent.create({
        id: "foundation-agent",
        name: "Foundation Agent",
        description: "Default general-purpose operational agent",
        model: "stub-model",
        instructions: "You are the foundation operational agent of the AI Operating Platform.",
        tools: ["calculator"],
        memoryScope: "foundation-agent",
      })
    );
  }

  // Task execution runtime & use cases
  const modelStrategy = new ModelExecutionStrategy(models, events, policy);
  const runtime = new CoreRuntime(tasks, executions, modelStrategy, events);
  const executeTask = new ExecuteTask(runtime);
  const submitTask = new SubmitTask(runtime);

  // Dedicated Agent execution strategy & runtime
  const agentStrategy = new AgentExecutionStrategy(models, toolGateway, memory, events, policy);
  const agentRuntime = new CoreRuntime(tasks, executions, agentStrategy, events);
  const agentService = new AgentService(agents, agentRuntime, modelRegistry, tools);

  // Orchestrated execution runtime & use case
  const orchestrator = new SequentialOrchestrator(models, toolGateway, events, policy);
  const orchestratedStrategy = new OrchestratedExecutionStrategy(orchestrator, (context, task) => ({
    execution: context,
    operations: (task.request.input.operations as unknown as Operation[]) ?? [],
  }));
  const orchestratedRuntime = new CoreRuntime(tasks, executions, orchestratedStrategy, events);
  const executeOrchestration = new ExecuteOrchestration(orchestratedRuntime);

  // Autonomous operations runtime & application service (v0.9)
  const operationRepository: InMemoryOperationRepository =
    (!isLogger && (optionsOrLogger as CreatePlatformOptions).operationRepository instanceof InMemoryOperationRepository)
      ? ((optionsOrLogger as CreatePlatformOptions).operationRepository as InMemoryOperationRepository)
      : new InMemoryOperationRepository();

  const planner: PlannerPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).planner)
    ? (optionsOrLogger as CreatePlatformOptions).planner!
    : new StubPlanner();

  const evaluator: DecisionEvaluatorPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).evaluator)
    ? (optionsOrLogger as CreatePlatformOptions).evaluator!
    : new DeterministicDecisionEvaluator();

  const autonomousOrchestrator = new AutonomousOrchestrator(
    agentRuntime,
    planner,
    evaluator,
    policy,
    events
  );

  const operationService = new AutonomousOperationService(
    autonomousOrchestrator,
    operationRepository,
    agents
  );

  return {
    tasks,
    executions,
    events,
    audit,
    metrics,
    policy,
    memory,
    memoryService,
    tools,
    toolGateway,
    models,
    modelRegistry,
    agents,
    agentRegistry: agents,
    agentService,
    agentRuntime,
    agentStrategy,
    runtime,
    orchestratedRuntime,
    orchestrator,
    executeTask,
    submitTask,
    executeOrchestration,
    operations: operationRepository,
    operationRepository,
    operationService,
    autonomousOrchestrator,
    planner,
    evaluator,
  };
};
