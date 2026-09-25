/**
 * AI Operating Platform - Taint Tracking & Trust Boundary Domain Model
 * 
 * Formal domain primitives for Track 2 (GAP-01).
 * Invariants:
 * 1. Conservative propagation: Any material combination involving untrusted or derived data remains untrusted.
 * 2. Deep immutability: Tainted values and their provenance trees are frozen upon creation.
 * 3. Serialization/cloning safe: Retains trust level, provenance, and source metadata through transformations.
 * 4. Control-plane vs Data-plane isolation: Tainted data may flow in business payloads, but is prohibited
 *    from hijacking control plane decisions (identity, tenantId, permissions, approval tokens, tool selection overrides).
 * 5. Sanitization transparency: Sanitizing untrusted data marks it as SANITIZED with explicit audit trail
 *    (transformer, authorized policy, timestamp) and never elevates it to SYSTEM_TRUSTED.
 */

import crypto from "node:crypto";
import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS, BoundedDataLimits } from "../context/bounded-data.js";

export type TrustStatus =
  | "TRUSTED"
  | "UNTRUSTED_EXTERNAL"
  | "UNTRUSTED_USER"
  | "DERIVED_FROM_UNTRUSTED"
  | "SANITIZED";

export type TaintSourceKind =
  | "SYSTEM"
  | "INTERNAL_DATABASE"
  | "WEB_CONNECTOR"
  | "EXTERNAL_API"
  | "USER_INPUT"
  | "SCRAPED_CONTENT"
  | "MODEL_OUTPUT"
  | "UNKNOWN_EXTERNAL";

export interface TaintProvenance {
  readonly originId: string;
  readonly sourceKind: TaintSourceKind;
  readonly description?: string | undefined;
  readonly timestamp: Date;
  readonly parentProvenance?: readonly TaintProvenance[] | undefined;
  readonly sanitizedBy?: {
    readonly transformer: string;
    readonly policyId: string;
    readonly timestamp: Date;
  } | undefined;
}

export interface TaintedValueSnapshot<T = unknown> {
  readonly value: T;
  readonly trustStatus: TrustStatus;
  readonly provenance: TaintProvenance;
  readonly isTainted: boolean;
}

export class TaintBoundaryViolationError extends Error {
  readonly code = "TAINT_BOUNDARY_VIOLATION";
  constructor(
    readonly fieldName: string,
    message: string,
    readonly provenance?: TaintProvenance | undefined
  ) {
    super(message);
    this.name = "TaintBoundaryViolationError";
  }
}

export class UntrustedControlDataError extends TaintBoundaryViolationError {
  override readonly code = "UNTRUSTED_CONTROL_DATA";
  constructor(
    fieldName: string,
    message = `Untrusted data is prohibited from determining control-plane parameter '${fieldName}'`,
    provenance?: TaintProvenance | undefined
  ) {
    super(fieldName, message, provenance);
    this.name = "UntrustedControlDataError";
  }
}

export class TaintedValue<T = unknown> {
  readonly value: T;
  readonly trustStatus: TrustStatus;
  readonly provenance: TaintProvenance;

  private constructor(value: T, trustStatus: TrustStatus, provenance: TaintProvenance) {
    this.value = value;
    this.trustStatus = trustStatus;
    this.provenance = Object.freeze({
      ...provenance,
      parentProvenance: provenance.parentProvenance ? Object.freeze([...provenance.parentProvenance]) : undefined,
    });
    deepFreeze(this.value);
    Object.freeze(this);
  }

  get isTainted(): boolean {
    return this.trustStatus === "UNTRUSTED_EXTERNAL" ||
           this.trustStatus === "UNTRUSTED_USER" ||
           this.trustStatus === "DERIVED_FROM_UNTRUSTED";
  }

  get isTrusted(): boolean {
    return this.trustStatus === "TRUSTED";
  }

  get isSanitized(): boolean {
    return this.trustStatus === "SANITIZED";
  }

  static trusted<V>(value: V, originId = "system-kernel", sourceKind: TaintSourceKind = "SYSTEM"): TaintedValue<V> {
    return new TaintedValue<V>(value, "TRUSTED", {
      originId,
      sourceKind,
      timestamp: new Date(),
    });
  }

  static untrustedExternal<V>(
    value: V,
    originId: string,
    sourceKind: TaintSourceKind = "EXTERNAL_API",
    description?: string
  ): TaintedValue<V> {
    return new TaintedValue<V>(value, "UNTRUSTED_EXTERNAL", {
      originId,
      sourceKind,
      description,
      timestamp: new Date(),
    });
  }

  static untrustedUser<V>(
    value: V,
    originId: string,
    description?: string
  ): TaintedValue<V> {
    return new TaintedValue<V>(value, "UNTRUSTED_USER", {
      originId,
      sourceKind: "USER_INPUT",
      description,
      timestamp: new Date(),
    });
  }

