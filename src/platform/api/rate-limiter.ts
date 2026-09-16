/**
 * Server-Side In-Memory Rate Limiter for Enterprise API Gateway.
 *
 * SCOPE & TOPOLOGY NOTICE:
 * This rate limiter operates strictly in-memory within a single Node.js runtime process.
 * It provides deterministic rate limiting across GLOBAL, TENANT, APPLICATION, PRINCIPAL,
 * and DEVICE tiers. For multi-node distributed clusters, a distributed cache adapter
 * (e.g. Redis sliding window) should be layered over this interface.
 */

export type RateLimitTier = "GLOBAL" | "TENANT" | "APPLICATION" | "PRINCIPAL" | "DEVICE";

export type RateLimitStatus = "UNLIMITED" | "WITHIN_LIMIT" | "NEAR_LIMIT" | "RATE_LIMITED";

export interface RateLimitPolicy {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly status: RateLimitStatus;
  readonly tier: RateLimitTier;
  readonly scope: RateLimitTier;
  readonly limit: number;
  readonly current: number;
  readonly remaining: number;
  readonly resetAt: Date;
  readonly retryAfterMs: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiterConfig {
  readonly global?: RateLimitPolicy | undefined;
  readonly tenant?: RateLimitPolicy | undefined;
  readonly application?: RateLimitPolicy | undefined;
  readonly principal?: RateLimitPolicy | undefined;
  readonly device?: RateLimitPolicy | undefined;
}

interface WindowBucket {
  count: number;
  resetAt: number;
}

export class ServerRateLimiter {
  private readonly config: {
    readonly global: RateLimitPolicy;
    readonly tenant: RateLimitPolicy;
    readonly application: RateLimitPolicy;
    readonly principal: RateLimitPolicy;
    readonly device: RateLimitPolicy;
  };
  private readonly buckets: Map<string, WindowBucket> = new Map();

  constructor(config?: RateLimiterConfig) {
    this.config = {
      global: config?.global ?? { maxRequests: 5000, windowMs: 60000 },
      tenant: config?.tenant ?? { maxRequests: 1000, windowMs: 60000 },
      application: config?.application ?? { maxRequests: 500, windowMs: 60000 },
      principal: config?.principal ?? { maxRequests: 200, windowMs: 60000 },
      device: config?.device ?? { maxRequests: 60, windowMs: 60000 },
    };
  }

  public checkRateLimit(context?: {
    readonly tenantId?: string | undefined;
    readonly applicationId?: string | undefined;
    readonly principalId?: string | undefined;
    readonly principal?: { id?: string | undefined } | string | undefined;
    readonly deviceId?: string | undefined;
  }): RateLimitResult {
    const now = Date.now();
    const principalId = typeof context?.principal === "string"
      ? context.principal
      : typeof context?.principal === "object"
      ? context.principal.id
      : context?.principalId;

    // 1. GLOBAL Check
    const globalRes = this.evaluateTier("GLOBAL", "global", this.config.global, now);
    if (!globalRes.allowed) return globalRes;

    let mostSpecificRes = globalRes;

    // 2. TENANT Check
    if (context?.tenantId) {
      const tenantRes = this.evaluateTier("TENANT", `tenant:${context.tenantId}`, this.config.tenant, now);
      if (!tenantRes.allowed) return tenantRes;
      mostSpecificRes = tenantRes;
    }

    // 3. APPLICATION Check
    if (context?.applicationId) {
      const appRes = this.evaluateTier("APPLICATION", `app:${context.applicationId}`, this.config.application, now);
      if (!appRes.allowed) return appRes;
      mostSpecificRes = appRes;
    }

    // 4. PRINCIPAL Check
    if (principalId && principalId !== "anonymous") {
      const principalRes = this.evaluateTier("PRINCIPAL", `principal:${principalId}`, this.config.principal, now);
      if (!principalRes.allowed) return principalRes;
      mostSpecificRes = principalRes;
    }

    // 5. DEVICE Check
    if (context?.deviceId) {
      const deviceRes = this.evaluateTier("DEVICE", `device:${context.deviceId}`, this.config.device, now);
      if (!deviceRes.allowed) return deviceRes;
      mostSpecificRes = deviceRes;
    }

    return mostSpecificRes;
  }

  private evaluateTier(
    tier: RateLimitTier,
    key: string,
    policy: RateLimitPolicy,
    now: number
  ): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + policy.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    const current = bucket.count;
    const limit = policy.maxRequests;
    const remaining = Math.max(0, limit - current);
    const allowed = current <= limit;
    const resetAt = new Date(bucket.resetAt);
    const retryAfterMs = allowed ? 0 : Math.max(0, bucket.resetAt - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const ratio = current / limit;
    const status: RateLimitStatus = !allowed
      ? "RATE_LIMITED"
      : ratio >= 0.8
      ? "NEAR_LIMIT"
      : "WITHIN_LIMIT";

    return {
      allowed,
      status,
      tier,
      scope: tier,
      limit,
      current,
      remaining,
      resetAt,
      retryAfterMs,
      retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
    };
  }

  public reset(): void {
    this.buckets.clear();
  }
}
