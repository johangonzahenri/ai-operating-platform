/**
 * AI Operating Platform - Autonomy Level & Governance Boundaries
 * 
 * Formal taxonomy of progressive autonomy levels and high-impact action gating rules.
 * 
 * Invariants:
 * - Autonomy Level controls WHAT CAN BE AUTOMATED, not WHO HAS AUTHORITY.
 * - Autonomy NEVER equals unlimited authority.
 * - High-impact actions are always gated by PolicyGateway, Budget, Verification, and Human Oversight.
 */

export type AutonomyLevel =
  | "LEVEL_0_MANUAL"
  | "LEVEL_1_ASSISTED"
  | "LEVEL_2_GOVERNED_AUTOMATION"
  | "LEVEL_3_GOVERNED_AUTONOMY"
  | "LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS";

export const HIGH_IMPACT_ACTION_TYPES: readonly string[] = [
  "FINANCIAL_TRANSFER",
  "DESTRUCTIVE_OPERATION",
  "PRODUCTION_DEPLOYMENT",
  "LEGAL_COMMITMENT",
  "EXTERNAL_CONTRACT",
  "POLICY_MUTATION",
  "BUDGET_EXPANSION",
  "STRATEGIC_OBJECTIVE_MUTATION",
  "SELF_GOVERNANCE_MUTATION",
];

export function isHighImpactAction(actionType: string): boolean {
  return HIGH_IMPACT_ACTION_TYPES.includes(actionType.trim().toUpperCase());
}

/**
 * Evaluates whether an action requires explicit human oversight under a given autonomy level.
 * High-impact actions require human oversight across all autonomy levels.
 */
export function requiresHumanOversight(actionType: string, level: AutonomyLevel): boolean {
  if (isHighImpactAction(actionType)) {
    return true;
  }
  switch (level) {
    case "LEVEL_0_MANUAL":
    case "LEVEL_1_ASSISTED":
      return true;
    case "LEVEL_2_GOVERNED_AUTOMATION":
    case "LEVEL_3_GOVERNED_AUTONOMY":
    case "LEVEL_4_MULTI_ENTERPRISE_AUTONOMOUS":
      return false;
    default:
      return true; // Fail-closed default
  }
}
