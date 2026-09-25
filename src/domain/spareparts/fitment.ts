/**
 * src/domain/spareparts/fitment.ts
 * Automotive Fitment (Compatibility) Domain Aggregate, Rules, Provenance & Conflict Model.
 */

import { Part } from "./part.js";
import { PartNumber } from "./part-number.js";
import { VehicleProfile, VehicleSpecification } from "./vehicle.js";
import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export type FitmentStatus =
  | "EXACT"
  | "COMPATIBLE"
  | "POTENTIAL"
  | "INCOMPATIBLE"
  | "CONFLICT"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export const VALID_FITMENT_STATUSES: readonly FitmentStatus[] = Object.freeze([
  "EXACT",
  "COMPATIBLE",
  "POTENTIAL",
  "INCOMPATIBLE",
  "CONFLICT",
  "UNKNOWN",
  "NOT_APPLICABLE",
]);

export type FitmentEvidenceProvenance =
  | "OEM_CATALOG"
  | "MANUFACTURER_SPEC"
  | "DISTRIBUTOR_MATRIX"
  | "RETAILER_LISTING"
  | "MARKETPLACE_CLAIM"
  | "AGENT_INFERENCE"
  | "USER_REPORT";

export const VALID_FITMENT_PROVENANCES: readonly FitmentEvidenceProvenance[] = Object.freeze([
  "OEM_CATALOG",
  "MANUFACTURER_SPEC",
  "DISTRIBUTOR_MATRIX",
  "RETAILER_LISTING",
  "MARKETPLACE_CLAIM",
  "AGENT_INFERENCE",
  "USER_REPORT",
]);

export interface FitmentRule {
  readonly ruleId: string;
  readonly make: string;
  readonly model: string;
  readonly yearFrom: number;
  readonly yearTo: number;
  readonly generation?: string | undefined;
  readonly engines?: readonly string[] | undefined;
  readonly engineCodes?: readonly string[] | undefined;
  readonly trims?: readonly string[] | undefined;
  readonly driveTypes?: readonly string[] | undefined;
  readonly transmissions?: readonly string[] | undefined;
  readonly markets?: readonly string[] | undefined;
  readonly notes?: string | undefined;
}

export interface Fitment {
  readonly fitmentId: string;
  readonly canonicalPartId: string;
  readonly canonicalVehicleId: string;
  readonly status: FitmentStatus;
  readonly confidence: number; // 0.0 to 1.0 (FitmentConfidence != SourceTrust)
  readonly rules: readonly FitmentRule[];
  readonly provenance: FitmentEvidenceProvenance;
  readonly sourceId?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly evidenceClaims: readonly StructuredClaimEvidence[];
  readonly conflictingEvidence?: readonly StructuredClaimEvidence[] | undefined;
  readonly verifiedAt: Date;
  readonly verifiedBy?: string | undefined;
}

export class FitmentValidationError extends Error {
  readonly code = "FITMENT_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "FitmentValidationError";
  }
}

/**
 * Deterministic generation of Fitment ID.
 */
export function generateFitmentId(canonicalPartId: string, canonicalVehicleId: string): string {
  if (!canonicalPartId || canonicalPartId.trim().length === 0) {
    throw new FitmentValidationError("canonicalPartId is required for fitment ID");
  }
  if (!canonicalVehicleId || canonicalVehicleId.trim().length === 0) {
    throw new FitmentValidationError("canonicalVehicleId is required for fitment ID");
  }
  return `fit:${canonicalPartId}:${canonicalVehicleId}`;
}

/**
 * Evaluates whether a vehicle specification matches a fitment rule.
 */
export function matchesFitmentRule(spec: VehicleSpecification, rule: FitmentRule): boolean {
  if (spec.make.toLowerCase() !== rule.make.toLowerCase()) return false;
  if (spec.model.toLowerCase() !== rule.model.toLowerCase()) return false;
  if (spec.year < rule.yearFrom || spec.year > rule.yearTo) return false;

  if (rule.generation && spec.generation && rule.generation.toLowerCase() !== spec.generation.toLowerCase()) {
    return false;
  }

  if (rule.engines && rule.engines.length > 0 && spec.engine) {
    const matchedEngine = rule.engines.some(e => e.toLowerCase() === spec.engine!.toLowerCase());
    if (!matchedEngine) return false;
  }

  if (rule.engineCodes && rule.engineCodes.length > 0 && spec.engineCode) {
    const matchedCode = rule.engineCodes.some(c => c.toUpperCase() === spec.engineCode!.toUpperCase());
    if (!matchedCode) return false;
  }

  if (rule.driveTypes && rule.driveTypes.length > 0 && spec.driveType) {
    const matchedDrive = rule.driveTypes.some(d => d.toUpperCase() === spec.driveType!.toUpperCase());
    if (!matchedDrive) return false;
  }

  return true;
}

/**
 * Factory to create a validated Fitment aggregate.
 */
export function createFitment(params: {
  readonly canonicalPartId: string;
  readonly canonicalVehicleId: string;
  readonly status: FitmentStatus;
  readonly confidence: number;
  readonly rules?: readonly FitmentRule[] | undefined;
  readonly provenance: FitmentEvidenceProvenance;
  readonly sourceId?: string | undefined;
  readonly sourceUrl?: string | undefined;
  readonly evidenceClaims?: readonly StructuredClaimEvidence[] | undefined;
  readonly conflictingEvidence?: readonly StructuredClaimEvidence[] | undefined;
  readonly verifiedAt?: Date | undefined;
  readonly verifiedBy?: string | undefined;
}): Fitment {
  if (!params.canonicalPartId || params.canonicalPartId.trim().length === 0) {
    throw new FitmentValidationError("canonicalPartId is required");
  }
  if (!params.canonicalVehicleId || params.canonicalVehicleId.trim().length === 0) {
    throw new FitmentValidationError("canonicalVehicleId is required");
  }

  if (!VALID_FITMENT_STATUSES.includes(params.status)) {
    throw new FitmentValidationError(`Invalid FitmentStatus: '${params.status}'`);
  }

  if (!VALID_FITMENT_PROVENANCES.includes(params.provenance)) {
    throw new FitmentValidationError(`Invalid FitmentEvidenceProvenance: '${params.provenance}'`);
  }

  if (params.confidence < 0 || params.confidence > 1 || isNaN(params.confidence)) {
    throw new FitmentValidationError(`Confidence must be between 0.0 and 1.0, got: ${params.confidence}`);
  }

  const fitmentId = generateFitmentId(params.canonicalPartId, params.canonicalVehicleId);

  return Object.freeze({
    fitmentId,
    canonicalPartId: params.canonicalPartId,
    canonicalVehicleId: params.canonicalVehicleId,
    status: params.status,
    confidence: params.confidence,
    rules: Object.freeze(params.rules || []),
    provenance: params.provenance,
    sourceId: params.sourceId?.trim(),
    sourceUrl: params.sourceUrl?.trim(),
    evidenceClaims: Object.freeze(params.evidenceClaims || []),
    conflictingEvidence: params.conflictingEvidence ? Object.freeze(params.conflictingEvidence) : undefined,
    verifiedAt: params.verifiedAt || new Date(),
    verifiedBy: params.verifiedBy?.trim(),
  });
}
