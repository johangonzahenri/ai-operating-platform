import { SecurityContext, Principal, RiskLevel } from "./security.js";
import { AuthorizationRequest, ResourceType } from "./authorization.js";

export class SecurityBoundaryViolationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SecurityBoundaryViolationError";
  }
}

export interface ToolInvocationRequest {
  readonly context: SecurityContext;
  readonly toolId: string;
  readonly action?: string | undefined;
  readonly requiredPermission?: string | undefined;
  readonly input: Readonly<Record<string, unknown>>;
  readonly targetAgentId?: string | undefined;
  readonly targetTenantId?: string | undefined;
  readonly targetScope?: string | undefined;
  readonly riskLevel?: RiskLevel | undefined;
  readonly correlationId?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface ModelInvocationRequest {
  readonly context: SecurityContext;
  readonly modelId: string;
  readonly providerId?: string | undefined;
  readonly action?: string | undefined;
  readonly requiredPermission?: string | undefined;
  readonly input: Readonly<Record<string, unknown>>;
  readonly targetAgentId?: string | undefined;
  readonly targetTenantId?: string | undefined;
  readonly targetScope?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface MemoryAccessRequest {
  readonly context: SecurityContext;
  readonly operation: "READ" | "WRITE" | "DELETE";
  readonly scope: string;
  readonly key: string;
  readonly requiredPermission?: string | undefined;
  readonly targetTenantId?: string | undefined;
  readonly targetAgentId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AgentDelegation {
  readonly sourcePrincipalId: string;
  readonly targetPrincipalId: string;
  readonly delegatedCapability: string;
  readonly resource: string;
  readonly scope?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly depth: number;
  readonly maxDepth?: number | undefined;
  readonly expiresAt?: Date | undefined;
  readonly correlationId: string;
}

export interface ModelProviderAllowlist {
  readonly allowedModels: readonly string[];
  readonly allowedProviders?: readonly string[] | undefined;
}

export interface ToolOutputSanitizationResult {
  readonly sanitizedOutput: unknown;
  readonly isBounded: boolean;
  readonly bytesTruncated: boolean;
}
