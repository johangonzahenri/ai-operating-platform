/**
 * src/application/spareparts/price-intelligence-engine.ts
 * Deterministic Price Normalization, Total Acquisition Cost, FX Conversion & Multi-Source Comparison Engine.
 */

import { Offer, Price } from "../../domain/spareparts/product-offer.js";
import {
  NormalizedPrice,
  ShippingCostItem,
  TaxCostItem,
  ImportCostItem,
  TotalAcquisitionCost,
  CostCompletenessStatus,
  PriceComparisonOfferItem,
  TransparentPriceComparison,
  PriceIntelligenceValidationError,
} from "../../domain/spareparts/price-intelligence.js";
import { CanonicalPartCluster } from "../../domain/spareparts/part-cluster.js";
import { FitmentVerificationResult } from "../../domain/spareparts/fitment-verdict.js";
import { SellerReputationService } from "./seller-reputation-service.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";

export interface ExchangeRateProvider {
  getRate(fromCurrency: string, toCurrency: string): { rate: number; source: string; timestamp: Date } | undefined;
}

/**
 * Standard deterministic reference FX rates (e.g. for Chilean Peso baseline comparisons).
 */
export const DEFAULT_REFERENCE_FX_RATES: Readonly<Record<string, Record<string, number>>> = Object.freeze({
  "CLP": { "CLP": 1.0, "USD": 0.00105, "EUR": 0.00095 },
  "USD": { "CLP": 950.0, "USD": 1.0, "EUR": 0.91 },
  "EUR": { "CLP": 1050.0, "USD": 1.10, "EUR": 1.0 },
});

export class StaticExchangeRateProvider implements ExchangeRateProvider {
  constructor(private readonly rates: Record<string, Record<string, number>> = DEFAULT_REFERENCE_FX_RATES) {}

  getRate(fromCurrency: string, toCurrency: string): { rate: number; source: string; timestamp: Date } | undefined {
    const from = fromCurrency.toUpperCase().trim();
    const to = toCurrency.toUpperCase().trim();
    if (from === to) {
      return { rate: 1.0, source: "IDENTITY", timestamp: new Date("2026-09-24T00:00:00Z") };
    }
    const table = this.rates[from];
    if (table && table[to] !== undefined) {
      return { rate: table[to], source: "STATIC_REFERENCE_FX", timestamp: new Date("2026-09-24T00:00:00Z") };
    }
    return undefined;
  }
}

export interface CostCalculationOptions {
  readonly comparisonCurrency?: string | undefined; // Target currency, defaults to "CLP"
  readonly requestedQuantity?: number | undefined; // Defaults to 1
  readonly targetDestinationCountry?: string | undefined; // e.g. "CL"
  readonly targetDestinationRegion?: string | undefined;
}

export class PriceIntelligenceEngine {
  constructor(
    private readonly sellerReputationService: SellerReputationService = new SellerReputationService(),
    private readonly fxProvider: ExchangeRateProvider = new StaticExchangeRateProvider()
  ) {}

