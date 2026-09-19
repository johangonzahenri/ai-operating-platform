import { VerificationResult } from "../../../domain/workflow/verification-result.js";
import { VerificationConcurrencyConflictError } from "../../../domain/workflow/verification-errors.js";
import { VerificationResultRepositoryPort } from "../../../application/ports/verification-repository-port.js";

export class InMemoryVerificationResultRepository implements VerificationResultRepositoryPort {
  private readonly items = new Map<string, VerificationResult>();

  private makeKey(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  async save(verification: VerificationResult): Promise<VerificationResult> {
    const key = this.makeKey(verification.id, verification.tenantId);
    const existing = this.items.get(key);

    if (existing) {
      const expectedVersion = verification.version - 1;
      if (existing.version !== expectedVersion) {
        throw new VerificationConcurrencyConflictError(
          verification.id,
          existing.version,
          verification.version
        );
      }
    }

    this.items.set(key, verification);
    return verification;
  }

  async findById(id: string, tenantId: string): Promise<VerificationResult | null> {
    const key = this.makeKey(id, tenantId);
    return this.items.get(key) ?? null;
  }

  async findByInstanceId(
    instanceId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.workflowInstanceId === instanceId) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.verifiedAt.getTime() - b.verifiedAt.getTime());
  }

  async findByExecutionId(
    executionId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.executionId === executionId) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.verifiedAt.getTime() - b.verifiedAt.getTime());
  }

  async findByStepId(
    instanceId: string,
    stepId: string,
    tenantId: string
  ): Promise<readonly VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const item of this.items.values()) {
      if (
        item.tenantId === tenantId &&
        item.workflowInstanceId === instanceId &&
        item.workflowStepId === stepId
      ) {
        results.push(item);
      }
    }
    return results.sort((a, b) => a.verifiedAt.getTime() - b.verifiedAt.getTime());
  }

  async findByTenantId(
    tenantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<readonly VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId) {
        results.push(item);
      }
    }
    results.sort((a, b) => b.verifiedAt.getTime() - a.verifiedAt.getTime());
    return results.slice(offset, offset + limit);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const key = this.makeKey(id, tenantId);
    return this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}
