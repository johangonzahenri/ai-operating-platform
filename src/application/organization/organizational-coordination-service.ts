import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { Runtime } from "../../domain/execution/runtime.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { Task } from "../../domain/task/task.js";
import { AgentQueryPort } from "../ports/query-ports.js";
import { OrganizationHierarchyRepository } from "../ports/organization-repository-port.js";
import { TeamResourceBudgetService } from "./team-resource-budget-service.js";
import { CoordinationRepositoryPort } from "../ports/coordination-repository-port.js";
import {
  AgentCoordinationRecord,
  CoordinationDomainError,
  CoordinationCycleError,
  CoordinationDepthExceededError,
  CreateAgentCoordinationRecordProps,
} from "../../domain/organization/organizational-coordination.js";
import {
  OrganizationNotFoundError,
  TeamNotFoundError,
  CrossTenantOrganizationError,
} from "../../domain/organization/organization-errors.js";
import {
  createCoordinationRequestedEvent,
  createCoordinationAuthorizedEvent,
  createCoordinationRejectedEvent,
  createCoordinationStartedEvent,
  createCoordinationCompletedEvent,
  createCoordinationFailedEvent,
} from "../../domain/organization/organization-events.js";

export interface OrganizationalCoordinationServiceOptions {
  readonly coordinationRepository: CoordinationRepositoryPort;
  readonly organizationRepository: OrganizationHierarchyRepository;
  readonly budgetService: TeamResourceBudgetService;
  readonly policyGateway: PolicyGateway;
  readonly runtime: Runtime;
  readonly agentQuery: AgentQueryPort;
  readonly events?: EventPublisher | undefined;
}

export interface RequestCoordinationParams {
  readonly id?: string | undefined;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly requesterId: string;
  readonly correlationId?: string | undefined;
  readonly parentExecutionId?: string | undefined;
  readonly purpose: string;
  readonly inputPayload: Readonly<Record<string, unknown>>;
  readonly depth?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly handoffCount?: number | undefined;
  readonly maxHandoffs?: number | undefined;
  readonly history?: readonly string[] | undefined;
  readonly requestedTokens?: number | undefined;
  readonly requestedCost?: number | undefined;
  readonly estimatedDurationMs?: number | undefined;
}

export interface CoordinationExecutionResult {
  readonly success: boolean;
  readonly record: AgentCoordinationRecord;
  readonly executionId?: string | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: Readonly<{ code: string; message: string }> | undefined;
}

export class OrganizationalCoordinationService {
  private readonly coordinationRepo: CoordinationRepositoryPort;
  private readonly orgRepo: OrganizationHierarchyRepository;
  private readonly budgetService: TeamResourceBudgetService;
  private readonly policy: PolicyGateway;
  private readonly runtime: Runtime;
  private readonly agentQuery: AgentQueryPort;
  private readonly events?: EventPublisher | undefined;

  constructor(options: OrganizationalCoordinationServiceOptions) {
    this.coordinationRepo = options.coordinationRepository;
    this.orgRepo = options.organizationRepository;
    this.budgetService = options.budgetService;
    this.policy = options.policyGateway;
    this.runtime = options.runtime;
    this.agentQuery = options.agentQuery;
    this.events = options.events;
  }

