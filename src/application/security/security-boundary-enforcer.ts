import crypto from "node:crypto";
import { EventPublisher, DomainEvent } from "../../domain/events/events.js";
import { SecurityContext, Principal } from "../../domain/security/security.js";
import { PolicyGateway, PolicyDecision } from "../../domain/policy/policy.js";
import {
  ToolInvocationRequest,
  ModelInvocationRequest,
  MemoryAccessRequest,
  AgentDelegation,
  ModelProviderAllowlist,
  SecurityBoundaryViolationError,
} from "../../domain/security/boundaries.js";
import { AuthorizationEvaluator } from "./rbac-authorization-evaluator.js";

export interface BoundaryEnforcerOptions {
  readonly maxDelegationDepth?: number | undefined;
  readonly modelAllowlists?: Readonly<Record<string, ModelProviderAllowlist>> | undefined;
}

export class SecurityBoundaryEnforcer {
  private readonly maxDelegationDepth: number;
  private readonly modelAllowlists: Map<string, ModelProviderAllowlist>;

  constructor(
    private readonly evaluator: AuthorizationEvaluator,
    private readonly eventPublisher?: EventPublisher | undefined,
    options?: BoundaryEnforcerOptions
  ) {
    this.maxDelegationDepth = options?.maxDelegationDepth ?? 1;
    this.modelAllowlists = new Map();
    if (options?.modelAllowlists) {
      for (const [key, value] of Object.entries(options.modelAllowlists)) {
        this.modelAllowlists.set(key, value);
      }
    }
  }

  registerModelAllowlist(agentOrRoleId: string, allowlist: ModelProviderAllowlist): void {
    this.modelAllowlists.set(agentOrRoleId, allowlist);
  }

  // 1. Tool Boundary Enforcement
  async enforceToolBoundary(request: ToolInvocationRequest): Promise<PolicyDecision> {
    if (!request || typeof request !== "object" || !request.context || !(request.context instanceof SecurityContext)) {
      return {
        allowed: false,
        policyId: "tool-boundary-fail-closed",
        code: "SECURITY_INVALID_REQUEST",
        reason: "Tool invocation requires a valid SecurityContext",
      };
    }

    const { context, toolId, input, targetTenantId, targetScope, targetAgentId } = request;
    const principal = context.principal;

    // Agent identity derived exclusively from SecurityContext
    const effectiveAgentId = principal.type === "AGENT" ? principal.id : targetAgentId;

    // Evaluate RBAC Authorization for tool.invoke
    const authzResult = await this.evaluator.evaluate({
      context,
      action: "tool.invoke",
      resourceType: "TOOL",
      resourceId: toolId,
      targetAgentId: effectiveAgentId,
      targetTenantId,
      targetScope,
      riskLevel: request.riskLevel,
      metadata: { toolId, inputSanitized: true },
    });

    if (!authzResult.allowed) {
      return {
        allowed: false,
        policyId: authzResult.matchedPolicyId ?? "tool-boundary-denied",
        code: authzResult.code,
        reason: authzResult.reason,
      };
    }

    return {
      allowed: true,
      policyId: authzResult.matchedPolicyId ?? "tool-boundary-allowed",
      code: "SECURITY_TOOL_ALLOWED",
      reason: `Tool '${toolId}' authorized for principal '${principal.id}'`,
    };
  }

  // 2. Model Boundary & Allowlist Enforcement
  async enforceModelBoundary(request: ModelInvocationRequest): Promise<PolicyDecision> {
    if (!request || typeof request !== "object" || !request.context || !(request.context instanceof SecurityContext)) {
      return {
        allowed: false,
        policyId: "model-boundary-fail-closed",
        code: "SECURITY_INVALID_REQUEST",
        reason: "Model invocation requires a valid SecurityContext",
      };
    }

    const { context, modelId, providerId, targetTenantId, targetScope, targetAgentId } = request;
    const principal = context.principal;

    // 1. Model Allowlist Check (by Agent ID or Role)
    const lookupKeys = [principal.id, ...(principal.roles ?? [])];
    let matchedAllowlist: ModelProviderAllowlist | undefined = undefined;
    for (const key of lookupKeys) {
      if (this.modelAllowlists.has(key)) {
        matchedAllowlist = this.modelAllowlists.get(key);
        break;
      }
    }

    if (matchedAllowlist) {
      if (!matchedAllowlist.allowedModels.includes(modelId) && !matchedAllowlist.allowedModels.includes("*")) {
        return {
          allowed: false,
          policyId: "model-allowlist-denied",
          code: "SECURITY_MODEL_NOT_ALLOWED",
          reason: `Model '${modelId}' is not in the allowed models list for principal '${principal.id}'`,
        };
      }
      if (
        providerId &&
        matchedAllowlist.allowedProviders &&
        !matchedAllowlist.allowedProviders.includes(providerId) &&
        !matchedAllowlist.allowedProviders.includes("*")
      ) {
        return {
          allowed: false,
          policyId: "provider-allowlist-denied",
          code: "SECURITY_PROVIDER_NOT_ALLOWED",
          reason: `Provider '${providerId}' is not in the allowed providers list for principal '${principal.id}'`,
        };
      }
    }

    // 2. Evaluate RBAC Authorization for model.invoke
    const authzResult = await this.evaluator.evaluate({
      context,
      action: "model.invoke",
      resourceType: "MODEL",
      resourceId: modelId,
      targetAgentId,
      targetTenantId,
      targetScope,
      metadata: { modelId, providerId },
    });

    if (!authzResult.allowed) {
      return {
        allowed: false,
        policyId: authzResult.matchedPolicyId ?? "model-boundary-denied",
        code: authzResult.code,
        reason: authzResult.reason,
      };
    }

    return {
      allowed: true,
      policyId: authzResult.matchedPolicyId ?? "model-boundary-allowed",
      code: "SECURITY_MODEL_ALLOWED",
      reason: `Model '${modelId}' authorized for principal '${principal.id}'`,
    };
  }

