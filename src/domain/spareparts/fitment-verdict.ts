/**
 * src/domain/spareparts/fitment-verdict.ts
 * Deterministic Fitment Verdict Taxonomy, Parameter Comparison Models & Invariants.
 */

import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export type FitmentVerdict =
  | "FIT"
  | "NOT_FIT"
  | "UNKNOWN"
  | "CONFLICT";

export const VALID_FITMENT_VERDICTS: readonly FitmentVerdict[] = Object.freeze([
  "FIT",
  "NOT_FIT",
  "UNKNOWN",
  "CONFLICT",
]);

export type FitmentParameterStatus =
  | "MATCH"
  | "MISMATCH"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export const VALID_FITMENT_PARAMETER_STATUSES: readonly FitmentParameterStatus[] = Object.freeze([
  "MATCH",
  "MISMATCH",
  "UNKNOWN",
  "NOT_APPLICABLE",
]);

export type FitmentAttributeName =
  | "make"
  | "model"
  | "year"
  | "generation"
  | "engine"
  | "engineCode"
  | "fuelType"
  | "transmission"
  | "driveType"
  | "bodyType"
  | "trim"
  | "market";

export interface FitmentParameterResult {
  readonly parameter: FitmentAttributeName;
  readonly expected: string | number | undefined;
  readonly actual: string | number | readonly string[] | undefined;
  readonly isRequired: boolean;
  readonly status: FitmentParameterStatus;
  readonly reason: string;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export interface FitmentConflictDetail {
  readonly conflictId: string;
  readonly parameter: FitmentAttributeName;
  readonly sourceA: string;
  readonly sourceB: string;
  readonly claimA: string;
  readonly claimB: string;
  readonly reason: string;
  readonly evidenceA: readonly StructuredClaimEvidence[];
  readonly evidenceB: readonly StructuredClaimEvidence[];
}

export interface FitmentSourceReport {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly trustScore: number;
  readonly assertedVerdict: FitmentVerdict;
  readonly evidenceCount: number;
  readonly notes?: string | undefined;
}

export interface FitmentVerificationResult {
  readonly verificationId: string;
  readonly canonicalPartId: string;
  readonly canonicalVehicleId: string;
  readonly vehicleFitmentKey: string;
  readonly verdict: FitmentVerdict;
  readonly confidence: number;
  readonly parameterResults: readonly FitmentParameterResult[];
  readonly evidence: readonly StructuredClaimEvidence[];
  readonly conflicts: readonly FitmentConflictDetail[];
  readonly sourceReports: readonly FitmentSourceReport[];
  readonly explanation: string;
  readonly verifiedAt: Date;
}

export class FitmentVerdictValidationError extends Error {
  readonly code = "FITMENT_VERDICT_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "FitmentVerdictValidationError";
  }
}

/**
 * Builds a deterministic vehicle fitment key from normalized vehicle attributes.
 * Syntax: vfk:<make>:<model>:<year>[:<generation>][:<engine>][:<market>]
 */
export function buildVehicleFitmentKey(params: {
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly generation?: string | undefined;
  readonly engine?: string | undefined;
  readonly market?: string | undefined;
}): string {
  if (!params.make || params.make.trim().length === 0) {
    throw new FitmentVerdictValidationError("Vehicle make is required for fitment key");
  }
  if (!params.model || params.model.trim().length === 0) {
    throw new FitmentVerdictValidationError("Vehicle model is required for fitment key");
  }
  if (!params.year || isNaN(params.year) || params.year < 1900 || params.year > 2100) {
    throw new FitmentVerdictValidationError(`Invalid vehicle year: ${params.year}`);
  }

  const cleanMake = params.make.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanModel = params.model.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const parts = ["vfk", cleanMake, cleanModel, String(params.year)];

  if (params.generation && params.generation.trim().length > 0) {
    parts.push(params.generation.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  }
  if (params.engine && params.engine.trim().length > 0) {
    parts.push(params.engine.trim().toLowerCase().replace(/[^a-z0-9.]/g, ""));
  }
  if (params.market && params.market.trim().length > 0) {
    parts.push(params.market.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  }

  return parts.join(":");
}
