/**
 * AI Operating Platform - Executive Governance Gate
 * 
 * Formal evaluation gate checking Identity, Authority, PolicyGateway, Budget,
 * and Autonomy Level constraints before a plan can proceed to execution.
 */

import { ExecutivePlan } from "./executive-plan.js";
import { AutonomyLevel, requiresHumanOversight, isHighImpactAction } from "../business/autonomy-level.js";
import { PolicyGateway } from "../policy/policy.js";

export interface GovernanceEvaluationResult {
  readonly allowed: boolean;
  readonly requiresHumanApproval: boolean;
  readonly highImpactDetected: boolean;
  readonly reasons: readonly string[];
}

export class ExecutiveGovernanceGate {
  /**
   * Evaluates if the plan can be executed automatically or strictly requires human approval.
   */
  static async evaluate(
    plan: ExecutivePlan,
    autonomyLevel: AutonomyLevel,
    policyGateway?: PolicyGateway | undefined
  ): Promise<GovernanceEvaluationResult> {
    const reasons: string[] = [];
    let requiresApproval = false;
    let highImpactDetected = false;

    // 1. High impact action check across all plan actions
    for (const action of plan.actions) {
      if (isHighImpactAction(action.actionType) || action.requiresApproval) {
        highImpactDetected = true;
        requiresApproval = true;
        reasons.push(`Action '${action.actionId}' is classified as HIGH IMPACT or explicitly requires approval`);
      }

      // Autonomy level check
      if (requiresHumanOversight(action.actionType, autonomyLevel)) {
        requiresApproval = true;
        reasons.push(`Autonomy level '${autonomyLevel}' requires human oversight for action '${action.actionType}'`);
      }
    }

    // 2. Policy Gateway Check (if provided)
    if (policyGateway) {
      try {
        for (const action of plan.actions) {
          const evalResult = await policyGateway.evaluate({
            traceId: `trace-gate-${plan.cycleId}`,
            operationId: `gate:action:${action.actionId}`,
            operationType: "TOOL",
            resourceId: action.targetId || action.actionId,
            action: `executive.action.${action.actionType}`,
            riskLevel: highImpactDetected ? "HIGH" : "MEDIUM",
            metadata: {
              tenantId: plan.tenantId,
              cycleId: plan.cycleId,
              enterpriseId: plan.enterpriseId,
              autonomyLevel,
            },
          });

          if (!evalResult.allowed) {
            return {
              allowed: false,
              requiresHumanApproval: true,
              highImpactDetected,
              reasons: Object.freeze([`PolicyGateway denied action '${action.actionId}': ${evalResult.reason ?? "Denied by policy"}`]),
            };
          }
        }
      } catch (err: any) {
        // Fail-closed on policy evaluation error
        return {
          allowed: false,
          requiresHumanApproval: true,
          highImpactDetected,
          reasons: Object.freeze([`PolicyGateway evaluation failed fail-closed: ${err.message}`]),
        };
      }
    }

    return {
      allowed: true,
      requiresHumanApproval: requiresApproval,
      highImpactDetected,
      reasons: Object.freeze(reasons),
    };
  }
}

