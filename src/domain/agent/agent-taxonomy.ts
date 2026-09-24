/**
 * Agent Taxonomy & Capability Model — AI Operating Platform
 * 
 * Formal definitions for agent types, capability tiers, tool proficiencies,
 * external provider contracts, and delegation boundaries.
 */

export type AgentTaxonomyType =
  | "NATIVE_AGENT"
  | "MODEL_AGENT"
  | "WEB_AGENT"
  | "RESEARCH_AGENT"
  | "CODE_AGENT"
  | "AUTOMATION_AGENT"
  | "VERIFICATION_AGENT"
  | "EXTERNAL_AGENT";

export const VALID_AGENT_TAXONOMY_TYPES: readonly AgentTaxonomyType[] = Object.freeze([
  "NATIVE_AGENT",
  "MODEL_AGENT",
  "WEB_AGENT",
  "RESEARCH_AGENT",
  "CODE_AGENT",
  "AUTOMATION_AGENT",
  "VERIFICATION_AGENT",
  "EXTERNAL_AGENT",
]);

export type ToolProficiencyLevel = "DECLARED" | "VERIFIED" | "DEGRADED" | "DISABLED";

export const VALID_TOOL_PROFICIENCY_LEVELS: readonly ToolProficiencyLevel[] = Object.freeze([
  "DECLARED",
  "VERIFIED",
  "DEGRADED",
  "DISABLED",
]);

