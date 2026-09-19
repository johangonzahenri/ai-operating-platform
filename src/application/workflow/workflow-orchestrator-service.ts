import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { Runtime } from "../../domain/execution/runtime.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { Task } from "../../domain/task/task.js";
import { AgentQueryPort } from "../ports/query-ports.js";
import { OrganizationHierarchyRepository } from "../ports/organization-repository-port.js";
import { AgentProfileService } from "../organization/agent-profile-service.js";
import { TeamResourceBudgetService } from "../organization/team-resource-budget-service.js";
import {
  WorkflowDefinitionRepositoryPort,
  WorkflowInstanceRepositoryPort,
} from "../ports/workflow-repository-port.js";
import {
  WorkflowDefinition,
  CreateWorkflowDefinitionProps,
  UpdateWorkflowDefinitionProps,
  WorkflowStepDefinition,
} from "../../domain/workflow/workflow-definition.js";
import {
  WorkflowInstance,
  WorkflowStepState,
} from "../../domain/workflow/workflow-instance.js";
import {
  WorkflowNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowExecutionError,
  WorkflowValidationError,
} from "../../domain/workflow/workflow-errors.js";
import {
  createWorkflowCreatedEvent,
  createWorkflowUpdatedEvent,
  createWorkflowStartedEvent,
  createWorkflowStepStartedEvent,
  createWorkflowStepCompletedEvent,
  createWorkflowStepFailedEvent,
  createWorkflowCompletedEvent,
  createWorkflowFailedEvent,
  createWorkflowCancelledEvent,
} from "../../domain/workflow/workflow-events.js";

import { WorkflowVerificationService } from "./workflow-verification-service.js";

export interface WorkflowOrchestratorServiceOptions {
  readonly definitionRepository: WorkflowDefinitionRepositoryPort;
  readonly instanceRepository: WorkflowInstanceRepositoryPort;
  readonly agentProfileService?: AgentProfileService | undefined;
  readonly organizationRepository?: OrganizationHierarchyRepository | undefined;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly budgetService?: TeamResourceBudgetService | undefined;
  readonly verificationService?: WorkflowVerificationService | undefined;
  readonly runtime?: Runtime | undefined;
  readonly agentQuery?: AgentQueryPort | undefined;
  readonly events?: EventPublisher | undefined;
}

export interface StartWorkflowParams {
  readonly id?: string | undefined;
  readonly definitionId: string;
  readonly tenantId: string;
  readonly initiatorId?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly correlationId?: string | undefined;
  readonly autoAdvance?: boolean | undefined;
}

export interface AdvanceStepResult {
  readonly stepId: string;
  readonly success: boolean;
  readonly assignedAgentId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly error?: Readonly<{ code: string; message: string }> | undefined;
}

export interface AdvanceWorkflowResult {
  readonly instance: WorkflowInstance;
  readonly executedSteps: readonly AdvanceStepResult[];
}

export class WorkflowOrchestratorService {
  private readonly defRepo: WorkflowDefinitionRepositoryPort;
  private readonly instanceRepo: WorkflowInstanceRepositoryPort;
  private readonly profileService?: AgentProfileService | undefined;
  private readonly orgRepo?: OrganizationHierarchyRepository | undefined;
  private readonly policy?: PolicyGateway | undefined;
  private readonly budgetService?: TeamResourceBudgetService | undefined;
  private readonly verificationService?: WorkflowVerificationService | undefined;
  private readonly runtime?: Runtime | undefined;
  private readonly agentQuery?: AgentQueryPort | undefined;
  private readonly events?: EventPublisher | undefined;

  constructor(options: WorkflowOrchestratorServiceOptions) {
    this.defRepo = options.definitionRepository;
    this.instanceRepo = options.instanceRepository;
    this.profileService = options.agentProfileService;
    this.orgRepo = options.organizationRepository;
    this.policy = options.policyGateway;
    this.budgetService = options.budgetService;
    this.verificationService = options.verificationService;
    this.runtime = options.runtime;
    this.agentQuery = options.agentQuery;
    this.events = options.events;
  }

