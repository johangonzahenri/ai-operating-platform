import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import {
  VerificationResult,
  VerificationVerdict,
  VerifierSource,
  WorkflowStepVerificationRule,
} from "../../domain/workflow/verification-result.js";
import {
  VerificationValidationError,
  VerificationNotFoundError,
  SelfVerificationError,
  VerificationPolicyDeniedError,
} from "../../domain/workflow/verification-errors.js";
import {
  WorkflowInstanceNotFoundError,
  WorkflowNotFoundError,
  WorkflowValidationError as DomainWorkflowValidationError,
} from "../../domain/workflow/workflow-errors.js";
import { VerificationResultRepositoryPort } from "../ports/verification-repository-port.js";
import {
  WorkflowInstanceRepositoryPort,
  WorkflowDefinitionRepositoryPort,
} from "../ports/workflow-repository-port.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import { TeamResourceBudgetService } from "../organization/team-resource-budget-service.js";
import { DeterministicVerifier } from "./deterministic-verifier.js";
import {
  createWorkflowStepVerificationRequestedEvent,
  createWorkflowStepVerificationCompletedEvent,
  createWorkflowStepVerificationFailedEvent,
} from "../../domain/workflow/workflow-events.js";

export interface VerifyStepParams {
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly stepId: string;
  readonly verifierPrincipalId: string;
  readonly verifierSource?: VerifierSource | undefined;
  readonly producerPrincipalId?: string | undefined;
  readonly explicitRule?: WorkflowStepVerificationRule | undefined;
  readonly overrideOutput?: Readonly<Record<string, unknown>> | undefined;
}

export interface WorkflowVerificationServiceDeps {
  readonly verificationRepo: VerificationResultRepositoryPort;
  readonly instanceRepo: WorkflowInstanceRepositoryPort;
  readonly defRepo: WorkflowDefinitionRepositoryPort;
  readonly policy?: PolicyGateway | undefined;
  readonly budgetService?: TeamResourceBudgetService | undefined;
  readonly events?: EventPublisher | undefined;
}

export class WorkflowVerificationService {
  private readonly verificationRepo: VerificationResultRepositoryPort;
  private readonly instanceRepo: WorkflowInstanceRepositoryPort;
  private readonly defRepo: WorkflowDefinitionRepositoryPort;
  private readonly policy?: PolicyGateway | undefined;
  private readonly budgetService?: TeamResourceBudgetService | undefined;
  private readonly events?: EventPublisher | undefined;

  constructor(deps: WorkflowVerificationServiceDeps) {
    this.verificationRepo = deps.verificationRepo;
    this.instanceRepo = deps.instanceRepo;
    this.defRepo = deps.defRepo;
    this.policy = deps.policy;
    this.budgetService = deps.budgetService;
    this.events = deps.events;
  }

