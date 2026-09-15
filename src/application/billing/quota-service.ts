import { Tenant, DEFAULT_PLAN_LIMITS } from "../../domain/tenant/tenant.js";
import { QuotaMetric, QuotaCheckResult, QuotaExceededError } from "../../domain/billing/quota.js";

export class QuotaService {
  private readonly usageRecords: Map<string, number> = new Map(); // key: `${tenantId}:${metric}:${period}`

  private getPeriodKey(date: Date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  private getLimitForMetric(tenant: Tenant, metric: QuotaMetric): number {
    switch (metric) {
      case "tasks":
        return tenant.limits.maxTasksPerMonth;
      case "executions":
        return tenant.limits.maxExecutionsPerMonth;
      case "tokens":
        return tenant.limits.maxTokensPerMonth;
      case "storage_mb":
        return tenant.limits.maxStorageMb;
      case "webhooks":
        return tenant.plan === "FREE" ? 100 : tenant.plan === "PRO" ? 5000 : 100000;
      default:
        return 1000;
    }
  }

  getCurrentUsage(tenantId: string, metric: QuotaMetric, period: string = this.getPeriodKey()): number {
    const key = `${tenantId}:${metric}:${period}`;
    return this.usageRecords.get(key) ?? 0;
  }

  checkQuota(tenant: Tenant, metric: QuotaMetric, requestedAmount: number = 1): QuotaCheckResult {
    const period = this.getPeriodKey();
    const currentUsage = this.getCurrentUsage(tenant.id, metric, period);
    const limit = this.getLimitForMetric(tenant, metric);
    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage + requestedAmount <= limit;

    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
    nextMonth.setUTCHours(0, 0, 0, 0);

    return {
      allowed,
      tenantId: tenant.id,
      metric,
      currentUsage,
      requestedAmount,
      limit,
      remaining,
      resetAt: nextMonth.toISOString(),
    };
  }

  consumeQuota(tenant: Tenant, metric: QuotaMetric, amount: number = 1): void {
    const check = this.checkQuota(tenant, metric, amount);
    if (!check.allowed) {
      throw new QuotaExceededError(tenant.id, metric, check.currentUsage, check.limit);
    }
    const period = this.getPeriodKey();
    const key = `${tenant.id}:${metric}:${period}`;
    this.usageRecords.set(key, check.currentUsage + amount);
  }

  resetUsage(tenantId: string, metric: QuotaMetric): void {
    const period = this.getPeriodKey();
    const key = `${tenantId}:${metric}:${period}`;
    this.usageRecords.delete(key);
  }
}
