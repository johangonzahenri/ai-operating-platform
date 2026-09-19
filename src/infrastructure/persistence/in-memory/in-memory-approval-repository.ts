import { ApprovalRequest } from "../../../domain/workflow/approval-request.js";
import { ApprovalConcurrencyConflictError } from "../../../domain/workflow/approval-errors.js";
import {
  ApprovalFilterCriteria,
  ApprovalRequestRepositoryPort,
} from "../../../application/ports/approval-repository-port.js";

export class InMemoryApprovalRequestRepository implements ApprovalRequestRepositoryPort {
  private readonly items = new Map<string, ApprovalRequest>();

  async save(approval: ApprovalRequest): Promise<ApprovalRequest> {
    const existing = this.items.get(approval.id);
    if (existing) {
      if (existing.tenantId !== approval.tenantId) {
        throw new ApprovalConcurrencyConflictError(approval.id, approval.version, existing.version);
      }
      if (existing.version !== approval.version && existing.version !== approval.version - 1) {
        throw new ApprovalConcurrencyConflictError(approval.id, approval.version - 1, existing.version);
      }
    }
    this.items.set(approval.id, approval);
    return approval;
  }

  async findById(id: string, tenantId: string): Promise<ApprovalRequest | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return item;
  }

  async findByInstanceId(instanceId: string, tenantId: string): Promise<readonly ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.workflowInstanceId === instanceId) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByStepId(
    instanceId: string,
    stepId: string,
    tenantId: string
  ): Promise<readonly ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const item of this.items.values()) {
      if (
        item.tenantId === tenantId &&
        item.workflowInstanceId === instanceId &&
        item.workflowStepId === stepId
      ) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByExecutionId(executionId: string, tenantId: string): Promise<readonly ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.executionId === executionId) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findAll(
    criteria: ApprovalFilterCriteria,
    limit = 50,
    offset = 0
  ): Promise<readonly ApprovalRequest[]> {
    const filtered: ApprovalRequest[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId !== criteria.tenantId) continue;
      if (criteria.workflowId && item.workflowId !== criteria.workflowId) continue;
      if (criteria.workflowInstanceId && item.workflowInstanceId !== criteria.workflowInstanceId) continue;
      if (criteria.workflowStepId && item.workflowStepId !== criteria.workflowStepId) continue;
      if (criteria.status && item.status !== criteria.status) continue;
      if (criteria.requesterPrincipalId && item.requesterPrincipalId !== criteria.requesterPrincipalId) continue;
      if (criteria.reviewerPrincipalId && item.reviewerPrincipalId !== criteria.reviewerPrincipalId) continue;
      if (criteria.approverPrincipalId && item.approverPrincipalId !== criteria.approverPrincipalId) continue;
      filtered.push(item);
    }

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return filtered.slice(offset, offset + limit);
  }

  async findPendingExpired(tenantId: string, now: Date = new Date()): Promise<readonly ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const item of this.items.values()) {
      if (
        item.tenantId === tenantId &&
        item.isPending() &&
        item.expiresAt &&
        now.getTime() > item.expiresAt.getTime()
      ) {
        results.push(item);
      }
    }
    return results;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) {
      return false;
    }
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }
}