  /**
   * Normalizes a raw price into the target comparison currency and normalizes by quantity.
   */
  normalizePrice(
    rawPrice: Price,
    options?: {
      readonly targetCurrency?: string | undefined;
      readonly requestedQuantity?: number | undefined;
      readonly packSize?: number | undefined;
      readonly discountAmount?: number | undefined;
      readonly evidence?: readonly StructuredClaimEvidence[] | undefined;
    }
  ): NormalizedPrice {
    const targetCurrency = (options?.targetCurrency || rawPrice.currency || "CLP").toUpperCase().trim();
    const fromCurrency = rawPrice.currency.toUpperCase().trim();
    const qty = options?.requestedQuantity && options.requestedQuantity > 0 ? options.requestedQuantity : 1;
    const pack = options?.packSize && options.packSize > 0 ? options.packSize : 1;

    let fxRate = 1.0;
    let fxSource = "IDENTITY";
    let fxTimestamp = rawPrice.validAt;

    if (fromCurrency !== targetCurrency) {
      const rateInfo = this.fxProvider.getRate(fromCurrency, targetCurrency);
      if (!rateInfo) {
        throw new PriceIntelligenceValidationError(
          `Cannot normalize price: Missing FX exchange rate from ${fromCurrency} to ${targetCurrency}`
        );
      }
      fxRate = rateInfo.rate;
      fxSource = rateInfo.source;
      fxTimestamp = rateInfo.timestamp;
    }

    const unitAmountRaw = rawPrice.amount / pack;
    const baseTotalRaw = unitAmountRaw * qty;
    const discount = options?.discountAmount !== undefined ? options.discountAmount : 0;
    const afterDiscountRaw = Math.max(0, baseTotalRaw - discount);

    const normalizedAmount = Math.round(afterDiscountRaw * fxRate * 100) / 100;
    const unitPriceNormalized = Math.round((unitAmountRaw * fxRate) * 100) / 100;

    return Object.freeze({
      rawAmount: rawPrice.amount,
      rawCurrency: rawPrice.currency,
      normalizedAmount,
      normalizedCurrency: targetCurrency,
      exchangeRate: fxRate,
      exchangeRateSource: fxSource,
      exchangeRateTimestamp: fxTimestamp,
      unitPrice: unitPriceNormalized,
      requestedQuantity: qty,
      packSize: pack,
      discountAmount: discount > 0 ? discount : undefined,
      discountPercent: discount > 0 && baseTotalRaw > 0 ? Math.round((discount / baseTotalRaw) * 1000) / 10 : undefined,
      evidence: options?.evidence ? Object.freeze([...options.evidence]) : undefined,
    });
  }

