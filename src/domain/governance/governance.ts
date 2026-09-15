export type RiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type HumanOversightLevel =
  | "AUTOMATIC"
  | "AUTOMATIC_AUDIT"
  | "USER_CONFIRMATION"
  | "HUMAN_APPROVAL";

export type ChangeLifecycleState =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "RETIRED";

export interface GovernedPolicyRule {
  readonly ruleId: string;
  readonly resource: string;
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly oversightLevel: HumanOversightLevel;
  readonly condition?: string;
}

export interface GovernedPolicy {
  readonly policyId: string;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly status: ChangeLifecycleState;
  readonly effectiveAt: string;
  readonly rules: readonly GovernedPolicyRule[];
  readonly owner: string;
}

export interface GovernanceAuditEntry {
  readonly auditId: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly targetType: "APPLICATION" | "AGENT" | "MODEL" | "TOOL" | "POLICY" | "TENANT";
  readonly targetId: string;
  readonly action: string;
  readonly riskTier: RiskTier;
  readonly oversightEnforced: HumanOversightLevel;
  readonly decision: "ALLOWED" | "DENIED" | "PENDING_APPROVAL";
  readonly rationale?: string;
}

export interface ApplicationGovernanceRecord {
  readonly applicationId: string;
  readonly name: string;
  readonly owner: string;
  readonly environment: string;
  readonly riskTier: RiskTier;
  readonly status: ChangeLifecycleState;
  readonly approvedCapabilities: readonly string[];
  readonly contactEmail: string;
  readonly registeredAt: string;
  readonly lastReviewedAt: string;
}
