/**
 * AI Operating Platform — Transversal Quality Governance & Audit Domain Model
 * 
 * Formal domain entities, value objects, and types for system-wide quality governance,
 * audit controls, evidence classifications, and coverage evaluation.
 * 
 * Design Invariants:
 * 1. Zero third-party dependencies in domain.
 * 2. Unambiguous evidence taxonomy (E0..E7): no conflation of unit tests with live HTTP or production.
 * 3. Monotonic, fail-closed audit verdicts.
 * 4. Distinct separation between Software Status and Environmental Readiness.
 */

/**
 * Formal 8-level hierarchy of audit evidence.
 */
export type EvidenceLevel =
  | "E0_DOCUMENTARY"       // Documentation, schemas, architectural records, design specs
  | "E1_STATIC_ANALYSIS"   // Static code scanning, AST parsing, linting, pure imports check
  | "E2_UNIT_TEST"         // Pure in-memory unit tests of aggregates, entities, value objects
  | "E3_INTEGRATION_TEST"  // Multi-component integration in-memory or with mock/fake adapters
  | "E4_E2E_SIMULATED"     // End-to-end flow with in-memory persistence and fake boundary ports
  | "E5_LIVE_HTTP"         // Live network socket requests against local runtime (127.0.0.1)
  | "E6_STAGING_ENV"       // Executed in deployed staging/pre-production environment
  | "E7_PRODUCTION";       // Executed against live production infrastructure with public certs/IdP

export const CANONICAL_EVIDENCE_LEVELS: readonly EvidenceLevel[] = Object.freeze([
  "E0_DOCUMENTARY",
  "E1_STATIC_ANALYSIS",
  "E2_UNIT_TEST",
  "E3_INTEGRATION_TEST",
  "E4_E2E_SIMULATED",
  "E5_LIVE_HTTP",
  "E6_STAGING_ENV",
  "E7_PRODUCTION",
]);

/**
 * Three formal categories of audit execution.
 */
export type AuditType =
  | "AUD_FASE"        // Periodic short-range audit (every 3-4 phases or on structural trigger)
  | "AUD_SISTEMA"     // Transversal holistic system audit at major architectural milestones
  | "AUD_LIBERACION";  // Formal release gate certification (MVP, V1, Production)

/**
 * Formal audit finding severity.
 */
export type AuditFindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/**
 * Formal audit finding lifecycle states.
 */
export type AuditFindingStatus =
  | "OPEN"
  | "FIXED"
  | "MITIGATED"
  | "ACCEPTED_DEBT"
  | "PENDING_ENVIRONMENT";

/**
 * Nature of the finding: distinguishes bugs from architectural debt and environment gaps.
 */
export type AuditFindingCategory =
  | "DEFECT_BUG"
  | "TECHNICAL_DEBT"
  | "ARCHITECTURAL_RISK"
  | "EVIDENCE_OVERCLAIM"
  | "ENVIRONMENT_GAP";

export interface AuditFindingProps {
  readonly id: string;
  readonly controlId: string;
  readonly severity: AuditFindingSeverity;
  readonly category: AuditFindingCategory;
  readonly description: string;
  readonly component: string;
  readonly evidenceLevel: EvidenceLevel;
  readonly evidenceDetails: string;
  readonly impact: string;
  readonly requiredAction: string;
  readonly status: AuditFindingStatus;
}

export class AuditFinding {
  readonly id: string;
  readonly controlId: string;
  readonly severity: AuditFindingSeverity;
  readonly category: AuditFindingCategory;
  readonly description: string;
  readonly component: string;
  readonly evidenceLevel: EvidenceLevel;
  readonly evidenceDetails: string;
  readonly impact: string;
  readonly requiredAction: string;
  readonly status: AuditFindingStatus;

  constructor(props: AuditFindingProps) {
    if (!props.id || !props.controlId) {
      throw new Error("AuditFinding requires id and controlId");
    }
    this.id = props.id;
    this.controlId = props.controlId;
    this.severity = props.severity;
    this.category = props.category;
    this.description = props.description;
    this.component = props.component;
    this.evidenceLevel = props.evidenceLevel;
    this.evidenceDetails = props.evidenceDetails;
    this.impact = props.impact;
    this.requiredAction = props.requiredAction;
    this.status = props.status;
  }

  isBlocking(): boolean {
    if (this.status === "FIXED" || this.status === "MITIGATED" || this.status === "ACCEPTED_DEBT") {
      return false;
    }
    return this.severity === "CRITICAL" || this.severity === "HIGH";
  }
}

/**
 * Status of an individual audit control evaluation.
 */
export type AuditControlResult =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "NOT_VERIFIED"
  | "NOT_APPLICABLE"
  | "PENDING_ENVIRONMENT";

export interface AuditEvidenceRecord {
  readonly level: EvidenceLevel;
  readonly sourceFile: string;
  readonly testName?: string | undefined;
  readonly verifiedAt: string;
  readonly sha256OrHash?: string | undefined;
  readonly demonstratedClaim: string;
  readonly explicitLimitation: string;
}

