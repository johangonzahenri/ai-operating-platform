/**
 * AI Operating Platform - BusinessMetric / KPI Aggregate Root
 * 
 * Represents a business KPI bound to a strategic or operational objective.
 * 
 * Invariants:
 * - KPI Source of Truth: A metric must have an explicit 'source' reference.
 *   Fabricated numbers or missing sources are rejected fail-closed.
 * - Missing Values: When current value is not recorded, status is MISSING,
 *   never filled with arbitrary zero or ungrounded estimates.
 * - Gap Calculation: Deterministically calculated as (targetValue - currentValue).
 */

import {
  BusinessValidationError,
  BusinessMetricValidationError,
  BusinessConcurrencyConflictError,
  BusinessTenantMismatchError,
} from "./business-errors.js";

export type MetricPeriod = "REAL_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export type MetricStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "MEASURED" | "MISSING";

export interface BusinessMetricProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly name: string;
  readonly unit: string;
  readonly targetValue: number;
  readonly currentValue?: number | undefined;
  readonly gap?: number | undefined;
  readonly period: MetricPeriod;
  readonly source: string;
  readonly lastUpdated: Date;
  readonly status: MetricStatus;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBusinessMetricProps {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly name: string;
  readonly unit: string;
  readonly targetValue: number;
  readonly currentValue?: number | undefined;
  readonly period?: MetricPeriod | undefined;
  readonly source: string;
}

export interface RecordMeasurementProps {
  readonly value: number;
  readonly source: string;
  readonly recordedAt?: Date | undefined;
  readonly expectedConcurrencyVersion?: number | undefined;
}

const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_PERIODS: readonly MetricPeriod[] = [
  "REAL_TIME",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUAL",
];
const VALID_STATUSES: readonly MetricStatus[] = [
  "ON_TRACK",
  "AT_RISK",
  "OFF_TRACK",
  "MEASURED",
  "MISSING",
];

export class BusinessMetric {
  readonly id: string;
  readonly tenantId: string;
  readonly enterpriseId: string;
  readonly objectiveId: string;
  readonly name: string;
  readonly unit: string;
  readonly targetValue: number;
  readonly currentValue?: number | undefined;
  readonly gap?: number | undefined;
  readonly period: MetricPeriod;
  readonly source: string;
  readonly lastUpdated: Date;
  readonly status: MetricStatus;
  readonly version: number;
  readonly concurrencyVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BusinessMetricProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.enterpriseId = props.enterpriseId;
    this.objectiveId = props.objectiveId;
    this.name = props.name;
    this.unit = props.unit;
    this.targetValue = props.targetValue;
    this.currentValue = props.currentValue;
    this.gap = props.gap;
    this.period = props.period;
    this.source = props.source;
    this.lastUpdated = props.lastUpdated;
    this.status = props.status;
    this.version = props.version;
    this.concurrencyVersion = props.concurrencyVersion;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: CreateBusinessMetricProps): BusinessMetric {
    if (!props) {
      throw new BusinessMetricValidationError("CreateBusinessMetricProps is required");
    }
    const id = props.id?.trim();
    if (!id || !ID_REGEX.test(id)) {
      throw new BusinessMetricValidationError("Metric id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const tenantId = props.tenantId?.trim();
    if (!tenantId || !ID_REGEX.test(tenantId)) {
      throw new BusinessMetricValidationError("Tenant id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const enterpriseId = props.enterpriseId?.trim();
    if (!enterpriseId || !ID_REGEX.test(enterpriseId)) {
      throw new BusinessMetricValidationError("Enterprise id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const objectiveId = props.objectiveId?.trim();
    if (!objectiveId || !ID_REGEX.test(objectiveId)) {
      throw new BusinessMetricValidationError("Objective id must be alphanumeric, dashes or underscores (1-128 chars)");
    }
    const name = props.name?.trim();
    if (!name || name.length > 256) {
      throw new BusinessMetricValidationError("Metric name must be 1-256 characters");
    }
    const unit = props.unit?.trim() ?? "UNITS";
    if (typeof props.targetValue !== "number" || isNaN(props.targetValue)) {
      throw new BusinessMetricValidationError("targetValue must be a valid number");
    }
    const source = props.source?.trim();
    if (!source) {
      throw new BusinessMetricValidationError("Metric 'source' is mandatory to ensure ground-truth traceability");
    }

    const period: MetricPeriod = props.period ?? "MONTHLY";
    if (!VALID_PERIODS.includes(period)) {
      throw new BusinessMetricValidationError(`Invalid metric period: '${period}'`);
    }

    const now = new Date();
    const hasCurrent = props.currentValue !== undefined && !isNaN(props.currentValue);
    const currentValue = hasCurrent ? props.currentValue : undefined;
    const gap = hasCurrent ? props.targetValue - (props.currentValue as number) : undefined;
    const status: MetricStatus = hasCurrent
      ? BusinessMetric.calculateStatus(props.targetValue, props.currentValue as number)
      : "MISSING";

    return new BusinessMetric({
      id,
      tenantId,
      enterpriseId,
      objectiveId,
      name,
      unit,
      targetValue: props.targetValue,
      currentValue,
      gap,
      period,
      source,
      lastUpdated: now,
      status,
      version: 1,
      concurrencyVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: BusinessMetricProps): BusinessMetric {
    if (!props) {
      throw new BusinessMetricValidationError("BusinessMetricProps is required for rehydration");
    }
    if (!VALID_STATUSES.includes(props.status)) {
      throw new BusinessMetricValidationError(`Invalid metric status: '${props.status}'`);
    }
    return new BusinessMetric(props);
  }

  recordMeasurement(props: RecordMeasurementProps): BusinessMetric {
    if (!props) {
      throw new BusinessMetricValidationError("RecordMeasurementProps is required");
    }
    if (
      props.expectedConcurrencyVersion !== undefined &&
      props.expectedConcurrencyVersion !== this.concurrencyVersion
    ) {
      throw new BusinessConcurrencyConflictError(
        this.id,
        props.expectedConcurrencyVersion,
        this.concurrencyVersion
      );
    }
    if (typeof props.value !== "number" || isNaN(props.value)) {
      throw new BusinessMetricValidationError("Measurement value must be a valid number");
    }
    const source = props.source?.trim();
    if (!source) {
      throw new BusinessMetricValidationError("Measurement 'source' is mandatory for truth traceability");
    }

    const recordedAt = props.recordedAt ?? new Date();
    const gap = this.targetValue - props.value;
    const status = BusinessMetric.calculateStatus(this.targetValue, props.value);

    return new BusinessMetric({
      ...this,
      currentValue: props.value,
      gap,
      source,
      lastUpdated: recordedAt,
      status,
      version: this.version + 1,
      concurrencyVersion: this.concurrencyVersion + 1,
      updatedAt: new Date(),
    });
  }

  private static calculateStatus(target: number, current: number): MetricStatus {
    if (current >= target) {
      return "ON_TRACK";
    }
    // If within 80% of target
    if (target > 0 && current >= target * 0.8) {
      return "AT_RISK";
    }
    return "OFF_TRACK";
  }

  assertTenant(expectedTenantId: string): void {
    if (this.tenantId !== expectedTenantId) {
      throw new BusinessTenantMismatchError(this.id, expectedTenantId, this.tenantId);
    }
  }
}
