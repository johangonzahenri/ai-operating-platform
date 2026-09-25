/**
 * src/domain/spareparts/price-intelligence.ts
 * Price Normalization, Cost Breakdown, Seller Trust Score & Comparison Domain Models.
 */

import { Price } from "./product-offer.js";
import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export type CostCompletenessStatus =
  | "TOTAL_KNOWN"
  | "TOTAL_PARTIAL"
  | "TOTAL_UNKNOWN";

export const VALID_COST_COMPLETENESS_STATUSES: readonly CostCompletenessStatus[] = Object.freeze([
  "TOTAL_KNOWN",
  "TOTAL_PARTIAL",
  "TOTAL_UNKNOWN",
]);

export type CostComponentStatus =
  | "INCLUDED"
  | "EXCLUDED"
  | "KNOWN_AMOUNT"
  | "FREE"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export const VALID_COST_COMPONENT_STATUSES: readonly CostComponentStatus[] = Object.freeze([
  "INCLUDED",
  "EXCLUDED",
  "KNOWN_AMOUNT",
  "FREE",
  "UNKNOWN",
  "NOT_APPLICABLE",
]);

export interface NormalizedPrice {
  readonly rawAmount: number;
  readonly rawCurrency: string;
  readonly normalizedAmount: number;
  readonly normalizedCurrency: string;
  readonly exchangeRate: number;
  readonly exchangeRateSource: string;
  readonly exchangeRateTimestamp?: Date | undefined;
  readonly unitPrice: number;
  readonly requestedQuantity: number;
  readonly packSize: number;
  readonly discountAmount?: number | undefined;
  readonly discountPercent?: number | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export interface ShippingCostItem {
  readonly status: CostComponentStatus;
  readonly amount?: number | undefined;
  readonly currency?: string | undefined;
  readonly isFree: boolean;
  readonly method?: string | undefined;
  readonly carrier?: string | undefined;
  readonly estimatedDays?: number | undefined;
  readonly destinationRegion?: string | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export interface TaxCostItem {
  readonly status: CostComponentStatus;
  readonly taxType?: string | undefined; // e.g. "IVA", "VAT", "SALES_TAX"
  readonly ratePercent?: number | undefined;
  readonly amount?: number | undefined;
  readonly currency?: string | undefined;
  readonly isIncludedInPrice: boolean;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export interface ImportCostItem {
  readonly status: CostComponentStatus;
  readonly customsDuty?: number | undefined;
  readonly brokerageFee?: number | undefined;
  readonly handlingFee?: number | undefined;
  readonly totalImportFees?: number | undefined;
  readonly currency?: string | undefined;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export interface TotalAcquisitionCost {
  readonly basePrice: NormalizedPrice;
  readonly shipping: ShippingCostItem;
  readonly taxes: TaxCostItem;
  readonly importCosts: ImportCostItem;
  readonly totalAmount?: number | undefined; // undefined if UNKNOWN (fail-closed)
  readonly currency: string;
  readonly completeness: CostCompletenessStatus;
  readonly calculationBreakdown: string;
  readonly evidence: readonly StructuredClaimEvidence[];
}

export interface TrustScoreComponent {
  readonly factor: string;
  readonly value: number; // 0.0 to 1.0
  readonly weight: number; // 0.0 to 1.0
  readonly contribution: number; // value * weight
  readonly reason: string;
  readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
}

export interface SellerTrustScore {
  readonly sellerId: string;
  readonly sellerName: string;
  readonly score: number; // 0.0 to 1.0
  readonly confidence: number; // 0.0 to 1.0
  readonly components: readonly TrustScoreComponent[];
  readonly reasons: readonly string[];
  readonly sourceReliability: number;
  readonly isVerified: boolean;
  readonly evidence: readonly StructuredClaimEvidence[];
  readonly evaluatedAt: Date;
}

export interface PriceComparisonOfferItem {
  readonly offerId: string;
  readonly canonicalPartId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly sellerTrust: SellerTrustScore;
  readonly basePrice: Price;
  readonly totalCost: TotalAcquisitionCost;
  readonly isComparable: boolean;
  readonly incomparabilityReasons?: readonly string[] | undefined;
  readonly fitmentVerdict?: "FIT" | "NOT_FIT" | "UNKNOWN" | "CONFLICT" | undefined;
}

export interface TransparentPriceComparison {
  readonly comparisonId: string;
  readonly canonicalPartId: string;
  readonly comparisonCurrency: string;
  readonly requestedQuantity: number;
  readonly items: readonly PriceComparisonOfferItem[];
  readonly bestPriceOfferId?: string | undefined; // Lowest complete known total
  readonly bestTrustOfferId?: string | undefined; // Highest seller trust score
  readonly bestOverallOfferId?: string | undefined; // Balanced best deal
  readonly warnings: readonly string[];
  readonly evaluatedAt: Date;
}

export class PriceIntelligenceValidationError extends Error {
  readonly code = "PRICE_INTELLIGENCE_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PriceIntelligenceValidationError";
  }
}