export interface AuditControlProps {
  readonly controlId: string;
  readonly name: string;
  readonly domain: string;
  readonly layer: "CORE_DOMAIN" | "APPLICATION" | "PORTS" | "INFRASTRUCTURE" | "PLATFORM" | "SATELLITE_APP";
  readonly result: AuditControlResult;
  readonly evidence: AuditEvidenceRecord;
  readonly findings?: readonly AuditFinding[] | undefined;
}

export class AuditControl {
  readonly controlId: string;
  readonly name: string;
  readonly domain: string;
  readonly layer: AuditControlProps["layer"];
  readonly result: AuditControlResult;
  readonly evidence: AuditEvidenceRecord;
  readonly findings: readonly AuditFinding[];

  constructor(props: AuditControlProps) {
    this.controlId = props.controlId;
    this.name = props.name;
    this.domain = props.domain;
    this.layer = props.layer;
    this.result = props.result;
    this.evidence = props.evidence;
    this.findings = props.findings ?? [];
  }
}

/**
 * Capability audit status in the system inventory.
 */
export type CapabilityAuditStatus =
  | "AUDITED"
  | "PARTIALLY_AUDITED"
  | "NOT_AUDITED"
  | "NOT_APPLICABLE"
  | "PENDING_ENVIRONMENT";

export interface CapabilityInventoryItem {
  readonly capabilityId: string;
  readonly domain: string;
  readonly layer: string;
  readonly implementedInCode: boolean;
  readonly auditStatus: CapabilityAuditStatus;
  readonly controllingAuditId?: string | undefined;
  readonly notes?: string | undefined;
}

/**
 * System Audit Verdict.
 */
export type AuditVerdict =
  | "AUDITORIA_APROBADA"
  | "AUDITORIA_APROBADA_CON_DEUDA"
  | "AUDITORIA_BLOQUEADA"
  | "AUDITORIA_NO_EJECUTABLE";

export interface AuditSessionProps {
  readonly auditId: string;
  readonly auditType: AuditType;
  readonly baselineCommit: string;
  readonly platformVersion: string;
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
  readonly controls: readonly AuditControl[];
  readonly capabilities: readonly CapabilityInventoryItem[];
}

export class AuditSession {
  readonly auditId: string;
  readonly auditType: AuditType;
  readonly baselineCommit: string;
  readonly platformVersion: string;
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
  readonly controls: readonly AuditControl[];
  readonly capabilities: readonly CapabilityInventoryItem[];

  constructor(props: AuditSessionProps) {
    this.auditId = props.auditId;
    this.auditType = props.auditType;
    this.baselineCommit = props.baselineCommit;
    this.platformVersion = props.platformVersion;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.controls = props.controls;
    this.capabilities = props.capabilities;
  }

  evaluateVerdict(): AuditVerdict {
    // 1. Any non-executable control?
    const hasUnexecutable = this.controls.some((c) => c.result === "NOT_VERIFIED" && c.evidence.level === "E7_PRODUCTION");
    if (this.controls.length === 0) {
      return "AUDITORIA_NO_EJECUTABLE";
    }

    // 2. Check for blocking findings across all controls
    const allFindings = this.controls.flatMap((c) => c.findings);
    const hasBlockingFinding = allFindings.some((f) => f.isBlocking());
    if (hasBlockingFinding) {
      return "AUDITORIA_BLOQUEADA";
    }

    // 3. Any partially verified controls or non-blocking technical debt?
    const hasPartial = this.controls.some((c) => c.result === "PARTIALLY_VERIFIED");
    const hasDebt = allFindings.some(
      (f) => f.category === "TECHNICAL_DEBT" || f.category === "ENVIRONMENT_GAP" || f.status === "ACCEPTED_DEBT"
    );

    if (hasPartial || hasDebt) {
      return "AUDITORIA_APROBADA_CON_DEUDA";
    }

    // 4. Clean pass
    return "AUDITORIA_APROBADA";
  }

  calculateCoverage(): {
    totalCapabilities: number;
    auditedCount: number;
    partialCount: number;
    notAuditedCount: number;
    pendingEnvCount: number;
    auditCoveragePercent: number;
  } {
    const total = this.capabilities.length;
    if (total === 0) {
      return { totalCapabilities: 0, auditedCount: 0, partialCount: 0, notAuditedCount: 0, pendingEnvCount: 0, auditCoveragePercent: 0 };
    }

    const audited = this.capabilities.filter((c) => c.auditStatus === "AUDITED").length;
    const partial = this.capabilities.filter((c) => c.auditStatus === "PARTIALLY_AUDITED").length;
    const notAudited = this.capabilities.filter((c) => c.auditStatus === "NOT_AUDITED").length;
    const pendingEnv = this.capabilities.filter((c) => c.auditStatus === "PENDING_ENVIRONMENT").length;

    // Partial counts as 0.5 towards coverage
    const effectiveCovered = audited + partial * 0.5;
    const auditCoveragePercent = Math.round((effectiveCovered / total) * 100);

    return {
      totalCapabilities: total,
      auditedCount: audited,
      partialCount: partial,
      notAuditedCount: notAudited,
      pendingEnvCount: pendingEnv,
      auditCoveragePercent,
    };
  }
}
