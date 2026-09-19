/**
 * AI Operating Platform - Executive Plan Validator
 * 
 * Deterministic validator enforcing consistency between an ExecutivePlan and the ExecutiveContextSnapshot.
 */

import { ExecutivePlan } from "./executive-plan.js";
import { ExecutiveContextSnapshot } from "./executive-context-snapshot.js";
import { ExecutivePlanValidationError } from "./executive-errors.js";

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly violations: readonly string[];
}

export class ExecutivePlanValidator {
  static validate(plan: ExecutivePlan, context: ExecutiveContextSnapshot): PlanValidationResult {
    const violations: string[] = [];

    // 1. Tenant boundary
    if (plan.tenantId !== context.tenantId) {
      violations.push(`Cross-tenant mismatch: plan tenant '${plan.tenantId}' != context tenant '${context.tenantId}'`);
    }
    if (plan.enterpriseId !== context.enterpriseId) {
      violations.push(`Enterprise mismatch: plan enterprise '${plan.enterpriseId}' != context enterprise '${context.enterpriseId}'`);
    }

    // 2. Objective existence
    const targetObj = context.objectives.find((o) => o.id === plan.objectiveId);
    if (!targetObj) {
      violations.push(`Target Objective '${plan.objectiveId}' does not exist in context snapshot`);
    }

    // 3. Initiative existence (if specified)
    if (plan.initiativeId) {
      const targetInit = context.initiatives.find((i) => i.id === plan.initiativeId);
      if (!targetInit) {
        violations.push(`Target Initiative '${plan.initiativeId}' does not exist in context snapshot`);
      }
    }

    // 4. Action checks
    for (const action of plan.actions) {
      if (action.actionType === "START_WORKFLOW") {
        if (!action.workflowDefinitionId) {
          violations.push(`Action '${action.actionId}' of type START_WORKFLOW requires a workflowDefinitionId`);
        } else {
          const wf = context.workflows.find((w) => w.id === action.workflowDefinitionId);
          if (!wf) {
            violations.push(`Workflow '${action.workflowDefinitionId}' referenced in action '${action.actionId}' does not exist in snapshot`);
          } else if (wf.status !== "ACTIVE") {
            violations.push(`Workflow '${action.workflowDefinitionId}' is not ACTIVE (current status: ${wf.status})`);
          }
        }

        if (action.solutionId) {
          const sol = context.solutions.find((s) => s.id === action.solutionId);
          if (!sol) {
            violations.push(`Solution '${action.solutionId}' referenced in action '${action.actionId}' does not exist in snapshot`);
          } else if (action.solutionVersion !== undefined && sol.publishedVersion !== action.solutionVersion) {
            violations.push(`Solution '${action.solutionId}' version ${action.solutionVersion} does not match published version ${sol.publishedVersion}`);
          }
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations: Object.freeze(violations),
    };
  }

  static assertValid(plan: ExecutivePlan, context: ExecutiveContextSnapshot): void {
    const result = this.validate(plan, context);
    if (!result.valid) {
      throw new ExecutivePlanValidationError(
        `ExecutivePlan validation failed with ${result.violations.length} violation(s): ${result.violations.join("; ")}`,
        result.violations
      );
    }
  }
}
