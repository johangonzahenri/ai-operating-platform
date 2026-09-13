import { PolicyContext, PolicyDecision, PolicyGateway } from "../../domain/policy/policy.js";
import { SecurityContext } from "../../domain/security/security.js";
import {
  AuthorizationRequest,
  ResourceType,
} from "../../domain/security/authorization.js";
import { AuthorizationEvaluator } from "../../application/security/rbac-authorization-evaluator.js";

export class RbacPolicyGateway implements PolicyGateway {
  constructor(
    private readonly evaluator: AuthorizationEvaluator,
    private readonly defaultSecurityContextSupplier?: (context: PolicyContext) => SecurityContext
  ) {}

  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    if (!context || typeof context !== "object") {
      return {
        allowed: false,
        policyId: "security-fail-closed",
        code: "SECURITY_INVALID_REQUEST",
        reason: "PolicyContext must be a non-null object",
      };
    }

    try {
      const secContext =
        context.metadata?.securityContext instanceof SecurityContext
          ? context.metadata.securityContext
          : this.defaultSecurityContextSupplier
          ? this.defaultSecurityContextSupplier(context)
          : SecurityContext.anonymous(context.traceId ?? "untracked");

      const resourceType: ResourceType =
        context.operationType === "MODEL"
          ? "MODEL"
          : context.operationType === "TOOL"
          ? "TOOL"
          : "API";

      const action =
        typeof context.action === "string" && context.action.trim() !== ""
          ? context.action.trim()
          : context.operationType === "MODEL"
          ? "model.invoke"
          : "tool.invoke";

      const authzReq: AuthorizationRequest = {
        context: secContext,
        action,
        resourceType,
        resourceId: context.resourceId ?? "unknown",
        targetAgentId: context.agentId,
        requiredPermission: Array.isArray(context.requiredPermissions) && context.requiredPermissions[0]
          ? context.requiredPermissions[0]
          : undefined,
        riskLevel: context.riskLevel,
        metadata: context.metadata,
      };

      const result = await this.evaluator.evaluate(authzReq);

      return {
        allowed: result.allowed,
        policyId: result.matchedPolicyId ?? (result.allowed ? "rbac-allow" : "rbac-deny"),
        code: result.code,
        reason: result.reason,
      };
    } catch {
      return {
        allowed: false,
        policyId: "security-fail-closed",
        code: "SECURITY_EVALUATION_ERROR",
        reason: "Authorization policy evaluation failed closed",
      };
    }
  }
}
