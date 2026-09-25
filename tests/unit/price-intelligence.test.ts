/**
 * tests/unit/price-intelligence.test.ts
 * Unit tests for Phase 147: Price Intelligence, Reputation & Total Cost Engine.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  PriceIntelligenceEngine,
  SellerReputationService,
  StaticExchangeRateProvider,
} from "../../src/application/spareparts/index.js";
import {
  createOffer,
  createSeller,
  createPrice,
} from "../../src/domain/spareparts/product-offer.js";
import { createPartCluster } from "../../src/domain/spareparts/part-cluster.js";
import { createPartNumber } from "../../src/domain/spareparts/part-number.js";
import { StructuredClaimEvidence } from "../../src/domain/agent/agent-taxonomy.js";

describe("Phase 147: Price Intelligence, Reputation & Total Cost Engine", () => {
  let engine: PriceIntelligenceEngine;
  let reputationService: SellerReputationService;

  const mockEvidence = (claim: string): StructuredClaimEvidence => ({
    claimId: `claim-${Math.random().toString(36).slice(2, 7)}`,
    claimType: "PRICE_CLAIM",
    subject: "AutomotivePart",
    predicate: "hasListedPrice",
    object: claim,
    confidence: 0.95,
    sourceId: "autoplanet_cl",
    retrievedAt: new Date("2026-09-24T12:00:00Z"),
  });

  beforeEach(() => {
    reputationService = new SellerReputationService();
    engine = new PriceIntelligenceEngine(reputationService, new StaticExchangeRateProvider());
  });

  it("Test 1 (Domestic CLP Known Cost): Complete known landed cost in domestic currency", () => {
    const seller = createSeller({ sellerId: "s1", name: "Repuestos Castillo", sourceId: "autoplanet_cl", country: "CL", verified: true });
    const price = createPrice({ amount: 45000, currency: "CLP", taxIncluded: true, shippingIncluded: false });

    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "autoplanet_cl",
      seller,
      listing: { sourceListingId: "A1", sourceId: "autoplanet_cl", rawTitle: "Pastillas", sourceUrl: "http://1", retrievedAt: new Date() },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
      shipping: { cost: 4000, currency: "CLP", destinationCountry: "CL", isFreeShipping: false },
    });

    const cost = engine.calculateTotalCost(offer, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });

    assert.equal(cost.completeness, "TOTAL_KNOWN");
    assert.equal(cost.totalAmount, 49000); // 45000 + 4000
    assert.equal(cost.currency, "CLP");
    assert.equal(cost.taxes.status, "INCLUDED");
    assert.equal(cost.importCosts.status, "NOT_APPLICABLE");
    assert.ok(cost.calculationBreakdown.includes("Base: 45000 CLP"));
  });

  it("Test 2 (Shipping Included / Free): Explicit free shipping computes total without extra fees", () => {
    const seller = createSeller({ sellerId: "s2", name: "MercadoRepuestos", sourceId: "mercadolibre_cl", country: "CL", verified: true });
    const price = createPrice({ amount: 50000, currency: "CLP", taxIncluded: true, shippingIncluded: true });

    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "mercadolibre_cl",
      seller,
      listing: { sourceListingId: "M1", sourceId: "mercadolibre_cl", rawTitle: "Pastillas", sourceUrl: "http://2", retrievedAt: new Date() },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const cost = engine.calculateTotalCost(offer, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });

    assert.equal(cost.completeness, "TOTAL_KNOWN");
    assert.equal(cost.totalAmount, 50000);
    assert.equal(cost.shipping.status, "INCLUDED");
    assert.equal(cost.shipping.isFree, true);
  });

  it("Test 3 (Shipping Unknown != 0): Missing shipping cost preserves UNKNOWN and does not sum 0", () => {
    const seller = createSeller({ sellerId: "s3", name: "Desarmaduría San Bernardo", sourceId: "desarmaduria_cl", country: "CL" });
    const price = createPrice({ amount: 30000, currency: "CLP", taxIncluded: true, shippingIncluded: false });

    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "desarmaduria_cl",
      seller,
      listing: { sourceListingId: "D1", sourceId: "desarmaduria_cl", rawTitle: "Pastillas", sourceUrl: "http://3", retrievedAt: new Date() },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
      // No shipping info provided!
    });

    const cost = engine.calculateTotalCost(offer, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });

    assert.equal(cost.shipping.status, "UNKNOWN");
    assert.equal(cost.shipping.amount, undefined);
    assert.equal(cost.completeness, "TOTAL_UNKNOWN");
    assert.equal(cost.totalAmount, undefined); // Invariant: UNKNOWN != 0!
    assert.ok(cost.calculationBreakdown.includes("Shipping: UNKNOWN"));
  });

  it("Test 4 (Taxes Unknown): Unstated tax status fails-closed without assuming 0", () => {
    const seller = createSeller({ sellerId: "s4", name: "Global Vendor", sourceId: "rockauto", country: "US" });
    const price = createPrice({ amount: 40, currency: "USD", taxIncluded: false, shippingIncluded: false });

    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "rockauto",
      seller,
      listing: { sourceListingId: "R1", sourceId: "rockauto", rawTitle: "Pads", sourceUrl: "http://4", retrievedAt: new Date() },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const cost = engine.calculateTotalCost(offer, { comparisonCurrency: "USD" });

    assert.equal(cost.taxes.status, "UNKNOWN");
    assert.equal(cost.completeness, "TOTAL_UNKNOWN");
    assert.equal(cost.totalAmount, undefined);
  });

  it("Test 5 (International Cross-border Import Cost Unknown): Flags pending import fees", () => {
    const seller = createSeller({ sellerId: "s5", name: "AutoDoc Germany", sourceId: "autodoc", country: "DE" });
    const price = createPrice({ amount: 50, currency: "EUR", taxIncluded: true, shippingIncluded: false });

    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "autodoc",
      seller,
      listing: { sourceListingId: "AD1", sourceId: "autodoc", rawTitle: "Brake Pads", sourceUrl: "http://5", retrievedAt: new Date() },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
      shipping: { cost: 15, currency: "EUR", destinationCountry: "CL", isFreeShipping: false },
    });

    const cost = engine.calculateTotalCost(offer, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });

    assert.equal(cost.importCosts.status, "UNKNOWN");
    assert.equal(cost.completeness, "TOTAL_UNKNOWN");
    assert.equal(cost.totalAmount, undefined);
    assert.ok(cost.calculationBreakdown.includes("Cross-border fees pending"));
  });

  it("Test 6 (FX Currency Normalization): Deterministically converts USD to CLP with rate audit", () => {
    const priceUSD = createPrice({ amount: 100, currency: "USD" });
    const norm = engine.normalizePrice(priceUSD, { targetCurrency: "CLP" });

    assert.equal(norm.rawAmount, 100);
    assert.equal(norm.rawCurrency, "USD");
    assert.equal(norm.normalizedCurrency, "CLP");
    assert.equal(norm.exchangeRate, 950);
    assert.equal(norm.normalizedAmount, 95000); // 100 * 950
    assert.equal(norm.exchangeRateSource, "STATIC_REFERENCE_FX");
  });

  it("Test 7 (Missing FX Rate Protection): Throws explicit validation error rather than assuming rate 1", () => {
    const priceJPY = createPrice({ amount: 10000, currency: "JPY" });

    assert.throws(() => {
      engine.normalizePrice(priceJPY, { targetCurrency: "CLP" });
    }, /Missing FX exchange rate from JPY to CLP/);
  });

  it("Test 8 (Quantity and Pack Size Normalization): Correctly normalizes price per unit", () => {
    // Pack of 4 spark plugs for 40,000 CLP -> 10,000 CLP per unit
    const packPrice = createPrice({ amount: 40000, currency: "CLP" });
    const norm = engine.normalizePrice(packPrice, {
      targetCurrency: "CLP",
      requestedQuantity: 2, // User needs 2 plugs
      packSize: 4,
    });

    assert.equal(norm.unitPrice, 10000);
    assert.equal(norm.requestedQuantity, 2);
    assert.equal(norm.packSize, 4);
    assert.equal(norm.normalizedAmount, 20000); // 2 * 10,000
  });

  it("Test 9 (Discounts Normalization): Deducts explicit discount and records percentage", () => {
    const price = createPrice({ amount: 50000, currency: "CLP" });
    const norm = engine.normalizePrice(price, {
      targetCurrency: "CLP",
      requestedQuantity: 1,
      discountAmount: 5000,
    });

    assert.equal(norm.normalizedAmount, 45000);
    assert.equal(norm.discountAmount, 5000);
    assert.equal(norm.discountPercent, 10); // 10%
  });

  it("Test 10 (Seller Trust Score Evaluation & Explainability): Factors are auditable and weighted", () => {
    const seller = createSeller({
      sellerId: "seller-123",
      name: "Repuestos Central",
      sourceId: "autoplanet_cl",
      verified: true,
      reputation: {
        rating: 4.8,
        maxRating: 5.0,
        reviewCount: 150,
        verificationStatus: "VERIFIED",
        sourceId: "autoplanet_cl",
        retrievedAt: new Date(),
      },
    });

    const trust = reputationService.evaluateSellerTrust({
      seller,
      sourceReliability: 0.90,
      warrantyMonths: 6,
      returnPolicyDays: 30,
    });

    assert.ok(trust.score >= 0.85);
    assert.equal(trust.isVerified, true);
    assert.equal(trust.components.length, 5);

    const verifComp = trust.components.find(c => c.factor === "SELLER_VERIFICATION");
    assert.equal(verifComp?.value, 1.0);
    assert.equal(verifComp?.weight, 0.25);

    assert.ok(trust.reasons.some(r => r.includes("Verified seller credentials")));
  });

  it("Test 11 (Source Trust vs Seller Trust Separation): Unverified seller on reliable source", () => {
    const unverifiedSeller = createSeller({
      sellerId: "unverified-vendor",
      name: "New Vendor",
      sourceId: "mercadolibre_cl",
      verified: false,
    });

    const trust = reputationService.evaluateSellerTrust({
      seller: unverifiedSeller,
      sourceReliability: 0.95, // High platform trust
    });

    assert.equal(trust.sourceReliability, 0.95);
    assert.equal(trust.isVerified, false);
    assert.ok(trust.score < 0.80, "Unverified seller must have penalized score despite source reliability");
  });

  it("Test 12 (Multi-Source Comparison & Incomparability Handling): Cluster comparison with out of stock items", () => {
    const primaryPn = createPartNumber({ rawValue: "04465-02220", brand: "Toyota" });

    const sellerA = createSeller({ sellerId: "sa", name: "Store A", sourceId: "autoplanet_cl", country: "CL", verified: true });
    const offerA = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "autoplanet_cl",
      seller: sellerA,
      listing: { sourceListingId: "A1", sourceId: "autoplanet_cl", rawTitle: "Pastillas", sourceUrl: "http://a", retrievedAt: new Date() },
      price: createPrice({ amount: 40000, currency: "CLP", taxIncluded: true, shippingIncluded: false }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
      shipping: { cost: 3000, currency: "CLP", destinationCountry: "CL", isFreeShipping: false },
    });

    const sellerB = createSeller({ sellerId: "sb", name: "Store B", sourceId: "mercadolibre_cl", country: "CL", verified: true });
    const offerB = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "mercadolibre_cl",
      seller: sellerB,
      listing: { sourceListingId: "B1", sourceId: "mercadolibre_cl", rawTitle: "Pastillas", sourceUrl: "http://b", retrievedAt: new Date() },
      price: createPrice({ amount: 35000, currency: "CLP", taxIncluded: true, shippingIncluded: true }),
      availability: { status: "OUT_OF_STOCK", checkedAt: new Date() }, // Out of stock!
    });

    const cluster = createPartCluster({
      canonicalPartId: "part:toyota:0446502220",
      primaryPartNumber: primaryPn,
      brand: { brandId: "b-toyota", name: "Toyota" },
      members: [offerA, offerB],
    });

    const comparison = engine.compareOffers(cluster, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });

    assert.equal(comparison.items.length, 2);

    const itemA = comparison.items.find(i => i.offerId === offerA.canonicalOfferId);
    const itemB = comparison.items.find(i => i.offerId === offerB.canonicalOfferId);

    assert.equal(itemA?.isComparable, true);
    assert.equal(itemB?.isComparable, false);
    assert.ok(itemB?.incomparabilityReasons?.some(r => r.includes("out of stock")));
    assert.equal(comparison.bestPriceOfferId, offerA.canonicalOfferId);
  });

  it("Test 13 (Determinism & Idempotency): Re-running comparison produces identical output", () => {
    const primaryPn = createPartNumber({ rawValue: "04465-02220", brand: "Toyota" });
    const seller = createSeller({ sellerId: "s", name: "Store", sourceId: "src", country: "CL", verified: true });
    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "src",
      seller,
      listing: { sourceListingId: "1", sourceId: "src", rawTitle: "P", sourceUrl: "http://1", retrievedAt: new Date() },
      price: createPrice({ amount: 20000, currency: "CLP", taxIncluded: true, shippingIncluded: true }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const cluster = createPartCluster({
      canonicalPartId: "part:toyota:0446502220",
      primaryPartNumber: primaryPn,
      brand: { brandId: "b-toyota", name: "Toyota" },
      members: [offer],
    });

    const comp1 = engine.compareOffers(cluster, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });
    const comp2 = engine.compareOffers(cluster, { comparisonCurrency: "CLP", targetDestinationCountry: "CL" });

    assert.equal(comp1.bestPriceOfferId, comp2.bestPriceOfferId);
    assert.equal(comp1.items[0].totalCost.totalAmount, comp2.items[0].totalCost.totalAmount);
    assert.equal(comp1.items[0].sellerTrust.score, comp2.items[0].sellerTrust.score);
  });

  it("Test 14 (Integration with Fitment Result): Incompatible vehicle flags offer as incomparable", () => {
    const primaryPn = createPartNumber({ rawValue: "04465-02220", brand: "Toyota" });
    const seller = createSeller({ sellerId: "s", name: "Store", sourceId: "src", country: "CL", verified: true });
    const offer = createOffer({
      canonicalPartId: "part:toyota:0446502220",
      sourceId: "src",
      seller,
      listing: { sourceListingId: "1", sourceId: "src", rawTitle: "P", sourceUrl: "http://1", retrievedAt: new Date() },
      price: createPrice({ amount: 20000, currency: "CLP", taxIncluded: true, shippingIncluded: true }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const cluster = createPartCluster({
      canonicalPartId: "part:toyota:0446502220",
      primaryPartNumber: primaryPn,
      brand: { brandId: "b-toyota", name: "Toyota" },
      members: [offer],
    });

    const mockFitmentResult = {
      verificationId: "v1",
      canonicalPartId: "part:toyota:0446502220",
      canonicalVehicleId: "veh:toyota:corolla:2025",
      vehicleFitmentKey: "vfk:toyota:corolla:2025",
      verdict: "NOT_FIT" as const,
      confidence: 0.99,
      parameterResults: [],
      evidence: [],
      conflicts: [],
      sourceReports: [],
      explanation: "Vehicle year outside allowable range [2014-2019]",
      verifiedAt: new Date(),
    };

    const comparison = engine.compareOffers(cluster, {
      comparisonCurrency: "CLP",
      targetDestinationCountry: "CL",
      fitmentResults: [mockFitmentResult],
    });

    const item = comparison.items[0];
    assert.equal(item.isComparable, false);
    assert.equal(item.fitmentVerdict, "NOT_FIT");
    assert.ok(item.incomparabilityReasons?.some(r => r.includes("Incompatible with target vehicle")));
  });
});
