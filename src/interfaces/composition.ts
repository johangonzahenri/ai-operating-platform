import { WorkflowDefinitionRepositoryPort, WorkflowInstanceRepositoryPort } from "../application/ports/workflow-repository-port.js";
import { VerificationResultRepositoryPort } from "../application/ports/verification-repository-port.js";
import { ApprovalRequestRepositoryPort } from "../application/ports/approval-repository-port.js";
import { AgentLifecycleRepositoryPort, AgentEvaluationRepositoryPort } from "../application/ports/agent-evaluation-repository-port.js";
import {
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowInstanceRepository,
} from "../infrastructure/persistence/in-memory/in-memory-workflow-repository.js";
import { InMemoryVerificationResultRepository } from "../infrastructure/persistence/in-memory/in-memory-verification-repository.js";
import { InMemoryApprovalRequestRepository } from "../infrastructure/persistence/in-memory/in-memory-approval-repository.js";
import {
  InMemoryAgentLifecycleRepository,
  InMemoryAgentEvaluationRepository,
} from "../infrastructure/persistence/in-memory/in-memory-agent-evaluation-repository.js";
import {
  SqliteWorkflowDefinitionRepository,
  SqliteWorkflowInstanceRepository,
} from "../infrastructure/persistence/sqlite/sqlite-workflow-repository.js";
import { SqliteVerificationResultRepository } from "../infrastructure/persistence/sqlite/sqlite-verification-repository.js";
import { SqliteApprovalRequestRepository } from "../infrastructure/persistence/sqlite/sqlite-approval-repository.js";
import {
  SqliteAgentLifecycleRepository,
  SqliteAgentEvaluationRepository,
} from "../infrastructure/persistence/sqlite/sqlite-agent-evaluation-repository.js";
import {
  AISolutionRepositoryPort,
  AISolutionInstanceRepositoryPort,
} from "../application/ports/solution-repository-port.js";
import {
  InMemoryAISolutionRepository,
  InMemoryAISolutionInstanceRepository,
} from "../infrastructure/persistence/in-memory/in-memory-solution-repository.js";
import {
  SqliteAISolutionRepository,
  SqliteAISolutionInstanceRepository,
} from "../infrastructure/persistence/sqlite/sqlite-solution-repository.js";
import { SolutionBlueprintValidator } from "../application/solution/solution-blueprint-validator.js";
import { SolutionFactoryService } from "../application/solution/solution-factory-service.js";
import { WorkflowOrchestratorService } from "../application/workflow/workflow-orchestrator-service.js";
import { WorkflowVerificationService } from "../application/workflow/workflow-verification-service.js";
import { HumanOversightService } from "../application/workflow/human-oversight-service.js";
import { AgentLifecycleService } from "../application/agent/agent-lifecycle-service.js";
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
import { MultiAgentCoordinator } from "../application/coordination/multi-agent-coordinator.js";
import { Agent } from "../domain/agent/agent.js";
import { AgentRegistry } from "../domain/agent/agent-registry.js";
import { InMemoryAgentRegistry } from "../infrastructure/agent/in-memory-agent-registry.js";
import { MemoryService } from "../application/memory/memory-service.js";
import { RegistryToolGateway, ToolInvocationRuntime } from "../application/tools/tool-gateway.js";
import { PlanExecutionEngine } from "../application/autonomy/plan-execution-engine.js";
import { PolicyGateway } from "../domain/policy/policy.js";
import { InMemoryPolicyGateway } from "../infrastructure/policy/in-memory-policy-gateway.js";
import { InMemoryEventPublisher } from "../infrastructure/events/in-memory-event-publisher.js";
import { createModelGateway, createDefaultProviderFactory } from "../infrastructure/model/provider-factory.js";
import { DefaultModelRouter } from "../application/model/default-model-router.js";
import { DefaultModelGateway } from "../application/model/default-model-gateway.js";
import { modelProviderConfigFromEnvironment } from "../infrastructure/model/model-provider-config.js";
import { InMemoryModelRegistry } from "../infrastructure/model/in-memory-model-registry.js";
import { StructuredEventLogger, StructuredLogger } from "../infrastructure/observability/structured-event-logger.js";
import { InMemoryTaskRepository } from "../infrastructure/persistence/in-memory-task-repository.js";
import { InMemoryExecutionRepository } from "../infrastructure/persistence/in-memory-execution-repository.js";
import { InMemoryMemoryGateway } from "../infrastructure/memory/in-memory-memory-gateway.js";
import { InMemoryAuditLog } from "../infrastructure/observability/in-memory-audit-log.js";
import { EventStreamAdapter } from "../application/observability/event-stream-adapter.js";
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
import {
  AuthenticationService,
  ApiKeyAuthenticationProvider,
  BearerTokenAuthenticationProvider,
} from "../application/security/authentication-service.js";
import { RbacAuthorizationEvaluator } from "../application/security/rbac-authorization-evaluator.js";
import {
  ApiKeyRepository,
  InMemoryApiKeyRepository,
} from "../infrastructure/security/in-memory-api-key-repository.js";
import { InMemoryRoleRepository } from "../infrastructure/security/in-memory-role-repository.js";
import { RoleRepository } from "../domain/security/authorization.js";
import { OrganizationHierarchyRepository } from "../application/ports/organization-repository-port.js";
import { InMemoryOrganizationRepository } from "../infrastructure/organization/in-memory-organization-repository.js";
import { SqliteOrganizationRepository } from "../infrastructure/persistence/sqlite/sqlite-organization-repository.js";
import { OrganizationService } from "../application/organization/organization-service.js";
import { TeamResourceBudgetRepositoryPort } from "../application/ports/team-resource-budget-repository-port.js";
import { InMemoryTeamResourceBudgetRepository } from "../infrastructure/organization/in-memory-team-resource-budget-repository.js";
import { SqliteTeamResourceBudgetRepository } from "../infrastructure/persistence/sqlite/sqlite-team-resource-budget-repository.js";
import { TeamResourceBudgetService } from "../application/organization/team-resource-budget-service.js";
import { CoordinationRepositoryPort } from "../application/ports/coordination-repository-port.js";
import { InMemoryCoordinationRepository } from "../infrastructure/persistence/in-memory/in-memory-coordination-repository.js";
import { SqliteCoordinationRepository } from "../infrastructure/persistence/sqlite/sqlite-coordination-repository.js";
import { OrganizationalCoordinationService } from "../application/organization/organizational-coordination-service.js";
import { AgentProfileRepositoryPort } from "../application/ports/agent-profile-repository-port.js";
import { AgentProfileService } from "../application/organization/agent-profile-service.js";
import { InMemoryAgentProfileRepository } from "../infrastructure/persistence/in-memory/in-memory-agent-profile-repository.js";
import { SqliteAgentProfileRepository } from "../infrastructure/persistence/sqlite/sqlite-agent-profile-repository.js";
import {
  EnterpriseRepositoryPort,
  BusinessObjectiveRepositoryPort,
  BusinessInitiativeRepositoryPort,
  BusinessMetricRepositoryPort,
  ExecutiveDecisionRepositoryPort,
} from "../application/ports/business-repository-port.js";
import {
  InMemoryEnterpriseRepository,
  InMemoryBusinessObjectiveRepository,
  InMemoryBusinessInitiativeRepository,
  InMemoryBusinessMetricRepository,
  InMemoryExecutiveDecisionRepository,
} from "../infrastructure/persistence/in-memory/in-memory-business-repository.js";
import {
  SqliteEnterpriseRepository,
  SqliteBusinessObjectiveRepository,
  SqliteBusinessInitiativeRepository,
  SqliteBusinessMetricRepository,
  SqliteExecutiveDecisionRepository,
} from "../infrastructure/persistence/sqlite/sqlite-business-repository.js";
import { EnterpriseOperatingService } from "../application/business/enterprise-operating-service.js";
import {
  ExecutiveCycleRepositoryPort,
  ExecutiveContextSnapshotRepositoryPort,
  ExecutiveAnalysisRepositoryPort,
  ExecutivePlanRepositoryPort,
} from "../application/ports/executive-repository-port.js";
import {
  InMemoryExecutiveCycleRepository,
  InMemoryExecutiveContextSnapshotRepository,
  InMemoryExecutiveAnalysisRepository,
  InMemoryExecutivePlanRepository,
} from "../infrastructure/persistence/in-memory/in-memory-executive-repository.js";
import {
  SqliteExecutiveCycleRepository,
  SqliteExecutiveContextSnapshotRepository,
  SqliteExecutiveAnalysisRepository,
  SqliteExecutivePlanRepository,
} from "../infrastructure/persistence/sqlite/sqlite-executive-repository.js";
import { ExecutiveOrchestratorService } from "../application/executive/executive-orchestrator-service.js";
import {
  AutonomousTriggerRepositoryPort,
  RuntimeLeaseRepositoryPort,
  AutonomousRuntimeStateRepositoryPort,
} from "../application/ports/autonomous-runtime-port.js";
import {
  InMemoryAutonomousTriggerRepository,
  InMemoryRuntimeLeaseRepository,
  InMemoryAutonomousRuntimeStateRepository,
} from "../infrastructure/persistence/in-memory/in-memory-autonomous-repository.js";
import {
  SqliteAutonomousTriggerRepository,
  SqliteRuntimeLeaseRepository,
  SqliteAutonomousRuntimeStateRepository,
} from "../infrastructure/persistence/sqlite/sqlite-autonomous-repository.js";
import { AutonomousOperationsRuntime } from "../application/autonomous/autonomous-operations-runtime.js";

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
  readonly apiKeyRepository?: ApiKeyRepository | undefined;
  readonly roleRepository?: RoleRepository | undefined;
  readonly authenticationService?: AuthenticationService | undefined;
  readonly rbacEvaluator?: RbacAuthorizationEvaluator | undefined;
  readonly organizationRepository?: OrganizationHierarchyRepository | undefined;
  readonly organizationService?: OrganizationService | undefined;
  readonly teamResourceBudgetRepository?: TeamResourceBudgetRepositoryPort | undefined;
  readonly teamResourceBudgetService?: TeamResourceBudgetService | undefined;
  readonly coordinationRepository?: CoordinationRepositoryPort | undefined;
  readonly organizationalCoordinationService?: OrganizationalCoordinationService | undefined;
  readonly agentProfileRepository?: AgentProfileRepositoryPort | undefined;
  readonly agentProfileService?: AgentProfileService | undefined;
  readonly workflowDefinitionRepository?: WorkflowDefinitionRepositoryPort | undefined;
  readonly workflowInstanceRepository?: WorkflowInstanceRepositoryPort | undefined;
  readonly workflowOrchestratorService?: WorkflowOrchestratorService | undefined;
  readonly verificationResultRepository?: VerificationResultRepositoryPort | undefined;
  readonly workflowVerificationService?: WorkflowVerificationService | undefined;
  readonly approvalRequestRepository?: ApprovalRequestRepositoryPort | undefined;
  readonly humanOversightService?: HumanOversightService | undefined;
  readonly agentLifecycleRepository?: AgentLifecycleRepositoryPort | undefined;
  readonly agentEvaluationRepository?: AgentEvaluationRepositoryPort | undefined;
  readonly agentLifecycleService?: AgentLifecycleService | undefined;
  readonly solutionRepository?: AISolutionRepositoryPort | undefined;
  readonly solutionInstanceRepository?: AISolutionInstanceRepositoryPort | undefined;
  readonly solutionFactoryService?: SolutionFactoryService | undefined;
  readonly enterpriseRepository?: EnterpriseRepositoryPort | undefined;
  readonly businessObjectiveRepository?: BusinessObjectiveRepositoryPort | undefined;
  readonly businessInitiativeRepository?: BusinessInitiativeRepositoryPort | undefined;
  readonly businessMetricRepository?: BusinessMetricRepositoryPort | undefined;
  readonly executiveDecisionRepository?: ExecutiveDecisionRepositoryPort | undefined;
  readonly enterpriseOperatingService?: EnterpriseOperatingService | undefined;
  readonly eventStream?: EventStreamAdapter | undefined;
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

  const eventStream: EventStreamAdapter = (!isLogger && (optionsOrLogger as CreatePlatformOptions).eventStream)
    ? (optionsOrLogger as CreatePlatformOptions).eventStream!
    : new EventStreamAdapter(events, eventStore);

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
  const planExecutionEngine = new PlanExecutionEngine();
  const modelConfig = modelProviderConfigFromEnvironment();
  const providerFactory = createDefaultProviderFactory();
  const modelRouter = new DefaultModelRouter({ defaultProvider: modelConfig.provider });
  const models = new DefaultModelGateway({
    router: modelRouter,
    providerFactory,
  });

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

  // Organization and Team Budget hierarchy services
  const organizationRepository: OrganizationHierarchyRepository = (!isLogger && (optionsOrLogger as CreatePlatformOptions).organizationRepository)
    ? (optionsOrLogger as CreatePlatformOptions).organizationRepository!
    : dbManager
      ? new SqliteOrganizationRepository(dbManager)
      : new InMemoryOrganizationRepository();

  const organizationService: OrganizationService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).organizationService)
    ? (optionsOrLogger as CreatePlatformOptions).organizationService!
    : new OrganizationService({
        repository: organizationRepository,
        agentQuery: agents,
        events,
      });

  const teamResourceBudgetRepository: TeamResourceBudgetRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).teamResourceBudgetRepository)
    ? (optionsOrLogger as CreatePlatformOptions).teamResourceBudgetRepository!
    : dbManager
      ? new SqliteTeamResourceBudgetRepository(dbManager)
      : new InMemoryTeamResourceBudgetRepository();

  const teamResourceBudgetService: TeamResourceBudgetService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).teamResourceBudgetService)
    ? (optionsOrLogger as CreatePlatformOptions).teamResourceBudgetService!
    : new TeamResourceBudgetService({
        budgetRepository: teamResourceBudgetRepository,
        organizationRepository,
        events,
      });

  const coordinationRepository: CoordinationRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).coordinationRepository)
    ? (optionsOrLogger as CreatePlatformOptions).coordinationRepository!
    : dbManager
      ? new SqliteCoordinationRepository(dbManager)
      : new InMemoryCoordinationRepository();

  const toolInvocationRuntime = new ToolInvocationRuntime({
    registry: tools,
    events,
    policyGateway: policy,
    budgetService: teamResourceBudgetService,
    organizationRepository,
  });
  const toolGateway = new RegistryToolGateway(tools, events, policy);

  // Task execution runtime & use cases
  const modelStrategy = new ModelExecutionStrategy(models, events, policy);
  const runtime = new CoreRuntime(tasks, executions, modelStrategy, events, undefined, undefined, eventStore, transactionRunner);
  const executeTask = new ExecuteTask(runtime);
  const submitTask = new SubmitTask(runtime);

  // Dedicated Agent execution strategy & runtime
  const agentStrategy = new AgentExecutionStrategy(models, toolGateway, memoryService, events, policy, teamResourceBudgetService, organizationRepository);
  const agentRuntime = new CoreRuntime(tasks, executions, agentStrategy, events, undefined, undefined, eventStore, transactionRunner);
  const agentService = new AgentService(agents, agentRuntime, modelRegistry, tools);
  const multiAgentCoordinator = new MultiAgentCoordinator(agentRuntime, agents, policy, events);

  const agentProfileRepository: AgentProfileRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentProfileRepository)
    ? (optionsOrLogger as CreatePlatformOptions).agentProfileRepository!
    : dbManager
      ? new SqliteAgentProfileRepository(dbManager)
      : new InMemoryAgentProfileRepository();

  const agentProfileService: AgentProfileService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentProfileService)
    ? (optionsOrLogger as CreatePlatformOptions).agentProfileService!
    : new AgentProfileService({
        profileRepository: agentProfileRepository,
        organizationRepository,
        agentQuery: agents,
        events,
      });

  const organizationalCoordinationService: OrganizationalCoordinationService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).organizationalCoordinationService)
    ? (optionsOrLogger as CreatePlatformOptions).organizationalCoordinationService!
    : new OrganizationalCoordinationService({
        coordinationRepository,
        organizationRepository,
        budgetService: teamResourceBudgetService,
        policyGateway: policy,
        runtime: agentRuntime,
        agentQuery: agents,
        events,
      });

  const workflowDefinitionRepository: WorkflowDefinitionRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowDefinitionRepository)
    ? (optionsOrLogger as CreatePlatformOptions).workflowDefinitionRepository!
    : dbManager
      ? new SqliteWorkflowDefinitionRepository(dbManager)
      : new InMemoryWorkflowDefinitionRepository();

  const workflowInstanceRepository: WorkflowInstanceRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowInstanceRepository)
    ? (optionsOrLogger as CreatePlatformOptions).workflowInstanceRepository!
    : dbManager
      ? new SqliteWorkflowInstanceRepository(dbManager)
      : new InMemoryWorkflowInstanceRepository();

  const verificationResultRepository: VerificationResultRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).verificationResultRepository)
    ? (optionsOrLogger as CreatePlatformOptions).verificationResultRepository!
    : dbManager
      ? new SqliteVerificationResultRepository(dbManager)
      : new InMemoryVerificationResultRepository();

  const approvalRequestRepository: ApprovalRequestRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).approvalRequestRepository)
    ? (optionsOrLogger as CreatePlatformOptions).approvalRequestRepository!
    : dbManager
      ? new SqliteApprovalRequestRepository(dbManager)
      : new InMemoryApprovalRequestRepository();

  const agentLifecycleRepository: AgentLifecycleRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentLifecycleRepository)
    ? (optionsOrLogger as CreatePlatformOptions).agentLifecycleRepository!
    : dbManager
      ? new SqliteAgentLifecycleRepository(dbManager)
      : new InMemoryAgentLifecycleRepository();

  const agentEvaluationRepository: AgentEvaluationRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentEvaluationRepository)
    ? (optionsOrLogger as CreatePlatformOptions).agentEvaluationRepository!
    : dbManager
      ? new SqliteAgentEvaluationRepository(dbManager)
      : new InMemoryAgentEvaluationRepository();

  const agentLifecycleService: AgentLifecycleService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).agentLifecycleService)
    ? (optionsOrLogger as CreatePlatformOptions).agentLifecycleService!
    : new AgentLifecycleService({
        lifecycleRepository: agentLifecycleRepository,
        evaluationRepository: agentEvaluationRepository,
        profileRepository: agentProfileRepository,
        policyGateway: policy,
        events,
      });

  const workflowVerificationService: WorkflowVerificationService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowVerificationService)
    ? (optionsOrLogger as CreatePlatformOptions).workflowVerificationService!
    : new WorkflowVerificationService({
        verificationRepo: verificationResultRepository,
        instanceRepo: workflowInstanceRepository,
        defRepo: workflowDefinitionRepository,
        policy,
        budgetService: teamResourceBudgetService,
        events,
      });

  const humanOversightService: HumanOversightService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).humanOversightService)
    ? (optionsOrLogger as CreatePlatformOptions).humanOversightService!
    : new HumanOversightService({
        approvalRepository: approvalRequestRepository,
        workflowInstanceRepository,
        verificationService: workflowVerificationService,
        organizationRepository,
        policyGateway: policy,
        events,
      });

  const workflowOrchestratorService: WorkflowOrchestratorService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).workflowOrchestratorService)
    ? (optionsOrLogger as CreatePlatformOptions).workflowOrchestratorService!
    : new WorkflowOrchestratorService({
        definitionRepository: workflowDefinitionRepository,
        instanceRepository: workflowInstanceRepository,
        agentProfileService,
        agentLifecycleService,
        organizationRepository,
        budgetService: teamResourceBudgetService,
        policyGateway: policy,
        verificationService: workflowVerificationService,
        humanOversightService,
        runtime: agentRuntime,
        agentQuery: agents,
        events,
      });

  const solutionRepository: AISolutionRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).solutionRepository)
    ? (optionsOrLogger as CreatePlatformOptions).solutionRepository!
    : dbManager
      ? new SqliteAISolutionRepository(dbManager)
      : new InMemoryAISolutionRepository();

  const solutionInstanceRepository: AISolutionInstanceRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).solutionInstanceRepository)
    ? (optionsOrLogger as CreatePlatformOptions).solutionInstanceRepository!
    : dbManager
      ? new SqliteAISolutionInstanceRepository(dbManager)
      : new InMemoryAISolutionInstanceRepository();

  const solutionBlueprintValidator = new SolutionBlueprintValidator({
    workflowRepo: workflowDefinitionRepository,
    agentProfileRepo: agentProfileRepository,
    agentLifecycleService,
  });

  const solutionFactoryService: SolutionFactoryService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).solutionFactoryService)
    ? (optionsOrLogger as CreatePlatformOptions).solutionFactoryService!
    : new SolutionFactoryService({
        solutionRepo: solutionRepository,
        instanceRepo: solutionInstanceRepository,
        validator: solutionBlueprintValidator,
        eventPublisher: events,
      });

  const enterpriseRepository: EnterpriseRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).enterpriseRepository)
    ? (optionsOrLogger as CreatePlatformOptions).enterpriseRepository!
    : dbManager
      ? new SqliteEnterpriseRepository(dbManager)
      : new InMemoryEnterpriseRepository();

  const businessObjectiveRepository: BusinessObjectiveRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).businessObjectiveRepository)
    ? (optionsOrLogger as CreatePlatformOptions).businessObjectiveRepository!
    : dbManager
      ? new SqliteBusinessObjectiveRepository(dbManager)
      : new InMemoryBusinessObjectiveRepository();

  const businessInitiativeRepository: BusinessInitiativeRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).businessInitiativeRepository)
    ? (optionsOrLogger as CreatePlatformOptions).businessInitiativeRepository!
    : dbManager
      ? new SqliteBusinessInitiativeRepository(dbManager)
      : new InMemoryBusinessInitiativeRepository();

  const businessMetricRepository: BusinessMetricRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).businessMetricRepository)
    ? (optionsOrLogger as CreatePlatformOptions).businessMetricRepository!
    : dbManager
      ? new SqliteBusinessMetricRepository(dbManager)
      : new InMemoryBusinessMetricRepository();

  const executiveDecisionRepository: ExecutiveDecisionRepositoryPort = (!isLogger && (optionsOrLogger as CreatePlatformOptions).executiveDecisionRepository)
    ? (optionsOrLogger as CreatePlatformOptions).executiveDecisionRepository!
    : dbManager
      ? new SqliteExecutiveDecisionRepository(dbManager)
      : new InMemoryExecutiveDecisionRepository();

  const enterpriseOperatingService: EnterpriseOperatingService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).enterpriseOperatingService)
    ? (optionsOrLogger as CreatePlatformOptions).enterpriseOperatingService!
    : new EnterpriseOperatingService({
        enterpriseRepo: enterpriseRepository,
        objectiveRepo: businessObjectiveRepository,
        initiativeRepo: businessInitiativeRepository,
        metricRepo: businessMetricRepository,
        decisionRepo: executiveDecisionRepository,
        eventPublisher: events,
      });

  const executiveCycleRepository: ExecutiveCycleRepositoryPort = dbManager
    ? new SqliteExecutiveCycleRepository(dbManager)
    : new InMemoryExecutiveCycleRepository();

  const executiveContextSnapshotRepository: ExecutiveContextSnapshotRepositoryPort = dbManager
    ? new SqliteExecutiveContextSnapshotRepository(dbManager)
    : new InMemoryExecutiveContextSnapshotRepository();

  const executiveAnalysisRepository: ExecutiveAnalysisRepositoryPort = dbManager
    ? new SqliteExecutiveAnalysisRepository(dbManager)
    : new InMemoryExecutiveAnalysisRepository();

  const executivePlanRepository: ExecutivePlanRepositoryPort = dbManager
    ? new SqliteExecutivePlanRepository(dbManager)
    : new InMemoryExecutivePlanRepository();

  const executiveOrchestratorService = new ExecutiveOrchestratorService({
    cycleRepo: executiveCycleRepository,
    snapshotRepo: executiveContextSnapshotRepository,
    analysisRepo: executiveAnalysisRepository,
    planRepo: executivePlanRepository,
    enterpriseOperatingService,
    workflowOrchestratorService,
    workflowVerificationService,
    humanOversightService,
    policyGateway: policy,
    eventPublisher: events,
  });

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
    events,
    undefined,
    undefined,
    teamResourceBudgetService,
    organizationRepository
  );

  const diagnostics = new RuntimeDiagnosticsService(eventStore);

  const operationService = new AutonomousOperationService(
    autonomousOrchestrator,
    operationRepository,
    agents
  );

  const apiKeyRepository: ApiKeyRepository = (!isLogger && (optionsOrLogger as CreatePlatformOptions).apiKeyRepository)
    ? (optionsOrLogger as CreatePlatformOptions).apiKeyRepository!
    : new InMemoryApiKeyRepository();

  const roleRepository: RoleRepository = (!isLogger && (optionsOrLogger as CreatePlatformOptions).roleRepository)
    ? (optionsOrLogger as CreatePlatformOptions).roleRepository!
    : new InMemoryRoleRepository();

  const authenticationService: AuthenticationService = (!isLogger && (optionsOrLogger as CreatePlatformOptions).authenticationService)
    ? (optionsOrLogger as CreatePlatformOptions).authenticationService!
    : new AuthenticationService(events, [
        new ApiKeyAuthenticationProvider(apiKeyRepository),
        new BearerTokenAuthenticationProvider(),
      ]);

  const rbacEvaluator: RbacAuthorizationEvaluator = (!isLogger && (optionsOrLogger as CreatePlatformOptions).rbacEvaluator)
    ? (optionsOrLogger as CreatePlatformOptions).rbacEvaluator!
    : new RbacAuthorizationEvaluator(roleRepository, events);

  const autonomousTriggerRepository: AutonomousTriggerRepositoryPort = dbManager
    ? new SqliteAutonomousTriggerRepository(dbManager)
    : new InMemoryAutonomousTriggerRepository();

  const runtimeLeaseRepository: RuntimeLeaseRepositoryPort = dbManager
    ? new SqliteRuntimeLeaseRepository(dbManager)
    : new InMemoryRuntimeLeaseRepository();

  const autonomousRuntimeStateRepository: AutonomousRuntimeStateRepositoryPort = dbManager
    ? new SqliteAutonomousRuntimeStateRepository(dbManager)
    : new InMemoryAutonomousRuntimeStateRepository();

  const autonomousOperationsRuntime = new AutonomousOperationsRuntime({
    triggerRepo: autonomousTriggerRepository,
    leaseRepo: runtimeLeaseRepository,
    stateRepo: autonomousRuntimeStateRepository,
    executiveOrchestrator: executiveOrchestratorService,
    policyGateway: policy,
    eventPublisher: events,
  });

  events.subscribe(autonomousOperationsRuntime.handleDomainEvent.bind(autonomousOperationsRuntime));

  return {
    config: optionsOrLogger,
    tasks,
    taskRepository: tasks,
    executions,
    executionRepository: executions,
    agents,
    memory,
    memoryService,
    models,
    modelRegistry,
    tools,
    toolGateway,
    toolInvocationRuntime,
    planExecutionEngine,
    events,
    audit,
    metrics,
    operations: operationRepository,
    operationRepository,
    operationService,
    eventStore,
    eventStream,
    transactionRunner,
    diagnostics,
    db: dbManager,
    recovery: recoveryService,
    recoveryResult,
    runtime,
    executeTask,
    submitTask,
    agentStrategy,
    agentRuntime,
    agentService,
    multiAgentCoordinator,
    orchestrator,
    orchestratedStrategy,
    orchestratedRuntime,
    executeOrchestration,
    planner,
    evaluator,
    autonomousOrchestrator,
    apiKeyRepository,
    roleRepository,
    authenticationService,
    rbacEvaluator,
    organizationRepository,
    organizationService,
    teamResourceBudgetRepository,
    teamResourceBudgetService,
    coordinationRepository,
    organizationalCoordinationService,
    agentProfileRepository,
    agentProfileService,
    workflowDefinitionRepository,
    workflowInstanceRepository,
    workflowOrchestratorService,
    verificationResultRepository,
    workflowVerificationService,
    approvalRequestRepository,
    humanOversightService,
    agentLifecycleRepository,
    agentEvaluationRepository,
    agentLifecycleService,
    solutionRepository,
    solutionInstanceRepository,
    solutionBlueprintValidator,
    solutionFactoryService,
    enterpriseRepository,
    businessObjectiveRepository,
    businessInitiativeRepository,
    businessMetricRepository,
    executiveDecisionRepository,
    enterpriseOperatingService,
    executiveCycleRepository,
    executiveContextSnapshotRepository,
    executiveAnalysisRepository,
    executivePlanRepository,
    executiveOrchestratorService,
    autonomousTriggerRepository,
    runtimeLeaseRepository,
    autonomousRuntimeStateRepository,
    autonomousOperationsRuntime,
  };
};
