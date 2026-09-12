export interface ExecutionLimits {
  readonly maxToolCalls: number;
  readonly maxToolRounds: number;
  readonly maxExecutionTimeMs: number;
}

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxToolCalls: 16,
  maxToolRounds: 8,
  maxExecutionTimeMs: 30000,
};

export class ExecutionLimitsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionLimitsError";
  }
}

export function validateExecutionLimits(limits: ExecutionLimits): ExecutionLimits {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
      throw new ExecutionLimitsError(`${name} must be a finite positive integer within safe bounds`);
    }
  }
  return limits;
}

export function executionLimitsFromEnvironment(environment: Record<string, string | undefined> = process.env): ExecutionLimits {
  const limits = {
    maxToolCalls: Number(environment.MAX_TOOL_CALLS ?? DEFAULT_EXECUTION_LIMITS.maxToolCalls),
    maxToolRounds: Number(environment.MAX_TOOL_ROUNDS ?? DEFAULT_EXECUTION_LIMITS.maxToolRounds),
    maxExecutionTimeMs: Number(environment.MAX_EXECUTION_TIME ?? DEFAULT_EXECUTION_LIMITS.maxExecutionTimeMs),
  };
  return validateExecutionLimits(limits);
}
