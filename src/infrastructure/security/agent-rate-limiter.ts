import {
  AgentRateLimiterPort,
  AgentRateLimitScope,
  AgentRateLimitPolicy,
  AgentRateLimitEvaluation,
} from "../../application/ports/agent-rate-limiter-port.js";

interface TokenBucketState {
  tokens: number;
  destructiveTokens: number;
  lastRefillMs: number;
  windowStartMs: number;
  requestTimestamps: number[];
}

export const DEFAULT_CONSERVATIVE_AGENT_POLICY: AgentRateLimitPolicy = Object.freeze({
  policyId: "default-conservative-agent-policy",
  maxRequests: 30, // 30 calls per minute
  windowMs: 60000,
  burstCapacity: 10, // Max 10 calls in immediate burst
  maxDestructiveRequests: 5, // Max 5 destructive calls per minute
});

export const DEFAULT_READ_ONLY_AGENT_POLICY: AgentRateLimitPolicy = Object.freeze({
  policyId: "read-only-agent-policy",
  maxRequests: 120, // 120 calls per minute
  windowMs: 60000,
  burstCapacity: 20,
  maxDestructiveRequests: 0,
});

export const DEFAULT_AUTONOMOUS_AGENT_POLICY: AgentRateLimitPolicy = Object.freeze({
  policyId: "autonomous-agent-policy",
  maxRequests: 60,
  windowMs: 60000,
  burstCapacity: 15,
  maxDestructiveRequests: 10,
});

/**
 * InMemoryAgentRateLimiter implements Token-Bucket with sliding-window accounting
 * for in-process bounded agent velocity protection.
 */
export class InMemoryAgentRateLimiter implements AgentRateLimiterPort {
  private readonly policies = new Map<string, AgentRateLimitPolicy>();
  private readonly buckets = new Map<string, TokenBucketState>();
  private readonly defaultPolicy: AgentRateLimitPolicy;
  private readonly strictFailClosed: boolean;

  constructor(options?: {
    readonly defaultPolicy?: AgentRateLimitPolicy | undefined;
    readonly initialPolicies?: Record<string, AgentRateLimitPolicy> | undefined;
    readonly strictFailClosed?: boolean | undefined;
  }) {
    this.defaultPolicy = options?.defaultPolicy ?? DEFAULT_CONSERVATIVE_AGENT_POLICY;
    this.strictFailClosed = options?.strictFailClosed ?? false;

    if (options?.initialPolicies) {
      for (const [key, pol] of Object.entries(options.initialPolicies)) {
        this.policies.set(key, Object.freeze({ ...pol }));
      }
    }
  }

  setPolicy(scopeKey: string, policy: AgentRateLimitPolicy): void {
    if (!policy || typeof policy.maxRequests !== "number" || policy.maxRequests <= 0) {
      throw new Error(`Invalid rate limit policy: maxRequests must be positive integer`);
    }
    this.policies.set(scopeKey.trim(), Object.freeze({ ...policy }));
  }

  getPolicy(scope: AgentRateLimitScope): AgentRateLimitPolicy {
    // 1. Exact agent + tool policy
    if (scope.toolId) {
      const specific = this.policies.get(`${scope.agentId}:${scope.toolId}`);
      if (specific) return specific;
    }
    // 2. Specific agent policy
    const agentPol = this.policies.get(scope.agentId);
    if (agentPol) return agentPol;

    // 3. Tool global policy
    if (scope.toolId) {
      const toolPol = this.policies.get(`tool:${scope.toolId}`);
      if (toolPol) return toolPol;
    }

    // 4. Fallback to default
    return this.defaultPolicy;
  }

  async evaluateAndConsume(
    scope: AgentRateLimitScope,
    now: Date = new Date()
  ): Promise<AgentRateLimitEvaluation> {
    if (!scope.agentId || scope.agentId.trim() === "") {
      if (this.strictFailClosed) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: now,
          retryAfterMs: 1000,
          reason: "AgentRateLimiter: agentId is missing and strictFailClosed is enabled",
        };
      }
    }

    const policy = this.getPolicy(scope);
    const bucketKey = this.buildBucketKey(scope);
    const nowMs = now.getTime();

    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: policy.burstCapacity,
        destructiveTokens: policy.maxDestructiveRequests ?? policy.burstCapacity,
        lastRefillMs: nowMs,
        windowStartMs: nowMs,
        requestTimestamps: [],
      };
      this.buckets.set(bucketKey, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = Math.max(0, nowMs - bucket.lastRefillMs);
    const refillRatePerMs = policy.maxRequests / policy.windowMs;
    const tokensToAdd = elapsed * refillRatePerMs;
    bucket.tokens = Math.min(policy.burstCapacity, bucket.tokens + tokensToAdd);

    if (policy.maxDestructiveRequests !== undefined) {
      const destRefillRate = policy.maxDestructiveRequests / policy.windowMs;
      bucket.destructiveTokens = Math.min(
        policy.maxDestructiveRequests,
        bucket.destructiveTokens + elapsed * destRefillRate
      );
    }
    bucket.lastRefillMs = nowMs;

    // Prune sliding window timestamps older than windowMs
    const windowCutoff = nowMs - policy.windowMs;
    bucket.requestTimestamps = bucket.requestTimestamps.filter((ts) => ts > windowCutoff);

    // Sliding window check
    const currentWindowCount = bucket.requestTimestamps.length;
    const isDestructive = Boolean(scope.isDestructive);

    if (currentWindowCount >= policy.maxRequests || bucket.tokens < 1) {
      // Calculate earliest reset timestamp
      const oldestTimestamp = bucket.requestTimestamps[0] ?? nowMs;
      const retryAfterMs = Math.max(50, Math.ceil((oldestTimestamp + policy.windowMs) - nowMs));
      const resetAt = new Date(nowMs + retryAfterMs);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfterMs,
        policyId: policy.policyId,
        reason: `Agent '${scope.agentId}' velocity limit exceeded for policy '${policy.policyId}' (${policy.maxRequests} req / ${policy.windowMs}ms). Retry after ${retryAfterMs}ms`,
      };
    }

    // Check destructive quota if applicable
    if (isDestructive && policy.maxDestructiveRequests !== undefined && bucket.destructiveTokens < 1) {
      const retryAfterMs = Math.max(100, Math.ceil(policy.windowMs / (policy.maxDestructiveRequests || 1)));
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(nowMs + retryAfterMs),
        retryAfterMs,
        policyId: policy.policyId,
        reason: `Agent '${scope.agentId}' exceeded destructive tool quota for policy '${policy.policyId}'`,
      };
    }

    // Consume tokens
    bucket.tokens -= 1;
    if (isDestructive && policy.maxDestructiveRequests !== undefined) {
      bucket.destructiveTokens -= 1;
    }
    bucket.requestTimestamps.push(nowMs);

    const remaining = Math.max(0, policy.maxRequests - bucket.requestTimestamps.length);
    const resetAt = new Date(nowMs + policy.windowMs);

    return {
      allowed: true,
      remaining,
      resetAt,
      retryAfterMs: 0,
      policyId: policy.policyId,
    };
  }

  private buildBucketKey(scope: AgentRateLimitScope): string {
    const tenant = scope.tenantId?.trim() || "global";
    const agent = scope.agentId.trim();
    const tool = scope.toolId?.trim() || "all-tools";
    return `${tenant}:${agent}:${tool}`;
  }
}
