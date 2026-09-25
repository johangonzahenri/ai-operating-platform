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
  EvidenceChainContinuityError,
  EvidenceChainTamperError,
} from "./evidence-export-errors.js";
import crypto from "node:crypto";

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
  readonly sequenceNumber?: number | undefined;
  readonly previousPackageHashSha256?: string | null | undefined;
  readonly packageHashSha256?: string | undefined;
}

/**
 * Deterministic canonical JSON stringifier that sorts object keys recursively.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + canonicalJsonStringify(val);
  });
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes the canonical SHA-256 seal for an evidence export manifest (excluding packageHashSha256 itself).
 */
export function computeManifestPackageHash(manifest: {
  exportId: string;
  schemaVersion: string;
  tenantId: string;
  requestedByPrincipalId: string;
  generatedAt: Date;
  scope: EvidenceScope;
  filters: Readonly<Record<string, unknown>>;
  recordCounts: Readonly<Record<string, number>>;
  totalRecords: number;
  checksumSha256: string;
  sequenceNumber?: number | undefined;
  previousPackageHashSha256?: string | null | undefined;
}): string {
  const payload = {
    exportId: manifest.exportId,
    schemaVersion: manifest.schemaVersion,
    tenantId: manifest.tenantId,
    requestedByPrincipalId: manifest.requestedByPrincipalId,
    generatedAt: manifest.generatedAt.toISOString(),
    scope: manifest.scope,
    filters: manifest.filters,
    recordCounts: manifest.recordCounts,
    totalRecords: manifest.totalRecords,
    checksumSha256: manifest.checksumSha256,
    sequenceNumber: manifest.sequenceNumber ?? null,
    previousPackageHashSha256: manifest.previousPackageHashSha256 ?? null,
  };
  const canonicalStr = canonicalJsonStringify(payload);
  return crypto.createHash("sha256").update(canonicalStr, "utf8").digest("hex");
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
  readonly sequenceNumber: number;
  readonly previousPackageHashSha256: string | null;
  readonly packageHashSha256: string;

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

    const seq = props.sequenceNumber ?? 1;
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1) {
      throw new EvidenceExportValidationError(`sequenceNumber must be an integer >= 1, received: ${seq}`);
    }

    if (seq === 1 && props.previousPackageHashSha256 !== undefined && props.previousPackageHashSha256 !== null) {
      throw new EvidenceExportValidationError("Genesis package (sequenceNumber 1) must have previousPackageHashSha256 equal to null");
    }
    if (seq > 1 && (!props.previousPackageHashSha256 || typeof props.previousPackageHashSha256 !== "string")) {
      throw new EvidenceExportValidationError(`Non-genesis package (sequenceNumber ${seq}) must provide previousPackageHashSha256`);
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
    this.sequenceNumber = seq;
    this.previousPackageHashSha256 = props.previousPackageHashSha256 ?? null;

    const computedPackageHash = computeManifestPackageHash(this);
    if (props.packageHashSha256 && props.packageHashSha256 !== computedPackageHash) {
      throw new EvidenceChainTamperError(
        `Manifest packageHashSha256 mismatch for exportId '${props.exportId}'. Expected '${computedPackageHash}', got '${props.packageHashSha256}'`
      );
    }
    this.packageHashSha256 = computedPackageHash;
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

export interface EvidenceChainVerificationResult {
  readonly valid: boolean;
  readonly packageCount: number;
  readonly headPackageHash: string;
  readonly headSequenceNumber: number;
  readonly errors: readonly string[];
}

export class EvidenceHashChainVerifier {
  /**
   * Verifies an array of EvidenceExportManifests or EvidenceExportPackages for continuity,
   * integrity, genesis invariants, sequence ordering, and tamper-freedom.
   */
  static verifyChain(
    items: readonly (EvidenceExportManifest | EvidenceExportPackage)[]
  ): EvidenceChainVerificationResult {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new EvidenceChainContinuityError("Cannot verify empty evidence package chain");
    }

    const manifests: EvidenceExportManifest[] = items.map((item) =>
      item instanceof EvidenceExportPackage ? item.manifest : item
    );

    let expectedSequence = 1;
    let expectedPreviousHash: string | null = null;
    let expectedTenantId = manifests[0]!.tenantId;

    for (let i = 0; i < manifests.length; i++) {
      const manifest = manifests[i]!;

      // 1. Tenant consistency
      if (manifest.tenantId !== expectedTenantId) {
        throw new EvidenceChainContinuityError(
          `Tenant mismatch in evidence chain at index ${i}: expected '${expectedTenantId}', found '${manifest.tenantId}'`
        );
      }

      // 2. Sequence continuity
      if (manifest.sequenceNumber !== expectedSequence) {
        throw new EvidenceChainContinuityError(
          `Sequence break in evidence chain at index ${i}: expected sequence ${expectedSequence}, found ${manifest.sequenceNumber}`
        );
      }

      // 3. Genesis verification
      if (i === 0) {
        if (manifest.previousPackageHashSha256 !== null) {
          throw new EvidenceChainContinuityError(
            `Genesis package at index 0 must have previousPackageHashSha256=null, found '${manifest.previousPackageHashSha256}'`
          );
        }
      } else {
        // 4. Hash chain continuity
        if (manifest.previousPackageHashSha256 !== expectedPreviousHash) {
          throw new EvidenceChainContinuityError(
            `Hash link mismatch at sequence ${manifest.sequenceNumber}: expected previous hash '${expectedPreviousHash}', found '${manifest.previousPackageHashSha256}'`
          );
        }
      }

      // 5. Manifest hash integrity / tamper detection
      const recalculatedHash = computeManifestPackageHash(manifest);
      if (recalculatedHash !== manifest.packageHashSha256) {
        throw new EvidenceChainTamperError(
          `Tampered package manifest detected at sequence ${manifest.sequenceNumber} (exportId '${manifest.exportId}'): recalculated hash '${recalculatedHash}' does not match sealed hash '${manifest.packageHashSha256}'`
        );
      }

      expectedPreviousHash = manifest.packageHashSha256;
      expectedSequence++;
    }

    const headManifest = manifests[manifests.length - 1]!;
    return {
      valid: true,
      packageCount: manifests.length,
      headPackageHash: headManifest.packageHashSha256,
      headSequenceNumber: headManifest.sequenceNumber,
      errors: [],
    };
  }
}