  /**
   * Calculates total acquisition cost deterministically with fail-closed UNKNOWN handling.
   * Crucial invariant: UNKNOWN != 0!
   */
  calculateTotalCost(offer: Offer, options?: CostCalculationOptions): TotalAcquisitionCost {
    const targetCurrency = (options?.comparisonCurrency || offer.price.currency || "CLP").toUpperCase().trim();
    const qty = options?.requestedQuantity && options.requestedQuantity > 0 ? options.requestedQuantity : 1;

    // 1. Base Price
    const basePrice = this.normalizePrice(offer.price, {
      targetCurrency,
      requestedQuantity: qty,
      evidence: offer.evidenceClaims,
    });

    // 2. Shipping Cost
    let shippingItem: ShippingCostItem;
    if (offer.price.shippingIncluded) {
      shippingItem = {
        status: "INCLUDED",
        amount: 0,
        currency: targetCurrency,
        isFree: true,
        method: "Free shipping included in price",
      };
    } else if (offer.shipping) {
      if (offer.shipping.isFreeShipping || offer.shipping.cost === 0) {
        shippingItem = {
          status: "FREE",
          amount: 0,
          currency: targetCurrency,
          isFree: true,
          method: offer.shipping.carrier || "Standard Delivery",
          estimatedDays: offer.shipping.estimatedDeliveryDays,
        };
      } else {
        const shipFx = this.getExchangeRate(offer.shipping.currency, targetCurrency);
        const normShipCost = Math.round(offer.shipping.cost * shipFx * 100) / 100;
        shippingItem = {
          status: "KNOWN_AMOUNT",
          amount: normShipCost,
          currency: targetCurrency,
          isFree: false,
          carrier: offer.shipping.carrier,
          estimatedDays: offer.shipping.estimatedDeliveryDays,
        };
      }
    } else {
      // Invariant: Missing shipping information is UNKNOWN, NEVER 0!
      shippingItem = {
        status: "UNKNOWN",
        isFree: false,
        amount: undefined,
      };
    }

    // 3. Tax Cost
    let taxItem: TaxCostItem;
    if (offer.price.taxIncluded) {
      taxItem = {
        status: "INCLUDED",
        isIncludedInPrice: true,
        amount: 0,
        currency: targetCurrency,
        taxType: "IVA",
      };
    } else {
      // Missing or unstated tax is UNKNOWN (or EXCLUDED)
      taxItem = {
        status: "UNKNOWN",
        isIncludedInPrice: false,
        amount: undefined,
      };
    }

    // 4. Import Cost
    let importItem: ImportCostItem;
    const isDomestic = offer.seller.country === (options?.targetDestinationCountry || "CL");
    if (isDomestic) {
      importItem = {
        status: "NOT_APPLICABLE",
        totalImportFees: 0,
        currency: targetCurrency,
      };
    } else {
      // International shipment without explicit import calculation is UNKNOWN
      importItem = {
        status: "UNKNOWN",
        totalImportFees: undefined,
      };
    }

    // 5. Total Computation with Completeness
    const breakdownParts: string[] = [`Base: ${basePrice.normalizedAmount} ${targetCurrency}`];
    let totalAmount: number | undefined = basePrice.normalizedAmount;
    let completeness: CostCompletenessStatus = "TOTAL_KNOWN";

    if (shippingItem.status === "KNOWN_AMOUNT" && shippingItem.amount !== undefined) {
      totalAmount += shippingItem.amount;
      breakdownParts.push(`Shipping: +${shippingItem.amount}`);
    } else if (shippingItem.status === "FREE" || shippingItem.status === "INCLUDED") {
      breakdownParts.push("Shipping: Included/Free");
    } else {
      // Shipping is UNKNOWN -> Cannot compute complete total!
      totalAmount = undefined;
      completeness = "TOTAL_UNKNOWN";
      breakdownParts.push("Shipping: UNKNOWN");
    }

    if (taxItem.status === "INCLUDED") {
      breakdownParts.push("Tax: Included");
    } else if (taxItem.status === "KNOWN_AMOUNT" && taxItem.amount !== undefined) {
      if (totalAmount !== undefined) totalAmount += taxItem.amount;
      breakdownParts.push(`Tax: +${taxItem.amount}`);
    } else {
      totalAmount = undefined;
      completeness = "TOTAL_UNKNOWN";
      breakdownParts.push("Tax: UNKNOWN");
    }

    if (importItem.status === "NOT_APPLICABLE") {
      breakdownParts.push("Import: N/A (Domestic)");
    } else if (importItem.status === "KNOWN_AMOUNT" && importItem.totalImportFees !== undefined) {
      if (totalAmount !== undefined) totalAmount += importItem.totalImportFees;
      breakdownParts.push(`Import: +${importItem.totalImportFees}`);
    } else {
      totalAmount = undefined;
      completeness = "TOTAL_UNKNOWN";
      breakdownParts.push("Import: UNKNOWN (Cross-border fees pending)");
    }

    // Round total if known
    if (totalAmount !== undefined) {
      totalAmount = Math.round(totalAmount * 100) / 100;
    }

    return Object.freeze({
      basePrice,
      shipping: Object.freeze(shippingItem),
      taxes: Object.freeze(taxItem),
      importCosts: Object.freeze(importItem),
      totalAmount,
      currency: targetCurrency,
      completeness,
      calculationBreakdown: breakdownParts.join(" | "),
      evidence: Object.freeze(offer.evidenceClaims || []),
    });
  }

