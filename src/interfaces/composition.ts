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
import { createModelGateway } from "../infrastructure/model/provider-factory.js";
import { modelProviderConfigFromEnvironment } from "../infrastructure/model/model-provider-config.js";
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
import { SqliteOperationRepository } from "../infrastructure/persistence/sqlite/sqlite-operation-repository.js";
import { SqliteTaskRepository } from "../infrastructure/persistence/sqlite/sqlite-task-repository.js";
import { SqliteExecutionRepository } from "../infrastructure/persistence/sqlite/sqlite-execution-repository.js";
import { SqliteAgentRepository } from "../infrastructure/persistence/sqlite/sqlite-agent-repository.js";
import { SqliteDatabase } from "../infrastructure/persistence/sqlite/sqlite-database.js";
import { initializeSchema } from "../infrastructure/persistence/sqlite/sqlite-schema.js";
import { TaskRepository } from "../domain/task/task.js";
import { ExecutionRepository } from "../domain/execution/execution.js";
import { TaskQueryPort, ExecutionQueryPort, AgentQueryPort } from "../application/ports/query-ports.js";
import { StubPlanner } from "../infrastructure/autonomy/stub-planner.js";
import { LLMPlanner } from "../infrastructure/autonomy/llm-planner.js";
import { RestartRecoveryService } from "../application/recovery/restart-recovery-service.js";
import { RecoveryPort, RecoveryResult, TransactionRunner } from "../application/ports/recovery-port.js";
import { SqliteTransactionRunner } from "../infrastructure/persistence/sqlite/sqlite-transaction-runner.js";
import { DurableEventStore, DurableEventQueryPort } from "../application/ports/durable-event-port.js";
import { InMemoryEventStore } from "../infrastructure/persistence/in-memory-event-store.js";
import { SqliteEventStore } from "../infrastructure/persistence/sqlite/sqlite-event-store.js";
import { RuntimeDiagnosticsService } from "../application/diagnostics/runtime-diagnostics.js";

export interface CreatePlatformOptions {
  readonly logger?: StructuredLogger | undefined;
  readonly policy?: PolicyGateway | undefined;
  readonly modelRegistry?: ModelQueryPort | undefined;
  readonly agentRegistry?: AgentRegistry | undefined;
  readonly planner?: PlannerPort | undefined;
  readonly evaluator?: DecisionEvaluatorPort | undefined;
  readonly operationRepository?: (OperationRepositoryPort & OperationQueryPort) | undefined;
  readonly useDurablePersistence?: boolean | undefined;
  readonly dbPath?: string | undefined;
  readonly skipRecovery?: boolean | undefined;
  readonly eventStore?: (DurableEventStore & DurableEventQueryPort) | undefined;
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

  const isDurable = !isLogger && Boolean(
    (optionsOrLogger as CreatePlatformOptions).useDurablePersistence ||
    (optionsOrLogger as CreatePlatformOptions).dbPath
  );
  const dbPath = (!isLogger && (optionsOrLogger as CreatePlatformOptions).dbPath)
    ? (optionsOrLogger as CreatePlatformOptions).dbPath!
    : "data/app.db";

  let dbManager: SqliteDatabase | undefined;
  if (isDurable) {
    dbManager = new SqliteDatabase({ dbPath });
    initializeSchema(dbManager.open());
  }

  const tasks = dbManager
    ? new SqliteTaskRepository(dbManager)
    : new InMemoryTaskRepository();
  const executions = dbManager
    ? new SqliteExecutionRepository(dbManager)
    : new InMemoryExecutionRepository();

