import { VerificationResult } from "../../domain/workflow/verification-result.js";

export interface VerificationResultRepositoryPort {
  save(verification: VerificationResult): Promise<VerificationResult>;
  findById(id: string, tenantId: string): Promise<VerificationResult | null>;
  findByInstanceId(instanceId: string, tenantId: string): Promise<readonly VerificationResult[]>;
  findByExecutionId(executionId: string, tenantId: string): Promise<readonly VerificationResult[]>;
  findByStepId(instanceId: string, stepId: string, tenantId: string): Promise<readonly VerificationResult[]>;
  findByTenantId(tenantId: string, limit?: number, offset?: number): Promise<readonly VerificationResult[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