  async coordinate(
    params: RequestCoordinationParams,
    traceId: string = crypto.randomUUID()
  ): Promise<CoordinationExecutionResult> {
    const correlationId = params.correlationId?.trim() || crypto.randomUUID();

    // 1. Verify Team and Organization within same Tenant
    const team = await this.orgRepo.findTeamById(params.teamId);
    if (!team) {
      throw new TeamNotFoundError(params.teamId);
    }
    if (team.tenantId !== params.tenantId) {
      throw new CrossTenantOrganizationError(`Team '${params.teamId}' does not belong to tenant '${params.tenantId}'`);
    }
    if (team.organizationId !== params.organizationId) {
      throw new CrossTenantOrganizationError(`Team '${params.teamId}' belongs to organization '${team.organizationId}', not '${params.organizationId}'`);
    }

    // 2. Verify Source and Target Agents exist and are ACTIVE
    const sourceAgent = this.agentQuery.findById(params.sourceAgentId);
    if (!sourceAgent) {
      throw new OrganizationNotFoundError(`Source agent '${params.sourceAgentId}' not found`);
    }
    if (sourceAgent.status !== "ACTIVE") {
      throw new CoordinationDomainError(`Source agent '${params.sourceAgentId}' is not ACTIVE`);
    }

    const targetAgent = this.agentQuery.findById(params.targetAgentId);
    if (!targetAgent) {
      throw new OrganizationNotFoundError(`Target agent '${params.targetAgentId}' not found`);
    }
    if (targetAgent.status !== "ACTIVE") {
      throw new CoordinationDomainError(`Target agent '${params.targetAgentId}' is not ACTIVE`);
    }

    // 3. Verify Target Agent Membership in Target Team
    const targetMembership = await this.orgRepo.findMembershipByTeamAndAgent(team.id, targetAgent.id);
    if (!targetMembership || targetMembership.status !== "ACTIVE") {
      throw new CoordinationDomainError(`Target agent '${targetAgent.id}' is not an active member of team '${team.id}'`);
    }
    if (targetMembership.tenantId !== params.tenantId) {
      throw new CrossTenantOrganizationError(`Target agent '${targetAgent.id}' belongs to another tenant`);
    }

    // 4. Create Initial AgentCoordinationRecord (validates bounds, cycle, depth limits)
    let record = AgentCoordinationRecord.create({
      id: params.id,
      tenantId: params.tenantId,
      organizationId: params.organizationId,
      teamId: params.teamId,
      sourceAgentId: sourceAgent.id,
      targetAgentId: targetAgent.id,
      requesterId: params.requesterId,
      correlationId,
      parentExecutionId: params.parentExecutionId,
      purpose: params.purpose,
      inputPayload: params.inputPayload,
      depth: params.depth,
      maxDepth: params.maxDepth,
      handoffCount: params.handoffCount,
      maxHandoffs: params.maxHandoffs,
      history: params.history,
    });

    await this.coordinationRepo.save(record);
    if (this.events) {
      this.events.publish(createCoordinationRequestedEvent(record, traceId));
    }

    // 5. Policy Gateway Evaluation
    const policyDecision = await this.policy.evaluate({
      traceId,
      operationId: record.id,
      operationType: "MODEL",
      resourceId: targetAgent.id,
      agentId: targetAgent.id,
      action: "coordination.execute",
      metadata: {
        tenantId: params.tenantId,
        teamId: params.teamId,
        sourceAgentId: sourceAgent.id,
        targetAgentId: targetAgent.id,
        purpose: params.purpose,
      },
    });

    if (!policyDecision.allowed) {
      const rejectReason = policyDecision.reason ?? `Coordination denied by policy for agent '${targetAgent.id}'`;
      record = record.reject("POLICY_DENIED", rejectReason);
      await this.coordinationRepo.save(record);
      if (this.events) {
        this.events.publish(
          createCoordinationRejectedEvent(
            record.id,
            params.tenantId,
            params.teamId,
            sourceAgent.id,
            targetAgent.id,
            rejectReason,
            "POLICY_DENIED",
            traceId
          )
        );
      }
      return {
        success: false,
        record,
        error: record.failure,
      };
    }

    // 6. Authorize Record
    record = record.authorize();
    await this.coordinationRepo.save(record);
    if (this.events) {
      this.events.publish(createCoordinationAuthorizedEvent(record, traceId));
    }

    // 7. Team Resource Budget Evaluation & Pre-Consumption
    const budgetConsumption = await this.budgetService.evaluateAndConsume(
      params.teamId,
      params.tenantId,
      {
        executions: 1,
        ...(params.requestedTokens ? { tokens: params.requestedTokens } : {}),
        ...(params.requestedCost ? { cost: params.requestedCost } : {}),
        ...(params.estimatedDurationMs ? { durationMs: params.estimatedDurationMs } : {}),
      },
      traceId
    );

    if (!budgetConsumption.allowed) {
      const budgetReason = budgetConsumption.reason ?? `Budget exceeded for team '${params.teamId}'`;
      record = record.reject("BUDGET_EXHAUSTED", budgetReason);
      await this.coordinationRepo.save(record);
      if (this.events) {
        this.events.publish(
          createCoordinationRejectedEvent(
            record.id,
            params.tenantId,
            params.teamId,
            sourceAgent.id,
            targetAgent.id,
            budgetReason,
            "BUDGET_EXHAUSTED",
            traceId
          )
        );
      }
      return {
        success: false,
        record,
        error: record.failure,
      };
    }

    // 8. Create Child Task & Dispatch
    const childTask = Task.create(crypto.randomUUID(), record.correlationId, {
      agentId: targetAgent.id,
      input: record.inputPayload,
    });

    record = record.dispatch(childTask.id);
    await this.coordinationRepo.save(record);

    // 9. Start Coordination
    record = record.start();
    await this.coordinationRepo.save(record);
    if (this.events) {
      this.events.publish(createCoordinationStartedEvent(record, traceId));
    }

    // 10. Execute on Runtime
    try {
      const targetDefinition = typeof (targetAgent as any).toDefinition === "function"
        ? (targetAgent as any).toDefinition()
        : {
            id: targetAgent.id,
            name: targetAgent.name,
            model: targetAgent.model,
            instructions: targetAgent.instructions,
            tools: targetAgent.tools,
            memoryScope: targetAgent.memoryScope,
          };

      const childExecutionResult = await this.runtime.execute(childTask, targetDefinition);

      if (childExecutionResult.execution.status === "COMPLETED" && childExecutionResult.task.result) {
        record = record.complete(childExecutionResult.task.result.output);
        await this.coordinationRepo.save(record);
        if (this.events) {
          this.events.publish(
            createCoordinationCompletedEvent(record, childExecutionResult.task.result.output, traceId)
          );
        }
        return {
          success: true,
          record,
          executionId: childExecutionResult.execution.id,
          output: record.outputPayload,
        };
      } else {
        const failCode = childExecutionResult.task.error?.code ?? "CHILD_EXECUTION_FAILED";
        const failMsg = childExecutionResult.task.error?.message ?? `Child agent execution status: ${childExecutionResult.execution.status}`;
        record = record.fail(failCode, failMsg);
        await this.coordinationRepo.save(record);
        if (this.events) {
          this.events.publish(createCoordinationFailedEvent(record, failCode, failMsg, traceId));
        }
        return {
          success: false,
          record,
          executionId: childExecutionResult.execution.id,
          error: record.failure,
        };
      }
    } catch (execErr) {
      const errorMsg = execErr instanceof Error ? execErr.message : "Child execution failed";
      record = record.fail("COORDINATION_EXECUTION_ERROR", errorMsg);
      await this.coordinationRepo.save(record);
      if (this.events) {
        this.events.publish(
          createCoordinationFailedEvent(record, "COORDINATION_EXECUTION_ERROR", errorMsg, traceId)
        );
      }
      return {
        success: false,
        record,
        error: record.failure,
      };
    }
  }

  async getCoordination(id: string, tenantId?: string): Promise<AgentCoordinationRecord> {
    const record = await this.coordinationRepo.findById(id);
    if (!record) {
      throw new OrganizationNotFoundError(`Coordination '${id}' not found`);
    }
    if (tenantId && record.tenantId !== tenantId) {
      throw new CrossTenantOrganizationError(`Cross-tenant access forbidden for coordination '${id}'`);
    }
    return record;
  }

  async listTeamCoordinations(
    teamId: string,
    tenantId?: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentCoordinationRecord[]> {
    if (tenantId) {
      const team = await this.orgRepo.findTeamById(teamId);
      if (!team) {
        throw new TeamNotFoundError(teamId);
      }
      if (team.tenantId !== tenantId) {
        throw new CrossTenantOrganizationError(`Team '${teamId}' does not belong to tenant '${tenantId}'`);
      }
    }
    return this.coordinationRepo.findByTeamId(teamId, tenantId, limit, offset);
  }

  async listTenantCoordinations(
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly AgentCoordinationRecord[]> {
    return this.coordinationRepo.findByTenantId(tenantId, limit, offset);
  }
}
