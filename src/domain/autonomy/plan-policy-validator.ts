import { Plan, PlanPolicyRejectedError } from "./plan.js";
import { SecurityContext } from "../security/security.js";
import { SecurityBoundaryEnforcer } from "../../application/security/security-boundary-enforcer.js";
import { PolicyGateway } from "../policy/policy.js";

export interface PlanPolicyEvaluationOptions {
  readonly agentId?: string | undefined;
  readonly targetTenantId?: string | undefined;
  readonly allowedTools?: readonly string[] | undefined;
  readonly allowedAgents?: readonly string[] | undefined;
}

/**
 * PlanPolicyValidator guarantees that all planned steps conform to the platform's
 * security boundaries, tenant isolation rules, and RBAC permissions before execution is allowed.
 *
 * Invariant: The LLM can only PROPOSE. The platform policy decides AUTHORIZATION.
 */
export class PlanPolicyValidator {
  constructor(
    private readonly enforcer?: SecurityBoundaryEnforcer | undefined,
    private readonly policyGateway?: PolicyGateway | undefined
  ) {}

  async validatePolicy(
    plan: Plan,
    securityContext?: SecurityContext | undefined,
    options: PlanPolicyEvaluationOptions = {}
  ): Promise<void> {
    if (!plan || !(plan instanceof Plan)) {
      throw new PlanPolicyRejectedError("Plan must be a valid Plan instance");
    }

    // 1. Tool allowlist evaluation per agent definition if provided
    if (options.allowedTools && options.allowedTools.length > 0) {
      const allowedSet = new Set(options.allowedTools);
      for (const step of plan.steps) {
        const toolTarget = step.toolId ?? (step.action.startsWith("tool.") ? step.action.replace(/^tool\./, "") : undefined);
        if (toolTarget && !allowedSet.has(toolTarget) && !allowedSet.has(step.action)) {
          throw new PlanPolicyRejectedError(
            `Planned step ${step.order} requests tool '${toolTarget}' which is not allowed for agent '${options.agentId ?? "unknown"}'`,
            "tool-allowlist-denied",
            step.id
          );
        }
      }
    }

    // 2. Pre-execution SecurityBoundary check if SecurityContext is provided
    if (securityContext && this.enforcer) {
      for (const step of plan.steps) {
        // Enforce boundary if step action targets a tool
        const isTool = step.action.startsWith("tool.") || Boolean(step.toolId);
        if (isTool) {
          const toolId = step.toolId ?? step.action.replace(/^tool\./, "");
          const decision = await this.enforcer.enforceToolBoundary({
            context: securityContext,
            toolId,
            action: step.action,
            input: step.input,
            targetAgentId: options.agentId,
            targetTenantId: options.targetTenantId ?? securityContext.tenantId,
            correlationId: plan.operationId,
          });

          if (!decision.allowed) {
            throw new PlanPolicyRejectedError(
              `Security boundary rejected planned step ${step.order} ('${step.action}'): ${decision.reason}`,
              decision.policyId,
              step.id
            );
          }
        }
      }
    }

    // 3. Evaluate with PolicyGateway if configured
    if (this.policyGateway) {
      for (const step of plan.steps) {
        const decision = await this.policyGateway.evaluate({
          traceId: plan.operationId,
          operationType: "TOOL",
          resourceId: step.toolId ?? step.action,
          agentId: options.agentId,
          action: step.action,
          input: step.input,
          metadata: { stepId: step.id, order: step.order },
        });

        if (!decision.allowed) {
          throw new PlanPolicyRejectedError(
            `PolicyGateway rejected planned step ${step.order} ('${step.action}'): ${decision.reason ?? "Policy denied"}`,
            decision.policyId,
            step.id
          );
        }
      }
    }
  }
}
