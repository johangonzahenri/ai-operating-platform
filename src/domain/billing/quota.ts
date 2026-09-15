export type QuotaMetric = "tasks" | "executions" | "tokens" | "storage_mb" | "webhooks";

export interface QuotaCheckResult {
  readonly allowed: boolean;
  readonly tenantId: string;
  readonly metric: QuotaMetric;
  readonly currentUsage: number;
  readonly requestedAmount: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  constructor(
    readonly tenantId: string,
    readonly metric: QuotaMetric,
    readonly currentUsage: number,
    readonly limit: number
  ) {
    super(`Quota exceeded for tenant '${tenantId}' on metric '${metric}': current usage ${currentUsage} / limit ${limit}`);
    this.name = "QuotaExceededError";
  }
}
