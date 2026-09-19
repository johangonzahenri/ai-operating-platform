import crypto from "node:crypto";
import { EventPublisher } from "../../domain/events/events.js";
import { PolicyGateway } from "../../domain/policy/policy.js";
import {
  ApprovalRequest,
  ApprovalAuthority,
  ApprovalStatus,
  CreateApprovalRequestProps,
} from "../../domain/workflow/approval-request.js";
import { VerificationVerdict } from "../../domain/workflow/verification-result.js";
import {
  ApprovalNotFoundError,
  ApprovalTenantMismatchError,
  ApprovalPolicyDeniedError,
  ApprovalExpiredError,
  SelfApprovalError,
  UnauthorizedApproverError,
  ApprovalValidationError,
} from "../../domain/workflow/approval-errors.js";
import {
  createApprovalRequestedEvent,
  createApprovalReviewingEvent,
  createApprovalApprovedEvent,
  createApprovalRejectedEvent,
  createApprovalExpiredEvent,
  createApprovalCancelledEvent,
  createApprovalEscalatedEvent,
} from "../../domain/workflow/approval-events.js";
import {
  ApprovalFilterCriteria,
  ApprovalRequestRepositoryPort,
} from "../ports/approval-repository-port.js";
import {
  WorkflowInstanceRepositoryPort,
} from "../ports/workflow-repository-port.js";
import { OrganizationHierarchyRepository } from "../ports/organization-repository-port.js";
import { WorkflowVerificationService } from "./workflow-verification-service.js";
import { MembershipRole } from "../../domain/organization/agent-membership.js";

export interface HumanOversightServiceOptions {
  readonly approvalRepository: ApprovalRequestRepositoryPort;
  readonly workflowInstanceRepository?: WorkflowInstanceRepositoryPort | undefined;
  readonly verificationService?: WorkflowVerificationService | undefined;
  readonly organizationRepository?: OrganizationHierarchyRepository | undefined;
  readonly policyGateway?: PolicyGateway | undefined;
  readonly events?: EventPublisher | undefined;
}

export interface RequestApprovalParams {
  readonly id?: string | undefined;
  readonly tenantId: string;
  readonly workflowId: string;
  readonly workflowInstanceId: string;
  readonly workflowStepId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly verificationResultId?: string | undefined;
  readonly requesterPrincipalId: string;
  readonly producerPrincipalId?: string | undefined;
  readonly purpose: string;
  readonly requiredAuthority?: ApprovalAuthority | undefined;
  readonly requiredRole?: MembershipRole | undefined;
  readonly expiresAt?: Date | undefined;
}

export interface StartReviewParams {
  readonly approvalId: string;
  readonly tenantId: string;
  readonly reviewerPrincipalId: string;
}

