/**
 * src/application/spareparts/duplicate-detection-service.ts
 * Deterministic Duplicate & Equivalence Detection Service for Automotive Spare Parts.
 */

import { Offer } from "../../domain/spareparts/product-offer.js";
import { PartNumber, normalizePartNumber } from "../../domain/spareparts/part-number.js";
import { DuplicateMatchResult, MatchClassification } from "../../domain/spareparts/part-cluster.js";
import { CrossReference } from "../../domain/spareparts/cross-reference.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";

export interface DuplicateDetectionRule {
  readonly ruleId: string;
  readonly description: string;
  readonly evaluate: (offerA: Offer, offerB: Offer, crossRefs?: readonly CrossReference[]) => DuplicateMatchResult | undefined;
}

export class DuplicateDetectionService {
  /**
   * Compares two offers deterministically and returns a MatchClassification with evidence.
   */
  classifyPair(
    offerA: Offer,
    offerB: Offer,
    options?: {
      readonly knownCrossReferences?: readonly CrossReference[] | undefined;
    }
  ): DuplicateMatchResult {
    // 1. Same offer ID or same source listing ID (Exact Duplicate)
    if (offerA.canonicalOfferId === offerB.canonicalOfferId) {
      return {
        classification: "EXACT_DUPLICATE",
        confidence: 1.0,
        matchedKeys: [offerA.canonicalOfferId],
        reason: "Identical canonical offer ID",
        evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
      };
    }

    if (offerA.sourceId === offerB.sourceId && offerA.listing.sourceListingId === offerB.listing.sourceListingId) {
      return {
        classification: "EXACT_DUPLICATE",
        confidence: 1.0,
        matchedKeys: [`${offerA.sourceId}:${offerA.listing.sourceListingId}`],
        reason: "Same source and listing ID",
        evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
      };
    }

    // 2. Canonical Part ID match
    if (offerA.canonicalPartId === offerB.canonicalPartId) {
      return {
        classification: "EXACT_DUPLICATE",
        confidence: 0.98,
        matchedKeys: [offerA.canonicalPartId],
        reason: "Matching canonical part ID (brand + normalized part number)",
        evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
      };
    }

    // Parse brand & part number tokens from canonicalPartId ("part:brand:normalizedpn")
    const partsA = offerA.canonicalPartId.split(":");
    const partsB = offerB.canonicalPartId.split(":");

    const brandA = partsA.length >= 2 ? partsA[1] : "";
    const brandB = partsB.length >= 2 ? partsB[1] : "";
    const pnA = partsA.length >= 3 ? partsA[2] : "";
    const pnB = partsB.length >= 3 ? partsB[2] : "";

    // 3. Same normalized Part Number under compatible brands
    if (pnA && pnB && pnA === pnB) {
      if (brandA === brandB || !brandA || !brandB || brandA === "generic" || brandB === "generic") {
        return {
          classification: "EXACT_DUPLICATE",
          confidence: 0.95,
          matchedKeys: [`pn:${pnA}`],
          reason: "Identical normalized part number under compatible brand",
          evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
        };
      } else {
        // Differing explicit brands with identical part number string (e.g. Bosch 12345 vs Denso 12345)
        // Without cross-reference, this is distinct or unresolved to prevent false positives!
        return {
          classification: "DISTINCT",
          confidence: 0.85,
          matchedKeys: [`brandA:${brandA}`, `brandB:${brandB}`],
          reason: "Identical part number string belongs to conflicting/different manufacturers",
          evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
        };
      }
    }

    // 4. Cross-Reference Evaluation
    if (options?.knownCrossReferences && options.knownCrossReferences.length > 0 && pnA && pnB) {
      for (const xref of options.knownCrossReferences) {
        const srcNorm = xref.sourcePartNumber.normalizedValue.toLowerCase();
        const tgtNorm = xref.targetPartNumber.normalizedValue.toLowerCase();

        const matchesDirect = (srcNorm === pnA && tgtNorm === pnB);
        const matchesReverse = (xref.direction === "BIDIRECTIONAL" && srcNorm === pnB && tgtNorm === pnA);

        if (matchesDirect || matchesReverse) {
          if (xref.relationType === "EXACT" || xref.relationType === "EQUIVALENT" || xref.relationType === "SUPERSEDES") {
            const evList: StructuredClaimEvidence[] = [
              ...offerA.evidenceClaims,
              ...offerB.evidenceClaims,
            ];
            if (xref.evidence) {
              evList.push(...xref.evidence);
            }
            return {
              classification: "EXACT_DUPLICATE",
              confidence: xref.confidence,
              matchedKeys: [xref.crossReferenceId],
              reason: `Verified ${xref.relationType} cross-reference relationship (${xref.verifiedBy || "catalog"})`,
              evidence: evList,
            };
          } else if (xref.relationType === "POTENTIAL_MATCH" || xref.relationType === "COMPATIBLE" || xref.relationType === "REPLACEMENT") {
            return {
              classification: "PROBABLE_MATCH",
              confidence: xref.confidence,
              matchedKeys: [xref.crossReferenceId],
              reason: `Probable cross-reference equivalence: ${xref.relationType}`,
              evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims, ...(xref.evidence || [])],
            };
          }
        }
      }
    }

    // 5. Check for direct conflicting attributes or distinct part numbers
    if (pnA && pnB && pnA !== pnB) {
      return {
        classification: "DISTINCT",
        confidence: 0.99,
        matchedKeys: [`pnA:${pnA}`, `pnB:${pnB}`],
        reason: "Different normalized part numbers without cross-reference link",
        evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
      };
    }

    // Default fallback
    return {
      classification: "UNRESOLVED",
      confidence: 0.3,
      matchedKeys: [],
      reason: "Insufficient identifying signals to establish equivalence or distinction",
      evidence: [...offerA.evidenceClaims, ...offerB.evidenceClaims],
    };
  }
}
