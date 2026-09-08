export interface AutonomyConsumptionProps {
  readonly stepsUsed: number;
  readonly toolCallsUsed: number;
  readonly elapsedMs: number;
  readonly tokensUsed?: number | undefined;
}

export interface AutonomyConsumptionSnapshot {
  readonly stepsUsed: number;
  readonly toolCallsUsed: number;
  readonly elapsedMs: number;
  readonly tokensUsed?: number | undefined;
}

export class AutonomyConsumptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutonomyConsumptionValidationError";
  }
}

/**
 * AutonomyConsumption represents the immutable, recorded operational metrics
 * consumed by an autonomous operation (steps, tool calls, elapsed duration, tokens).
 */
export class AutonomyConsumption {
  readonly stepsUsed: number;
  readonly toolCallsUsed: number;
  readonly elapsedMs: number;
  readonly tokensUsed?: number | undefined;

  private constructor(
    stepsUsed: number,
    toolCallsUsed: number,
    elapsedMs: number,
    tokensUsed?: number | undefined
  ) {
    this.stepsUsed = stepsUsed;
    this.toolCallsUsed = toolCallsUsed;
    this.elapsedMs = elapsedMs;
    this.tokensUsed = tokensUsed;
    Object.freeze(this);
  }

  static zero(): AutonomyConsumption {
    return new AutonomyConsumption(0, 0, 0, undefined);
  }

  static create(props: AutonomyConsumptionProps): AutonomyConsumption {
    if (props === null || typeof props !== "object" || Array.isArray(props)) {
      throw new AutonomyConsumptionValidationError("Consumption props must be a valid non-null object");
    }

    const { stepsUsed, toolCallsUsed, elapsedMs, tokensUsed } = props;

    if (typeof stepsUsed !== "number" || !Number.isInteger(stepsUsed) || stepsUsed < 0) {
      throw new AutonomyConsumptionValidationError("stepsUsed must be a non-negative integer");
    }

    if (typeof toolCallsUsed !== "number" || !Number.isInteger(toolCallsUsed) || toolCallsUsed < 0) {
      throw new AutonomyConsumptionValidationError("toolCallsUsed must be a non-negative integer");
    }

    if (typeof elapsedMs !== "number" || !Number.isInteger(elapsedMs) || elapsedMs < 0) {
      throw new AutonomyConsumptionValidationError("elapsedMs must be a non-negative integer");
    }

    if (tokensUsed !== undefined) {
      if (typeof tokensUsed !== "number" || !Number.isInteger(tokensUsed) || tokensUsed < 0) {
        throw new AutonomyConsumptionValidationError("tokensUsed must be a non-negative integer when provided");
      }
    }

    return new AutonomyConsumption(stepsUsed, toolCallsUsed, elapsedMs, tokensUsed);
  }

  recordStep(delta: {
    readonly toolCalls?: number | undefined;
    readonly elapsedMs?: number | undefined;
    readonly tokens?: number | undefined;
  } = {}): AutonomyConsumption {
    const toolCallsDelta = delta.toolCalls ?? 0;
    const elapsedMsDelta = delta.elapsedMs ?? 0;
    const tokensDelta = delta.tokens ?? 0;

    if (typeof toolCallsDelta !== "number" || !Number.isInteger(toolCallsDelta) || toolCallsDelta < 0) {
      throw new AutonomyConsumptionValidationError("toolCalls delta must be a non-negative integer");
    }

    if (typeof elapsedMsDelta !== "number" || !Number.isInteger(elapsedMsDelta) || elapsedMsDelta < 0) {
      throw new AutonomyConsumptionValidationError("elapsedMs delta must be a non-negative integer");
    }

    if (typeof tokensDelta !== "number" || !Number.isInteger(tokensDelta) || tokensDelta < 0) {
      throw new AutonomyConsumptionValidationError("tokens delta must be a non-negative integer");
    }

    const nextTokensUsed =
      this.tokensUsed !== undefined || delta.tokens !== undefined
        ? (this.tokensUsed ?? 0) + tokensDelta
        : undefined;

    return new AutonomyConsumption(
      this.stepsUsed + 1,
      this.toolCallsUsed + toolCallsDelta,
      this.elapsedMs + elapsedMsDelta,
      nextTokensUsed
    );
  }

  snapshot(): AutonomyConsumptionSnapshot {
    return Object.freeze({
      stepsUsed: this.stepsUsed,
      toolCallsUsed: this.toolCallsUsed,
      elapsedMs: this.elapsedMs,
      ...(this.tokensUsed !== undefined ? { tokensUsed: this.tokensUsed } : {}),
    });
  }

  equals(other: unknown): boolean {
    if (!(other instanceof AutonomyConsumption)) {
      return false;
    }
    return (
      this.stepsUsed === other.stepsUsed &&
      this.toolCallsUsed === other.toolCallsUsed &&
      this.elapsedMs === other.elapsedMs &&
      this.tokensUsed === other.tokensUsed
    );
  }
}
