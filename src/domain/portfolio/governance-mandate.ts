/**
 * AI Operating Platform - EnterpriseGovernanceMandate Aggregate Root
 * 
 * Defines explicit, bounded, time-limited governance authority of a principal, agent,
 * or shared service over one or more target enterprises within a portfolio context.
 * 
 * Core Invariant:
 * MANDATE != ROLE != PERMISSION != AUTONOMY
 * 
 * An operation that spans from Source Enterprise to Target Enterprise(s) is DENIED
 * by default unless an ACTIVE, unexpired, non-revoked Mandate covers the exact operation,
 * target enterprise, and autonomy boundaries.
 */

import { AutonomyLevel, requiresHumanOversight } from "../business/autonomy-level.js";
import {
  PortfolioValidationError,
  MandateRevokedError,
  MandateExpiredError,
  MandateScopeViolationError,
  PortfolioConcurrencyConflictError,
} from "./portfolio-errors.js";

export type MandateStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export type MandateAuthorityScope =
  | "PORTFOLIO_COORDINATION"
  | "SHARED_SERVICE"
  | "EXECUTIVE_AUDIT"
  | "RESTRICTED_OPERATION";

export interface GovernanceMandateProps {
  readonly id: string;
  readonly tenantId: string;
  readonly portfolioId: string;
  readonly sourceEnterpriseId: string;
  readonly targetEnterpriseIds: readonly string[];
  readonly granteePrincipalId: string;
  readonly authorityScope: MandateAuthorityScope;
  readonly allowedOperations: readonly string[];
  readonly allowedObjectives: readonly string[];
  readonly autonomyLimit: AutonomyLevel;
  readonly requiresApproval: boolean;
  readonly status: MandateStatus;
  readonly validFrom: Date;
  readonly validTo?: Date | undefined;
  readonly revocationReason?: string | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateGovernanceMandateProps {
  readonly id: string;
  readonly tenantId: string;
  readonly portfolioId: string;
  readonly sourceEnterpriseId: string;
  readonly targetEnterpriseIds: readonly string[];
  readonly granteePrincipalId: string;
  readonly authorityScope: MandateAuthorityScope;
  readonly allowedOperations?: readonly string[] | undefined;
  readonly allowedObjectives?: readonly string[] | undefined;
  readonly autonomyLimit?: AutonomyLevel | undefined;
  readonly requiresApproval?: boolean | undefined;
  readonly validFrom?: Date | undefined;
  readonly validTo?: Date | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_AUTHORITY_SCOPES: readonly MandateAuthorityScope[] = [
  "PORTFOLIO_COORDINATION",
  "SHARED_SERVICE",
  "EXECUTIVE_AUDIT",
  "RESTRICTED_OPERATION",
];

export class EnterpriseGovernanceMandate {
  readonly id: string;
  readonly tenantId: string;
  readonly portfolioId: string;
  readonly sourceEnterpriseId: string;
  readonly targetEnterpriseIds: readonly string[];
  readonly granteePrincipalId: string;
  readonly authorityScope: MandateAuthorityScope;
  readonly allowedOperations: readonly string[];
  readonly allowedObjectives: readonly string[];
  readonly autonomyLimit: AutonomyLevel;
  readonly requiresApproval: boolean;
  readonly status: MandateStatus;
  readonly validFrom: Date;
  readonly validTo?: Date | undefined;
  readonly revocationReason?: string | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: GovernanceMandateProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.portfolioId = props.portfolioId;
    this.sourceEnterpriseId = props.sourceEnterpriseId;
    this.targetEnterpriseIds = Object.freeze([...props.targetEnterpriseIds]);
    this.granteePrincipalId = props.granteePrincipalId;
    this.authorityScope = props.authorityScope;
    this.allowedOperations = Object.freeze([...props.allowedOperations]);
    this.allowedObjectives = Object.freeze([...props.allowedObjectives]);
    this.autonomyLimit = props.autonomyLimit;
    this.requiresApproval = props.requiresApproval;
    this.status = props.status;
    this.validFrom = props.validFrom;
    this.validTo = props.validTo;
    this.revocationReason = props.revocationReason;
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateGovernanceMandateProps): EnterpriseGovernanceMandate {
    if (!props) {
      throw new PortfolioValidationError("CreateGovernanceMandateProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new PortfolioValidationError("GovernanceMandate id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new PortfolioValidationError("Tenant id is invalid");
    }
    const portfolioId = props.portfolioId?.trim();
    if (!portfolioId || !ID_REGEX.test(portfolioId)) {
      throw new PortfolioValidationError("Portfolio id is invalid");
    }
    const sourceEnterpriseId = props.sourceEnterpriseId?.trim();
    if (!sourceEnterpriseId || !ID_REGEX.test(sourceEnterpriseId)) {
      throw new PortfolioValidationError("Source enterprise id is invalid");
    }
    if (!props.targetEnterpriseIds || props.targetEnterpriseIds.length === 0) {
      throw new PortfolioValidationError("At least one target enterprise id is required for a mandate");
    }
    const targetEnterpriseIds = Array.from(
      new Set(props.targetEnterpriseIds.map((t) => t?.trim()).filter((t): t is string => Boolean(t) && ID_REGEX.test(t)))
    );
    if (targetEnterpriseIds.length === 0) {
      throw new PortfolioValidationError("Target enterprise ids list is empty or contains invalid entries");
    }
    const granteePrincipalId = props.granteePrincipalId?.trim();
    if (!granteePrincipalId) {
      throw new PortfolioValidationError("Grantee principal id is required");
    }
    if (!VALID_AUTHORITY_SCOPES.includes(props.authorityScope)) {
      throw new PortfolioValidationError(`Invalid authority scope '${props.authorityScope}'`);
    }

    const now = new Date();
    const validFrom = props.validFrom ?? now;
    if (props.validTo && props.validTo <= validFrom) {
      throw new PortfolioValidationError("Mandate validTo date must be strictly after validFrom date");
    }

    const allowedOperations = props.allowedOperations && props.allowedOperations.length > 0
      ? props.allowedOperations.map((op) => op.trim().toUpperCase())
      : ["*"];

    const allowedObjectives = props.allowedObjectives && props.allowedObjectives.length > 0
      ? props.allowedObjectives.map((obj) => obj.trim())
      : ["*"];

    const autonomyLimit = props.autonomyLimit ?? "LEVEL_2_GOVERNED_AUTOMATION";

    return new EnterpriseGovernanceMandate({
      id,
      tenantId,
      portfolioId,
      sourceEnterpriseId,
      targetEnterpriseIds,
      granteePrincipalId,
      authorityScope: props.authorityScope,
      allowedOperations,
      allowedObjectives,
      autonomyLimit,
      requiresApproval: props.requiresApproval ?? true,
      status: "ACTIVE",
      validFrom,
      validTo: props.validTo,
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: GovernanceMandateProps): EnterpriseGovernanceMandate {
    if (!props || !props.id || !props.tenantId || !props.portfolioId) {
      throw new PortfolioValidationError("Invalid GovernanceMandate rehydration props");
    }
    return new EnterpriseGovernanceMandate(props);
  }

  isEffectiveAt(date: Date = new Date()): boolean {
    if (this.status !== "ACTIVE") {
      return false;
    }
    if (date < this.validFrom) {
      return false;
    }
    if (this.validTo && date > this.validTo) {
      return false;
    }
    return true;
  }

  evaluateAuthority(criteria: {
    readonly targetEnterpriseId: string;
    readonly operation: string;
    readonly objectiveId?: string | undefined;
    readonly requestedAutonomy?: AutonomyLevel | undefined;
    readonly atDate?: Date | undefined;
  }): { readonly allowed: boolean; readonly reason?: string; readonly requiresApproval: boolean } {
    const atDate = criteria.atDate ?? new Date();

    if (this.status === "REVOKED") {
      return {
        allowed: false,
        reason: `Mandate '${this.id}' is revoked (${this.revocationReason ?? "No reason provided"})`,
        requiresApproval: true,
      };
    }

    if (this.status === "EXPIRED" || (this.validTo && atDate > this.validTo)) {
      return {
        allowed: false,
        reason: `Mandate '${this.id}' has expired`,
        requiresApproval: true,
      };
    }

    if (atDate < this.validFrom) {
      return {
        allowed: false,
        reason: `Mandate '${this.id}' is not yet effective (effective from ${this.validFrom.toISOString()})`,
        requiresApproval: true,
      };
    }

    const cleanTarget = criteria.targetEnterpriseId?.trim();
    if (!this.targetEnterpriseIds.includes(cleanTarget) && !this.targetEnterpriseIds.includes("*")) {
      return {
        allowed: false,
        reason: `Target enterprise '${cleanTarget}' is outside mandate target scope [${this.targetEnterpriseIds.join(", ")}]`,
        requiresApproval: true,
      };
    }

    const cleanOp = criteria.operation?.trim().toUpperCase();
    const matchesOp =
      this.allowedOperations.includes("*") ||
      this.allowedOperations.includes(cleanOp) ||
      this.allowedOperations.some((pattern) => pattern.endsWith(".*") && cleanOp.startsWith(pattern.slice(0, -2)));

    if (!matchesOp) {
      return {
        allowed: false,
        reason: `Operation '${cleanOp}' is not permitted by mandate operations [${this.allowedOperations.join(", ")}]`,
        requiresApproval: true,
      };
    }

    if (criteria.objectiveId && !this.allowedObjectives.includes("*") && !this.allowedObjectives.includes(criteria.objectiveId.trim())) {
      return {
        allowed: false,
        reason: `Objective '${criteria.objectiveId}' is not permitted by mandate objectives`,
        requiresApproval: true,
      };
    }

    // Check if human oversight is required based on mandate setting or autonomy level
    const needsApproval = this.requiresApproval || (criteria.requestedAutonomy ? requiresHumanOversight(cleanOp, criteria.requestedAutonomy) : false);

    return {
      allowed: true,
      requiresApproval: needsApproval,
    };
  }

  revoke(reason: string, expectedConcurrencyVersion?: number): EnterpriseGovernanceMandate {
    if (this.status === "REVOKED") {
      return this;
    }
    if (expectedConcurrencyVersion !== undefined && expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, expectedConcurrencyVersion, this.concurrencyVersion);
    }
    const cleanReason = reason?.trim();
    if (!cleanReason) {
      throw new PortfolioValidationError("Revocation reason is required");
    }
    const now = new Date();
    return new EnterpriseGovernanceMandate({
      id: this.id,
      tenantId: this.tenantId,
      portfolioId: this.portfolioId,
      sourceEnterpriseId: this.sourceEnterpriseId,
      targetEnterpriseIds: this.targetEnterpriseIds,
      granteePrincipalId: this.granteePrincipalId,
      authorityScope: this.authorityScope,
      allowedOperations: this.allowedOperations,
      allowedObjectives: this.allowedObjectives,
      autonomyLimit: this.autonomyLimit,
      requiresApproval: this.requiresApproval,
      status: "REVOKED",
      validFrom: this.validFrom,
      validTo: this.validTo,
      revocationReason: cleanReason,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
