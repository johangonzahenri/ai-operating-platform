/**
 * AI Operating Platform - PortfolioObjective Aggregate Root
 * 
 * Represents a strategic or operational goal across multiple enterprises in a portfolio.
 * Provides deterministic metric aggregation without relying on LLMs or ungrounded estimates.
 * 
 * Hierarchy Lineage:
 * Portfolio Objective -> Enterprise Objective -> Initiative -> Solution -> Workflow -> Agent
 */

import {
  PortfolioValidationError,
  PortfolioConcurrencyConflictError,
} from "./portfolio-errors.js";

export type PortfolioObjectiveType = "STRATEGIC" | "OPERATIONAL" | "FINANCIAL" | "SUSTAINABILITY";
export type PortfolioObjectiveLifecycleState = "DRAFT" | "ACTIVE" | "ACHIEVED" | "CANCELLED" | "ARCHIVED";
export type MetricAggregationMethod = "SUM" | "AVERAGE" | "WEIGHTED_AVERAGE" | "MIN" | "MAX" | "COUNT";
export type MissingDataHandling = "EXCLUDE" | "FAIL_CLOSED" | "FLAG_PARTIAL";

export interface PortfolioTargetMetric {
  readonly name: string;
  readonly unit: string;
  readonly targetValue: number;
}

export interface EnterpriseMetricContribution {
  readonly enterpriseId: string;
  readonly metricId?: string | undefined;
  readonly value?: number | undefined;
  readonly weight?: number | undefined;
  readonly recordedAt?: Date | undefined;
  readonly status: "MEASURED" | "MISSING" | "STALE" | "INVALID";
}

