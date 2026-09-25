/**
 * Agent Rate Limiter Port — AI Operating Platform
 * 
 * Bounded rate limiting and burst protection for agents invoking tools,
 * external providers, or sub-operations.
 * 
 * Invariants:
 * 1. Independent from monetized TeamResourceBudget / AutonomyBudget (Limits velocity, not total quota).
 * 2. Scoped hierarchically (agentId, tenantId, toolId).
 * 3. Token-Bucket / Sliding-Window deterministic algorithm.
 * 4. Fail-closed on missing policy if strict enforcement is configured.
 */

export interface AgentRateLimitScope {
  readonly agentId: string;
  readonly tenantId?: string | undefined;
  readonly applicationId?: string | undefined;
  readonly principalId?: string | undefined;
  readonly toolId?: string | undefined;
  readonly isDestructive?: boolean | undefined;
}

export interface AgentRateLimitPolicy {
  readonly policyId: string;
  /** Maximum requests allowed in the sliding window */
  readonly maxRequests: number;
  /** Duration of the sliding window in milliseconds */
  readonly windowMs: number;
  /** Maximum immediate burst capacity before throttling */
  readonly burstCapacity: number;
  /** Optional separate limit for destructive tools within the window */
  readonly maxDestructiveRequests?: number | undefined;
}

export interface AgentRateLimitEvaluation {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: Date;
  readonly retryAfterMs: number;
  readonly reason?: string | undefined;
  readonly policyId?: string | undefined;
}

export interface AgentRateLimiterPort {
  /**
   * Consumes 1 execution token for the given agent and tool scope.
   * If limit is exceeded, returns allowed=false with retryAfterMs and reason.
   */
  evaluateAndConsume(
    scope: AgentRateLimitScope,
    now?: Date
  ): Promise<AgentRateLimitEvaluation>;

  /**
   * Registers or updates a rate limit policy for a specific agent class, agent ID, or default.
   */
  setPolicy(scopeKey: string, policy: AgentRateLimitPolicy): void;

  /**
   * Retrieves the active policy for a scope, falling back to default conservative policy.
   */
  getPolicy(scope: AgentRateLimitScope): AgentRateLimitPolicy;
}