  async verifyStepResult(
    params: VerifyStepParams,
    traceId: string = crypto.randomUUID()
  ): Promise<VerificationResult> {
    if (!params.tenantId || !params.tenantId.trim()) {
      throw new VerificationValidationError("tenantId is required for verification");
    }
    if (!params.workflowInstanceId || !params.workflowInstanceId.trim()) {
      throw new VerificationValidationError("workflowInstanceId is required for verification");
    }
    if (!params.stepId || !params.stepId.trim()) {
      throw new VerificationValidationError("stepId is required for verification");
    }
    if (!params.verifierPrincipalId || !params.verifierPrincipalId.trim()) {
      throw new VerificationValidationError("verifierPrincipalId is required for verification");
    }

    // 1. Load Workflow Instance
    const instance = await this.instanceRepo.findById(params.workflowInstanceId, params.tenantId);
    if (!instance) {
      throw new WorkflowInstanceNotFoundError(params.workflowInstanceId);
    }
    if (instance.tenantId !== params.tenantId) {
      throw new VerificationValidationError("Tenant boundary violation");
    }

    const stepState = instance.getStepState(params.stepId);
    if (!stepState) {
      throw new DomainWorkflowValidationError(
        `Step '${params.stepId}' not found on instance '${instance.id}'`
      );
    }

    // 2. Validate Producer !== Verifier (Separation of Producer and Verifier)
    const producerPrincipalId = params.producerPrincipalId ?? stepState.assignedAgentId;
    if (
      producerPrincipalId &&
      producerPrincipalId.trim() &&
      producerPrincipalId.trim() === params.verifierPrincipalId.trim()
    ) {
      throw new SelfVerificationError(producerPrincipalId, params.verifierPrincipalId);
    }

    // 3. Load Workflow Step Definition Rule
    const definition = await this.defRepo.findById(instance.workflowDefinitionId, params.tenantId);
    if (!definition) {
      throw new WorkflowNotFoundError(instance.workflowDefinitionId);
    }
    const stepDef = definition.steps.find((s) => s.stepId === params.stepId);
    const rule = params.explicitRule ?? stepDef?.verificationRule;

    const verificationId = crypto.randomUUID();

    if (this.events) {
      this.events.publish(
        createWorkflowStepVerificationRequestedEvent(
          instance,
          params.stepId,
          verificationId,
          params.verifierPrincipalId,
          traceId
        )
      );
    }

    // 4. Evaluate PolicyGateway (fail-closed)
    if (this.policy) {
      const policyDecision = await this.policy.evaluate({
        traceId,
        operationId: `${instance.id}:${params.stepId}:verify`,
        operationType: "MODEL",
        resourceId: params.stepId,
        agentId: params.verifierPrincipalId,
        action: "workflow.step.verify",
        metadata: {
          tenantId: params.tenantId,
          workflowInstanceId: instance.id,
          stepId: params.stepId,
          verifierPrincipalId: params.verifierPrincipalId,
        },
      });

      if (!policyDecision.allowed) {
        throw new VerificationPolicyDeniedError(
          policyDecision.reason ?? "Verification execution denied by policy"
        );
      }
    }

    // 5. Evaluate Deterministic Verifier
    const targetOutput = params.overrideOutput ?? stepState.output;
    const outcome = DeterministicVerifier.evaluate(targetOutput, rule);

    // 6. Create & Persist VerificationResult Aggregate
    const verification = VerificationResult.create({
      id: verificationId,
      tenantId: params.tenantId,
      workflowId: instance.workflowDefinitionId,
      workflowInstanceId: instance.id,
      workflowStepId: params.stepId,
      taskId: stepState.taskId,
      executionId: stepState.executionId,
      producerPrincipalId,
      verifierPrincipalId: params.verifierPrincipalId,
      verifierSource: params.verifierSource ?? "SYSTEM",
      verdict: outcome.verdict,
      method: outcome.method,
      evidence: outcome.evidence,
      reason: outcome.reason,
    });

    await this.verificationRepo.save(verification);

    // 7. Mutate WorkflowInstance with Verification Result
    let updatedInstance = instance;
    if (outcome.verdict === "PASS") {
      updatedInstance = updatedInstance.markStepVerified(
        params.stepId,
        verification.id,
        "PASS",
        targetOutput
      );
    } else {
      const failRes = updatedInstance.markStepVerificationFailed(
        params.stepId,
        verification.id,
        outcome.verdict,
        outcome.reason ?? `Step verification yielded ${outcome.verdict}`
      );
      updatedInstance = failRes.instance;
    }

    await this.instanceRepo.save(updatedInstance);

    // 8. Publish Domain Events
    if (this.events) {
      this.events.publish(
        createWorkflowStepVerificationCompletedEvent(updatedInstance, verification, traceId)
      );
      if (!verification.isPass()) {
        this.events.publish(
          createWorkflowStepVerificationFailedEvent(
            updatedInstance,
            params.stepId,
            verification.id,
            outcome.verdict,
            outcome.reason ?? "Verification failed",
            traceId
          )
        );
      }
    }

    return verification;
  }

  async getVerification(id: string, tenantId: string): Promise<VerificationResult> {
    if (!id || !id.trim()) {
      throw new VerificationValidationError("id is required to get a verification");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new VerificationValidationError("tenantId is required to get a verification");
    }
    const res = await this.verificationRepo.findById(id, tenantId);
    if (!res) {
      throw new VerificationNotFoundError(id);
    }
    return res;
  }

  async listVerificationsByInstance(
    instanceId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    if (!instanceId || !instanceId.trim()) {
      throw new VerificationValidationError("instanceId is required");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new VerificationValidationError("tenantId is required");
    }
    return this.verificationRepo.findByInstanceId(instanceId, tenantId);
  }

  async listVerificationsByExecution(
    executionId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    if (!executionId || !executionId.trim()) {
      throw new VerificationValidationError("executionId is required");
    }
    if (!tenantId || !tenantId.trim()) {
      throw new VerificationValidationError("tenantId is required");
    }
    return this.verificationRepo.findByExecutionId(executionId, tenantId);
  }

  async listVerifications(
    tenantId: string,
    limit?: number,
    offset?: number
  ): Promise<readonly VerificationResult[]> {
    if (!tenantId || !tenantId.trim()) {
      throw new VerificationValidationError("tenantId is required");
    }
    return this.verificationRepo.findByTenantId(tenantId, limit, offset);
  }
}
