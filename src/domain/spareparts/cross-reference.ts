/**
 * src/domain/spareparts/cross-reference.ts
 * Cross-Reference Relationship Domain Model (OEM <-> Aftermarket, Replacements, Supersedes).
 */

import { PartNumber } from "./part-number.js";
import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export type CrossReferenceType =
  | "EXACT"
  | "EQUIVALENT"
  | "REPLACEMENT"
  | "SUPERSEDES"
  | "CROSS_REFERENCE"
  | "COMPATIBLE"
  | "POTENTIAL_MATCH"
  | "UNKNOWN";

export const VALID_CROSS_REFERENCE_TYPES: readonly CrossReferenceType[] = Object.freeze([
  "EXACT",
  "EQUIVALENT",
  "REPLACEMENT",
  "SUPERSEDES",
  "CROSS_REFERENCE",
  "COMPATIBLE",
  "POTENTIAL_MATCH",
  "UNKNOWN",
]);

export type CrossReferenceDirection = "BIDIRECTIONAL" | "DIRECT" | "REVERSE";

export interface CrossReference {
  readonly crossReferenceId: string;
  readonly sourcePartNumber: PartNumber;
  readonly targetPartNumber: PartNumber;
  readonly relationType: CrossReferenceType;
  readonly direction: CrossReferenceDirection;
  readonly confidence: number; // 0.0 to 1.0
  readonly verifiedBy?: string | undefined; // e.g. "OEM_CATALOG", "MANUFACTURER", "COMMUNITY"
  readonly notes?: string | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
  readonly retrievedAt?: Date | undefined;
}

export class CrossReferenceValidationError extends Error {
  readonly code = "CROSS_REFERENCE_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "CrossReferenceValidationError";
  }
}

/**
 * Factory to create a validated CrossReference entity.
 */
export function createCrossReference(params: {
  readonly sourcePartNumber: PartNumber;
  readonly targetPartNumber: PartNumber;
  readonly relationType: CrossReferenceType;
  readonly direction?: CrossReferenceDirection | undefined;
  readonly confidence?: number | undefined;
  readonly verifiedBy?: string | undefined;
  readonly notes?: string | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
  readonly retrievedAt?: Date | undefined;
}): CrossReference {
  if (!params.sourcePartNumber || !params.sourcePartNumber.normalizedValue) {
    throw new CrossReferenceValidationError("Source PartNumber is required");
  }
  if (!params.targetPartNumber || !params.targetPartNumber.normalizedValue) {
    throw new CrossReferenceValidationError("Target PartNumber is required");
  }

  if (!VALID_CROSS_REFERENCE_TYPES.includes(params.relationType)) {
    throw new CrossReferenceValidationError(`Invalid CrossReferenceType: '${params.relationType}'`);
  }

  const confidence = params.confidence !== undefined ? params.confidence : 0.8;
  if (confidence < 0 || confidence > 1 || isNaN(confidence)) {
    throw new CrossReferenceValidationError(`Confidence must be between 0.0 and 1.0, got: ${confidence}`);
  }

  const direction = params.direction || "BIDIRECTIONAL";
  const crossId = `xref:${params.sourcePartNumber.normalizedValue}:${params.targetPartNumber.normalizedValue}`;

  return Object.freeze({
    crossReferenceId: crossId,
    sourcePartNumber: params.sourcePartNumber,
    targetPartNumber: params.targetPartNumber,
    relationType: params.relationType,
    direction,
    confidence,
    verifiedBy: params.verifiedBy?.trim(),
    notes: params.notes?.trim(),
    evidence: params.evidence ? Object.freeze([...params.evidence]) : undefined,
    retrievedAt: params.retrievedAt || new Date(),
  });
}
