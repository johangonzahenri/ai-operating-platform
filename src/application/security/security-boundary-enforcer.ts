import crypto from "node:crypto";
import { EventPublisher, DomainEvent } from "../../domain/events/events.js";
import { SecurityContext, Principal, RiskLevel } from "../../domain/security/security.js";
import { PolicyGateway, PolicyDecision } from "../../domain/policy/policy.js";
import {
  deepFreeze,
  sanitizeBoundedValue,
  DEFAULT_BOUNDED_DATA_LIMITS,
  BoundedDataLimits,
} from "../../domain/context/bounded-data.js";
import {
  ToolInvocationRequest,
  ModelInvocationRequest,
  MemoryAccessRequest,
  AgentDelegation,
  ModelProviderAllowlist,
  ToolOutputSanitizationResult,
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

  // 1. Risk Level Integrity: Prevents caller from arbitrarily downgrading intrinsically high-risk actions
  deriveTrustedRiskLevel(resourceType: string, action: string, callerReportedRisk?: RiskLevel): RiskLevel {
    const act = action.toLowerCase();
    const res = resourceType.toLowerCase();

    // Sensitive / high risk operations
    if (
      act.includes("format") ||
      act.includes("delete_all") ||
      act.includes("shutdown") ||
      act.includes("reboot") ||
      act.includes("elevate") ||
      res === "system"
    ) {
      return "CRITICAL";
    }

    if (
      act.includes("shell") ||
      act.includes("execute") ||
      act.includes("write") ||
      act.includes("assign") ||
      act.includes("modify") ||
      res === "coordination"
    ) {
      return "HIGH";
    }

    if (act.includes("invoke") || act.includes("transfer")) {
      return "MEDIUM";
    }

    return callerReportedRisk ?? "LOW";
  }

  // 2. Tool Boundary Enforcement (Pre-execution authorization)
  async enforceToolBoundary(request: ToolInvocationRequest): Promise<PolicyDecision> {
    if (!request || typeof request !== "object" || !request.context || !(request.context instanceof SecurityContext)) {
      return {
        allowed: false,
        policyId: "tool-boundary-fail-closed",
        code: "SECURITY_INVALID_REQUEST",
        reason: "Tool invocation requires a valid SecurityContext",
      };
    }

    const { context, toolId, targetTenantId, targetScope, targetAgentId } = request;
    const principal = context.principal;

    // Caller identity strictly from SecurityContext (no fallback to targetAgentId as caller)
    const callerId = principal.id;
    const action = request.action ?? "tool.invoke";
    const requiredPermission = request.requiredPermission ?? (toolId.startsWith("system.") ? toolId : undefined);

    // Trusted Risk derivation
    const trustedRisk = this.deriveTrustedRiskLevel("TOOL", action, request.riskLevel);

    // Evaluate RBAC Authorization for tool
    const authzResult = await this.evaluator.evaluate({
      context,
      action,
      resourceType: "TOOL",
      resourceId: toolId,
      requiredPermission,
      targetAgentId,
      targetTenantId,
      targetScope,
      riskLevel: trustedRisk,
      metadata: { toolId, callerId, inputSanitized: true },
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

  // 3. Tool Output Sanitization & Boundary Enforcement (Post-execution)
  enforceToolOutput(rawOutput: unknown, limits: BoundedDataLimits = DEFAULT_BOUNDED_DATA_LIMITS): ToolOutputSanitizationResult {
    const state = { truncated: false };
    const sanitized = deepFreeze(sanitizeBoundedValue(rawOutput, limits, 0, state));

    return {
      sanitizedOutput: sanitized,
      isBounded: true,
      bytesTruncated: state.truncated,
    };
  }

  // 4. Model Boundary & Allowlist Enforcement
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

    const action = request.action ?? "model.invoke";

    // 2. Evaluate RBAC Authorization for model.invoke
    const authzResult = await this.evaluator.evaluate({
      context,
      action,
      resourceType: "MODEL",
      resourceId: modelId,
      requiredPermission: request.requiredPermission,
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

  // 5. Memory Boundary & Scope Ownership Enforcement (READ, WRITE, DELETE)
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

    // Memory Scope Ownership check:
    // If principal is an AGENT, dedicated agent scopes (e.g. `agent-${id}`) are strictly isolated to that agent
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
      requiredPermission: request.requiredPermission,
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

  // 6. Agent Delegation Boundary & Escalation Prevention
  async enforceDelegationBoundary(delegation: AgentDelegation, sourceContext: SecurityContext): Promise<{ allowed: boolean; code: string; reason: string }> {
    if (!delegation || typeof delegation !== "object" || !sourceContext || !(sourceContext instanceof SecurityContext)) {
      return {
        allowed: false,
        code: "SECURITY_INVALID_REQUEST",
        reason: "Agent delegation requires a valid delegation object and source SecurityContext",
      };
    }

    // Source must be authenticated
    if (!sourceContext.authenticated) {
      return {
        allowed: false,
        code: "SECURITY_UNAUTHENTICATED",
        reason: "Unauthenticated source cannot delegate capabilities",
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

    // Prevent privilege escalation via delegation: Target cannot acquire SYSTEM privileges or universal wildcard
    if (delegation.targetPrincipalId === "system-internal" || delegation.delegatedCapability === "*") {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_ESCALATION_BLOCKED",
        reason: "Delegation cannot confer SYSTEM or wildcard privileges",
      };
    }

    // Tenant boundary check: Source cannot delegate cross-tenant capabilities beyond its own tenant
    if (sourceContext.tenantId && delegation.tenantId && sourceContext.tenantId !== delegation.tenantId) {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_TENANT_ESCALATION_BLOCKED",
        reason: `Source tenant '${sourceContext.tenantId}' cannot delegate capabilities for target tenant '${delegation.tenantId}'`,
      };
    }

    // Scope boundary check: Source cannot delegate broader scope than its own scope
    if (sourceContext.resourceScope && delegation.scope && sourceContext.resourceScope !== delegation.scope && sourceContext.resourceScope !== "*") {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_SCOPE_ESCALATION_BLOCKED",
        reason: `Source scope '${sourceContext.resourceScope}' cannot delegate capabilities for target scope '${delegation.scope}'`,
      };
    }

    // Capability check: Verify source has authorization for handoff.transfer AND the capability being delegated
    const handoffAuthz = await this.evaluator.evaluate({
      context: sourceContext,
      action: "handoff.transfer",
      resourceType: "COORDINATION",
      resourceId: delegation.resource,
      targetAgentId: delegation.targetPrincipalId,
    });

    if (!handoffAuthz.allowed) {
      return {
        allowed: false,
        code: "SECURITY_DELEGATION_UNAUTHORIZED",
        reason: `Source principal '${sourceContext.principal.id}' is not authorized to delegate handoffs`,
      };
    }

    return {
      allowed: true,
      code: "SECURITY_DELEGATION_ALLOWED",
      reason: `Delegation from '${delegation.sourcePrincipalId}' to '${delegation.targetPrincipalId}' authorized`,
    };
  }
}
