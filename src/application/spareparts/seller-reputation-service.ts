/**
 * src/application/spareparts/seller-reputation-service.ts
 * Deterministic & Explainable Seller Reputation Evaluation Engine.
 */

import { Seller } from "../../domain/spareparts/product-offer.js";
import {
  SellerTrustScore,
  TrustScoreComponent,
} from "../../domain/spareparts/price-intelligence.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";

export interface SellerReputationInput {
  readonly seller: Seller;
  readonly sourceReliability?: number | undefined; // 0.0 to 1.0 from source registry
  readonly hasVerifiedListing?: boolean | undefined;
  readonly evidenceQuality?: number | undefined; // 0.0 to 1.0
  readonly priceTransparency?: boolean | undefined;
  readonly returnPolicyDays?: number | undefined;
  readonly warrantyMonths?: number | undefined;
}

export class SellerReputationService {
  /**
   * Evaluates seller trust score deterministically from structured domain signals.
   * Guarantees:
   * 1. Explainability: Every point contribution has an explicit weight, factor, reason, and signal.
   * 2. Source Separation: Distinguishes source reliability from direct seller signals.
   * 3. Determinism: Same signals always yield identical scores and component lists.
   */
  evaluateSellerTrust(input: SellerReputationInput): SellerTrustScore {
    const components: TrustScoreComponent[] = [];
    const reasons: string[] = [];
    const evidenceList: StructuredClaimEvidence[] = [];

    // Factor 1: Seller Verification Status (Weight: 0.25)
    const isVerified = Boolean(input.seller.verified);
    const verifVal = isVerified ? 1.0 : 0.4;
    const verifWeight = 0.25;
    components.push({
      factor: "SELLER_VERIFICATION",
      value: verifVal,
      weight: verifWeight,
      contribution: verifVal * verifWeight,
      reason: isVerified ? "Seller is officially verified in source registry" : "Seller identity is unverified or community-reported",
    });
    if (isVerified) reasons.push("Verified seller credentials confirmed");

    // Factor 2: Source Platform Reliability (Weight: 0.25)
    const srcRel = input.sourceReliability !== undefined ? Math.min(1, Math.max(0, input.sourceReliability)) : 0.8;
    const srcWeight = 0.25;
    components.push({
      factor: "SOURCE_RELIABILITY",
      value: srcRel,
      weight: srcWeight,
      contribution: srcRel * srcWeight,
      reason: `Platform source '${input.seller.sourceId}' baseline reliability score is ${srcRel.toFixed(2)}`,
    });

    // Factor 3: Seller Customer Review Rating (Weight: 0.20)
    let reviewScore = 0.6; // default neutral if unrated
    let reviewReason = "No seller customer reviews recorded; neutral default assigned";
    if (input.seller.reputation && input.seller.reputation.maxRating > 0) {
      const normalizedRating = Math.min(1, Math.max(0, input.seller.reputation.rating / input.seller.reputation.maxRating));
      reviewScore = normalizedRating;
      reviewReason = `Customer review rating ${input.seller.reputation.rating}/${input.seller.reputation.maxRating} (${input.seller.reputation.reviewCount} reviews)`;
      reasons.push(reviewReason);
    }
    const reviewWeight = 0.20;
    components.push({
      factor: "CUSTOMER_RATING",
      value: reviewScore,
      weight: reviewWeight,
      contribution: reviewScore * reviewWeight,
      reason: reviewReason,
    });

    // Factor 4: Commercial Warranty & Return Policy Transparency (Weight: 0.15)
    let policyScore = 0.3;
    const hasWarranty = input.warrantyMonths !== undefined && input.warrantyMonths > 0;
    const hasReturns = input.returnPolicyDays !== undefined && input.returnPolicyDays > 0;
    if (hasWarranty && hasReturns) {
      policyScore = 1.0;
      reasons.push(`Explicit commercial warranty (${input.warrantyMonths}m) and return policy (${input.returnPolicyDays}d)`);
    } else if (hasWarranty || hasReturns) {
      policyScore = 0.7;
      reasons.push("Partial warranty or return protection disclosed");
    }
    const policyWeight = 0.15;
    components.push({
      factor: "POLICY_TRANSPARENCY",
      value: policyScore,
      weight: policyWeight,
      contribution: policyScore * policyWeight,
      reason: hasWarranty || hasReturns ? "Warranty or return terms explicitly declared" : "No warranty or return window specified",
    });

    // Factor 5: Evidence Quality & Listing Completeness (Weight: 0.15)
    const evQuality = input.evidenceQuality !== undefined ? Math.min(1, Math.max(0, input.evidenceQuality)) : (input.hasVerifiedListing ? 0.9 : 0.6);
    const evWeight = 0.15;
    components.push({
      factor: "EVIDENCE_COMPLETENESS",
      value: evQuality,
      weight: evWeight,
      contribution: evQuality * evWeight,
      reason: `Structured claim evidence quality rated at ${(evQuality * 100).toFixed(0)}% completeness`,
    });

    // Calculate aggregated score
    let totalScore = 0;
    for (const comp of components) {
      totalScore += comp.contribution;
    }
    // Round to 4 decimal places for deterministic precision
    totalScore = Math.round(totalScore * 10000) / 10000;

    const confidence = isVerified ? 0.95 : 0.75;

    return Object.freeze({
      sellerId: input.seller.sellerId,
      sellerName: input.seller.name,
      score: totalScore,
      confidence,
      components: Object.freeze(components),
      reasons: Object.freeze(reasons),
      sourceReliability: srcRel,
      isVerified,
      evidence: Object.freeze(evidenceList),
      evaluatedAt: new Date(),
    });
  }
}
