export type ErrorClass = "RETRYABLE" | "NON_RETRYABLE";

export interface RetryConfig {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffFactor: number;
  readonly jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffFactor: 2,
  jitter: true,
};

export class RetryPolicy {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  public classifyError(error: unknown): ErrorClass {
    if (!error) return "NON_RETRYABLE";

    const errMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const errName = error instanceof Error ? error.name : "";

    // Transient network / socket / rate limit / lock errors
    if (
      errMessage.includes("econnreset") ||
      errMessage.includes("etimedout") ||
      errMessage.includes("timeout") ||
      errMessage.includes("sqlite_busy") ||
      errMessage.includes("database is locked") ||
      errMessage.includes("rate limit") ||
      errMessage.includes("too many requests") ||
      errMessage.includes("503") ||
      errMessage.includes("504")
    ) {
      return "RETRYABLE";
    }

    // Deterministic validation, auth, business logic errors
    if (
      errName.includes("Validation") ||
      errName.includes("Authorization") ||
      errName.includes("Authentication") ||
      errName.includes("Forbidden") ||
      errName.includes("NotFound") ||
      errMessage.includes("unauthorized") ||
      errMessage.includes("forbidden") ||
      errMessage.includes("invalid") ||
      errMessage.includes("schema")
    ) {
      return "NON_RETRYABLE";
    }

    return "NON_RETRYABLE";
  }

  public calculateDelay(attempt: number): number {
    if (attempt <= 0) return 0;
    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.backoffFactor, attempt - 1);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);
    
    if (!this.config.jitter) return cappedDelay;
    
    // Add full jitter between 0.5x and 1.5x
    const jitterMultiplier = 0.5 + Math.random();
    return Math.floor(cappedDelay * jitterMultiplier);
  }

  public async executeWithRetry<T>(
    operation: (attempt: number) => Promise<T>,
    customClassifier?: (err: unknown) => ErrorClass
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        return await operation(attempt);
      } catch (err) {
        const classification = customClassifier ? customClassifier(err) : this.classifyError(err);
        if (classification === "NON_RETRYABLE" || attempt > this.config.maxRetries) {
          throw err;
        }
        const delay = this.calculateDelay(attempt);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
}
