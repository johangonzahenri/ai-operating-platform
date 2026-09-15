export interface RateLimitOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetMs: number;
  readonly retryAfterSeconds?: number | undefined;
}

export class SlidingWindowRateLimiter {
  private readonly hitLog: Map<string, number[]> = new Map();

  constructor(private readonly defaultOptions: RateLimitOptions = { maxRequests: 100, windowMs: 60000 }) {}

  checkLimit(key: string, customOptions?: Partial<RateLimitOptions>): RateLimitResult {
    const limit = customOptions?.maxRequests ?? this.defaultOptions.maxRequests;
    const windowMs = customOptions?.windowMs ?? this.defaultOptions.windowMs;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.hitLog.has(key)) {
      this.hitLog.set(key, []);
    }

    const timestamps = this.hitLog.get(key)!.filter((t) => t > windowStart);
    const count = timestamps.length;
    const allowed = count < limit;

    if (allowed) {
      timestamps.push(now);
      this.hitLog.set(key, timestamps);
    }

    const oldest = timestamps[0] || now;
    const resetMs = Math.max(0, oldest + windowMs - now);
    const retryAfterSeconds = allowed ? undefined : Math.ceil(resetMs / 1000);

    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - timestamps.length),
      resetMs,
      retryAfterSeconds,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.hitLog.delete(key);
    } else {
      this.hitLog.clear();
    }
  }
}
