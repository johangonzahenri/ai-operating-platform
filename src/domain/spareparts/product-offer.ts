/**
 * src/domain/spareparts/product-offer.ts
 * Commerce Domain: Product, ProductVariant, Listing, Seller, SellerReputation, ProductRating, Price, TotalCost, Availability, Shipping & Offer.
 */

import { PartCondition } from "./part.js";
import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export interface ProductVariant {
  readonly variantId: string;
  readonly name: string;
  readonly packaging?: string | undefined; // e.g. "Box of 4 pads", "Single unit", "1 Liter bottle"
  readonly quantity: number;
  readonly material?: string | undefined; // e.g. "Ceramic", "Semi-metallic", "Synthetic"
  readonly revision?: string | undefined;
  readonly market?: string | undefined;
}

export interface Product {
  readonly canonicalProductId: string;
  readonly canonicalPartId: string;
  readonly commercialName: string;
  readonly description?: string | undefined;
  readonly packaging?: string | undefined;
  readonly quantityPerPack: number;
  readonly variants: readonly ProductVariant[];
  readonly barcode?: string | undefined; // EAN/UPC/GTIN
}

export interface Listing {
  readonly sourceListingId: string;
  readonly sourceId: string;
  readonly rawTitle: string;
  readonly sourceUrl: string;
  readonly rawPrice?: number | undefined;
  readonly rawCurrency?: string | undefined;
  readonly sellerName?: string | undefined;
  readonly rawData?: Readonly<Record<string, unknown>> | undefined;
  readonly retrievedAt: Date;
}

export interface SellerReputation {
  readonly rating: number; // e.g. 4.8 / 5.0 or 0.0 to 1.0 normalized
  readonly maxRating: number; // e.g. 5.0
  readonly reviewCount: number;
  readonly positiveRatio?: number | undefined; // e.g. 0.98 (98%)
  readonly verificationStatus: "VERIFIED" | "COMMUNITY_VERIFIED" | "UNVERIFIED" | "BLACKLISTED";
  readonly sourceId: string;
  readonly retrievedAt: Date;
}

export interface Seller {
  readonly sellerId: string;
  readonly name: string;
  readonly sourceId: string;
  readonly location?: string | undefined; // e.g. "Santiago, Chile", "Miami, FL, US"
  readonly country: string; // e.g. "CL", "US", "DE"
  readonly verified: boolean;
  readonly reputation?: SellerReputation | undefined;
}

export interface ProductRating {
  readonly averageScore: number;
  readonly maxScore: number;
  readonly totalReviews: number;
  readonly distribution?: Readonly<Record<string, number>> | undefined;
  readonly sourceId: string;
  readonly retrievedAt: Date;
}

export type PriceType =
  | "LIST_PRICE"
  | "SALE_PRICE"
  | "REFERENCE_PRICE"
  | "MEMBER_PRICE"
  | "ESTIMATED_PRICE"
  | "UNKNOWN";

export const VALID_PRICE_TYPES: readonly PriceType[] = Object.freeze([
  "LIST_PRICE",
  "SALE_PRICE",
  "REFERENCE_PRICE",
  "MEMBER_PRICE",
  "ESTIMATED_PRICE",
  "UNKNOWN",
]);

export interface Price {
  readonly amount: number;
  readonly currency: string; // e.g. "CLP", "USD", "EUR"
  readonly priceType: PriceType;
  readonly taxIncluded: boolean;
  readonly shippingIncluded: boolean;
  readonly validAt: Date;
  readonly sourceId?: string | undefined;
}

export interface TotalCost {
  readonly productPrice: Price;
  readonly shippingCost: Price;
  readonly estimatedTaxes?: Price | undefined;
  readonly importFees?: Price | undefined;
  readonly totalAmount: number;
  readonly currency: string;
  readonly calculationBreakdown: string;
}

export type AvailabilityStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "PREORDER"
  | "AVAILABLE_ON_REQUEST"
  | "UNKNOWN";

export const VALID_AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = Object.freeze([
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "PREORDER",
  "AVAILABLE_ON_REQUEST",
  "UNKNOWN",
]);

export interface Availability {
  readonly status: AvailabilityStatus;
  readonly quantity?: number | undefined;
  readonly leadTimeDays?: number | undefined;
  readonly locationWarehouse?: string | undefined;
  readonly checkedAt: Date;
}

export interface ShippingInfo {
  readonly cost: number;
  readonly currency: string;
  readonly destinationCountry: string; // e.g. "CL"
  readonly destinationRegion?: string | undefined;
  readonly estimatedDeliveryDays?: number | undefined;
  readonly carrier?: string | undefined;
  readonly isFreeShipping: boolean;
}

export interface Offer {
  readonly canonicalOfferId: string;
  readonly canonicalPartId: string;
  readonly canonicalProductId?: string | undefined;
  readonly sourceId: string;
  readonly seller: Seller;
  readonly listing: Listing;
  readonly price: Price;
  readonly availability: Availability;
  readonly shipping?: ShippingInfo | undefined;
  readonly condition: PartCondition;
  readonly warrantyMonths?: number | undefined;
  readonly returnPolicyDays?: number | undefined;
  readonly productRating?: ProductRating | undefined;
  readonly evidenceClaims: readonly StructuredClaimEvidence[];
  readonly retrievedAt: Date;
}

export class CommerceValidationError extends Error {
  readonly code = "COMMERCE_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "CommerceValidationError";
  }
}

/**
 * Deterministic generation of Canonical Offer ID.
 */
