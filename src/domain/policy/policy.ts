export interface PolicyContext { readonly traceId: string; readonly executionId: string; readonly taskId: string; readonly operationId: string; readonly operationType: "MODEL" | "TOOL"; readonly resourceId: string; readonly metadata: Readonly<Record<string, unknown>>; }
export interface PolicyDecision { readonly allowed: boolean; readonly policyId: string; readonly reason?: string; }
export class PolicyDeniedError extends Error { constructor(readonly policyId: string, readonly operationId: string, message: string) { super(message); this.name = "PolicyDeniedError"; } }
export class PolicyEvaluationError extends Error { constructor(message: string, readonly cause?: Error) { super(message); this.name = "PolicyEvaluationError"; } }
export interface PolicyGateway { evaluate(context: PolicyContext): Promise<PolicyDecision>; }