  // --- Workflow Definition Management ---

  async createDefinition(
    props: CreateWorkflowDefinitionProps,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowDefinition> {
    const definition = WorkflowDefinition.create(props);
    const saved = await this.defRepo.save(definition);
    if (this.events) {
      this.events.publish(createWorkflowCreatedEvent(saved, traceId));
    }
    return saved;
  }

  async updateDefinition(
    id: string,
    tenantId: string,
    props: UpdateWorkflowDefinitionProps,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowDefinition> {
    const existing = await this.getDefinition(id, tenantId);
    const updated = existing.update(props);
    const saved = await this.defRepo.save(updated);
    if (this.events) {
      this.events.publish(createWorkflowUpdatedEvent(saved, traceId));
    }
    return saved;
  }

  async activateDefinition(
    id: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowDefinition> {
    const existing = await this.getDefinition(id, tenantId);
    const activated = existing.activate();
    const saved = await this.defRepo.save(activated);
    if (this.events) {
      this.events.publish(createWorkflowUpdatedEvent(saved, traceId));
    }
    return saved;
  }

  async archiveDefinition(
    id: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowDefinition> {
    const existing = await this.getDefinition(id, tenantId);
    const archived = existing.archive();
    const saved = await this.defRepo.save(archived);
    if (this.events) {
      this.events.publish(createWorkflowUpdatedEvent(saved, traceId));
    }
    return saved;
  }

  async getDefinition(id: string, tenantId: string): Promise<WorkflowDefinition> {
    if (!id || !id.trim()) {
      throw new WorkflowValidationError("id is required to get a workflow definition");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new WorkflowValidationError("tenantId is required to get a workflow definition");
    }
    const def = await this.defRepo.findById(id, tenantId);
    if (!def) {
      throw new WorkflowNotFoundError(id);
    }
    return def;
  }

  async listDefinitions(
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly WorkflowDefinition[]> {
    if (!tenantId || !tenantId.trim()) {
      throw new WorkflowValidationError("tenantId is required to list workflow definitions");
    }
    return this.defRepo.findByTenantId(tenantId, limit, offset);
  }

  async deleteDefinition(id: string, tenantId: string): Promise<boolean> {
    if (!id || !id.trim()) {
      throw new WorkflowValidationError("id is required to delete a workflow definition");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new WorkflowValidationError("tenantId is required to delete a workflow definition");
    }
    return this.defRepo.delete(id, tenantId);
  }

  // --- Workflow Instance Lifecycle & Orchestration ---

  async startWorkflow(
    params: StartWorkflowParams,
    traceId: string = crypto.randomUUID()
  ): Promise<{ instance: WorkflowInstance; executedSteps: readonly AdvanceStepResult[] }> {
    const definition = await this.getDefinition(params.definitionId, params.tenantId);

    const instanceId = params.id?.trim() || crypto.randomUUID();
    let instance = WorkflowInstance.create({
      id: instanceId,
      workflowDefinition: definition,
      initiatorId: params.initiatorId ?? "system",
      input: params.input ?? {},
      correlationId: params.correlationId,
      traceId,
    });
    instance = instance.start();
    await this.instanceRepo.save(instance);

    if (this.events) {
      this.events.publish(createWorkflowStartedEvent(instance, traceId));
    }

    if (params.autoAdvance !== false) {
      return this.advanceWorkflow(instance.id, params.tenantId, traceId);
    }

    return { instance, executedSteps: [] };
  }

  async advanceWorkflow(
    instanceId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<AdvanceWorkflowResult> {
    let instance = await this.getInstance(instanceId, tenantId);

    if (instance.status !== "RUNNING") {
      return { instance, executedSteps: [] };
    }

    const definition = await this.getDefinition(instance.workflowDefinitionId, tenantId);
    const allExecutedSteps: AdvanceStepResult[] = [];

    // Loop while there are runnable steps to advance
    let hasProgress = true;
    while (hasProgress && instance.status === "RUNNING") {
      const runnableStepIds = instance.getNextRunnableStepIds(definition);
      if (runnableStepIds.length === 0) {
        hasProgress = false;
        break;
      }

      hasProgress = false;

      for (const stepId of runnableStepIds) {
        const stepDef = definition.steps.find((s) => s.stepId === stepId);
        if (!stepDef) {
          throw new WorkflowExecutionError(`Step definition '${stepId}' not found in definition '${definition.id}'`);
        }

        const stepResult = await this.executeStep(instance, stepDef, definition, traceId);
        allExecutedSteps.push(stepResult);
        hasProgress = true;

        // Reload instance after step execution
        instance = await this.getInstance(instanceId, tenantId);
        if (instance.status !== "RUNNING") {
          break;
        }
      }
    }

    // Final check if workflow completed or failed
    if (instance.status === "RUNNING") {
      if (instance.isCompleted()) {
        const aggregatedOutput: Record<string, unknown> = {};
        for (const s of Object.values(instance.stepStates)) {
          if (s.output) {
            aggregatedOutput[s.stepId] = s.output;
          }
        }
        instance = instance.complete(aggregatedOutput);
        await this.instanceRepo.save(instance);
        if (this.events) {
          this.events.publish(createWorkflowCompletedEvent(instance, traceId));
        }
      }
    }

    return { instance, executedSteps: allExecutedSteps };
  }

  private async executeStep(
    instance: WorkflowInstance,
    stepDef: WorkflowStepDefinition,
    definition: WorkflowDefinition,
    traceId: string
  ): Promise<AdvanceStepResult> {
    const stepState = instance.getStepState(stepDef.stepId);
    if (!stepState) {
      throw new WorkflowExecutionError(`Step state '${stepDef.stepId}' not found in instance '${instance.id}'`);
    }

    // 1. Agent Discovery & Matching
    let assignedAgentId = stepDef.assignedAgentId;
    const targetTeamId = stepDef.assignedTeamId ?? definition.teamId;

    if (!assignedAgentId && this.profileService) {
      const requiredCap = stepDef.requiredCapabilities && stepDef.requiredCapabilities.length > 0
        ? stepDef.requiredCapabilities[0]
        : undefined;

      const matched = await this.profileService.matchAgentForCoordination({
        tenantId: instance.tenantId,
        teamId: targetTeamId ?? "",
        requiredCapability: requiredCap,
        requiredResponsibility: stepDef.responsibility,
        preferredRole: stepDef.requiredRole,
      });

      if (matched) {
        assignedAgentId = matched.agentId;
      }
    }

    if (!assignedAgentId) {
      const errorMsg = `No eligible agent found for step '${stepDef.name}' (${stepDef.stepId}) with capability '${stepDef.requiredCapabilities?.join(",") ?? "none"}' and responsibility '${stepDef.responsibility ?? "none"}'`;
      const failureResult = instance.markStepFailed(stepDef.stepId, errorMsg);
      let updatedInstance = failureResult.instance;
      await this.instanceRepo.save(updatedInstance);

      if (this.events) {
        const failedStep = updatedInstance.getStepState(stepDef.stepId)!;
        this.events.publish(createWorkflowStepFailedEvent(updatedInstance, failedStep, traceId));
        if (updatedInstance.status === "FAILED") {
          this.events.publish(createWorkflowFailedEvent(updatedInstance, traceId));
        }
      }

      return {
        stepId: stepDef.stepId,
        success: false,
        error: { code: "NO_ELIGIBLE_AGENT", message: errorMsg },
      };
    }

    // 2. Mark step ASSIGNING
    let updatedInstance = instance.markStepAssigning(stepDef.stepId, assignedAgentId, targetTeamId);
    await this.instanceRepo.save(updatedInstance);

    // 3. Policy Gateway Evaluation (fail-closed)
    if (this.policy) {
      const policyDecision = await this.policy.evaluate({
        traceId,
        operationId: `${instance.id}:${stepDef.stepId}`,
        operationType: "MODEL",
        resourceId: assignedAgentId,
        agentId: assignedAgentId,
        action: "workflow.step.execute",
        metadata: {
          tenantId: instance.tenantId,
          workflowDefinitionId: definition.id,
          workflowInstanceId: instance.id,
          stepId: stepDef.stepId,
          stepName: stepDef.name,
          teamId: targetTeamId,
        },
      });

      if (!policyDecision.allowed) {
        const rejectMsg = policyDecision.reason ?? `Step execution denied by policy for agent '${assignedAgentId}'`;
        const failureResult = updatedInstance.markStepFailed(stepDef.stepId, rejectMsg);
        updatedInstance = failureResult.instance;
        await this.instanceRepo.save(updatedInstance);
        if (this.events) {
          const failedStep = updatedInstance.getStepState(stepDef.stepId)!;
          this.events.publish(createWorkflowStepFailedEvent(updatedInstance, failedStep, traceId));
          if (updatedInstance.status === "FAILED") {
            this.events.publish(createWorkflowFailedEvent(updatedInstance, traceId));
          }
        }
        return {
          stepId: stepDef.stepId,
          success: false,
          assignedAgentId,
          error: { code: "POLICY_DENIED", message: rejectMsg },
        };
      }
    }

    // 4. Team Resource Budget Evaluation & Consumption
    if (this.budgetService && targetTeamId) {
      const budgetResult = await this.budgetService.evaluateAndConsume(
        targetTeamId,
        instance.tenantId,
        { executions: 1 },
        traceId
      );

      if (!budgetResult.allowed) {
        const budgetMsg = budgetResult.reason ?? `Budget exceeded for team '${targetTeamId}' on step '${stepDef.name}'`;
        const failureResult = updatedInstance.markStepFailed(stepDef.stepId, budgetMsg);
        updatedInstance = failureResult.instance;
        await this.instanceRepo.save(updatedInstance);
        if (this.events) {
          const failedStep = updatedInstance.getStepState(stepDef.stepId)!;
          this.events.publish(createWorkflowStepFailedEvent(updatedInstance, failedStep, traceId));
          if (updatedInstance.status === "FAILED") {
            this.events.publish(createWorkflowFailedEvent(updatedInstance, traceId));
          }
        }
        return {
          stepId: stepDef.stepId,
          success: false,
          assignedAgentId,
          error: { code: "BUDGET_EXHAUSTED", message: budgetMsg },
        };
      }
    }

    // 5. Build Step Input & Create Task
    const priorOutputs: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(updatedInstance.stepStates)) {
      if (s.status === "COMPLETED" && s.output) {
        priorOutputs[k] = s.output;
      }
    }

    const stepInput: Record<string, unknown> = {
      ...(instance.input ?? {}),
      ...(stepDef.inputTemplate ?? {}),
      _priorStepOutputs: priorOutputs,
      _workflow: {
        instanceId: instance.id,
        definitionId: definition.id,
        stepId: stepDef.stepId,
        stepName: stepDef.name,
      },
    };

    const taskId = crypto.randomUUID();
    const task = Task.create(taskId, instance.id, {
      agentId: assignedAgentId,
      input: stepInput,
    });

    // 6. Mark step DISPATCHED then RUNNING
    const executionId = crypto.randomUUID();
    updatedInstance = updatedInstance.markStepDispatched(stepDef.stepId, task.id, executionId);
    await this.instanceRepo.save(updatedInstance);
    updatedInstance = updatedInstance.markStepRunning(stepDef.stepId);
    await this.instanceRepo.save(updatedInstance);

    const runningStep = updatedInstance.getStepState(stepDef.stepId)!;
    if (this.events) {
      this.events.publish(createWorkflowStepStartedEvent(updatedInstance, runningStep, traceId));
    }

    // 7. Execute Task via Runtime (if runtime provided)
    if (this.runtime && this.agentQuery) {
      try {
        const agent = this.agentQuery.findById(assignedAgentId);
        const agentDef = agent && typeof (agent as any).toDefinition === "function"
          ? (agent as any).toDefinition()
          : {
              id: assignedAgentId,
              name: agent?.name ?? assignedAgentId,
              model: agent?.model ?? "mock-model",
              instructions: agent?.instructions ?? "Execute workflow step",
              tools: agent?.tools ?? [],
              memoryScope: agent?.memoryScope ?? "workflow",
            };

        const execResult = await this.runtime.execute(task, agentDef);

        if (execResult.execution.status === "COMPLETED" && execResult.task.result) {
          const output = execResult.task.result.output ?? {};
          updatedInstance = updatedInstance.markStepCompleted(stepDef.stepId, output);
          await this.instanceRepo.save(updatedInstance);

          const completedStep = updatedInstance.getStepState(stepDef.stepId)!;
          if (this.events) {
            this.events.publish(createWorkflowStepCompletedEvent(updatedInstance, completedStep, traceId));
          }

          // Step Verification Validation if rule configured
          if (this.verificationService && stepDef.verificationRule) {
            const vResult = await this.verificationService.verifyStepResult(
              {
                tenantId: instance.tenantId,
                workflowInstanceId: instance.id,
                stepId: stepDef.stepId,
                verifierPrincipalId: "system-verifier",
                verifierSource: "SYSTEM",
                producerPrincipalId: assignedAgentId,
                overrideOutput: output,
              },
              traceId
            );

            if (!vResult.isPass()) {
              return {
                stepId: stepDef.stepId,
                success: false,
                assignedAgentId,
                taskId: task.id,
                executionId: execResult.execution.id,
                error: {
                  code: `VERIFICATION_${vResult.verdict}`,
                  message: vResult.reason ?? `Verification yielded ${vResult.verdict}`,
                },
              };
            }
          }

          return {
            stepId: stepDef.stepId,
            success: true,
            assignedAgentId,
            taskId: task.id,
            executionId: execResult.execution.id,
            output,
          };
        } else {
          const failCode = execResult.task.error?.code ?? "STEP_EXECUTION_FAILED";
          const failMsg = execResult.task.error?.message ?? `Step execution status: ${execResult.execution.status}`;

          const failureResult = updatedInstance.markStepFailed(stepDef.stepId, failMsg);
          updatedInstance = failureResult.instance;
          await this.instanceRepo.save(updatedInstance);

          const failedStep = updatedInstance.getStepState(stepDef.stepId)!;
          if (this.events) {
            this.events.publish(createWorkflowStepFailedEvent(updatedInstance, failedStep, traceId));
            if (updatedInstance.status === "FAILED") {
              this.events.publish(createWorkflowFailedEvent(updatedInstance, traceId));
            }
          }

          return {
            stepId: stepDef.stepId,
            success: false,
            assignedAgentId,
            taskId: task.id,
            executionId: execResult.execution.id,
            error: { code: failCode, message: failMsg },
          };
        }
      } catch (err) {
        const errCode = "STEP_RUNTIME_ERROR";
        const errMsg = err instanceof Error ? err.message : "Step runtime failure";

        const failureResult = updatedInstance.markStepFailed(stepDef.stepId, errMsg);
        updatedInstance = failureResult.instance;
        await this.instanceRepo.save(updatedInstance);

        const failedStep = updatedInstance.getStepState(stepDef.stepId)!;
        if (this.events) {
          this.events.publish(createWorkflowStepFailedEvent(updatedInstance, failedStep, traceId));
          if (updatedInstance.status === "FAILED") {
            this.events.publish(createWorkflowFailedEvent(updatedInstance, traceId));
          }
        }

        return {
          stepId: stepDef.stepId,
          success: false,
          assignedAgentId,
          taskId: task.id,
          error: { code: errCode, message: errMsg },
        };
      }
    } else {
      // Synthetic completion if runtime is not injected
      const mockOutput = { result: `Step '${stepDef.name}' completed successfully`, stepId: stepDef.stepId };
      updatedInstance = updatedInstance.markStepCompleted(stepDef.stepId, mockOutput);
      await this.instanceRepo.save(updatedInstance);

      const completedStep = updatedInstance.getStepState(stepDef.stepId)!;
      if (this.events) {
        this.events.publish(createWorkflowStepCompletedEvent(updatedInstance, completedStep, traceId));
      }

      if (this.verificationService && stepDef.verificationRule) {
        const vResult = await this.verificationService.verifyStepResult(
          {
            tenantId: instance.tenantId,
            workflowInstanceId: instance.id,
            stepId: stepDef.stepId,
            verifierPrincipalId: "system-verifier",
            verifierSource: "SYSTEM",
            producerPrincipalId: assignedAgentId,
            overrideOutput: mockOutput,
          },
          traceId
        );

        if (!vResult.isPass()) {
          return {
            stepId: stepDef.stepId,
            success: false,
            assignedAgentId,
            taskId: task.id,
            error: {
              code: `VERIFICATION_${vResult.verdict}`,
              message: vResult.reason ?? `Verification yielded ${vResult.verdict}`,
            },
          };
        }
      }

      return {
        stepId: stepDef.stepId,
        success: true,
        assignedAgentId,
        taskId: task.id,
        output: mockOutput,
      };
    }
  }

  async pauseWorkflow(
    instanceId: string,
    tenantId: string,
    reason?: string,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowInstance> {
    const existing = await this.getInstance(instanceId, tenantId);
    const paused = existing.pause(reason);
    const saved = await this.instanceRepo.save(paused);
    return saved;
  }

  async resumeWorkflow(
    instanceId: string,
    tenantId: string,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowInstance> {
    const existing = await this.getInstance(instanceId, tenantId);
    const resumed = existing.resume();
    const saved = await this.instanceRepo.save(resumed);
    return saved;
  }

  async cancelWorkflow(
    instanceId: string,
    tenantId: string,
    reason?: string,
    traceId: string = crypto.randomUUID()
  ): Promise<WorkflowInstance> {
    const existing = await this.getInstance(instanceId, tenantId);
    const cancelled = existing.cancel(reason);
    const saved = await this.instanceRepo.save(cancelled);
    if (this.events) {
      this.events.publish(createWorkflowCancelledEvent(saved, reason, traceId));
    }
    return saved;
  }

  async getInstance(instanceId: string, tenantId: string): Promise<WorkflowInstance> {
    if (!instanceId || !instanceId.trim()) {
      throw new WorkflowValidationError("instanceId is required to get a workflow instance");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new WorkflowValidationError("tenantId is required to get a workflow instance");
    }
    const instance = await this.instanceRepo.findById(instanceId, tenantId);
    if (!instance) {
      throw new WorkflowInstanceNotFoundError(instanceId);
    }
    return instance;
  }

  async listInstances(
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly WorkflowInstance[]> {
    if (!tenantId || !tenantId.trim()) {
      throw new WorkflowValidationError("tenantId is required to list workflow instances");
    }
    return this.instanceRepo.findByTenantId(tenantId, limit, offset);
  }

  async listInstancesByDefinition(
    definitionId: string,
    tenantId: string
  ): Promise<readonly WorkflowInstance[]> {
    if (!definitionId || !definitionId.trim()) {
      throw new WorkflowValidationError("definitionId is required to list instances by definition");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new WorkflowValidationError("tenantId is required to list instances by definition");
    }
    return this.instanceRepo.findByDefinitionId(definitionId, tenantId);
  }
}
