export interface TaskDTO {
  readonly id: string;
  readonly traceId: string;
  readonly agentId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface ExecutionDTO {
  readonly id: string;
  readonly taskId: string;
  readonly traceId: string;
  readonly status: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly currentRound?: number | undefined;
  readonly currentTool?: string | undefined;
  readonly toolCalls?: number | undefined;
  readonly completedToolCalls?: number | undefined;
  readonly toolErrors?: number | undefined;
  readonly currentActivity?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly finalResult?: Readonly<Record<string, unknown>> | undefined;
  readonly toolCallObservations?: readonly Readonly<Record<string, unknown>>[] | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface OperationDTO {
  readonly kind: "MODEL" | "TOOL";
  readonly id: string;
  readonly model?: string | undefined;
  readonly toolId?: string | undefined;
  readonly input: Readonly<Record<string, unknown>>;
  readonly bindings?: readonly { readonly targetKey: string; readonly operationId: string; readonly sourceKey: string }[] | undefined;
}

export interface OrchestrationRequestDTO {
  readonly operations: readonly OperationDTO[];
  readonly traceId?: string | undefined;
}

export interface OrchestrationResultDTO {
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED";
  readonly operations: readonly {
    readonly operationId: string;
    readonly kind?: "MODEL" | "TOOL" | undefined;
    readonly status: string;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly error?: string | undefined;
  }[];
  readonly output?: Readonly<Record<string, unknown>> | undefined;
}

export interface AuditObservationDTO {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly type: string;
  readonly traceId: string;
  readonly aggregateId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly operationId?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface MetricSummaryDTO {
  readonly counters: Readonly<Record<string, number>>;
  readonly samplesCount: number;
}

export interface ToolDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
}

export interface ModelDTO {
  readonly id: string;
  readonly provider: string;
  readonly name: string;
  readonly status: "connected" | "available" | "unavailable";
  readonly capabilities: readonly string[];
}

export interface AgentDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly model: string;
  readonly instructions: string;
  readonly tools: readonly string[];
  readonly memoryScope?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAgentRequestDTO {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly model: string;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export interface UpdateAgentRequestDTO {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly model?: string | undefined;
  readonly instructions?: string | undefined;
  readonly tools?: readonly string[] | undefined;
  readonly memoryScope?: string | undefined;
}

export interface ExecuteAgentRequestDTO {
  readonly input: Readonly<Record<string, unknown>>;
  readonly traceId?: string | undefined;
}

export interface ExecuteAgentResponseDTO {
  readonly task: TaskDTO;
  readonly execution: ExecutionDTO;
}

export interface PlatformStatusDTO {
  readonly status: "HEALTHY";
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly tasksCount: number;
  readonly executionsCount: number;
  readonly toolsCount: number;
  readonly modelsCount?: number | undefined;
  readonly agentsCount?: number | undefined;
  readonly operationsCount?: number | undefined;
  readonly metrics: MetricSummaryDTO;
}

export interface ApiErrorResponseDTO {
  readonly error: string;
  readonly status: number;
  readonly code?: string | undefined;
  readonly traceId?: string | undefined;
}

// --- Autonomous Operation DTOs (v0.9) ---

export interface AutonomyBudgetDTO {
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number | undefined;
}

export interface AutonomyConsumptionDTO {
  readonly stepsUsed: number;
  readonly elapsedMs: number;
  readonly toolCallsUsed: number;
  readonly tokensUsed?: number | undefined;
}

export interface AutonomousOperationDTO {
  readonly id: string;
  readonly objective: string;
  readonly agentId: string;
  readonly status: string;
  readonly budget: AutonomyBudgetDTO;
  readonly consumption: AutonomyConsumptionDTO;
  readonly createdAt: string;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly terminationReason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly resultOutput?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlanStepDTO {
  readonly id: string;
  readonly order: number;
  readonly action: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlanDTO {
  readonly id: string;
  readonly operationId: string;
  readonly totalSteps: number;
  readonly steps: readonly PlanStepDTO[];
  readonly createdAt: string;
}

export interface ObservationDTO {
  readonly observationId: string;
  readonly operationId: string;
  readonly stepId: string;
  readonly status: "SUCCESS" | "FAILED" | "CANCELLED";
  readonly durationMs: number;
  readonly toolCalls: number;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
}

export interface DecisionDTO {
  readonly type: "EXECUTE_STEP" | "COMPLETE" | "STOP" | "FAIL";
  readonly operationId: string;
  readonly stepId?: string | undefined;
  readonly action?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly failureError?: { readonly code: string; readonly message: string } | undefined;
  readonly decidedAt: string;
}

export interface AutonomousOperationDetailDTO {
  readonly operation: AutonomousOperationDTO;
  readonly plan?: PlanDTO | undefined;
  readonly observations: readonly ObservationDTO[];
  readonly decisions: readonly DecisionDTO[];
}

export interface CreateAutonomousOperationRequestDTO {
  readonly id?: string | undefined;
  readonly objective: string;
  readonly agentId: string;
  readonly budget: AutonomyBudgetDTO;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface CancelAutonomousOperationRequestDTO {
  readonly reason?: string | undefined;
}

export interface ComponentHealthDTO {
  readonly status: "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_CONFIGURED" | "READY" | "RECONCILED";
  readonly message?: string | undefined;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
}

export interface PlatformHealthDTO {
  readonly status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  readonly liveness?: "UP" | "DOWN" | undefined;
  readonly readiness?: "READY" | "NOT_READY" | undefined;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
  readonly components: {
    readonly api: ComponentHealthDTO;
    readonly sqlite: ComponentHealthDTO & {
      readonly mode: "durable" | "in-memory";
    };
    readonly eventStore: ComponentHealthDTO & {
      readonly persistedCount: number;
      readonly queryableCount: number;
      readonly lastEventOccurredAt?: string | undefined;
    };
    readonly runtime: ComponentHealthDTO;
    readonly recovery: ComponentHealthDTO;
  };
}

export interface DurableEventDTO {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: string;
  readonly version: number;
  readonly metadata: {
    readonly sequenceNumber: number;
    readonly traceId: string;
    readonly correlationId: string;
    readonly causationId?: string | undefined;
    readonly schemaVersion: number;
  };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DurableEventListResponseDTO {
  readonly data: readonly DurableEventDTO[];
  readonly meta: {
    readonly count: number;
    readonly total: number;
    readonly afterSequence?: number | undefined;
    readonly beforeSequence?: number | undefined;
  };
}

// --- Diagnostics DTOs (v0.9.2) ---

export interface DiagnosticTraceNodeDTO {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: string;
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ExecutionTraceDiagnosticDTO {
  readonly traceId: string;
  readonly rootTaskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED" | "IN_PROGRESS" | "UNKNOWN";
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly failureReason?: string | undefined;
  readonly failureCode?: string | undefined;
  readonly isCrashRecovered: boolean;
  readonly timeline: readonly DiagnosticTraceNodeDTO[];
  readonly causalChain: readonly string[];
}

export interface CrashRecoveryDiagnosticDTO {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly recoveredAt: string;
  readonly code: string;
  readonly reason: string;
  readonly terminalStatus: string;
}

// --- Pagination DTOs (v0.9.2) ---

export interface PaginatedResponseDTO<T> {
  readonly data: readonly T[];
  readonly meta: {
    readonly count: number;
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  };
}

export interface PaginationOptions {
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

// --- Platform API v1 DTOs (Phase 14) ---

export interface PlatformMetadataDTO {
  readonly name: string;
  readonly version: string;
  readonly environment: string;
  readonly uptimeSeconds: number;
  readonly status: string;
  readonly capabilities: readonly string[];
  readonly defaultModel: string;
  readonly modelsCount: number;
  readonly toolsCount: number;
  readonly agentsCount: number;
}

export interface SafeAgentMetadataDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly model: string;
  readonly tools: readonly string[];
  readonly memoryScope?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskCancellationResultDTO {
  readonly taskId: string;
  readonly status: "CANCELLED";
  readonly cancelledAt: string;
  readonly reason?: string | undefined;
}

export interface PlatformApiResponse<T> {
  readonly success: boolean;
  readonly data?: T | undefined;
  readonly error?: { readonly code: string; readonly message: string; readonly details?: unknown } | undefined;
  readonly requestId: string;
  readonly correlationId?: string | undefined;
}

export interface ApplicationDTO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly role: string;
  readonly implementationStatus: "IMPLEMENTED" | "PARTIAL" | "DESIGNED" | "PLANNED";
  readonly runtimeStatus: "HEALTHY" | "OPERATIONAL" | "AVAILABLE" | "ENFORCED" | "WAL_ACTIVE" | "NOT_CONNECTED" | "OFFLINE" | "DEGRADED";
  readonly allowedCapabilities: readonly string[];
  readonly authenticationMode: "API_KEY" | "BEARER_TOKEN" | "MUTUAL_TLS";
  readonly endpoints: readonly string[];
  readonly architecture: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  readonly tenantId?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// --- SaaS Control Plane & Tenant DTOs (Prompt 82) ---

export interface TenantQuotaLimitDTO {
  readonly maxTasksPerMonth: number;
  readonly maxExecutionsPerMonth: number;
  readonly maxTokensPerMonth: number;
  readonly maxApplications: number;
  readonly maxUsers: number;
  readonly allowedCapabilities: readonly string[];
  readonly maxStorageMb: number;
}

export interface TenantDTO {
  readonly id: string;
  readonly name: string;
  readonly plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  readonly status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  readonly limits: TenantQuotaLimitDTO;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly createdAt: string;
  readonly updatedAt?: string | undefined;
}

export interface QuotaItemDTO {
  readonly metric: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly remaining: number;
  readonly percentageUsed: number;
  readonly resetAt: string;
  readonly status: "OK" | "WARNING" | "EXCEEDED";
}

export interface TenantUsageDashboardDTO {
  readonly tenantId: string;
  readonly plan: string;
  readonly status: string;
  readonly period: string;
  readonly quotas: readonly QuotaItemDTO[];
  readonly applicationsCount: number;
  readonly recentTasksCount: number;
  readonly recentExecutionsCount: number;
  readonly securityEventsCount: number;
}

export interface GlobalUsageSummaryDTO {
  readonly totalTasks: number;
  readonly totalExecutions: number;
  readonly totalModelCalls: number;
  readonly totalTokens: number | "NOT_AVAILABLE";
  readonly totalToolCalls: number;
  readonly totalAutomationRuns: number;
  readonly totalArRuns: number;
  readonly totalStorageMb: number | "NOT_AVAILABLE";
  readonly activeTenantsCount: number;
  readonly activeApplicationsCount: number;
}

export interface ApplicationAnalyticsDTO {
  readonly applicationId: string;
  readonly name: string;
  readonly tenantId: string;
  readonly totalTasks: number;
  readonly totalExecutions: number;
  readonly totalModelCalls: number;
  readonly totalToolCalls: number;
  readonly successfulExecutions: number;
  readonly failedExecutions: number;
  readonly errorRate: number;
  readonly grantedCapabilities: readonly string[];
  readonly lifecycleStatus: string;
  readonly lastActivityAt?: string | undefined;
}

export interface ApplicationLifecycleUpdateDTO {
  readonly state: "DRAFT" | "VALIDATED" | "REGISTERED" | "CONNECTED" | "OPERATIONAL" | "SUSPENDED" | "RETIRED";
  readonly reason?: string | undefined;
}

// --- Virtual Organization DTOs (Prompt 102) ---

export interface OrganizationDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly areasCount?: number | undefined;
  readonly teamsCount?: number | undefined;
}

export interface CreateOrganizationRequestDTO {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface UpdateOrganizationRequestDTO {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" | undefined;
}

export interface AreaDTO {
  readonly id: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly teamsCount?: number | undefined;
}

export interface CreateAreaRequestDTO {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface TeamDTO {
  readonly id: string;
  readonly areaId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly membersCount?: number | undefined;
}

export interface CreateTeamRequestDTO {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string | undefined;
}

export interface AgentMembershipDTO {
  readonly id: string;
  readonly teamId: string;
  readonly agentId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly role: "LEAD" | "SPECIALIST" | "OPERATOR" | "REVIEWER";
  readonly status: "ACTIVE" | "INACTIVE";
  readonly joinedAt: string;
  readonly updatedAt: string;
}

export interface AssignAgentRequestDTO {
  readonly agentId: string;
  readonly role?: "LEAD" | "SPECIALIST" | "OPERATOR" | "REVIEWER" | undefined;
}

export interface OrganizationHierarchyDTO {
  readonly organization: OrganizationDTO;
  readonly areas: readonly {
    readonly area: AreaDTO;
    readonly teams: readonly {
      readonly team: TeamDTO;
      readonly members: readonly AgentMembershipDTO[];
    }[];
  }[];
}

// --- Team Resource Governance & Budget DTOs (Prompt 103) ---

export interface BudgetLimitsDTO {
  readonly maxExecutions: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxAutonomousSteps: number;
  readonly maxDurationMs: number;
  readonly maxTokens?: number | undefined;
}

export interface BudgetConsumedDTO {
  readonly executions: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly autonomousSteps: number;
  readonly durationMs: number;
  readonly tokens?: number | undefined;
}

export interface BudgetRemainingDTO {
  readonly executions: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly autonomousSteps: number;
  readonly durationMs: number;
  readonly tokens?: number | undefined;
}

export interface TeamResourceBudgetDTO {
  readonly id: string;
  readonly teamId: string;
  readonly organizationId: string;
  readonly tenantId: string;
  readonly limits: BudgetLimitsDTO;
  readonly consumed: BudgetConsumedDTO;
  readonly remaining: BudgetRemainingDTO;
  readonly status: "ACTIVE" | "EXHAUSTED" | "SUSPENDED";
  readonly window: "LIFETIME" | "DAILY" | "MONTHLY";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateTeamResourceBudgetRequestDTO {
  readonly id?: string | undefined;
  readonly limits: BudgetLimitsDTO;
  readonly window?: "LIFETIME" | "DAILY" | "MONTHLY" | undefined;
}

export interface UpdateTeamResourceBudgetRequestDTO {
  readonly limits?: Partial<BudgetLimitsDTO> | undefined;
  readonly status?: "ACTIVE" | "SUSPENDED" | undefined;
}

export interface AuthorizeResourceConsumptionRequestDTO {
  readonly executions?: number | undefined;
  readonly modelCalls?: number | undefined;
  readonly toolCalls?: number | undefined;
  readonly autonomousSteps?: number | undefined;
  readonly durationMs?: number | undefined;
  readonly tokens?: number | undefined;
}

export interface ConsumptionEvaluationDTO {
  readonly allowed: boolean;
  readonly reason?: string | undefined;
  readonly budget?: TeamResourceBudgetDTO | undefined;
  readonly remaining?: BudgetRemainingDTO | undefined;
}

// --- Organizational Agent Coordination DTOs (Prompt 109) ---

export interface AgentCoordinationDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly requesterId: string;
  readonly correlationId: string;
  readonly parentExecutionId?: string | undefined;
  readonly childExecutionId?: string | undefined;
  readonly purpose: string;
  readonly inputPayload: Readonly<Record<string, unknown>>;
  readonly outputPayload?: Readonly<Record<string, unknown>> | undefined;
  readonly depth: number;
  readonly maxDepth: number;
  readonly handoffCount: number;
  readonly maxHandoffs: number;
  readonly status: "REQUESTED" | "AUTHORIZED" | "DISPATCHED" | "RUNNING" | "COMPLETED" | "FAILED" | "REJECTED" | "CANCELLED";
  readonly failure?: Readonly<{ code: string; message: string }> | undefined;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | undefined;
}

export interface RequestCoordinationRequestDTO {
  readonly id?: string | undefined;
  readonly organizationId: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly purpose: string;
  readonly inputPayload: Readonly<Record<string, unknown>>;
  readonly correlationId?: string | undefined;
  readonly parentExecutionId?: string | undefined;
  readonly depth?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly handoffCount?: number | undefined;
  readonly maxHandoffs?: number | undefined;
  readonly history?: readonly string[] | undefined;
  readonly requestedTokens?: number | undefined;
  readonly requestedCost?: number | undefined;
  readonly estimatedDurationMs?: number | undefined;
}

export interface CoordinationExecutionResponseDTO {
  readonly success: boolean;
  readonly coordination: AgentCoordinationDTO;
  readonly executionId?: string | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: Readonly<{ code: string; message: string }> | undefined;
}






// ============================================================================
// Agent Profile, Responsibilities & Capabilities DTOs (Prompt 110)
// ============================================================================

export interface AgentCapabilityDTO {
  readonly id: string;
  readonly name: string;
  readonly version?: string | undefined;
  readonly description?: string | undefined;
  readonly category?: string | undefined;
  readonly status: "DECLARED" | "VERIFIED" | "DISABLED";
  readonly verifiedAt?: string | undefined;
  readonly verifiedBy?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AgentProfileDTO {
  readonly agentId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly role: string;
  readonly responsibilities: readonly string[];
  readonly capabilities: readonly AgentCapabilityDTO[];
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAgentProfileRequestDTO {
  readonly tenantId?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly teamId: string;
  readonly role?: string | undefined;
  readonly responsibilities?: readonly string[] | undefined;
  readonly capabilities?: readonly any[] | undefined;
  readonly status?: string | undefined;
}

export interface UpdateAgentProfileRequestDTO {
  readonly role?: string | undefined;
  readonly responsibilities?: readonly string[] | undefined;
  readonly status?: string | undefined;
}

export interface AddCapabilityRequestDTO {
  readonly id: string;
  readonly name: string;
  readonly version?: string | undefined;
  readonly description?: string | undefined;
  readonly category?: string | undefined;
  readonly status?: "DECLARED" | "VERIFIED" | "DISABLED" | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface VerifyCapabilityRequestDTO {
  readonly verifierId?: string | undefined;
  readonly verifiedBy?: string | undefined;
}

export interface AgentDiscoveryCriteriaDTO {
  readonly tenantId?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly role?: string | undefined;
  readonly responsibility?: string | undefined;
  readonly responsibilities?: readonly string[] | undefined;
  readonly capabilityId?: string | undefined;
  readonly capabilities?: readonly string[] | undefined;
  readonly capabilityStatus?: "DECLARED" | "VERIFIED" | "DISABLED" | undefined;
  readonly status?: "ACTIVE" | "INACTIVE" | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface WorkflowStepDefinitionDTO {
  readonly stepId: string;
  readonly name: string;
  readonly order: number;
  readonly purpose: string;
  readonly dependsOn?: readonly string[] | undefined;
  readonly responsibility?: string | undefined;
  readonly requiredCapabilities?: readonly string[] | undefined;
  readonly requiredRole?: string | undefined;
  readonly assignedAgentId?: string | undefined;
  readonly assignedTeamId?: string | undefined;
  readonly inputTemplate?: Readonly<Record<string, unknown>> | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly requiresApproval?: boolean | undefined;
  readonly verificationRule?: WorkflowStepVerificationRuleDTO | undefined;
}

export interface WorkflowStepVerificationRuleDTO {
  readonly method?: "SCHEMA" | "INVARIANT" | "RULE" | "DETERMINISTIC" | "POLICY" | "SPECIALIZED" | undefined;
  readonly requiredFields?: readonly string[] | undefined;
  readonly fieldTypes?: Readonly<Record<string, "string" | "number" | "boolean" | "object" | "array">> | undefined;
  readonly allowedValues?: Readonly<Record<string, readonly unknown[]>> | undefined;
  readonly numericRanges?: Readonly<Record<string, { readonly min?: number; readonly max?: number }>> | undefined;
  readonly customInvariants?: readonly string[] | undefined;
}

export interface WorkflowDefinitionDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly version: number;
  readonly status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  readonly steps: readonly WorkflowStepDefinitionDTO[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWorkflowDefinitionRequestDTO {
  readonly id: string;
  readonly tenantId?: string | undefined;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly steps: readonly WorkflowStepDefinitionDTO[];
}

export interface UpdateWorkflowDefinitionRequestDTO {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly steps?: readonly WorkflowStepDefinitionDTO[] | undefined;
}

export interface WorkflowStepStateDTO {
  readonly stepId: string;
  readonly status: "PENDING" | "ASSIGNING" | "DISPATCHED" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  readonly assignedAgentId?: string | undefined;
  readonly assignedTeamId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly coordinationId?: string | undefined;
  readonly attempts: number;
  readonly maxRetries: number;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: string | undefined;
  readonly verificationVerdict?: "PASS" | "FAIL" | "MISSING" | "MALFORMED" | "CONFLICT" | "AMBIGUOUS" | undefined;
  readonly verificationId?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | undefined;
}

export interface WorkflowInstanceDTO {
  readonly id: string;
  readonly workflowDefinitionId: string;
  readonly workflowDefinitionVersion: number;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly initiatorId: string;
  readonly status: "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly currentStepId?: string | undefined;
  readonly stepStates: Readonly<Record<string, WorkflowStepStateDTO>>;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly failure?: { readonly code: string; readonly message: string; readonly stepId?: string } | undefined;
  readonly correlationId: string;
  readonly traceId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | undefined;
}

export interface StartWorkflowRequestDTO {
  readonly id?: string | undefined;
  readonly definitionId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly initiatorId?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly correlationId?: string | undefined;
  readonly autoAdvance?: boolean | undefined;
}

export interface AdvanceWorkflowResultDTO {
  readonly instance: WorkflowInstanceDTO;
  readonly executedSteps: readonly {
    readonly stepId: string;
    readonly success: boolean;
    readonly assignedAgentId?: string | undefined;
    readonly taskId?: string | undefined;
    readonly executionId?: string | undefined;
    readonly output?: Readonly<Record<string, unknown>> | undefined;
    readonly error?: { readonly code: string; readonly message: string } | undefined;
  }[];
}

export interface VerificationResultDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly verifierPrincipalId: string;
  readonly verifierSource: "SYSTEM" | "POLICY" | "AGENT" | "HUMAN";
  readonly verdict: "PASS" | "FAIL" | "MISSING" | "MALFORMED" | "CONFLICT" | "AMBIGUOUS";
  readonly method: "SCHEMA" | "INVARIANT" | "RULE" | "DETERMINISTIC" | "POLICY" | "SPECIALIZED";
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly reason?: string | undefined;
  readonly verifiedAt: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VerifyStepRequestDTO {
  readonly workflowInstanceId: string;
  readonly stepId: string;
  readonly verifierPrincipalId?: string | undefined;
  readonly verifierSource?: "SYSTEM" | "POLICY" | "AGENT" | "HUMAN" | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly explicitRule?: WorkflowStepVerificationRuleDTO | undefined;
  readonly overrideOutput?: Readonly<Record<string, unknown>> | undefined;
}

export interface ApprovalAuthorityDTO {
  readonly tenantId: string;
  readonly organizationId?: string | undefined;
  readonly areaId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly requiredRole?: "LEAD" | "SPECIALIST" | "OPERATOR" | "REVIEWER" | undefined;
  readonly requiredPermissions?: readonly string[] | undefined;
  readonly operationType?: string | undefined;
  readonly resourceScope?: string | undefined;
}

export interface ApprovalRequestDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly verificationResultId?: string | undefined;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly reviewerPrincipalId?: string | undefined;
  readonly approverPrincipalId?: string | undefined;
  readonly purpose: string;
  readonly requiredAuthority?: ApprovalAuthorityDTO | undefined;
  readonly requiredRole?: "LEAD" | "SPECIALIST" | "OPERATOR" | "REVIEWER" | undefined;
  readonly status: "REQUESTED" | "REVIEWING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED" | "ESCALATED";
  readonly decisionReason?: string | undefined;
  readonly decisionMetadata?: Readonly<Record<string, unknown>> | undefined;
  readonly escalationTarget?: string | undefined;
  readonly expiresAt?: string | undefined;
  readonly decidedAt?: string | undefined;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateApprovalRequestDTO {
  readonly id?: string | undefined;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly verificationResultId?: string | undefined;
  readonly requesterPrincipalId?: string | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly purpose: string;
  readonly requiredAuthority?: ApprovalAuthorityDTO | undefined;
  readonly requiredRole?: "LEAD" | "SPECIALIST" | "OPERATOR" | "REVIEWER" | undefined;
  readonly expiresAt?: string | undefined;
}

export interface StartReviewRequestDTO {
  readonly reviewerPrincipalId?: string | undefined;
}

export interface DecideApprovalRequestDTO {
  readonly approverPrincipalId?: string | undefined;
  readonly reason?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface EscalateApprovalRequestDTO {
  readonly escalationTarget: string;
  readonly reason: string;
}

export interface CancelApprovalRequestDTO {
  readonly reason?: string | undefined;
}

// --- Agent Lifecycle & Evaluation Governance DTOs (Phase 65) ---

export interface AgentLifecycleDTO {
  readonly agentId: string;
  readonly tenantId: string;
  readonly state: "REGISTERED" | "EVALUATION_PENDING" | "VERIFIED" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "DEPRECATED";
  readonly profileVersion: number;
  readonly suspendedReason?: string | undefined;
  readonly suspendedBy?: string | undefined;
  readonly suspendedAt?: string | undefined;
  readonly revokedReason?: string | undefined;
  readonly revokedBy?: string | undefined;
  readonly revokedAt?: string | undefined;
  readonly deprecatedReason?: string | undefined;
  readonly deprecatedBy?: string | undefined;
  readonly deprecatedAt?: string | undefined;
  readonly lastEvaluatedAt?: string | undefined;
  readonly lastEvaluationId?: string | undefined;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentEvaluationDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly evaluatedProfileVersion: number;
  readonly evaluatorPrincipalId: string;
  readonly evaluationType: "IDENTITY_CHECK" | "PROFILE_CHECK" | "CAPABILITY_CHECK" | "POLICY_CHECK" | "CONTRACT_CHECK" | "REGRESSION_CHECK";
  readonly verdict: "PASS" | "FAIL" | "PENDING" | "EXPIRED";
  readonly criteriaReference: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly evaluatedAt: string;
  readonly expiresAt?: string | undefined;
  readonly version: number;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface CreateAgentEvaluationRequestDTO {
  readonly id?: string | undefined;
  readonly agentId: string;
  readonly evaluatorPrincipalId?: string | undefined;
  readonly evaluationType: "IDENTITY_CHECK" | "PROFILE_CHECK" | "CAPABILITY_CHECK" | "POLICY_CHECK" | "CONTRACT_CHECK" | "REGRESSION_CHECK";
  readonly verdict?: "PASS" | "FAIL" | "PENDING" | "EXPIRED" | undefined;
  readonly criteriaReference: string;
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly expiresAt?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly autoTransitionLifecycle?: boolean | undefined;
}

export interface CompleteAgentEvaluationRequestDTO {
  readonly verdict: "PASS" | "FAIL";
  readonly evidence?: Readonly<Record<string, unknown>> | undefined;
  readonly expectedVersion?: number | undefined;
  readonly autoTransitionLifecycle?: boolean | undefined;
}

export interface TransitionLifecycleRequestDTO {
  readonly reason?: string | undefined;
  readonly operatorPrincipalId?: string | undefined;
  readonly expectedVersion?: number | undefined;
}

export interface AgentEligibilityDTO {
  readonly eligible: boolean;
  readonly code: string;
  readonly reason: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly lifecycleState?: string | undefined;
  readonly profileVersion?: number | undefined;
}

export interface SolutionBlueprintDTO {
  readonly workflows: readonly {
    readonly workflowDefinitionId: string;
    readonly requiredVersion?: number | undefined;
    readonly role?: string | undefined;
    readonly optional?: boolean | undefined;
  }[];
  readonly requiredAgents: readonly {
    readonly agentId: string;
    readonly requiredProfileVersion?: number | undefined;
    readonly requiredRole?: string | undefined;
    readonly requiredCapabilities?: readonly string[] | undefined;
    readonly optional?: boolean | undefined;
  }[];
  readonly requiredCapabilities: readonly {
    readonly capabilityId: string;
    readonly minLevel?: number | undefined;
    readonly description?: string | undefined;
    readonly optional?: boolean | undefined;
  }[];
  readonly requiredPolicies: readonly {
    readonly policyId: string;
    readonly ruleName?: string | undefined;
    readonly enforcementLevel?: "STRICT" | "WARNING" | undefined;
  }[];
  readonly verificationRequirements: readonly {
    readonly stepIdOrRule: string;
    readonly requiredVerdict: "PASS";
    readonly verifierType?: string | undefined;
  }[];
  readonly approvalRequirements: readonly {
    readonly actionOrStep: string;
    readonly requiredRole: string;
    readonly minApprovals?: number | undefined;
  }[];
  readonly externalAdapters: readonly {
    readonly adapterId: string;
    readonly type: string;
    readonly config?: Readonly<Record<string, unknown>> | undefined;
  }[];
  readonly observabilityRequirements: {
    readonly metricsEnabled: boolean;
    readonly traceLevel?: "NONE" | "BASIC" | "DETAILED" | "DEBUG" | undefined;
    readonly exportAuditLogs?: boolean | undefined;
  };
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface SolutionValidationReportDTO {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly validatedAt: string;
  readonly checkedComponents: {
    readonly workflowsCount: number;
    readonly agentsCount: number;
    readonly capabilitiesCount: number;
    readonly policiesCount: number;
    readonly verificationsCount: number;
    readonly approvalsCount: number;
  };
}

export interface AISolutionDTO {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly lifecycleState: "DRAFT" | "VALIDATING" | "VALIDATED" | "PUBLISHED" | "ARCHIVED" | "DEPRECATED";
  readonly blueprint: SolutionBlueprintDTO;
  readonly ownerPrincipalId: string;
  readonly lastValidationReport?: SolutionValidationReportDTO | undefined;
  readonly publishedAt?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly concurrencyVersion: number;
}

export interface SolutionInstanceDTO {
  readonly id: string;
  readonly solutionId: string;
  readonly solutionVersion: number;
  readonly tenantId: string;
  readonly name: string;
  readonly status: "INITIALIZED" | "ACTIVE" | "PAUSED" | "TERMINATED";
  readonly config: Readonly<Record<string, unknown>>;
  readonly operatorPrincipalId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSolutionRequestDTO {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly ownerPrincipalId?: string | undefined;
  readonly blueprint?: Partial<SolutionBlueprintDTO> | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface UpdateSolutionRequestDTO {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly blueprint?: Partial<SolutionBlueprintDTO> | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

export interface PublishSolutionRequestDTO {
  readonly autoValidate?: boolean | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

export interface InstantiateSolutionRequestDTO {
  readonly id?: string | undefined;
  readonly solutionVersion?: number | undefined;
  readonly name?: string | undefined;
  readonly config?: Readonly<Record<string, unknown>> | undefined;
  readonly operatorPrincipalId?: string | undefined;
}

