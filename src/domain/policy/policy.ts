export interface PolicyContext {
  readonly traceId: string;
  readonly executionId?: string | undefined;
  readonly taskId?: string | undefined;
  readonly operationId?: string | undefined;
  readonly operationType: "MODEL" | "TOOL";
  readonly resourceId: string;
  readonly agentId?: string | undefined;
  readonly action?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
  readonly requiredPermissions?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly policyId: string;
  readonly reason?: string | undefined;
  readonly code?: string | undefined;
}

export class PolicyDeniedError extends Error {
  constructor(readonly policyId: string, readonly operationId: string, message: string) {
    super(message);
    this.name = "PolicyDeniedError";
  }
}

export class PolicyEvaluationError extends Error {
  constructor(message: string, readonly cause?: Error) {
    super(message);
    this.name = "PolicyEvaluationError";
  }
}

export interface PolicyGateway {
  evaluate(context: PolicyContext): Promise<PolicyDecision>;
}

