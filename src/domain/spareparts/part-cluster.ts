/**
 * src/domain/spareparts/part-cluster.ts
 * Canonical Part Clustering, Deduplication Classifications & Equivalence Graphs.
 */

import { Brand, PartCategory, PartPosition, PartCondition } from "./part.js";
import { PartNumber } from "./part-number.js";
import { Offer } from "./product-offer.js";
import { CrossReference } from "./cross-reference.js";
import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export type MatchClassification =
  | "EXACT_DUPLICATE"
  | "PROBABLE_MATCH"
  | "DISTINCT"
  | "CONFLICT"
  | "UNRESOLVED";

export const VALID_MATCH_CLASSIFICATIONS: readonly MatchClassification[] = Object.freeze([
  "EXACT_DUPLICATE",
  "PROBABLE_MATCH",
  "DISTINCT",
  "CONFLICT",
  "UNRESOLVED",
]);

export interface DuplicateMatchResult {
  readonly classification: MatchClassification;
  readonly confidence: number; // 0.0 to 1.0
  readonly matchedKeys: readonly string[];
  readonly reason: string;
  readonly evidence: readonly StructuredClaimEvidence[];
}

export interface CanonicalPartCluster {
  readonly clusterId: string;
  readonly canonicalPartId: string;
  readonly primaryPartNumber: PartNumber;
  readonly alternatePartNumbers: readonly PartNumber[];
  readonly brand: Brand;
  readonly category?: PartCategory | undefined;
  readonly position?: PartPosition | undefined;
  readonly condition?: PartCondition | undefined;
  readonly members: readonly Offer[];
  readonly identitySignals: readonly string[];
  readonly crossReferences: readonly CrossReference[];
  readonly evidence: readonly StructuredClaimEvidence[];
  readonly confidence: number;
  readonly mergeReason: string;
  readonly createdAt: Date;
}

export class PartClusterValidationError extends Error {
  readonly code = "PART_CLUSTER_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PartClusterValidationError";
  }
}

/**
 * Deterministic generation of a Cluster ID based on the canonicalPartId.
 */
export function generateClusterId(canonicalPartId: string): string {
  if (!canonicalPartId || canonicalPartId.trim().length === 0) {
    throw new PartClusterValidationError("canonicalPartId is required to generate clusterId");
  }
  const clean = canonicalPartId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `cluster:${clean}`;
}

/**
 * Factory to create a validated and immutable CanonicalPartCluster aggregate.
 */
export function createPartCluster(params: {
  readonly canonicalPartId: string;
  readonly primaryPartNumber: PartNumber;
  readonly alternatePartNumbers?: readonly PartNumber[] | undefined;
  readonly brand: Brand;
  readonly category?: PartCategory | undefined;
  readonly position?: PartPosition | undefined;
  readonly condition?: PartCondition | undefined;
  readonly members: readonly Offer[];
  readonly identitySignals?: readonly string[] | undefined;
  readonly crossReferences?: readonly CrossReference[] | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
  readonly confidence?: number | undefined;
  readonly mergeReason?: string | undefined;
  readonly createdAt?: Date | undefined;
}): CanonicalPartCluster {
  if (!params.canonicalPartId || params.canonicalPartId.trim().length === 0) {
    throw new PartClusterValidationError("canonicalPartId cannot be empty");
  }
  if (!params.primaryPartNumber || !params.primaryPartNumber.normalizedValue) {
    throw new PartClusterValidationError("primaryPartNumber is required");
  }
  if (!params.brand || !params.brand.name) {
    throw new PartClusterValidationError("brand is required");
  }
  if (!params.members || params.members.length === 0) {
    throw new PartClusterValidationError("cluster must contain at least one offer member");
  }

  const confidence = params.confidence !== undefined ? params.confidence : 1.0;
  if (confidence < 0 || confidence > 1 || isNaN(confidence)) {
    throw new PartClusterValidationError(`Confidence must be between 0.0 and 1.0, got: ${confidence}`);
  }

  const clusterId = generateClusterId(params.canonicalPartId);

  // Deterministically sort members by canonicalOfferId to guarantee order-independence
  const sortedMembers = [...params.members].sort((a, b) =>
    a.canonicalOfferId.localeCompare(b.canonicalOfferId)
  );

  // Collect and deduplicate identity signals deterministically
  const rawSignals = params.identitySignals || [
    `pn:${params.primaryPartNumber.normalizedValue}`,
    `brand:${params.brand.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  ];
  const sortedSignals = Array.from(new Set(rawSignals)).sort();

  // Deduplicate and sort alternate part numbers
  const altNumbers = params.alternatePartNumbers
    ? [...params.alternatePartNumbers].sort((a, b) => a.normalizedValue.localeCompare(b.normalizedValue))
    : [];

  // Deduplicate cross references
  const xrefs = params.crossReferences
    ? [...params.crossReferences].sort((a, b) => a.crossReferenceId.localeCompare(b.crossReferenceId))
    : [];

  // Lossless evidence aggregation
  const evList: StructuredClaimEvidence[] = [];
  if (params.evidence) {
    evList.push(...params.evidence);
  }
  for (const m of sortedMembers) {
    if (m.evidenceClaims && m.evidenceClaims.length > 0) {
      evList.push(...m.evidenceClaims);
    }
  }

  return Object.freeze({
    clusterId,
    canonicalPartId: params.canonicalPartId.trim(),
    primaryPartNumber: params.primaryPartNumber,
    alternatePartNumbers: Object.freeze(altNumbers),
    brand: Object.freeze(params.brand),
    category: params.category,
    position: params.position,
    condition: params.condition,
    members: Object.freeze(sortedMembers),
    identitySignals: Object.freeze(sortedSignals),
    crossReferences: Object.freeze(xrefs),
    evidence: Object.freeze(evList),
    confidence,
    mergeReason: params.mergeReason || "Primary part number and brand identity match",
    createdAt: params.createdAt || new Date(),
  });
}