  // 3. Memory Boundary & Scope Ownership Enforcement
  async enforceMemoryBoundary(request: MemoryAccessRequest): Promise<PolicyDecision> {
    if (!request || typeof request !== "object" || !request.context || !(request.context instanceof SecurityContext)) {
      return {
        allowed: false,
        policyId: "memory-boundary-fail-closed",
        code: "SECURITY_INVALID_REQUEST",
        reason: "Memory access requires a valid SecurityContext",
      };
    }

    const { context, operation, scope, key, targetTenantId, targetAgentId } = request;
    const principal = context.principal;

    // Tenant Isolation for memory
    if (context.tenantId && targetTenantId && context.tenantId !== targetTenantId) {
      return {
        allowed: false,
        policyId: "memory-tenant-isolation-denied",
        code: "SECURITY_TENANT_ISOLATION_VIOLATION",
        reason: `Caller tenant '${context.tenantId}' cannot access target tenant '${targetTenantId}' memory`,
      };
    }

    // Memory Scope & Ownership:
    // If principal is an AGENT, it can access its own memory scope (e.g. `agent-${principal.id}` or `session-${id}`)
    // Accessing another agent's dedicated scope (`agent-other`) is blocked without explicit authorization
    if (principal.type === "AGENT") {
      if (scope.startsWith("agent-") && scope !== `agent-${principal.id}`) {
        return {
          allowed: false,
          policyId: "memory-ownership-denied",
          code: "SECURITY_MEMORY_OWNERSHIP_VIOLATION",
          reason: `Agent '${principal.id}' cannot access memory scope '${scope}' owned by another agent`,
        };
      }
    }

    const action = operation === "WRITE" ? "memory.write" : operation === "DELETE" ? "memory.delete" : "memory.read";

    const authzResult = await this.evaluator.evaluate({
      context,
      action,
      resourceType: "MEMORY",
      resourceId: `${scope}:${key}`,
      targetAgentId,
      targetTenantId,
      metadata: { scope, key, operation },
    });

    if (!authzResult.allowed) {
      return {
        allowed: false,
        policyId: authzResult.matchedPolicyId ?? "memory-boundary-denied",
        code: authzResult.code,
        reason: authzResult.reason,
      };
    }

    return {
      allowed: true,
      policyId: authzResult.matchedPolicyId ?? "memory-boundary-allowed",
      code: "SECURITY_MEMORY_ALLOWED",
      reason: `Memory ${operation} on '${scope}:${key}' authorized for principal '${principal.id}'`,
    };
  }

  // 4. Agent Delegation Enforcement
  enforceDelegationBoundary(delegation: AgentDelegation, sourceContext: SecurityContext): { allowed: boolean; code: string; reason: string } {
    if (!delegation || typeof delegation !== "object" || !sourceContext || !(sourceContext instanceof SecurityContext)) {
      return {
        allowed: false,
        code: "SECURITY_INVALID_REQUEST",
        reason: "Agent delegation requires a valid delegation object and source SecurityContext",
      };
    }

    const maxDepth = delegation.maxDepth ?? this.maxDelegationDepth;

    // Delegation Depth Check
    if (delegation.depth > maxDepth) {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_DEPTH_EXCEEDED",
        reason: `Delegation depth ${delegation.depth} exceeds maximum permitted depth ${maxDepth}`,
      };
    }

    // Expiration Check
    if (delegation.expiresAt && delegation.expiresAt.getTime() <= Date.now()) {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_EXPIRED",
        reason: "Delegation contract has expired",
      };
    }

    // Source principal mismatch check
    if (sourceContext.principal.id !== delegation.sourcePrincipalId) {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_IDENTITY_MISMATCH",
        reason: `Source context principal '${sourceContext.principal.id}' does not match delegation source '${delegation.sourcePrincipalId}'`,
      };
    }

    // Prevent privilege escalation via delegation: Target cannot acquire SYSTEM privileges
    if (delegation.targetPrincipalId === "system-internal" || delegation.delegatedCapability === "*") {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_ESCALATION_BLOCKED",
        reason: "Delegation cannot confer SYSTEM or wildcard privileges",
      };
    }

    return {
      allowed: true,
      code: "SECURITY_DELEGATION_ALLOWED",
      reason: `Delegation from '${delegation.sourcePrincipalId}' to '${delegation.targetPrincipalId}' authorized`,
    };
  }
}
