import crypto from "node:crypto";
import { EventPublisher, DomainEvent } from "../../domain/events/events.js";
import { SecurityContext, Principal } from "../../domain/security/security.js";
import {
  AuthorizationRequest,
  AuthorizationResult,
  Role,
  RoleRepository,
} from "../../domain/security/authorization.js";

export interface AuthorizationEvaluator {
  evaluate(request: AuthorizationRequest): Promise<AuthorizationResult>;
}

export interface ExplicitPolicyRule {
  readonly id: string;
  readonly effect: "ALLOW" | "DENY";
  readonly description?: string | undefined;
  matches(request: AuthorizationRequest): boolean;
}

export class RbacAuthorizationEvaluator implements AuthorizationEvaluator {
  private readonly explicitPolicies: ExplicitPolicyRule[] = [];

  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly eventPublisher?: EventPublisher | undefined,
    explicitPolicies: readonly ExplicitPolicyRule[] = []
  ) {
    this.explicitPolicies.push(...explicitPolicies);
  }

  registerExplicitPolicy(policy: ExplicitPolicyRule): void {
    this.explicitPolicies.push(policy);
  }

  async evaluate(request: unknown): Promise<AuthorizationResult> {
    const evaluatedAt = new Date();

    // 1. Fail closed on malformed request
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_INVALID_REQUEST",
        reason: "Authorization request must be a valid non-null object",
        evaluatedAt,
      };
      this.publishAuthzEvent("authorization.denied", undefined, result);
      return result;
    }

    const req = request as Partial<AuthorizationRequest>;

    // 2. Fail closed on missing SecurityContext or Principal
    if (!req.context || !(req.context instanceof SecurityContext) || !req.context.principal || !(req.context.principal instanceof Principal)) {
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_CONTEXT_MISSING",
        reason: "Authorization requires an explicit SecurityContext and Principal",
        evaluatedAt,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }

    const { context, action, resourceType, resourceId, targetTenantId, targetScope, targetAgentId, requiredPermission } = req;
    const principal = context.principal;

    if (!action || typeof action !== "string" || action.trim() === "") {
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_ACTION_MISSING",
        reason: "Authorization action must be a non-empty string",
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }

    const normalizedAction = action.trim().toLowerCase();

    // 3. Anonymous & Public Operations Check
    const isPublicAction = normalizedAction === "public.read" || normalizedAction === "health.check";
    if (!context.authenticated) {
      if (isPublicAction) {
        const result: AuthorizationResult = {
          allowed: true,
          code: "SECURITY_PUBLIC_ALLOWED",
          reason: "Public operation permitted for unauthenticated caller",
          evaluatedAt,
          principalId: principal.id,
          principalType: principal.type,
          tenantId: principal.tenantId,
          resourceType,
          resourceId,
          action: normalizedAction,
        };
        this.publishAuthzEvent("authorization.allowed", req, result);
        return result;
      }

      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_UNAUTHENTICATED",
        reason: "Unauthenticated principal cannot access protected resource",
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
        action: normalizedAction,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }

    // 4. SYSTEM Protection: Check for external escalation to system-internal
    if (principal.type === "SYSTEM" && principal.id !== "system-internal") {
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_SYSTEM_PROTECTED",
        reason: "SYSTEM principal type cannot be assumed by external identities",
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
        action: normalizedAction,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }

    // 5. Agent Self-Escalation Check (Invariants #4, #5)
    if (principal.type === "AGENT") {
      const forbiddenEscalationActions = [
        "role.assign",
        "role.modify",
        "role.delete",
        "permission.grant",
        "permission.revoke",
        "security.elevate",
        "agent.spawn_privileged",
      ];
      if (forbiddenEscalationActions.includes(normalizedAction)) {
        const result: AuthorizationResult = {
          allowed: false,
          code: "SECURITY_AGENT_ESCALATION_BLOCKED",
          reason: `Agent '${principal.id}' cannot perform security self-escalation action '${normalizedAction}'`,
          evaluatedAt,
          principalId: principal.id,
          principalType: principal.type,
          tenantId: principal.tenantId,
          resourceType,
          resourceId,
          action: normalizedAction,
        };
        this.publishAuthzEvent("authorization.denied", req, result);
        return result;
      }

      // Cross-Agent Boundary Check (Invariant #8, #9)
      if (targetAgentId && targetAgentId !== principal.id && normalizedAction !== "handoff.transfer") {
        const result: AuthorizationResult = {
          allowed: false,
          code: "SECURITY_CROSS_AGENT_VIOLATION",
          reason: `Agent '${principal.id}' cannot access resources of target agent '${targetAgentId}' without authorized handoff`,
          evaluatedAt,
          principalId: principal.id,
          principalType: principal.type,
          tenantId: principal.tenantId,
          resourceType,
          resourceId,
          action: normalizedAction,
        };
        this.publishAuthzEvent("authorization.denied", req, result);
        return result;
      }
    }

    // 6. Tenant Isolation Check
    if (context.tenantId && targetTenantId && context.tenantId !== targetTenantId) {
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_TENANT_ISOLATION_VIOLATION",
        reason: `Caller tenant '${context.tenantId}' is not authorized to access target tenant '${targetTenantId}'`,
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
        action: normalizedAction,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }

    // 7. Scope Isolation Check
    if (context.resourceScope && targetScope && context.resourceScope !== targetScope && context.resourceScope !== "*") {
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_SCOPE_ISOLATION_VIOLATION",
        reason: `Caller scope '${context.resourceScope}' does not match target scope '${targetScope}'`,
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
        action: normalizedAction,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }

    // 8. Explicit Policy Precedence: Explicit DENY > Explicit ALLOW > Role RBAC > Default DENY
    try {
      // Check explicit DENY policies
      for (const policy of this.explicitPolicies) {
        if (policy.effect === "DENY" && policy.matches(req as AuthorizationRequest)) {
          const result: AuthorizationResult = {
            allowed: false,
            code: "SECURITY_EXPLICIT_DENIED",
            reason: `Operation explicitly denied by policy '${policy.id}'`,
            evaluatedAt,
            principalId: principal.id,
            principalType: principal.type,
            tenantId: principal.tenantId,
            resourceType,
            resourceId,
            action: normalizedAction,
            matchedPolicyId: policy.id,
          };
          this.publishAuthzEvent("authorization.denied", req, result);
          return result;
        }
      }

      // Check explicit ALLOW policies
      for (const policy of this.explicitPolicies) {
        if (policy.effect === "ALLOW" && policy.matches(req as AuthorizationRequest)) {
          const result: AuthorizationResult = {
            allowed: true,
            code: "SECURITY_EXPLICIT_ALLOWED",
            reason: `Operation explicitly allowed by policy '${policy.id}'`,
            evaluatedAt,
            principalId: principal.id,
            principalType: principal.type,
            tenantId: principal.tenantId,
            resourceType,
            resourceId,
            action: normalizedAction,
            matchedPolicyId: policy.id,
          };
          this.publishAuthzEvent("authorization.allowed", req, result);
          return result;
        }
      }

      // 9. RBAC Role & Permission Evaluation
      const roles = await this.roleRepository.getRolesForPrincipal(principal);
      if (roles.length === 0) {
        const result: AuthorizationResult = {
          allowed: false,
          code: "SECURITY_NO_ROLES_ASSIGNED",
          reason: `Principal '${principal.id}' has no resolvable roles assigned`,
          evaluatedAt,
          principalId: principal.id,
          principalType: principal.type,
          tenantId: principal.tenantId,
          resourceType,
          resourceId,
          action: normalizedAction,
        };
        this.publishAuthzEvent("authorization.denied", req, result);
        return result;
      }

      // Candidate permission keys to match
      const permCandidates = new Set<string>();
      if (requiredPermission) {
        permCandidates.add(requiredPermission.trim().toLowerCase());
      }
      if (resourceType) {
        permCandidates.add(`${resourceType.toLowerCase()}.${normalizedAction}`);
      }
      permCandidates.add(normalizedAction);

      const matchedRoles: string[] = [];
      let isPermitted = false;

      for (const role of roles) {
        for (const candidate of permCandidates) {
          if (role.hasPermission(candidate)) {
            isPermitted = true;
            matchedRoles.push(role.id);
            break;
          }
        }
      }

      if (isPermitted) {
        const result: AuthorizationResult = {
          allowed: true,
          code: "SECURITY_RBAC_ALLOWED",
          reason: `Operation authorized by roles: [${matchedRoles.join(", ")}]`,
          evaluatedAt,
          principalId: principal.id,
          principalType: principal.type,
          tenantId: principal.tenantId,
          resourceType,
          resourceId,
          action: normalizedAction,
          matchedRoles: Object.freeze(matchedRoles),
        };
        this.publishAuthzEvent("authorization.allowed", req, result);
        return result;
      }

      // 10. Default DENY: No matching role permission found
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_DEFAULT_DENY",
        reason: `Principal '${principal.id}' lacks permissions for action '${normalizedAction}' on resource '${resourceId ?? ""}'`,
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
        action: normalizedAction,
        matchedRoles: Object.freeze(roles.map((r) => r.id)),
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    } catch {
      // Fail closed on any evaluator or repository exception
      const result: AuthorizationResult = {
        allowed: false,
        code: "SECURITY_EVALUATION_ERROR",
        reason: "Authorization evaluation encountered an internal error",
        evaluatedAt,
        principalId: principal.id,
        principalType: principal.type,
        tenantId: principal.tenantId,
        resourceType,
        resourceId,
        action: normalizedAction,
      };
      this.publishAuthzEvent("authorization.denied", req, result);
      return result;
    }
  }

  private publishAuthzEvent(
    type: "authorization.allowed" | "authorization.denied",
    request: Partial<AuthorizationRequest> | undefined,
    result: AuthorizationResult
  ): void {
    if (!this.eventPublisher) return;

    const traceId = request?.context?.correlationId ?? crypto.randomUUID();
    const event: DomainEvent = {
      id: crypto.randomUUID(),
      type,
      traceId,
      aggregateId: result.principalId ?? "anonymous",
      occurredAt: new Date(),
      payload: {
        principalId: result.principalId,
        principalType: result.principalType,
        tenantId: result.tenantId,
        resourceType: result.resourceType,
        resourceId: result.resourceId,
        action: result.action,
        decision: result.allowed ? "ALLOW" : "DENY",
        code: result.code,
        reason: result.reason,
        matchedRoles: result.matchedRoles,
        matchedPolicyId: result.matchedPolicyId,
        requestId: request?.context?.requestId,
      },
    };

    try {
      this.eventPublisher.publish(event);
    } catch {
      // Event publication errors must not compromise authorization decisions
    }
  }
}
