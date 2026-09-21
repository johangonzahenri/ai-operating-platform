/**
 * AI Operating Platform - Evidence Export Domain Contracts
 * 
 * Formal domain models for Governance & Compliance Evidence Export.
 * 
 * Invariants:
 * 1. Read-only: Exporting evidence NEVER mutates domain state, workflows, mandates, or budgets.
 * 2. Scope is explicit: Wildcard or universal scopes (*, ALL, ANY, GLOBAL) are strictly forbidden.
 * 3. Bounded queries: Maximum 1000 records, maximum 90 days date range.
 * 4. Immutable: Packages and manifests are frozen after generation.
 */

import {
  EvidenceExportValidationError,
  EvidenceFilterBoundsExceededError,
} from "./evidence-export-errors.js";

export type EvidenceScope =
  | "TENANT"
  | "PORTFOLIO"
  | "ENTERPRISE"
  | "WORKFLOW"
  | "EXECUTION"
  | "MANDATE"
  | "APPROVAL"
  | "RECONCILIATION"
  | "AUDIT_TRAIL";

export const VALID_EVIDENCE_SCOPES: readonly EvidenceScope[] = Object.freeze([
  "TENANT",
  "PORTFOLIO",
  "ENTERPRISE",
  "WORKFLOW",
  "EXECUTION",
  "MANDATE",
  "APPROVAL",
  "RECONCILIATION",
  "AUDIT_TRAIL",
]);

export const MAX_EXPORT_RECORDS_LIMIT = 1000;
export const DEFAULT_EXPORT_RECORDS_LIMIT = 200;
export const MAX_EXPORT_DATE_RANGE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EvidenceExportFilterProps {
  readonly scope: EvidenceScope;
  readonly targetId?: string | undefined;
  readonly fromDate?: Date | string | undefined;
  readonly toDate?: Date | string | undefined;
  readonly limit?: number | undefined;
  readonly eventTypes?: readonly string[] | undefined;
  readonly includeAuditEvents?: boolean | undefined;
  readonly idempotencyKey?: string | undefined;
}

export class EvidenceExportFilter {
  readonly scope: EvidenceScope;
  readonly targetId?: string | undefined;
  readonly fromDate?: Date | undefined;
  readonly toDate?: Date | undefined;
  readonly limit: number;
  readonly eventTypes?: readonly string[] | undefined;
  readonly includeAuditEvents: boolean;
  readonly idempotencyKey?: string | undefined;

  private constructor(props: {
    scope: EvidenceScope;
    targetId?: string | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
    limit: number;
    eventTypes?: readonly string[] | undefined;
    includeAuditEvents: boolean;
    idempotencyKey?: string | undefined;
  }) {
    this.scope = props.scope;
    this.targetId = props.targetId;
    this.fromDate = props.fromDate;
    this.toDate = props.toDate;
    this.limit = props.limit;
    this.eventTypes = props.eventTypes ? Object.freeze([...props.eventTypes]) : undefined;
    this.includeAuditEvents = props.includeAuditEvents;
    this.idempotencyKey = props.idempotencyKey;
    Object.freeze(this);
  }

