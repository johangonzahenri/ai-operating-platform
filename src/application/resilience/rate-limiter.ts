export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetMs: number;
  readonly limit: number;
}

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly clients = new Map<string, number[]>();

  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public check(clientId: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.clients.get(clientId) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldest = timestamps[0] ?? now;
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      this.clients.set(clientId, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        limit: this.maxRequests,
      };
    }

    timestamps.push(now);
    this.clients.set(clientId, timestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetMs: this.windowMs,
      limit: this.maxRequests,
    };
  }

  public reset(clientId?: string): void {
    if (clientId) {
      this.clients.delete(clientId);
    } else {
      this.clients.clear();
    }
  }
}

export class BackpressureController {
  private readonly maxPendingCapacity: number;
  private currentPending = 0;

  constructor(maxPendingCapacity = 50) {
    this.maxPendingCapacity = maxPendingCapacity;
  }

  public canAccept(): boolean {
    return this.currentPending < this.maxPendingCapacity;
  }

  public acquire(): boolean {
    if (!this.canAccept()) {
      return false;
    }
    this.currentPending++;
    return true;
  }

  public release(): void {
    if (this.currentPending > 0) {
      this.currentPending--;
    }
  }

  public getStatus(): { current: number; max: number; utilizationPct: number } {
    return {
      current: this.currentPending,
      max: this.maxPendingCapacity,
      utilizationPct: Math.round((this.currentPending / this.maxPendingCapacity) * 100),
    };
  }
}