  /**
   * Compares a list of offers transparently within a CanonicalPartCluster.
   */
  compareOffers(
    cluster: CanonicalPartCluster,
    options?: CostCalculationOptions & {
      readonly fitmentResults?: readonly FitmentVerificationResult[] | undefined;
    }
  ): TransparentPriceComparison {
    const comparisonCurrency = (options?.comparisonCurrency || "CLP").toUpperCase().trim();
    const qty = options?.requestedQuantity && options.requestedQuantity > 0 ? options.requestedQuantity : 1;
    const warnings: string[] = [];

    const fitmentMap = new Map<string, FitmentVerificationResult>();
    if (options?.fitmentResults) {
      for (const res of options.fitmentResults) {
        fitmentMap.set(res.canonicalPartId, res);
      }
    }

    const items: PriceComparisonOfferItem[] = [];

    for (const offer of cluster.members) {
      const incomparabilityReasons: string[] = [];

      // Check fitment if available
      const fitment = fitmentMap.get(offer.canonicalPartId);
      if (fitment && fitment.verdict === "NOT_FIT") {
        incomparabilityReasons.push(`Incompatible with target vehicle: ${fitment.explanation}`);
      }

      // Check availability
      if (offer.availability.status === "OUT_OF_STOCK") {
        incomparabilityReasons.push("Product is currently out of stock");
      }

      // Calculate total cost
      const totalCost = this.calculateTotalCost(offer, {
        comparisonCurrency,
        requestedQuantity: qty,
        targetDestinationCountry: options?.targetDestinationCountry,
        targetDestinationRegion: options?.targetDestinationRegion,
      });

      // Calculate seller trust
      const sellerTrust = this.sellerReputationService.evaluateSellerTrust({
        seller: offer.seller,
        hasVerifiedListing: Boolean(offer.listing.sourceUrl),
        warrantyMonths: offer.warrantyMonths,
        returnPolicyDays: offer.returnPolicyDays,
      });

      const isComparable = incomparabilityReasons.length === 0 && totalCost.completeness === "TOTAL_KNOWN";

      items.push({
        offerId: offer.canonicalOfferId,
        canonicalPartId: offer.canonicalPartId,
        sourceId: offer.sourceId,
        sourceName: offer.sourceId,
        sellerId: offer.seller.sellerId,
        sellerName: offer.seller.name,
        sellerTrust,
        basePrice: offer.price,
        totalCost,
        isComparable,
        incomparabilityReasons: incomparabilityReasons.length > 0 ? Object.freeze(incomparabilityReasons) : undefined,
        fitmentVerdict: fitment?.verdict,
      });
    }

    // Sort items deterministically: comparable items first by totalAmount ascending, then by seller trust descending
    items.sort((a, b) => {
      if (a.isComparable && !b.isComparable) return -1;
      if (!a.isComparable && b.isComparable) return 1;

      if (a.totalCost.totalAmount !== undefined && b.totalCost.totalAmount !== undefined) {
        const diff = a.totalCost.totalAmount - b.totalCost.totalAmount;
        if (Math.abs(diff) > 0.01) return diff;
      }
      return b.sellerTrust.score - a.sellerTrust.score;
    });

    // Determine best picks among comparable offers
    const comparableItems = items.filter(i => i.isComparable && i.totalCost.totalAmount !== undefined);

    let bestPriceOfferId: string | undefined = undefined;
    let bestTrustOfferId: string | undefined = undefined;
    let bestOverallOfferId: string | undefined = undefined;

    if (comparableItems.length > 0) {
      bestPriceOfferId = comparableItems[0].offerId;

      const sortedByTrust = [...comparableItems].sort((a, b) => b.sellerTrust.score - a.sellerTrust.score);
      bestTrustOfferId = sortedByTrust[0].offerId;

      // Balanced pick: normalized cost (lower is better) + trust score (higher is better)
      const minCost = comparableItems[0].totalCost.totalAmount!;
      const bestOverall = [...comparableItems].sort((a, b) => {
        const costFactorA = minCost / a.totalCost.totalAmount!;
        const costFactorB = minCost / b.totalCost.totalAmount!;
        const scoreA = (costFactorA * 0.6) + (a.sellerTrust.score * 0.4);
        const scoreB = (costFactorB * 0.6) + (b.sellerTrust.score * 0.4);
        return scoreB - scoreA;
      });
      bestOverallOfferId = bestOverall[0].offerId;
    } else {
      warnings.push("No fully comparable offers available due to unknown shipping/tax costs or out-of-stock listings");
    }

    return Object.freeze({
      comparisonId: `cmp:${cluster.clusterId}:${Date.now()}`,
      canonicalPartId: cluster.canonicalPartId,
      comparisonCurrency,
      requestedQuantity: qty,
      items: Object.freeze(items),
      bestPriceOfferId,
      bestTrustOfferId,
      bestOverallOfferId,
      warnings: Object.freeze(warnings),
      evaluatedAt: new Date(),
    });
  }

  private getExchangeRate(fromCurrency: string, toCurrency: string): number {
    const from = fromCurrency.toUpperCase().trim();
    const to = toCurrency.toUpperCase().trim();
    if (from === to) return 1.0;
    const rateInfo = this.fxProvider.getRate(from, to);
    if (!rateInfo) {
      throw new PriceIntelligenceValidationError(`Missing FX rate for conversion from ${from} to ${to}`);
    }
    return rateInfo.rate;
  }
}