export interface GovernedToolProficiency {
  readonly toolId: string;
  readonly proficiency: ToolProficiencyLevel;
  readonly verifiedAt?: Date | undefined;
  readonly verifiedBy?: string | undefined;
  readonly lastEvaluatedVersion?: number | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AgentPolicyDirectives {
  readonly maxSteps?: number | undefined;
  readonly maxHandoffs?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly allowedDomains?: readonly string[] | undefined;
  readonly blockedDomains?: readonly string[] | undefined;
  readonly requireHumanApprovalForDestructive?: boolean | undefined;
  readonly requireEvidenceProvenance?: boolean | undefined;
  readonly budgetQuotaPerTask?: Readonly<{
    readonly maxToolCalls?: number;
    readonly maxModelTokens?: number;
    readonly maxDurationMs?: number;
    readonly maxWebRequests?: number;
  }> | undefined;
}

export interface StructuredClaimEvidence {
  readonly claimId: string;
  readonly source: string;
  readonly sourceDomain?: string | undefined;
  readonly timestamp: Date;
  readonly statement: string;
  readonly rawEvidenceSnippet: string;
  readonly confidenceScore: number; // 0.0 to 1.0
  readonly verifiedDeterministically: boolean;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface AgentTaxonomyDefinition {
  readonly taxonomyType: AgentTaxonomyType;
  readonly roleName: string;
  readonly description: string;
  readonly primaryResponsibilities: readonly string[];
  readonly defaultAllowedTools: readonly string[];
  readonly policyDefaults: AgentPolicyDirectives;
}

export const CANONICAL_AGENT_TAXONOMY: Readonly<Record<AgentTaxonomyType, AgentTaxonomyDefinition>> = Object.freeze({
  NATIVE_AGENT: Object.freeze({
    taxonomyType: "NATIVE_AGENT",
    roleName: "Native Core Agent",
    description: "In-process deterministic agent executing platform-native algorithms without external dependencies.",
    primaryResponsibilities: Object.freeze(["DIAGNOSTICS", "EXECUTION", "COORDINATION"]),
    defaultAllowedTools: Object.freeze(["calculator", "system.ping"]),
    policyDefaults: Object.freeze({
      maxSteps: 5,
      maxHandoffs: 3,
      maxDepth: 2,
      requireEvidenceProvenance: false,
    }),
  }),
  MODEL_AGENT: Object.freeze({
    taxonomyType: "MODEL_AGENT",
    roleName: "Model Inference Agent",
    description: "LLM-powered reasoning agent governed by model gateways and structured output schemas.",
    primaryResponsibilities: Object.freeze(["ANALYSIS", "EXECUTION", "CUSTOMER_SUPPORT"]),
    defaultAllowedTools: Object.freeze(["calculator"]),
    policyDefaults: Object.freeze({
      maxSteps: 10,
      maxHandoffs: 5,
      maxDepth: 3,
      requireEvidenceProvenance: false,
    }),
  }),
  WEB_AGENT: Object.freeze({
    taxonomyType: "WEB_AGENT",
    roleName: "Web AI Navigation & Extraction Agent",
    description: "Governed web browsing, searching, and structured data extraction agent with strict domain allowlists.",
    primaryResponsibilities: Object.freeze(["ANALYSIS", "CATALOG", "INVENTORY"]),
    defaultAllowedTools: Object.freeze(["web.search", "web.extract", "web.fetch_metadata"]),
    policyDefaults: Object.freeze({
      maxSteps: 15,
      maxHandoffs: 5,
      maxDepth: 3,
      requireEvidenceProvenance: true,
      budgetQuotaPerTask: Object.freeze({
        maxWebRequests: 20,
        maxDurationMs: 60000,
        maxToolCalls: 25,
      }),
    }),
  }),
  RESEARCH_AGENT: Object.freeze({
    taxonomyType: "RESEARCH_AGENT",
    roleName: "Market & Technical Research Agent",
    description: "Multi-source synthesizer producing evidence-backed structured findings with confidence scores.",
    primaryResponsibilities: Object.freeze(["ANALYSIS", "DIAGNOSTICS"]),
    defaultAllowedTools: Object.freeze(["web.search", "web.extract", "calculator"]),
    policyDefaults: Object.freeze({
      maxSteps: 20,
      maxHandoffs: 6,
      maxDepth: 3,
      requireEvidenceProvenance: true,
    }),
  }),
  CODE_AGENT: Object.freeze({
    taxonomyType: "CODE_AGENT",
    roleName: "Engineering & Code Synthesis Agent",
    description: "Governed code generation and refactoring assistant operating within strict sandbox and PR policies.",
    primaryResponsibilities: Object.freeze(["EXECUTION", "MAINTENANCE"]),
    defaultAllowedTools: Object.freeze(["code.analyze", "code.test_runner"]),
    policyDefaults: Object.freeze({
      maxSteps: 15,
      maxHandoffs: 4,
      maxDepth: 2,
      requireHumanApprovalForDestructive: true,
      requireEvidenceProvenance: true,
    }),
  }),
  AUTOMATION_AGENT: Object.freeze({
    taxonomyType: "AUTOMATION_AGENT",
    roleName: "Business Process Automation Agent",
    description: "Executes scheduled workflows, inventory updates, and business operations under deterministic controls.",
    primaryResponsibilities: Object.freeze(["EXECUTION", "INVENTORY", "COORDINATION"]),
    defaultAllowedTools: Object.freeze(["calculator", "device.print"]),
    policyDefaults: Object.freeze({
      maxSteps: 20,
      maxHandoffs: 5,
      maxDepth: 3,
      requireEvidenceProvenance: true,
    }),
  }),
  VERIFICATION_AGENT: Object.freeze({
    taxonomyType: "VERIFICATION_AGENT",
    roleName: "Deterministic Quality & Policy Verifier",
    description: "Segregation-of-duties verifier validating schemas, mathematical invariants, and evidence purity.",
    primaryResponsibilities: Object.freeze(["VERIFICATION", "SECURITY"]),
    defaultAllowedTools: Object.freeze(["calculator"]),
    policyDefaults: Object.freeze({
      maxSteps: 5,
      maxHandoffs: 2,
      maxDepth: 1,
      requireEvidenceProvenance: true,
    }),
  }),
  EXTERNAL_AGENT: Object.freeze({
    taxonomyType: "EXTERNAL_AGENT",
    roleName: "Sandboxed External Provider Agent",
    description: "External specialized agent runtime (Codex CLI, OpenHands, Aider) governed via fail-closed adapter.",
    primaryResponsibilities: Object.freeze(["EXECUTION", "ANALYSIS"]),
    defaultAllowedTools: Object.freeze([]),
    policyDefaults: Object.freeze({
      maxSteps: 10,
      maxHandoffs: 3,
      maxDepth: 2,
      requireHumanApprovalForDestructive: true,
      requireEvidenceProvenance: true,
    }),
  }),
});