export function generateCanonicalOfferId(sourceId: string, sourceListingId: string, sellerId?: string): string {
  if (!sourceId || sourceId.trim().length === 0) {
    throw new CommerceValidationError("sourceId is required for canonical offer ID");
  }
  if (!sourceListingId || sourceListingId.trim().length === 0) {
    throw new CommerceValidationError("sourceListingId is required for canonical offer ID");
  }
  const cleanSource = sourceId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanListing = sourceListingId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanSeller = sellerId ? `:${sellerId.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";

  return `off:${cleanSource}:${cleanListing}${cleanSeller}`;
}

/**
 * Factory to create a validated Price value object.
 */
export function createPrice(params: {
  readonly amount: number;
  readonly currency: string;
  readonly priceType?: PriceType | undefined;
  readonly taxIncluded?: boolean | undefined;
  readonly shippingIncluded?: boolean | undefined;
  readonly validAt?: Date | undefined;
  readonly sourceId?: string | undefined;
}): Price {
  if (params.amount < 0 || isNaN(params.amount)) {
    throw new CommerceValidationError(`Price amount cannot be negative: ${params.amount}`);
  }
  if (!params.currency || params.currency.trim().length === 0) {
    throw new CommerceValidationError("Price currency is required");
  }

  const priceType = params.priceType || "LIST_PRICE";
  if (!VALID_PRICE_TYPES.includes(priceType)) {
    throw new CommerceValidationError(`Invalid PriceType: '${priceType}'`);
  }

  return Object.freeze({
    amount: params.amount,
    currency: params.currency.trim().toUpperCase(),
    priceType,
    taxIncluded: Boolean(params.taxIncluded),
    shippingIncluded: Boolean(params.shippingIncluded),
    validAt: params.validAt || new Date(),
    sourceId: params.sourceId?.trim(),
  });
}

/**
 * Factory to create a validated Seller aggregate.
 */
export function createSeller(params: {
  readonly sellerId: string;
  readonly name: string;
  readonly sourceId: string;
  readonly location?: string | undefined;
  readonly country?: string | undefined;
  readonly verified?: boolean | undefined;
  readonly reputation?: SellerReputation | undefined;
}): Seller {
  if (!params.sellerId || params.sellerId.trim().length === 0) {
    throw new CommerceValidationError("Seller ID cannot be empty");
  }
  if (!params.name || params.name.trim().length === 0) {
    throw new CommerceValidationError("Seller name cannot be empty");
  }
  if (!params.sourceId || params.sourceId.trim().length === 0) {
    throw new CommerceValidationError("Seller sourceId cannot be empty");
  }

  if (params.reputation) {
    if (params.reputation.rating < 0 || params.reputation.rating > params.reputation.maxRating) {
      throw new CommerceValidationError(`Seller rating ${params.reputation.rating} out of bounds (0-${params.reputation.maxRating})`);
    }
    if (params.reputation.reviewCount < 0) {
      throw new CommerceValidationError("Seller review count cannot be negative");
    }
  }

  return Object.freeze({
    sellerId: params.sellerId.trim(),
    name: params.name.trim(),
    sourceId: params.sourceId.trim(),
    location: params.location?.trim(),
    country: (params.country?.trim() || "CL").toUpperCase(),
    verified: Boolean(params.verified),
    reputation: params.reputation ? Object.freeze(params.reputation) : undefined,
  });
}

/**
 * Factory to create a validated Offer aggregate.
 */
export function createOffer(params: {
  readonly canonicalPartId: string;
  readonly canonicalProductId?: string | undefined;
  readonly sourceId: string;
  readonly seller: Seller;
  readonly listing: Listing;
  readonly price: Price;
  readonly availability: Availability;
  readonly shipping?: ShippingInfo | undefined;
  readonly condition?: PartCondition | undefined;
  readonly warrantyMonths?: number | undefined;
  readonly returnPolicyDays?: number | undefined;
  readonly productRating?: ProductRating | undefined;
  readonly evidenceClaims?: readonly StructuredClaimEvidence[] | undefined;
  readonly retrievedAt?: Date | undefined;
}): Offer {
  if (!params.canonicalPartId || params.canonicalPartId.trim().length === 0) {
    throw new CommerceValidationError("canonicalPartId is required for an offer");
  }
  if (!params.sourceId || params.sourceId.trim().length === 0) {
    throw new CommerceValidationError("sourceId is required for an offer");
  }
  if (!params.seller || !params.seller.sellerId) {
    throw new CommerceValidationError("Seller is required for an offer");
  }
  if (!params.listing || !params.listing.sourceListingId) {
    throw new CommerceValidationError("Listing is required for an offer");
  }
  if (!params.price || params.price.amount === undefined) {
    throw new CommerceValidationError("Price is required for an offer");
  }
  if (!params.availability || !VALID_AVAILABILITY_STATUSES.includes(params.availability.status)) {
    throw new CommerceValidationError("Valid Availability is required for an offer");
  }

  const offerId = generateCanonicalOfferId(params.sourceId, params.listing.sourceListingId, params.seller.sellerId);

  return Object.freeze({
    canonicalOfferId: offerId,
    canonicalPartId: params.canonicalPartId.trim(),
    canonicalProductId: params.canonicalProductId?.trim(),
    sourceId: params.sourceId.trim(),
    seller: Object.freeze(params.seller),
    listing: Object.freeze(params.listing),
    price: Object.freeze(params.price),
    availability: Object.freeze(params.availability),
    shipping: params.shipping ? Object.freeze(params.shipping) : undefined,
    condition: params.condition || "UNKNOWN",
    warrantyMonths: params.warrantyMonths,
    returnPolicyDays: params.returnPolicyDays,
    productRating: params.productRating ? Object.freeze(params.productRating) : undefined,
    evidenceClaims: Object.freeze(params.evidenceClaims || []),
    retrievedAt: params.retrievedAt || new Date(),
  });
}
