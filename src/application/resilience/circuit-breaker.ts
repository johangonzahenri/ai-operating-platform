export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly cooldownPeriodMs: number;
  readonly successThresholdInHalfOpen: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private consecutiveSuccesses = 0;
  private nextAttemptAt = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      cooldownPeriodMs: config.cooldownPeriodMs ?? 10000,
      successThresholdInHalfOpen: config.successThresholdInHalfOpen ?? 2,
    };
  }

  public getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() >= this.nextAttemptAt) {
      this.state = "HALF_OPEN";
      this.consecutiveSuccesses = 0;
    }
    return this.state;
  }

  public async execute<T>(action: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "OPEN") {
      if (fallback) return fallback();
      throw new Error("CircuitBreaker is OPEN - execution rejected");
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.successThresholdInHalfOpen) {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.consecutiveSuccesses = 0;
      }
    } else if (this.state === "CLOSED") {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.config.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.nextAttemptAt = Date.now() + this.config.cooldownPeriodMs;
    }
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttemptAt = 0;
  }
}
