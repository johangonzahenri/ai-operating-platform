/**
 * tests/unit/normalization-deduplication-crossref.test.ts
 * Unit tests for Phase 145: Normalization, Deduplication and Cross-Reference Engine.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  PartNormalizationService,
  DuplicateDetectionService,
  CrossReferenceService,
  PartClusteringEngine,
} from "../../src/application/spareparts/index.js";
import {
  createPartNumber,
  normalizePartNumber,
} from "../../src/domain/spareparts/part-number.js";
import {
  createCrossReference,
} from "../../src/domain/spareparts/cross-reference.js";
import {
  createOffer,
  createSeller,
  createPrice,
  generateCanonicalOfferId,
} from "../../src/domain/spareparts/product-offer.js";
import { generateCanonicalPartId } from "../../src/domain/spareparts/part.js";
import { StructuredClaimEvidence } from "../../src/domain/agent/agent-taxonomy.js";

describe("Phase 145: Normalization, Deduplication and Cross-Reference Engine", () => {
  let normalizer: PartNormalizationService;
  let detector: DuplicateDetectionService;
  let crossRefService: CrossReferenceService;
  let clusteringEngine: PartClusteringEngine;

  const mockEvidence = (claim: string): StructuredClaimEvidence => ({
    claimId: `claim-${Math.random().toString(36).slice(2, 7)}`,
    claimType: "CROSS_REFERENCE_EQUIVALENCE",
    subject: "AutomotivePart",
    predicate: "isEquivalentTo",
    object: claim,
    confidence: 0.95,
    sourceId: "autodoc_cl",
    retrievedAt: new Date("2026-09-24T12:00:00Z"),
  });

  beforeEach(() => {
    normalizer = new PartNormalizationService();
    detector = new DuplicateDetectionService();
    crossRefService = new CrossReferenceService();
    clusteringEngine = new PartClusteringEngine(normalizer, detector, crossRefService);
  });

  it("Test 1: Exact Duplicate Detection (Identical normalized part numbers and brands)", () => {
    const pn1 = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });
    const pn2 = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });

    assert.equal(pn1.normalizedValue, "0446502220");
    assert.equal(pn2.normalizedValue, "0446502220");

    const seller = createSeller({
      sellerId: "seller-1",
      name: "Repuestos Express",
      sourceId: "autoplanet_cl",
    });

    const price = createPrice({ amount: 24990, currency: "CLP" });

    const offerA = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn1),
      sourceId: "autoplanet_cl",
      seller,
      listing: {
        sourceListingId: "LIST-100",
        sourceId: "autoplanet_cl",
        rawTitle: "Pastillas de freno Toyota Corolla 04465-02220",
        sourceUrl: "https://autoplanet.cl/p/100",
        retrievedAt: new Date(),
      },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const offerB = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn2),
      sourceId: "mercadolibre_cl",
      seller: createSeller({ sellerId: "seller-2", name: "Toyota Store", sourceId: "mercadolibre_cl" }),
      listing: {
        sourceListingId: "MLC-200",
        sourceId: "mercadolibre_cl",
        rawTitle: "Pastillas Freno Original Toyota 04465-02220",
        sourceUrl: "https://articulo.mercadolibre.cl/MLC-200",
        retrievedAt: new Date(),
      },
      price,
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const match = detector.classifyPair(offerA, offerB);
    assert.equal(match.classification, "EXACT_DUPLICATE");
    assert.ok(match.confidence >= 0.95);
  });

  it("Test 2: Same OEM with formatting variations (e.g. 90915-YZZD1 vs 90915YZZD1 vs 90915 YZZD1)", () => {
    const norm1 = normalizer.normalizePartNumber("90915-YZZD1");
    const norm2 = normalizer.normalizePartNumber("90915YZZD1");
    const norm3 = normalizer.normalizePartNumber(" 90915 YZZD1 ");

    assert.equal(norm1.normalizedValue, "90915YZZD1");
    assert.equal(norm2.normalizedValue, "90915YZZD1");
    assert.equal(norm3.normalizedValue, "90915YZZD1");

    // Preserves original raw value
    assert.equal(norm1.rawValue, "90915-YZZD1");
    assert.equal(norm3.rawValue, " 90915 YZZD1 ");
  });

  it("Test 3: Probable Match (Unconfirmed or weaker relation type)", () => {
    const pnOEM = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });
    const pnAftermarket = normalizer.normalizePartNumber("P83082", { brand: "Brembo" });

    const xref = createCrossReference({
      sourcePartNumber: pnOEM,
      targetPartNumber: pnAftermarket,
      relationType: "POTENTIAL_MATCH",
      confidence: 0.65,
      notes: "Unverified community cross-reference",
    });

    const offerA = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pnOEM),
      sourceId: "source-a",
      seller: createSeller({ sellerId: "s1", name: "S1", sourceId: "source-a" }),
      listing: { sourceListingId: "L1", sourceId: "source-a", rawTitle: "Toyota Brake Pads", sourceUrl: "http://a.com/1", retrievedAt: new Date() },
      price: createPrice({ amount: 30000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const offerB = createOffer({
      canonicalPartId: generateCanonicalPartId("Brembo", pnAftermarket),
      sourceId: "source-b",
      seller: createSeller({ sellerId: "s2", name: "S2", sourceId: "source-b" }),
      listing: { sourceListingId: "L2", sourceId: "source-b", rawTitle: "Brembo P83082", sourceUrl: "http://b.com/2", retrievedAt: new Date() },
      price: createPrice({ amount: 28000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const match = detector.classifyPair(offerA, offerB, {
      knownCrossReferences: [xref],
    });

    assert.equal(match.classification, "PROBABLE_MATCH");
    assert.equal(match.confidence, 0.65);
  });

  it("Test 4: Distinct Parts (Different verified part numbers and brands)", () => {
    const pn1 = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });
    const pn2 = normalizer.normalizePartNumber("04465-33450", { brand: "Toyota" });

    const offerA = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn1),
      sourceId: "src-1",
      seller: createSeller({ sellerId: "s1", name: "S1", sourceId: "src-1" }),
      listing: { sourceListingId: "L1", sourceId: "src-1", rawTitle: "Pad A", sourceUrl: "http://a.com/1", retrievedAt: new Date() },
      price: createPrice({ amount: 20000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const offerB = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn2),
      sourceId: "src-2",
      seller: createSeller({ sellerId: "s2", name: "S2", sourceId: "src-2" }),
      listing: { sourceListingId: "L2", sourceId: "src-2", rawTitle: "Pad B", sourceUrl: "http://b.com/2", retrievedAt: new Date() },
      price: createPrice({ amount: 22000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const match = detector.classifyPair(offerA, offerB);
    assert.equal(match.classification, "DISTINCT");
    assert.ok(match.confidence >= 0.95);
  });

  it("Test 5: OEM <-> Aftermarket Cross-Reference Equivalence Resolution", () => {
    const pnOEM = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota", type: "OEM" });
    const pnBrembo = normalizer.normalizePartNumber("P83082", { brand: "Brembo", type: "MPN" });
    const pnBosch = normalizer.normalizePartNumber("0986494657", { brand: "Bosch", type: "MPN" });

    crossRefService.register({
      sourcePartNumber: pnOEM,
      targetPartNumber: pnBrembo,
      relationType: "EQUIVALENT",
      confidence: 0.98,
      verifiedBy: "OEM_CATALOG",
    });

    crossRefService.register({
      sourcePartNumber: pnOEM,
      targetPartNumber: pnBosch,
      relationType: "EQUIVALENT",
      confidence: 0.95,
      verifiedBy: "TECDOC",
    });

    // Query cross references for Toyota OEM
    const directXrefs = crossRefService.getCrossReferencesForPart(pnOEM);
    assert.equal(directXrefs.length, 2);

    // Connected components resolution: OEM -> Brembo & Bosch
    const allEquivalents = crossRefService.resolveEquivalentPartNumbers(pnOEM);
    assert.equal(allEquivalents.length, 2);
    const norms = allEquivalents.map(p => p.normalizedValue);
    assert.ok(norms.includes("P83082"));
    assert.ok(norms.includes("0986494657"));
  });

  it("Test 6: Conflict Representation (Conflicting cross-reference claims or differing manufacturers)", () => {
    // Identical string from two completely different manufacturers without cross-reference
    const offerBosch = createOffer({
      canonicalPartId: "part:bosch:12345",
      sourceId: "autoplanet_cl",
      seller: createSeller({ sellerId: "s1", name: "S1", sourceId: "autoplanet_cl" }),
      listing: { sourceListingId: "B1", sourceId: "autoplanet_cl", rawTitle: "Bosch Sensor 12345", sourceUrl: "http://b.com/1", retrievedAt: new Date() },
      price: createPrice({ amount: 15000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const offerDenso = createOffer({
      canonicalPartId: "part:denso:12345",
      sourceId: "mercadolibre_cl",
      seller: createSeller({ sellerId: "s2", name: "S2", sourceId: "mercadolibre_cl" }),
      listing: { sourceListingId: "D1", sourceId: "mercadolibre_cl", rawTitle: "Denso Plug 12345", sourceUrl: "http://d.com/1", retrievedAt: new Date() },
      price: createPrice({ amount: 12000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const match = detector.classifyPair(offerBosch, offerDenso);
    assert.equal(match.classification, "DISTINCT");
    assert.ok(match.reason.includes("conflicting/different manufacturers"));
  });

  it("Test 7: Lossless Evidence Preservation", () => {
    const pn = normalizer.normalizePartNumber("90915-YZZD1", { brand: "Toyota" });
    const ev1 = mockEvidence("Proof from Autoplanet");
    const ev2 = mockEvidence("Proof from MercadoLibre");

    const offerA = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn),
      sourceId: "autoplanet_cl",
      seller: createSeller({ sellerId: "s1", name: "S1", sourceId: "autoplanet_cl" }),
      listing: { sourceListingId: "L1", sourceId: "autoplanet_cl", rawTitle: "Filtro 1", sourceUrl: "http://a.com/1", retrievedAt: new Date() },
      price: createPrice({ amount: 8990, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
      evidenceClaims: [ev1],
    });

    const offerB = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn),
      sourceId: "mercadolibre_cl",
      seller: createSeller({ sellerId: "s2", name: "S2", sourceId: "mercadolibre_cl" }),
      listing: { sourceListingId: "L2", sourceId: "mercadolibre_cl", rawTitle: "Filtro 2", sourceUrl: "http://m.com/2", retrievedAt: new Date() },
      price: createPrice({ amount: 9500, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
      evidenceClaims: [ev2],
    });

    const clusters = clusteringEngine.clusterOffers([offerA, offerB]);
    assert.equal(clusters.length, 1);
    const cluster = clusters[0];

    assert.equal(cluster.members.length, 2);
    // Evidence claims must include both ev1 and ev2
    const collectedEvIds = cluster.evidence.map(e => e.claimId);
    assert.ok(collectedEvIds.includes(ev1.claimId));
    assert.ok(collectedEvIds.includes(ev2.claimId));
  });

  it("Test 8: Order Independence (Array permutation produces identical cluster graph)", () => {
    const pn1 = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });
    const pn2 = normalizer.normalizePartNumber("90915-YZZD1", { brand: "Toyota" });

    const off1 = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn1),
      sourceId: "s1",
      seller: createSeller({ sellerId: "sel1", name: "Sel1", sourceId: "s1" }),
      listing: { sourceListingId: "A1", sourceId: "s1", rawTitle: "T1", sourceUrl: "http://1", retrievedAt: new Date() },
      price: createPrice({ amount: 10000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const off2 = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn1),
      sourceId: "s2",
      seller: createSeller({ sellerId: "sel2", name: "Sel2", sourceId: "s2" }),
      listing: { sourceListingId: "A2", sourceId: "s2", rawTitle: "T2", sourceUrl: "http://2", retrievedAt: new Date() },
      price: createPrice({ amount: 11000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const off3 = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn2),
      sourceId: "s1",
      seller: createSeller({ sellerId: "sel1", name: "Sel1", sourceId: "s1" }),
      listing: { sourceListingId: "B1", sourceId: "s1", rawTitle: "T3", sourceUrl: "http://3", retrievedAt: new Date() },
      price: createPrice({ amount: 5000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const clustersOrder1 = clusteringEngine.clusterOffers([off1, off2, off3]);
    const clustersOrder2 = clusteringEngine.clusterOffers([off3, off1, off2]);
    const clustersOrder3 = clusteringEngine.clusterOffers([off2, off3, off1]);

    assert.equal(clustersOrder1.length, 2);
    assert.equal(clustersOrder2.length, 2);
    assert.equal(clustersOrder3.length, 2);

    // Deep equality of cluster IDs and member IDs
    assert.deepEqual(
      clustersOrder1.map(c => ({ id: c.clusterId, members: c.members.map(m => m.canonicalOfferId) })),
      clustersOrder2.map(c => ({ id: c.clusterId, members: c.members.map(m => m.canonicalOfferId) }))
    );
    assert.deepEqual(
      clustersOrder2.map(c => ({ id: c.clusterId, members: c.members.map(m => m.canonicalOfferId) })),
      clustersOrder3.map(c => ({ id: c.clusterId, members: c.members.map(m => m.canonicalOfferId) }))
    );
  });

  it("Test 9: Idempotency (Re-clustering clusters/members produces identical result)", () => {
    const pn = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });

    const off1 = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn),
      sourceId: "s1",
      seller: createSeller({ sellerId: "sel1", name: "Sel1", sourceId: "s1" }),
      listing: { sourceListingId: "X1", sourceId: "s1", rawTitle: "T1", sourceUrl: "http://1", retrievedAt: new Date() },
      price: createPrice({ amount: 10000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const off2 = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pn),
      sourceId: "s2",
      seller: createSeller({ sellerId: "sel2", name: "Sel2", sourceId: "s2" }),
      listing: { sourceListingId: "X2", sourceId: "s2", rawTitle: "T2", sourceUrl: "http://2", retrievedAt: new Date() },
      price: createPrice({ amount: 10500, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const firstRun = clusteringEngine.clusterOffers([off1, off2]);
    const membersFromFirstRun = firstRun.flatMap(c => c.members);
    const secondRun = clusteringEngine.clusterOffers(membersFromFirstRun);

    assert.equal(firstRun.length, secondRun.length);
    assert.equal(firstRun[0].clusterId, secondRun[0].clusterId);
    assert.equal(firstRun[0].members.length, secondRun[0].members.length);
  });

  it("Test 10: False-Positive Protection (Similar titles or same price must NOT merge without part identity)", () => {
    // Two brake pads for Toyota Corolla with identical price and title phrasing, but different part numbers
    const pnA = normalizer.normalizePartNumber("04465-02220", { brand: "Toyota" });
    const pnB = normalizer.normalizePartNumber("04465-12580", { brand: "Toyota" });

    const offerA = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pnA),
      sourceId: "store_a",
      seller: createSeller({ sellerId: "s1", name: "Corolla Parts", sourceId: "store_a" }),
      listing: {
        sourceListingId: "A1",
        sourceId: "store_a",
        rawTitle: "Pastillas de Freno Delanteras Toyota Corolla 1.8 2015-2018",
        sourceUrl: "http://storea.com/pads",
        retrievedAt: new Date(),
      },
      price: createPrice({ amount: 25000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const offerB = createOffer({
      canonicalPartId: generateCanonicalPartId("Toyota", pnB),
      sourceId: "store_b",
      seller: createSeller({ sellerId: "s2", name: "Corolla Parts", sourceId: "store_b" }),
      listing: {
        sourceListingId: "B1",
        sourceId: "store_b",
        rawTitle: "Pastillas de Freno Delanteras Toyota Corolla 1.8 2015-2018",
        sourceUrl: "http://storeb.com/pads",
        retrievedAt: new Date(),
      },
      price: createPrice({ amount: 25000, currency: "CLP" }),
      availability: { status: "IN_STOCK", checkedAt: new Date() },
    });

    const match = detector.classifyPair(offerA, offerB);
    assert.equal(match.classification, "DISTINCT");

    const clusters = clusteringEngine.clusterOffers([offerA, offerB]);
    assert.equal(clusters.length, 2, "Must remain separate clusters due to differing verified part numbers");
  });

  it("Test 11: Normalization Service Edge Cases (Brand mapping, URL tracking, seller trimming)", () => {
    // Brand normalization
    const b1 = normalizer.normalizeBrand("bosch");
    assert.equal(b1.name, "Bosch");
    assert.equal(b1.tier, "PREMIUM_AFTERMARKET");

    const b2 = normalizer.normalizeBrand("vw");
    assert.equal(b2.name, "Volkswagen");
    assert.equal(b2.tier, "OEM_GENUINE");

    // URL normalization
    const cleanUrl = normalizer.normalizeListingUrl("https://www.autoplanet.cl/producto/123/?utm_source=google&gclid=xyz&ref=123");
    assert.equal(cleanUrl, "https://www.autoplanet.cl/producto/123");

    // Seller normalization
    const cleanSeller = normalizer.normalizeSellerName("Repuestos Castillo SpA");
    assert.equal(cleanSeller, "Repuestos Castillo");
  });
});
