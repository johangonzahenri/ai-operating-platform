// Application Context & Observability Contract
export interface ApplicationRequestContext {
  readonly applicationId: string;
  readonly tenantId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly taskId?: string | undefined;
  readonly executionId?: string | undefined;
}

export function createRequestContext(
  tenantId: string,
  correlationId = `corr-${Date.now().toString(36)}`
): ApplicationRequestContext {
  return {
    applicationId: "reference-consumer",
    tenantId,
    requestId: `req-${Date.now().toString(36)}`,
    correlationId,
  };
}
