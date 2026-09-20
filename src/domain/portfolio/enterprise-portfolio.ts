/**
 * AI Operating Platform - EnterprisePortfolio Aggregate Root
 * 
 * Represents a governed group or holding of enterprises under bounded platform authority.
 * 
 * Invariants:
 * - Portfolio != Enterprise.
 * - Portfolio membership != Universal access to member enterprises.
 * - Each member enterprise maintains independent data boundaries, RBAC, and policy gating.
 */

import {
  PortfolioValidationError,
  PortfolioConcurrencyConflictError,
  PortfolioTenantMismatchError,
} from "./portfolio-errors.js";

export type PortfolioStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type MembershipStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";

export interface EnterprisePortfolioMembership {
  readonly enterpriseId: string;
  readonly status: MembershipStatus;
  readonly joinedAt: Date;
  readonly effectiveTo?: Date | undefined;
  readonly governanceScope: readonly string[];
}

export interface EnterprisePortfolioProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly status: PortfolioStatus;
  readonly memberships: readonly EnterprisePortfolioMembership[];
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEnterprisePortfolioProps {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly initialEnterpriseIds?: readonly string[] | undefined;
}

export interface AddEnterpriseToPortfolioProps {
  readonly enterpriseId: string;
  readonly governanceScope?: readonly string[] | undefined;
  readonly effectiveTo?: Date | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_PORTFOLIO_STATUSES: readonly PortfolioStatus[] = ["ACTIVE", "SUSPENDED", "ARCHIVED"];

export class EnterprisePortfolio {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly status: PortfolioStatus;
  readonly memberships: readonly EnterprisePortfolioMembership[];
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: EnterprisePortfolioProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description;
    this.ownerPrincipalId = props.ownerPrincipalId;
    this.status = props.status;
    this.memberships = Object.freeze([...props.memberships]);
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateEnterprisePortfolioProps): EnterprisePortfolio {
    if (!props) {
      throw new PortfolioValidationError("CreateEnterprisePortfolioProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new PortfolioValidationError("EnterprisePortfolio id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new PortfolioValidationError("Tenant id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const name = props.name?.trim();
    if (!name || name.length > 256) {
      throw new PortfolioValidationError("Portfolio name must be 1-256 characters");
    }
    const description = props.description?.trim() ?? "";
    const ownerPrincipalId = props.ownerPrincipalId?.trim();
    if (!ownerPrincipalId) {
      throw new PortfolioValidationError("Owner principal id is required");
    }

    const now = new Date();
    const memberships: EnterprisePortfolioMembership[] = [];
    if (props.initialEnterpriseIds && props.initialEnterpriseIds.length > 0) {
      const seen = new Set<string>();
      for (const entId of props.initialEnterpriseIds) {
        const clean = entId?.trim();
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        memberships.push({
          enterpriseId: clean,
          status: "ACTIVE",
          joinedAt: now,
          governanceScope: Object.freeze(["COORDINATION", "REPORTING"]),
        });
      }
    }

    return new EnterprisePortfolio({
      id,
      tenantId,
      name,
      description,
      ownerPrincipalId,
      status: "ACTIVE",
      memberships,
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: EnterprisePortfolioProps): EnterprisePortfolio {
    if (!props) {
      throw new PortfolioValidationError("EnterprisePortfolioProps is required for rehydration");
    }
    if (!props.id || !props.tenantId || !props.name || !VALID_PORTFOLIO_STATUSES.includes(props.status)) {
      throw new PortfolioValidationError("Invalid EnterprisePortfolio rehydration props");
    }
    return new EnterprisePortfolio(props);
  }

  hasEnterprise(enterpriseId: string): boolean {
    const clean = enterpriseId?.trim();
    return this.memberships.some((m) => m.enterpriseId === clean && m.status === "ACTIVE");
  }

  getEnterpriseMembership(enterpriseId: string): EnterprisePortfolioMembership | undefined {
    const clean = enterpriseId?.trim();
    return this.memberships.find((m) => m.enterpriseId === clean);
  }

  getActiveEnterpriseIds(): readonly string[] {
    return Object.freeze(
      this.memberships
        .filter((m) => m.status === "ACTIVE")
        .map((m) => m.enterpriseId)
    );
  }

  addEnterprise(props: AddEnterpriseToPortfolioProps): EnterprisePortfolio {
    if (this.status !== "ACTIVE") {
      throw new PortfolioValidationError(`Cannot add enterprise to portfolio in '${this.status}' status`);
    }
    if (props.expectedConcurrencyVersion !== undefined && props.expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, props.expectedConcurrencyVersion, this.concurrencyVersion);
    }
    const enterpriseId = props.enterpriseId?.trim();
    if (!enterpriseId || !ID_REGEX.test(enterpriseId)) {
      throw new PortfolioValidationError("Enterprise id is invalid for portfolio membership");
    }

    const existingIndex = this.memberships.findIndex((m) => m.enterpriseId === enterpriseId);
    const now = new Date();
    const scope = props.governanceScope && props.governanceScope.length > 0
      ? props.governanceScope.map((s) => s.trim().toUpperCase())
      : ["COORDINATION", "REPORTING"];

    const updatedMemberships = [...this.memberships];
    if (existingIndex >= 0) {
      const existing = updatedMemberships[existingIndex]!;
      if (existing.status === "ACTIVE") {
        throw new PortfolioValidationError(`Enterprise '${enterpriseId}' is already an active member of portfolio '${this.id}'`);
      }
      updatedMemberships[existingIndex] = {
        enterpriseId,
        status: "ACTIVE",
        joinedAt: existing.joinedAt,
        effectiveTo: props.effectiveTo,
        governanceScope: Object.freeze(scope),
      };
    } else {
      updatedMemberships.push({
        enterpriseId,
        status: "ACTIVE",
        joinedAt: now,
        effectiveTo: props.effectiveTo,
        governanceScope: Object.freeze(scope),
      });
    }

    return new EnterprisePortfolio({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      ownerPrincipalId: this.ownerPrincipalId,
      status: this.status,
      memberships: updatedMemberships,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  removeEnterprise(enterpriseId: string, expectedConcurrencyVersion?: number): EnterprisePortfolio {
    if (this.status !== "ACTIVE") {
      throw new PortfolioValidationError(`Cannot remove enterprise from portfolio in '${this.status}' status`);
    }
    if (expectedConcurrencyVersion !== undefined && expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, expectedConcurrencyVersion, this.concurrencyVersion);
    }
    const clean = enterpriseId?.trim();
    const existingIndex = this.memberships.findIndex((m) => m.enterpriseId === clean);
    if (existingIndex < 0 || this.memberships[existingIndex]!.status !== "ACTIVE") {
      throw new PortfolioValidationError(`Enterprise '${clean}' is not an active member of portfolio '${this.id}'`);
    }

    const now = new Date();
    const updatedMemberships = [...this.memberships];
    const existing = updatedMemberships[existingIndex]!;
    updatedMemberships[existingIndex] = {
      ...existing,
      status: "REMOVED",
      effectiveTo: now,
    };

    return new EnterprisePortfolio({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      ownerPrincipalId: this.ownerPrincipalId,
      status: this.status,
      memberships: updatedMemberships,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  updateDetails(props: {
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly ownerPrincipalId?: string | undefined;
    readonly expectedConcurrencyVersion?: number | undefined;
  }): EnterprisePortfolio {
    if (this.status !== "ACTIVE") {
      throw new PortfolioValidationError(`Cannot update portfolio details in '${this.status}' status`);
    }
    if (props.expectedConcurrencyVersion !== undefined && props.expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, props.expectedConcurrencyVersion, this.concurrencyVersion);
    }

    const name = props.name !== undefined ? props.name.trim() : this.name;
    if (!name || name.length > 256) {
      throw new PortfolioValidationError("Portfolio name must be 1-256 characters");
    }
    const description = props.description !== undefined ? props.description.trim() : this.description;
    const ownerPrincipalId = props.ownerPrincipalId !== undefined ? props.ownerPrincipalId.trim() : this.ownerPrincipalId;
    if (!ownerPrincipalId) {
      throw new PortfolioValidationError("Owner principal id is required");
    }

    const now = new Date();
    return new EnterprisePortfolio({
      id: this.id,
      tenantId: this.tenantId,
      name,
      description,
      ownerPrincipalId,
      status: this.status,
      memberships: this.memberships,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  archive(expectedConcurrencyVersion?: number): EnterprisePortfolio {
    if (this.status === "ARCHIVED") {
      return this;
    }
    if (expectedConcurrencyVersion !== undefined && expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, expectedConcurrencyVersion, this.concurrencyVersion);
    }
    const now = new Date();
    return new EnterprisePortfolio({
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      ownerPrincipalId: this.ownerPrincipalId,
      status: "ARCHIVED",
      memberships: this.memberships,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
