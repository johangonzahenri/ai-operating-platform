/**
 * Complete authorization trace that answers:
 * - WHO (principal)
 * - WHAT TENANT 
 * - WHAT TEAM
 * - WHAT AGENT
 * - WHAT RESOURCE
 * - WHAT ACTION
 * - WHAT POLICY (decision)
 * - WHAT BUDGET (remaining)
 */
export interface AuthorizationTrace {
  readonly traceId: string;
  readonly timestamp: Date;
  readonly principal: {
    readonly id: string;
    readonly type: string;
    readonly tenantId: string;
  };
  readonly organization?: {
    readonly organizationId: string;
    readonly areaId?: string;
    readonly teamId?: string;
  };
  readonly agent?: {
    readonly agentId: string;
    readonly status: string;
  };
  readonly resource: {
    readonly type: string;
    readonly id?: string;
    readonly action: string;
  };
  readonly policy: {
    readonly decision: 'ALLOW' | 'DENY';
    readonly reason: string;
    readonly evaluatedRoles: string[];
    readonly matchedPermissions: string[];
  };
  readonly budget?: {
    readonly teamId: string;
    readonly status: string;
    readonly remainingExecutions?: number;
    readonly remainingModelCalls?: number;
  };
  readonly result: 'AUTHORIZED' | 'DENIED';
  readonly durationMs: number;
}