  static create(props: EvidenceExportFilterProps): EvidenceExportFilter {
    if (!props || typeof props !== "object") {
      throw new EvidenceExportValidationError("EvidenceExportFilterProps must be a non-null object");
    }

    if (!props.scope || typeof props.scope !== "string") {
      throw new EvidenceExportValidationError("Evidence scope is required and must be a string");
    }

    const normalizedScope = props.scope.trim().toUpperCase() as EvidenceScope;
    if (!VALID_EVIDENCE_SCOPES.includes(normalizedScope)) {
      throw new EvidenceExportValidationError(
        `Invalid evidence scope: '${props.scope}'. Must be one of: ${VALID_EVIDENCE_SCOPES.join(", ")}`
      );
    }

    let limit = DEFAULT_EXPORT_RECORDS_LIMIT;
    if (props.limit !== undefined) {
      if (typeof props.limit !== "number" || !Number.isInteger(props.limit) || props.limit <= 0) {
        throw new EvidenceFilterBoundsExceededError(
          `Export limit must be a positive integer, received: ${props.limit}`
        );
      }
      if (props.limit > MAX_EXPORT_RECORDS_LIMIT) {
        throw new EvidenceFilterBoundsExceededError(
          `Export limit exceeds maximum allowed (${MAX_EXPORT_RECORDS_LIMIT}), received: ${props.limit}`
        );
      }
      limit = props.limit;
    }

    let parsedFromDate: Date | undefined;
    let parsedToDate: Date | undefined;

    if (props.fromDate !== undefined) {
      parsedFromDate = props.fromDate instanceof Date ? props.fromDate : new Date(props.fromDate);
      if (Number.isNaN(parsedFromDate.getTime())) {
        throw new EvidenceExportValidationError(`Invalid fromDate: '${props.fromDate}'`);
      }
    }

    if (props.toDate !== undefined) {
      parsedToDate = props.toDate instanceof Date ? props.toDate : new Date(props.toDate);
      if (Number.isNaN(parsedToDate.getTime())) {
        throw new EvidenceExportValidationError(`Invalid toDate: '${props.toDate}'`);
      }
    }

    if (parsedFromDate && parsedToDate) {
      if (parsedFromDate.getTime() > parsedToDate.getTime()) {
        throw new EvidenceExportValidationError(
          `fromDate (${parsedFromDate.toISOString()}) cannot be after toDate (${parsedToDate.toISOString()})`
        );
      }

      const diffDays = (parsedToDate.getTime() - parsedFromDate.getTime()) / MS_PER_DAY;
      if (diffDays > MAX_EXPORT_DATE_RANGE_DAYS) {
        throw new EvidenceFilterBoundsExceededError(
          `Date range exceeds maximum allowed (${MAX_EXPORT_DATE_RANGE_DAYS} days), requested range: ${Math.ceil(diffDays)} days`
        );
      }
    }

    const targetId = props.targetId?.trim() ? props.targetId.trim() : undefined;
    const idempotencyKey = props.idempotencyKey?.trim() ? props.idempotencyKey.trim() : undefined;

    return new EvidenceExportFilter({
      scope: normalizedScope,
      targetId,
      fromDate: parsedFromDate,
      toDate: parsedToDate,
      limit,
      eventTypes: props.eventTypes,
      includeAuditEvents: Boolean(props.includeAuditEvents),
      idempotencyKey,
    });
  }
}

export interface EvidenceExportManifestProps {
  readonly exportId: string;
  readonly schemaVersion?: "1.0.0" | undefined;
  readonly tenantId: string;
  readonly requestedByPrincipalId: string;
  readonly generatedAt?: Date | undefined;
  readonly scope: EvidenceScope;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly totalRecords: number;
  readonly checksumSha256: string;
}

export class EvidenceExportManifest {
  readonly exportId: string;
  readonly schemaVersion: "1.0.0";
  readonly tenantId: string;
  readonly requestedByPrincipalId: string;
  readonly generatedAt: Date;
  readonly scope: EvidenceScope;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly totalRecords: number;
  readonly checksumSha256: string;

  constructor(props: EvidenceExportManifestProps) {
    if (!props.exportId || typeof props.exportId !== "string") {
      throw new EvidenceExportValidationError("exportId is required and must be a non-empty string");
    }
    if (!props.tenantId || typeof props.tenantId !== "string") {
      throw new EvidenceExportValidationError("tenantId is required and must be a non-empty string");
    }
    if (!props.requestedByPrincipalId || typeof props.requestedByPrincipalId !== "string") {
      throw new EvidenceExportValidationError("requestedByPrincipalId is required and must be a non-empty string");
    }
    if (!props.checksumSha256 || typeof props.checksumSha256 !== "string") {
      throw new EvidenceExportValidationError("checksumSha256 is required and must be a non-empty string");
    }

    this.exportId = props.exportId;
    this.schemaVersion = "1.0.0";
    this.tenantId = props.tenantId;
    this.requestedByPrincipalId = props.requestedByPrincipalId;
    this.generatedAt = props.generatedAt ?? new Date();
    this.scope = props.scope;
    this.filters = Object.freeze({ ...props.filters });
    this.recordCounts = Object.freeze({ ...props.recordCounts });
    this.totalRecords = props.totalRecords;
    this.checksumSha256 = props.checksumSha256;
    Object.freeze(this);
  }
}

export interface EvidenceExportPackageProps {
  readonly manifest: EvidenceExportManifest;
  readonly data: Readonly<Record<string, readonly unknown[]>>;
}

export class EvidenceExportPackage {
  readonly manifest: EvidenceExportManifest;
  readonly data: Readonly<Record<string, readonly unknown[]>>;

  constructor(props: EvidenceExportPackageProps) {
    if (!props.manifest) {
      throw new EvidenceExportValidationError("manifest is required for EvidenceExportPackage");
    }
    if (!props.data || typeof props.data !== "object") {
      throw new EvidenceExportValidationError("data is required and must be an object");
    }

    this.manifest = props.manifest;
    
    // Deep freeze data collections
    const frozenData: Record<string, readonly unknown[]> = {};
    for (const [key, list] of Object.entries(props.data)) {
      frozenData[key] = Object.freeze(Array.isArray(list) ? [...list] : []);
    }
    this.data = Object.freeze(frozenData);
    Object.freeze(this);
  }
}