  static derive<V>(
    derivedValue: V,
    parents: readonly (TaintedValue<unknown> | unknown)[],
    originId = "runtime-derivation",
    description?: string
  ): TaintedValue<V> {
    const taintedParents = parents.filter(
      (p): p is TaintedValue<unknown> => p instanceof TaintedValue
    );

    const hasUntrusted = taintedParents.some((p) => p.isTainted);
    const hasSanitized = taintedParents.some((p) => p.isSanitized);

    let status: TrustStatus = "TRUSTED";
    if (hasUntrusted) {
      status = "DERIVED_FROM_UNTRUSTED";
    } else if (hasSanitized) {
      status = "SANITIZED";
    }

    const parentProvenances: TaintProvenance[] = taintedParents.map((p) => p.provenance);

    return new TaintedValue<V>(derivedValue, status, {
      originId,
      sourceKind: hasUntrusted ? "UNKNOWN_EXTERNAL" : "SYSTEM",
      description,
      timestamp: new Date(),
      parentProvenance: parentProvenances.length > 0 ? parentProvenances : undefined,
    });
  }

  sanitize(
    transformer: string,
    policyId: string,
    transformFn: (raw: T) => T
  ): TaintedValue<T> {
    const sanitizedVal = transformFn(this.value);
    return new TaintedValue<T>(sanitizedVal, "SANITIZED", {
      originId: `sanitized:${this.provenance.originId}`,
      sourceKind: this.provenance.sourceKind,
      description: `Sanitized by ${transformer} under policy ${policyId}`,
      timestamp: new Date(),
      parentProvenance: [this.provenance],
      sanitizedBy: {
        transformer,
        policyId,
        timestamp: new Date(),
      },
    });
  }

  map<U>(transform: (val: T) => U, derivationOrigin = "map-transform"): TaintedValue<U> {
    const newVal = transform(this.value);
    const derivedStatus: TrustStatus = this.isTainted
      ? "DERIVED_FROM_UNTRUSTED"
      : this.trustStatus;

    return new TaintedValue<U>(newVal, derivedStatus, {
      originId: `${this.provenance.originId}#${derivationOrigin}`,
      sourceKind: this.provenance.sourceKind,
      timestamp: new Date(),
      parentProvenance: [this.provenance],
    });
  }

  toJSON(): TaintedValueSnapshot<T> {
    return {
      value: this.value,
      trustStatus: this.trustStatus,
      provenance: this.provenance,
      isTainted: this.isTainted,
    };
  }

  static fromJSON<V>(snapshot: TaintedValueSnapshot<V>): TaintedValue<V> {
    if (!snapshot || typeof snapshot !== "object" || !("trustStatus" in snapshot)) {
      throw new Error("Invalid TaintedValueSnapshot payload");
    }
    return new TaintedValue<V>(
      snapshot.value,
      snapshot.trustStatus,
      {
        ...snapshot.provenance,
        timestamp: new Date(snapshot.provenance.timestamp),
      }
    );
  }
}

/**
 * Control plane forbidden attributes.
 * Untrusted data must never dictate or inject these fields.
 */
export const CONTROL_PLANE_FORBIDDEN_FIELDS: readonly string[] = Object.freeze([
  "tenantId",
  "principalId",
  "roles",
  "permissions",
  "approvalToken",
  "isSystem",
  "principalType",
  "requiresApproval",
  "riskLevel",
  "executionMode",
  "policyOverrides",
  "bypassSecurity",
]);

/**
 * Validates that an incoming tool request or plan parameter does not inject tainted values
 * into control-plane boundaries.
 */
export function assertUntrustedNotControlPlane(
  data: unknown,
  fieldName: string,
  provenance?: TaintProvenance
): void {
  const normalized = fieldName.trim();
  for (const forbidden of CONTROL_PLANE_FORBIDDEN_FIELDS) {
    if (normalized.toLowerCase() === forbidden.toLowerCase()) {
      throw new UntrustedControlDataError(
        fieldName,
        `Untrusted data is prohibited from determining control-plane parameter '${fieldName}'`,
        provenance
      );
    }
  }

  // If data itself is a TaintedValue and marked as tainted
  if (data instanceof TaintedValue && data.isTainted) {
    for (const forbidden of CONTROL_PLANE_FORBIDDEN_FIELDS) {
      if (normalized.toLowerCase() === forbidden.toLowerCase()) {
        throw new UntrustedControlDataError(
          fieldName,
          `Untrusted TaintedValue cannot be assigned to control plane field '${fieldName}'`,
          data.provenance
        );
      }
    }
  }
}

/**
 * Helper to inspect any deep object and detect if a specific key was injected from untrusted source.
 */
export function assertNoTaintedControlKeys(
  record: Readonly<Record<string, unknown>> | undefined
): void {
  if (!record || typeof record !== "object") return;

  for (const [key, val] of Object.entries(record)) {
    if (val instanceof TaintedValue && val.isTainted) {
      assertUntrustedNotControlPlane(val, key, val.provenance);
    }
    // Also check string keys themselves that might try to override controls
    if (CONTROL_PLANE_FORBIDDEN_FIELDS.includes(key) && val instanceof TaintedValue && val.isTainted) {
      throw new UntrustedControlDataError(
        key,
        `Control-plane parameter '${key}' cannot be sourced from tainted external value`,
        val.provenance
      );
    }
  }
}