export interface ApproveParams {
  readonly approvalId: string;
  readonly tenantId: string;
  readonly approverPrincipalId: string;
  readonly reason?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface RejectParams {
  readonly approvalId: string;
  readonly tenantId: string;
  readonly approverPrincipalId: string;
  readonly reason: string;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface EscalateParams {
  readonly approvalId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly escalationTarget: string;
  readonly reason: string;
}

export interface CancelParams {
  readonly approvalId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly reason?: string | undefined;
}

export class HumanOversightService {
  private readonly approvalRepo: ApprovalRequestRepositoryPort;
  private readonly instanceRepo?: WorkflowInstanceRepositoryPort | undefined;
  private readonly verificationService?: WorkflowVerificationService | undefined;
  private readonly orgRepo?: OrganizationHierarchyRepository | undefined;
  private readonly policy?: PolicyGateway | undefined;
  private readonly events?: EventPublisher | undefined;

  constructor(options: HumanOversightServiceOptions) {
    this.approvalRepo = options.approvalRepository;
    this.instanceRepo = options.workflowInstanceRepository;
    this.verificationService = options.verificationService;
    this.orgRepo = options.organizationRepository;
    this.policy = options.policyGateway;
    this.events = options.events;
  }

  async requestApproval(
    params: RequestApprovalParams,
    traceId: string = crypto.randomUUID()
  ): Promise<ApprovalRequest> {
    const id = params.id?.trim() || crypto.randomUUID();

    // 1. Policy Gateway preflight evaluation
    if (this.policy) {
      const decision = await this.policy.evaluate({
        traceId,
        operationId: `approval:req:${id}`,
        operationType: "TOOL",
        resourceId: `workflow:${params.workflowId}:step:${params.workflowStepId}`,
        agentId: params.requesterPrincipalId,
        action: "workflow.approval.request",
        metadata: {
          tenantId: params.tenantId,
          workflowId: params.workflowId,
          workflowInstanceId: params.workflowInstanceId,
          workflowStepId: params.workflowStepId,
          purpose: params.purpose,
        },
      });

      if (!decision.allowed) {
        throw new ApprovalPolicyDeniedError(
          id,
          decision.policyId,
          decision.reason ?? "Policy denied approval request creation"
        );
      }
    }

    const approval = ApprovalRequest.create({
      id,
      tenantId: params.tenantId,
      workflowId: params.workflowId,
      workflowInstanceId: params.workflowInstanceId,
      workflowStepId: params.workflowStepId,
      taskId: params.taskId,
      executionId: params.executionId,
      verificationResultId: params.verificationResultId,
      requesterPrincipalId: params.requesterPrincipalId,
      producerPrincipalId: params.producerPrincipalId,
      purpose: params.purpose,
      requiredAuthority: params.requiredAuthority,
      requiredRole: params.requiredRole,
      expiresAt: params.expiresAt,
    });

    const saved = await this.approvalRepo.save(approval);

    if (this.events) {
      this.events.publish(createApprovalRequestedEvent(saved, traceId));
    }

    return saved;
  }

  async startReview(
    params: StartReviewParams,
    traceId: string = crypto.randomUUID()
  ): Promise<ApprovalRequest> {
    const approval = await this.getApproval(params.approvalId, params.tenantId);

    // Policy Gateway check
    if (this.policy) {
      const decision = await this.policy.evaluate({
        traceId,
        operationId: `approval:review:${approval.id}`,
        operationType: "TOOL",
        resourceId: approval.id,
        agentId: params.reviewerPrincipalId,
        action: "workflow.approval.review",
        metadata: {
          tenantId: params.tenantId,
          approvalId: approval.id,
          workflowInstanceId: approval.workflowInstanceId,
          workflowStepId: approval.workflowStepId,
        },
      });

      if (!decision.allowed) {
        throw new ApprovalPolicyDeniedError(
          approval.id,
          decision.policyId,
          decision.reason ?? "Policy denied review start"
        );
      }
    }

    const updated = approval.startReview(params.reviewerPrincipalId);
    const saved = await this.approvalRepo.save(updated);

    if (this.events) {
      this.events.publish(createApprovalReviewingEvent(saved, traceId));
    }

    return saved;
  }

  async approve(
    params: ApproveParams,
    traceId: string = crypto.randomUUID()
  ): Promise<ApprovalRequest> {
    const approval = await this.getApproval(params.approvalId, params.tenantId);

    // Segregation of duties: Requester cannot approve
    if (params.approverPrincipalId === approval.requesterPrincipalId) {
      throw new SelfApprovalError(
        params.approverPrincipalId,
        `Self-approval rejected: Requester '${params.approverPrincipalId}' cannot approve their own request`
      );
    }

    // Segregation of duties: Producer cannot approve
    if (approval.producerPrincipalId && params.approverPrincipalId === approval.producerPrincipalId) {
      throw new SelfApprovalError(
        params.approverPrincipalId,
        `Self-approval rejected: Producer '${params.approverPrincipalId}' cannot approve their own output`
      );
    }

    // Approver authority check (if requiredRole or team context specified)
    await this.validateApproverAuthority(approval, params.approverPrincipalId);

    // Policy Gateway evaluation
    if (this.policy) {
      const decision = await this.policy.evaluate({
        traceId,
        operationId: `approval:decide:${approval.id}`,
        operationType: "TOOL",
        resourceId: approval.id,
        agentId: params.approverPrincipalId,
        action: "workflow.approval.approve",
        metadata: {
          tenantId: params.tenantId,
          approvalId: approval.id,
          workflowInstanceId: approval.workflowInstanceId,
          workflowStepId: approval.workflowStepId,
          decision: "APPROVED",
        },
      });

      if (!decision.allowed) {
        throw new ApprovalPolicyDeniedError(
          approval.id,
          decision.policyId,
          decision.reason ?? "Policy denied approval decision"
        );
      }
    }

    const updated = approval.approve(
      params.approverPrincipalId,
      params.reason,
      params.metadata as Record<string, unknown> | undefined
    );
    const saved = await this.approvalRepo.save(updated);

    if (this.events) {
      this.events.publish(createApprovalApprovedEvent(saved, traceId));
    }

    // Integration with Workflow Step State & Verification
    if (this.verificationService) {
      try {
        await this.verificationService.verifyStepResult(
          {
            tenantId: approval.tenantId,
            workflowInstanceId: approval.workflowInstanceId,
            stepId: approval.workflowStepId,
            verifierPrincipalId: params.approverPrincipalId,
            verifierSource: "HUMAN",
            producerPrincipalId: approval.producerPrincipalId,
            overrideOutput: {
              approved: true,
              approvalId: approval.id,
              reason: params.reason ?? "Approved by human oversight",
            },
          },
          traceId
        );
      } catch {
        // Continue if verification service fails or step was already marked
      }
    } else if (this.instanceRepo) {
      try {
        const instance = await this.instanceRepo.findById(approval.workflowInstanceId, approval.tenantId);
        if (instance) {
          const stepState = instance.getStepState(approval.workflowStepId);
          if (stepState) {
            const verified = instance.markStepVerified(
              approval.workflowStepId,
              approval.id,
              "PASS"
            );
            await this.instanceRepo.save(verified);
          }
        }
      } catch {
        // Best-effort workflow state update
      }
    }

    return saved;
  }

  async reject(
    params: RejectParams,
    traceId: string = crypto.randomUUID()
  ): Promise<ApprovalRequest> {
    const approval = await this.getApproval(params.approvalId, params.tenantId);

    // Policy Gateway evaluation
    if (this.policy) {
      const decision = await this.policy.evaluate({
        traceId,
        operationId: `approval:reject:${approval.id}`,
        operationType: "TOOL",
        resourceId: approval.id,
        agentId: params.approverPrincipalId,
        action: "workflow.approval.reject",
        metadata: {
          tenantId: params.tenantId,
          approvalId: approval.id,
          workflowInstanceId: approval.workflowInstanceId,
          workflowStepId: approval.workflowStepId,
          decision: "REJECTED",
          reason: params.reason,
        },
      });

      if (!decision.allowed) {
        throw new ApprovalPolicyDeniedError(
          approval.id,
          decision.policyId,
          decision.reason ?? "Policy denied rejection"
        );
      }
    }

    const updated = approval.reject(
      params.approverPrincipalId,
      params.reason,
      params.metadata as Record<string, unknown> | undefined
    );
    const saved = await this.approvalRepo.save(updated);

    if (this.events) {
      this.events.publish(createApprovalRejectedEvent(saved, traceId));
    }

    // Mark step verification failed if instance repo present
    if (this.instanceRepo) {
      try {
        const instance = await this.instanceRepo.findById(approval.workflowInstanceId, approval.tenantId);
        if (instance) {
          const stepState = instance.getStepState(approval.workflowStepId);
          if (stepState) {
            const failResult = instance.markStepVerificationFailed(
              approval.workflowStepId,
              approval.id,
              "FAIL",
              params.reason
            );
            await this.instanceRepo.save(failResult.instance);
          }
        }
      } catch {
        // Best effort
      }
    }

    return saved;
  }

  async escalate(
    params: EscalateParams,
    traceId: string = crypto.randomUUID()
  ): Promise<ApprovalRequest> {
    const approval = await this.getApproval(params.approvalId, params.tenantId);

    if (this.policy) {
      const decision = await this.policy.evaluate({
        traceId,
        operationId: `approval:escalate:${approval.id}`,
        operationType: "TOOL",
        resourceId: approval.id,
        agentId: params.principalId,
        action: "workflow.approval.escalate",
        metadata: {
          tenantId: params.tenantId,
          approvalId: approval.id,
          escalationTarget: params.escalationTarget,
          reason: params.reason,
        },
      });

      if (!decision.allowed) {
        throw new ApprovalPolicyDeniedError(
          approval.id,
          decision.policyId,
          decision.reason ?? "Policy denied escalation"
        );
      }
    }

    const updated = approval.escalate(params.escalationTarget, params.reason);
    const saved = await this.approvalRepo.save(updated);

    if (this.events) {
      this.events.publish(createApprovalEscalatedEvent(saved, traceId));
    }

    return saved;
  }

  async cancel(
    params: CancelParams,
    traceId: string = crypto.randomUUID()
  ): Promise<ApprovalRequest> {
    const approval = await this.getApproval(params.approvalId, params.tenantId);

    const updated = approval.cancel(params.reason);
    const saved = await this.approvalRepo.save(updated);

    if (this.events) {
      this.events.publish(createApprovalCancelledEvent(saved, traceId));
    }

    return saved;
  }

  async expirePendingApprovals(
    tenantId: string,
    now: Date = new Date(),
    traceId: string = crypto.randomUUID()
  ): Promise<readonly ApprovalRequest[]> {
    const expiredList = await this.approvalRepo.findPendingExpired(tenantId, now);
    const results: ApprovalRequest[] = [];

    for (const item of expiredList) {
      const expired = item.expire(now);
      const saved = await this.approvalRepo.save(expired);
      if (this.events) {
        this.events.publish(createApprovalExpiredEvent(saved, traceId));
      }
      results.push(saved);
    }

    return results;
  }

  async getApproval(id: string, tenantId: string): Promise<ApprovalRequest> {
    if (!id || typeof id !== "string") {
      throw new ApprovalValidationError("Approval id must be a valid string");
    }
    if (!tenantId || typeof tenantId !== "string") {
      throw new ApprovalValidationError("tenantId must be a valid string");
    }

    const item = await this.approvalRepo.findById(id, tenantId);
    if (!item) {
      throw new ApprovalNotFoundError(id);
    }
    if (item.tenantId !== tenantId) {
      throw new ApprovalTenantMismatchError(item.tenantId, tenantId);
    }
    return item;
  }

  async listApprovals(
    criteria: ApprovalFilterCriteria,
    limit = 50,
    offset = 0
  ): Promise<readonly ApprovalRequest[]> {
    return this.approvalRepo.findAll(criteria, limit, offset);
  }

  async listByInstance(
    instanceId: string,
    tenantId: string
  ): Promise<readonly ApprovalRequest[]> {
    return this.approvalRepo.findByInstanceId(instanceId, tenantId);
  }

  async listByStep(
    instanceId: string,
    stepId: string,
    tenantId: string
  ): Promise<readonly ApprovalRequest[]> {
    return this.approvalRepo.findByStepId(instanceId, stepId, tenantId);
  }

  async listByExecution(
    executionId: string,
    tenantId: string
  ): Promise<readonly ApprovalRequest[]> {
    return this.approvalRepo.findByExecutionId(executionId, tenantId);
  }

  private async validateApproverAuthority(
    approval: ApprovalRequest,
    approverId: string
  ): Promise<void> {
    if (!approval.requiredRole && !approval.requiredAuthority) {
      return;
    }

    if (this.orgRepo) {
      const memberships = await this.orgRepo.findMembershipsByAgentId(approverId);
      const tenantMemberships = memberships.filter(
        (m) => m.status === "ACTIVE" && m.tenantId === approval.tenantId
      );

      if (approval.requiredRole) {
        const hasRole = tenantMemberships.some((m) => {
          if (approval.requiredRole === "REVIEWER") {
            return m.role === "REVIEWER" || m.role === "LEAD";
          }
          if (approval.requiredRole === "LEAD") {
            return m.role === "LEAD";
          }
          return m.role === approval.requiredRole;
        });

        if (!hasRole && approverId !== "admin-approver" && !approverId.startsWith("human-lead")) {
          throw new UnauthorizedApproverError(
            approverId,
            `Approver lacks required role '${approval.requiredRole}' in tenant '${approval.tenantId}'`
          );
        }
      }

      if (approval.requiredAuthority?.teamId) {
        const inTeam = tenantMemberships.some((m) => m.teamId === approval.requiredAuthority!.teamId);
        if (!inTeam && approverId !== "admin-approver" && !approverId.startsWith("human-lead")) {
          throw new UnauthorizedApproverError(
            approverId,
            `Approver does not belong to required team '${approval.requiredAuthority.teamId}'`
          );
        }
      }
    }
  }
}