  const eventStore: DurableEventStore & DurableEventQueryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).eventStore)
    ? (optionsOrLogger as CreatePlatformOptions).eventStore!
    : dbManager
      ? new SqliteEventStore(dbManager)
      : new InMemoryEventStore();

  // Autonomous operations persistence (InMemory default for isolation/testing, Sqlite for durable)
  const operationRepository: OperationRepositoryPort & OperationQueryPort =
    (!isLogger && (optionsOrLogger as CreatePlatformOptions).operationRepository)
      ? (optionsOrLogger as CreatePlatformOptions).operationRepository!
      : dbManager
        ? new SqliteOperationRepository(dbManager)
        : new InMemoryOperationRepository();

  const skipRecovery = !isLogger && Boolean((optionsOrLogger as CreatePlatformOptions).skipRecovery);
  const transactionRunner: TransactionRunner = dbManager
    ? new SqliteTransactionRunner(dbManager)
    : { run: <T>(fn: () => T): T => fn() };

  const recoveryService = new RestartRecoveryService({
    tasks,
    executions,
    operations: operationRepository,
    events,
    eventStore,
    transactionRunner,
  });

  let recoveryResult: RecoveryResult | undefined;
  if (!skipRecovery) {
    recoveryResult = recoveryService.reconcile();
  }

  const memory = new InMemoryMemoryGateway();
  const memoryService = new MemoryService(memory, events, {
    authorize: ({ scope, actorId }) => {
      if (!scope || !actorId) throw new Error("Agent identity is required for memory access");
    },
  });

  const tools = new InMemoryToolRegistry();
  tools.register(new CalculatorTool());
  const toolGateway = new RegistryToolGateway(tools, events);
  const modelConfig = modelProviderConfigFromEnvironment();
  const models = createModelGateway();

  const modelRegistry: ModelQueryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).modelRegistry)
    ? (optionsOrLogger as CreatePlatformOptions).modelRegistry!
    : new InMemoryModelRegistry([
        {
          id: modelConfig.defaultModel,
          provider: modelConfig.provider,
          name: `${modelConfig.provider} model`,
          status: modelConfig.provider === "stub" ? "connected" : "available",
          capabilities: ["text-generation", "structured-output"],
        },
      ]);

  // Agent capability runtime & registry
  const agents: AgentRegistry & AgentQueryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentRegistry)
    ? ((optionsOrLogger as CreatePlatformOptions).agentRegistry as AgentRegistry & AgentQueryPort)
    : dbManager
      ? new SqliteAgentRepository(dbManager)
      : new InMemoryAgentRegistry();

  if (!agents.findById("foundation-agent")) {
    agents.register(
      Agent.create({
        id: "foundation-agent",
        name: "Foundation Agent",
        description: "Default general-purpose operational agent",
        model: modelConfig.defaultModel,
        instructions: "You are the foundation operational agent of the AI Operating Platform.",
        tools: ["calculator"],
        memoryScope: "foundation-agent",
      })
    );
  }

  // Task execution runtime & use cases
  const modelStrategy = new ModelExecutionStrategy(models, events, policy);
  const runtime = new CoreRuntime(tasks, executions, modelStrategy, events, undefined, undefined, eventStore, transactionRunner);
  const executeTask = new ExecuteTask(runtime);
  const submitTask = new SubmitTask(runtime);

  // Dedicated Agent execution strategy & runtime
  const agentStrategy = new AgentExecutionStrategy(models, toolGateway, memoryService, events, policy);
  const agentRuntime = new CoreRuntime(tasks, executions, agentStrategy, events, undefined, undefined, eventStore, transactionRunner);
  const agentService = new AgentService(agents, agentRuntime, modelRegistry, tools);

  // Orchestrated execution runtime & use case
  const orchestrator = new SequentialOrchestrator(models, toolGateway, events, policy);
  const orchestratedStrategy = new OrchestratedExecutionStrategy(orchestrator, (context, task) => ({
    execution: context,
    operations: (task.request.input.operations as unknown as Operation[]) ?? [],
  }));
  const orchestratedRuntime = new CoreRuntime(tasks, executions, orchestratedStrategy, events, undefined, undefined, eventStore, transactionRunner);
  const executeOrchestration = new ExecuteOrchestration(orchestratedRuntime);

  const planner: PlannerPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).planner)
    ? (optionsOrLogger as CreatePlatformOptions).planner!
    : modelConfig.provider === "stub"
      ? new StubPlanner()
      : new LLMPlanner(models, { model: modelConfig.defaultModel });

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

  const diagnostics = new RuntimeDiagnosticsService(eventStore);

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
    db: dbManager,
    recovery: recoveryService,
    recoveryResult,
    eventStore,
    diagnostics,
  };
};