export interface PortfolioObjectiveProps {
  readonly id: string;
  readonly tenantId: string;
  readonly portfolioId: string;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly type: PortfolioObjectiveType;
  readonly lifecycleState: PortfolioObjectiveLifecycleState;
  readonly targetMetric?: PortfolioTargetMetric | undefined;
  readonly participatingEnterpriseIds: readonly string[];
  readonly linkedEnterpriseObjectiveIds: readonly string[];
  readonly aggregationMethod: MetricAggregationMethod;
  readonly missingDataHandling: MissingDataHandling;
  readonly currentAggregatedValue?: number | undefined;
  readonly gap?: number | undefined;
  readonly lastAggregatedAt?: Date | undefined;
  readonly aggregationStatus?: "COMPLETE" | "PARTIAL" | "MISSING" | "FAILED" | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreatePortfolioObjectiveProps {
  readonly id: string;
  readonly tenantId: string;
  readonly portfolioId: string;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly type: PortfolioObjectiveType;
  readonly targetMetric?: PortfolioTargetMetric | undefined;
  readonly participatingEnterpriseIds: readonly string[];
  readonly aggregationMethod?: MetricAggregationMethod | undefined;
  readonly missingDataHandling?: MissingDataHandling | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_OBJECTIVE_TYPES: readonly PortfolioObjectiveType[] = ["STRATEGIC", "OPERATIONAL", "FINANCIAL", "SUSTAINABILITY"];
const VALID_LIFECYCLE_STATES: readonly PortfolioObjectiveLifecycleState[] = ["DRAFT", "ACTIVE", "ACHIEVED", "CANCELLED", "ARCHIVED"];

export class PortfolioObjective {
  readonly id: string;
  readonly tenantId: string;
  readonly portfolioId: string;
  readonly title: string;
  readonly description: string;
  readonly ownerPrincipalId: string;
  readonly type: PortfolioObjectiveType;
  readonly lifecycleState: PortfolioObjectiveLifecycleState;
  readonly targetMetric?: PortfolioTargetMetric | undefined;
  readonly participatingEnterpriseIds: readonly string[];
  readonly linkedEnterpriseObjectiveIds: readonly string[];
  readonly aggregationMethod: MetricAggregationMethod;
  readonly missingDataHandling: MissingDataHandling;
  readonly currentAggregatedValue?: number | undefined;
  readonly gap?: number | undefined;
  readonly lastAggregatedAt?: Date | undefined;
  readonly aggregationStatus?: "COMPLETE" | "PARTIAL" | "MISSING" | "FAILED" | undefined;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: PortfolioObjectiveProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.portfolioId = props.portfolioId;
    this.title = props.title;
    this.description = props.description;
    this.ownerPrincipalId = props.ownerPrincipalId;
    this.type = props.type;
    this.lifecycleState = props.lifecycleState;
    this.targetMetric = props.targetMetric;
    this.participatingEnterpriseIds = Object.freeze([...props.participatingEnterpriseIds]);
    this.linkedEnterpriseObjectiveIds = Object.freeze([...props.linkedEnterpriseObjectiveIds]);
    this.aggregationMethod = props.aggregationMethod;
    this.missingDataHandling = props.missingDataHandling;
    this.currentAggregatedValue = props.currentAggregatedValue;
    this.gap = props.gap;
    this.lastAggregatedAt = props.lastAggregatedAt;
    this.aggregationStatus = props.aggregationStatus;
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreatePortfolioObjectiveProps): PortfolioObjective {
    if (!props) {
      throw new PortfolioValidationError("CreatePortfolioObjectiveProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new PortfolioValidationError("PortfolioObjective id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new PortfolioValidationError("Tenant id is invalid");
    }
    const portfolioId = props.portfolioId?.trim();
    if (!portfolioId || !ID_REGEX.test(portfolioId)) {
      throw new PortfolioValidationError("Portfolio id is invalid");
    }
    const title = props.title?.trim();
    if (!title || title.length > 256) {
      throw new PortfolioValidationError("Portfolio objective title must be 1-256 characters");
    }
    const description = props.description?.trim() ?? "";
    const ownerPrincipalId = props.ownerPrincipalId?.trim();
    if (!ownerPrincipalId) {
      throw new PortfolioValidationError("Owner principal id is required");
    }
    if (!VALID_OBJECTIVE_TYPES.includes(props.type)) {
      throw new PortfolioValidationError(`Invalid objective type '${props.type}'`);
    }
    if (!props.participatingEnterpriseIds || props.participatingEnterpriseIds.length === 0) {
      throw new PortfolioValidationError("Participating enterprises list cannot be empty");
    }

    const participatingEnterpriseIds = Array.from(
      new Set(props.participatingEnterpriseIds.map((e) => e?.trim()).filter((e): e is string => Boolean(e) && ID_REGEX.test(e)))
    );

    const now = new Date();
    return new PortfolioObjective({
      id,
      tenantId,
      portfolioId,
      title,
      description,
      ownerPrincipalId,
      type: props.type,
      lifecycleState: "DRAFT",
      targetMetric: props.targetMetric,
      participatingEnterpriseIds,
      linkedEnterpriseObjectiveIds: [],
      aggregationMethod: props.aggregationMethod ?? "AVERAGE",
      missingDataHandling: props.missingDataHandling ?? "FLAG_PARTIAL",
      aggregationStatus: "MISSING",
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: PortfolioObjectiveProps): PortfolioObjective {
    if (!props || !props.id || !props.tenantId || !props.portfolioId) {
      throw new PortfolioValidationError("Invalid PortfolioObjective rehydration props");
    }
    return new PortfolioObjective(props);
  }

  linkEnterpriseObjective(enterpriseObjectiveId: string, expectedConcurrencyVersion?: number): PortfolioObjective {
    if (this.lifecycleState === "ARCHIVED" || this.lifecycleState === "CANCELLED") {
      throw new PortfolioValidationError(`Cannot link enterprise objective in '${this.lifecycleState}' state`);
    }
    if (expectedConcurrencyVersion !== undefined && expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, expectedConcurrencyVersion, this.concurrencyVersion);
    }
    const clean = enterpriseObjectiveId?.trim();
    if (!clean) {
      throw new PortfolioValidationError("Enterprise objective id is required");
    }
    if (this.linkedEnterpriseObjectiveIds.includes(clean)) {
      return this;
    }

    const now = new Date();
    return new PortfolioObjective({
      id: this.id,
      tenantId: this.tenantId,
      portfolioId: this.portfolioId,
      title: this.title,
      description: this.description,
      ownerPrincipalId: this.ownerPrincipalId,
      type: this.type,
      lifecycleState: this.lifecycleState,
      targetMetric: this.targetMetric,
      participatingEnterpriseIds: this.participatingEnterpriseIds,
      linkedEnterpriseObjectiveIds: [...this.linkedEnterpriseObjectiveIds, clean],
      aggregationMethod: this.aggregationMethod,
      missingDataHandling: this.missingDataHandling,
      currentAggregatedValue: this.currentAggregatedValue,
      gap: this.gap,
      lastAggregatedAt: this.lastAggregatedAt,
      aggregationStatus: this.aggregationStatus,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  activate(expectedConcurrencyVersion?: number): PortfolioObjective {
    if (this.lifecycleState !== "DRAFT") {
      throw new PortfolioValidationError(`Cannot activate portfolio objective from '${this.lifecycleState}' state`);
    }
    if (expectedConcurrencyVersion !== undefined && expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, expectedConcurrencyVersion, this.concurrencyVersion);
    }
    const now = new Date();
    return new PortfolioObjective({
      id: this.id,
      tenantId: this.tenantId,
      portfolioId: this.portfolioId,
      title: this.title,
      description: this.description,
      ownerPrincipalId: this.ownerPrincipalId,
      type: this.type,
      lifecycleState: "ACTIVE",
      targetMetric: this.targetMetric,
      participatingEnterpriseIds: this.participatingEnterpriseIds,
      linkedEnterpriseObjectiveIds: this.linkedEnterpriseObjectiveIds,
      aggregationMethod: this.aggregationMethod,
      missingDataHandling: this.missingDataHandling,
      currentAggregatedValue: this.currentAggregatedValue,
      gap: this.gap,
      lastAggregatedAt: this.lastAggregatedAt,
      aggregationStatus: this.aggregationStatus,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }

  aggregateMetrics(
    contributions: readonly EnterpriseMetricContribution[],
    expectedConcurrencyVersion?: number
  ): PortfolioObjective {
    if (expectedConcurrencyVersion !== undefined && expectedConcurrencyVersion !== this.concurrencyVersion) {
      throw new PortfolioConcurrencyConflictError(this.id, expectedConcurrencyVersion, this.concurrencyVersion);
    }

    const measured = contributions.filter((c) => c.status === "MEASURED" && typeof c.value === "number" && !isNaN(c.value));
    const missingCount = this.participatingEnterpriseIds.length - measured.length;

    let aggregationStatus: "COMPLETE" | "PARTIAL" | "MISSING" | "FAILED" = "COMPLETE";
    if (missingCount > 0) {
      if (this.missingDataHandling === "FAIL_CLOSED") {
        aggregationStatus = "FAILED";
      } else if (measured.length === 0) {
        aggregationStatus = "MISSING";
      } else {
        aggregationStatus = "PARTIAL";
      }
    }

    let aggregatedValue: number | undefined = undefined;

    if (aggregationStatus !== "FAILED" && measured.length > 0) {
      switch (this.aggregationMethod) {
        case "SUM":
          aggregatedValue = measured.reduce((acc, c) => acc + (c.value ?? 0), 0);
          break;
        case "COUNT":
          aggregatedValue = measured.length;
          break;
        case "MIN":
          aggregatedValue = Math.min(...measured.map((c) => c.value ?? 0));
          break;
        case "MAX":
          aggregatedValue = Math.max(...measured.map((c) => c.value ?? 0));
          break;
        case "WEIGHTED_AVERAGE": {
          let totalWeight = 0;
          let weightedSum = 0;
          for (const c of measured) {
            const w = c.weight ?? 1;
            totalWeight += w;
            weightedSum += (c.value ?? 0) * w;
          }
          aggregatedValue = totalWeight > 0 ? weightedSum / totalWeight : 0;
          break;
        }
        case "AVERAGE":
        default:
          aggregatedValue = measured.reduce((acc, c) => acc + (c.value ?? 0), 0) / measured.length;
          break;
      }
    }

    let gap: number | undefined = undefined;
    if (this.targetMetric && aggregatedValue !== undefined) {
      gap = this.targetMetric.targetValue - aggregatedValue;
    }

    const now = new Date();
    return new PortfolioObjective({
      id: this.id,
      tenantId: this.tenantId,
      portfolioId: this.portfolioId,
      title: this.title,
      description: this.description,
      ownerPrincipalId: this.ownerPrincipalId,
      type: this.type,
      lifecycleState: this.lifecycleState,
      targetMetric: this.targetMetric,
      participatingEnterpriseIds: this.participatingEnterpriseIds,
      linkedEnterpriseObjectiveIds: this.linkedEnterpriseObjectiveIds,
      aggregationMethod: this.aggregationMethod,
      missingDataHandling: this.missingDataHandling,
      currentAggregatedValue: aggregatedValue !== undefined ? Number(aggregatedValue.toFixed(4)) : undefined,
      gap: gap !== undefined ? Number(gap.toFixed(4)) : undefined,
      lastAggregatedAt: now,
      aggregationStatus,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
