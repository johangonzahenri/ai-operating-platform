import { ApprovalRequest, ApprovalStatus } from "../../domain/workflow/approval-request.js";

export interface ApprovalFilterCriteria {
  readonly tenantId: string;
  readonly workflowId?: string | undefined;
  readonly workflowInstanceId?: string | undefined;
  readonly workflowStepId?: string | undefined;
  readonly status?: ApprovalStatus | undefined;
  readonly requesterPrincipalId?: string | undefined;
  readonly reviewerPrincipalId?: string | undefined;
  readonly approverPrincipalId?: string | undefined;
}

export interface ApprovalRequestRepositoryPort {
  save(approval: ApprovalRequest): Promise<ApprovalRequest>;
  findById(id: string, tenantId: string): Promise<ApprovalRequest | null>;
  findByInstanceId(instanceId: string, tenantId: string): Promise<readonly ApprovalRequest[]>;
  findByStepId(instanceId: string, stepId: string, tenantId: string): Promise<readonly ApprovalRequest[]>;
  findByExecutionId(executionId: string, tenantId: string): Promise<readonly ApprovalRequest[]>;
  findAll(criteria: ApprovalFilterCriteria, limit?: number, offset?: number): Promise<readonly ApprovalRequest[]>;
  findPendingExpired(tenantId: string, now?: Date): Promise<readonly ApprovalRequest[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
