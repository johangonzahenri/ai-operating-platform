import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  // Vehicle
  normalizeVehicleMake,
  normalizeVehicleModel,
  generateCanonicalVehicleId,
  createVehicleProfile,
  VehicleValidationError,
  // Part Number
  normalizePartNumber,
  arePartNumbersEquivalent,
  createPartNumber,
  PartNumberValidationError,
  // Part
  createPart,
  generateCanonicalPartId,
  PartValidationError,
  // Cross Reference
  createCrossReference,
  CrossReferenceValidationError,
  // Fitment
  createFitment,
  generateFitmentId,
  matchesFitmentRule,
  FitmentValidationError,
  // Commerce / Offer
  createPrice,
  createSeller,
  createOffer,
  generateCanonicalOfferId,
  CommerceValidationError,
  // Search Query
  createSparePartsSearchQuery,
  normalizeSearchInput,
  SearchQueryValidationError,
} from "../../src/domain/spareparts/index.js";

describe("Phase 143: Canonical Automotive Spare Parts Domain Model", () => {
  describe("Vehicle Domain & Normalization", () => {
    it("normalizes vehicle makes to canonical title-case and aliases", () => {
      assert.equal(normalizeVehicleMake("TOYOTA"), "Toyota");
      assert.equal(normalizeVehicleMake("toyota motor corp"), "Toyota");
      assert.equal(normalizeVehicleMake("CHEVY"), "Chevrolet");
      assert.equal(normalizeVehicleMake("MERCEDES-BENZ"), "Mercedes-Benz");
      assert.equal(normalizeVehicleMake("vw"), "Volkswagen");
    });

    it("normalizes vehicle models removing parenthetical and body-type noise", () => {
      assert.equal(normalizeVehicleModel("COROLLA SEDAN (E170)"), "Corolla");
      assert.equal(normalizeVehicleModel("rav4 suv"), "Rav4");
      assert.equal(normalizeVehicleModel("civic"), "Civic");
    });

    it("generates deterministic canonical vehicle IDs", () => {
      const id1 = generateCanonicalVehicleId("Toyota", "Corolla", 2018, "E170", "1.8", "CL");
      const id2 = generateCanonicalVehicleId("TOYOTA", "Corolla Sedan (E170)", 2018, "E170", "1.8", "CL");
      assert.equal(id1, "veh:toyota:corolla:2018:e170:1.8:cl");
      assert.equal(id1, id2);
    });

    it("creates a validated VehicleProfile and rejects invalid years or missing makes", () => {
      const profile = createVehicleProfile({
        make: "Toyota",
        model: "Corolla",
        year: 2018,
        engine: "1.8L",
        fuelType: "GASOLINE",
        market: "CL",
      });

      assert.equal(profile.canonicalVehicleId, "veh:toyota:corolla:2018:1.8l:cl");
      assert.equal(profile.normalizedMake, "Toyota");
      assert.equal(profile.identifiers[0].type, "CANONICAL");

      assert.throws(() => {
        createVehicleProfile({ make: "", model: "Corolla", year: 2018 });
      }, VehicleValidationError);

      assert.throws(() => {
        createVehicleProfile({ make: "Toyota", model: "Corolla", year: 1850 });
      }, VehicleValidationError);
    });
  });

  describe("Part Number Domain & Normalization", () => {
    it("normalizes part numbers stripping spaces, dashes, slashes and brand prefixes", () => {
      assert.equal(normalizePartNumber("04465-02220"), "0446502220");
      assert.equal(normalizePartNumber("04465 02220"), "0446502220");
      assert.equal(normalizePartNumber("04465/02220"), "0446502220");
      assert.equal(normalizePartNumber("BOSCH : 0 986 494 657"), "0986494657");
      assert.equal(normalizePartNumber("DENSO / 221-3135"), "2213135");
    });

    it("verifies equivalence of formatting variations of the same part number", () => {
      assert.ok(arePartNumbersEquivalent("04465-02220", "04465 02220"));
      assert.ok(arePartNumbersEquivalent("BOSCH:0986-494-657", "0986 494 657"));
      assert.ok(!arePartNumbersEquivalent("04465-02220", "04465-02230"));
    });

    it("creates a validated PartNumber value object and validates confidence range", () => {
      const pn = createPartNumber({
        rawValue: "04465-02220",
        type: "OEM",
        manufacturer: "Toyota Motor Corp",
        brand: "Toyota Genuine",
        confidence: 0.95,
        isPrimary: true,
      });

      assert.equal(pn.normalizedValue, "0446502220");
      assert.equal(pn.type, "OEM");
      assert.equal(pn.confidence, 0.95);

      assert.throws(() => {
        createPartNumber({ rawValue: "123", confidence: 1.5 });
      }, PartNumberValidationError);

      assert.throws(() => {
        createPartNumber({ rawValue: "   " });
      }, PartNumberValidationError);
    });
  });

  describe("Part Domain & Category Taxonomy", () => {
    it("creates a Part aggregate with distinct Brand and Manufacturer", () => {
      const oemPn = createPartNumber({ rawValue: "04465-02220", type: "OEM" });
      const altPn = createPartNumber({ rawValue: "BOSCH-0986494657", type: "MPN" });

      const part = createPart({
        name: "Front Brake Pads Set",
        description: "Ceramic front brake pad set for Toyota Corolla",
        category: "BRAKING",
        subcategory: "Brake Pads",
        brand: {
          brandId: "brand-bosch",
          name: "Bosch",
          tier: "PREMIUM_AFTERMARKET",
        },
        manufacturer: {
          manufacturerId: "mfg-robert-bosch",
          name: "Robert Bosch GmbH",
          country: "DE",
          isOemSupplier: true,
        },
        primaryPartNumber: oemPn,
        alternatePartNumbers: [altPn],
        condition: "NEW",
        position: "FRONT",
        dimensions: { lengthMm: 120, widthMm: 55, thicknessMm: 16 },
        weightKg: 1.25,
      });

      assert.equal(part.canonicalPartId, "part:bosch:0446502220");
      assert.equal(part.category, "BRAKING");
      assert.equal(part.brand.name, "Bosch");
      assert.equal(part.manufacturer?.name, "Robert Bosch GmbH");
      assert.equal(part.position, "FRONT");
      assert.equal(part.condition, "NEW");
    });

    it("rejects invalid categories or empty brand names", () => {
      const pn = createPartNumber({ rawValue: "12345" });
      assert.throws(() => {
        // @ts-expect-error test invalid category
        createPart({ name: "Part", category: "INVALID_CAT", brand: "Brembo", primaryPartNumber: pn });
      }, PartValidationError);

      assert.throws(() => {
        createPart({ name: "Part", category: "BRAKING", brand: "   ", primaryPartNumber: pn });
      }, PartValidationError);
    });
  });

  describe("Cross-Reference Domain", () => {
    it("establishes valid cross-references between OEM and Aftermarket parts", () => {
      const oemPn = createPartNumber({ rawValue: "04465-02220", type: "OEM" });
      const afterPn = createPartNumber({ rawValue: "0986494657", type: "MPN", brand: "Bosch" });

      const xref = createCrossReference({
        sourcePartNumber: oemPn,
        targetPartNumber: afterPn,
        relationType: "EQUIVALENT",
        direction: "BIDIRECTIONAL",
        confidence: 0.98,
        verifiedBy: "OEM_CATALOG",
        notes: "Direct OEM replacement pad",
      });

      assert.equal(xref.crossReferenceId, "xref:0446502220:0986494657");
      assert.equal(xref.relationType, "EQUIVALENT");
      assert.equal(xref.confidence, 0.98);
    });

    it("rejects cross-references with out-of-range confidence", () => {
      const pn1 = createPartNumber({ rawValue: "111" });
      const pn2 = createPartNumber({ rawValue: "222" });

      assert.throws(() => {
        createCrossReference({ sourcePartNumber: pn1, targetPartNumber: pn2, relationType: "EXACT", confidence: -0.1 });
      }, CrossReferenceValidationError);
    });
  });

  describe("Fitment Domain, Rules & Conflict Model", () => {
    it("evaluates fitment rules against vehicle specifications deterministically", () => {
      const rule = {
        ruleId: "rule-1",
        make: "Toyota",
        model: "Corolla",
        yearFrom: 2014,
        yearTo: 2019,
        generation: "E170",
        engines: ["1.8L", "2.0L"],
        driveTypes: ["FWD"],
      };

      assert.ok(matchesFitmentRule({ make: "Toyota", model: "Corolla", year: 2018, generation: "E170", engine: "1.8L", driveType: "FWD" }, rule));
      assert.ok(!matchesFitmentRule({ make: "Toyota", model: "Corolla", year: 2021, generation: "E210" }, rule)); // Out of year range
      assert.ok(!matchesFitmentRule({ make: "Honda", model: "Civic", year: 2018 }, rule)); // Make mismatch
    });

    it("creates a Fitment entity maintaining explicit separation between status and confidence", () => {
      const fitment = createFitment({
        canonicalPartId: "part:toyota:0446502220",
        canonicalVehicleId: "veh:toyota:corolla:2018:cl",
        status: "COMPATIBLE",
        confidence: 0.96, // High confidence fitment
        provenance: "OEM_CATALOG",
        sourceId: "oem-catalog-reference",
        rules: [
          {
            ruleId: "r1",
            make: "Toyota",
            model: "Corolla",
            yearFrom: 2014,
            yearTo: 2019,
          },
        ],
      });

      assert.equal(fitment.fitmentId, "fit:part:toyota:0446502220:veh:toyota:corolla:2018:cl");
      assert.equal(fitment.status, "COMPATIBLE");
      assert.equal(fitment.confidence, 0.96);
      assert.equal(fitment.provenance, "OEM_CATALOG");
    });

    it("supports CONFLICT status preserving conflicting evidence claims", () => {
      const fitment = createFitment({
        canonicalPartId: "part:bosch:0986494657",
        canonicalVehicleId: "veh:toyota:corolla:2020:cl",
        status: "CONFLICT",
        confidence: 0.50,
        provenance: "MARKETPLACE_CLAIM",
        evidenceClaims: [
          {
            claimId: "c1",
            source: "https://mercadolibre.cl/item1",
            sourceDomain: "mercadolibre.cl",
            timestamp: new Date(),
            statement: "Seller claims fits Corolla 2020",
            confidenceScore: 0.6,
            verifiedDeterministically: false,
          },
        ],
        conflictingEvidence: [
          {
            claimId: "c2",
            source: "https://rockauto.com/item1",
            sourceDomain: "rockauto.com",
            timestamp: new Date(),
            statement: "RockAuto catalog restricts to 2014-2019",
            confidenceScore: 0.95,
            verifiedDeterministically: true,
          },
        ],
      });

      assert.equal(fitment.status, "CONFLICT");
      assert.equal(fitment.conflictingEvidence?.length, 1);
    });
  });

  describe("Commerce Domain: Sellers, Prices, Availability & Offers", () => {
    it("creates a validated Price value object and rejects negative amounts", () => {
      const price = createPrice({
        amount: 38990,
        currency: "CLP",
        priceType: "SALE_PRICE",
        taxIncluded: true,
        shippingIncluded: false,
      });

      assert.equal(price.amount, 38990);
      assert.equal(price.currency, "CLP");
      assert.equal(price.priceType, "SALE_PRICE");
      assert.equal(price.taxIncluded, true);

      assert.throws(() => {
        createPrice({ amount: -500, currency: "CLP" });
      }, CommerceValidationError);

      assert.throws(() => {
        createPrice({ amount: 100, currency: "" });
      }, CommerceValidationError);
    });

    it("creates a Seller entity separating SellerReputation from ProductRating", () => {
      const seller = createSeller({
        sellerId: "seller-autoplanet-chile",
        name: "Autoplanet Chile",
        sourceId: "autoplanet-cl",
        location: "Santiago, Chile",
        country: "CL",
        verified: true,
        reputation: {
          rating: 4.7,
          maxRating: 5.0,
          reviewCount: 1420,
          positiveRatio: 0.97,
          verificationStatus: "VERIFIED",
          sourceId: "autoplanet-cl",
          retrievedAt: new Date(),
        },
      });

      assert.equal(seller.sellerId, "seller-autoplanet-chile");
      assert.equal(seller.reputation?.rating, 4.7);
      assert.equal(seller.verified, true);
    });

    it("creates an Offer aggregate linking Part, Seller, Listing, Price, and Availability", () => {
      const seller = createSeller({
        sellerId: "seller-repuestos-boston",
        name: "Repuestos Boston",
        sourceId: "repuestos-boston-cl",
      });

      const price = createPrice({
        amount: 42500,
        currency: "CLP",
        taxIncluded: true,
      });

      const offer = createOffer({
        canonicalPartId: "part:toyota:0446502220",
        sourceId: "repuestos-boston-cl",
        seller,
        listing: {
          sourceListingId: "art-104928",
          sourceId: "repuestos-boston-cl",
          rawTitle: "Pastillas de Freno Delanteras Corolla 2014-2019",
          sourceUrl: "https://repuestosboston.cl/p/104928",
          retrievedAt: new Date(),
        },
        price,
        availability: {
          status: "IN_STOCK",
          quantity: 8,
          leadTimeDays: 1,
          checkedAt: new Date(),
        },
        shipping: {
          cost: 3990,
          currency: "CLP",
          destinationCountry: "CL",
          estimatedDeliveryDays: 2,
          isFreeShipping: false,
        },
        condition: "NEW",
        warrantyMonths: 6,
      });

      assert.equal(offer.canonicalOfferId, generateCanonicalOfferId("repuestos-boston-cl", "art-104928", seller.sellerId));
      assert.equal(offer.availability.status, "IN_STOCK");
      assert.equal(offer.price.amount, 42500);
      assert.equal(offer.shipping?.cost, 3990);
    });
  });

  describe("Search Query Domain & Contracts", () => {
    it("normalizes and structures natural language automotive queries into clean terms", () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno delanteras para Toyota Corolla 2018",
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          year: 2018,
        },
        partNumber: "04465-02220",
        category: "BRAKING",
        region: "CL",
      });

      assert.ok(query.queryId.startsWith("query-"));
      assert.equal(query.normalizedInput.normalizedMake, "Toyota");
      assert.equal(query.normalizedInput.normalizedModel, "Corolla");
      assert.equal(query.normalizedInput.normalizedPartNumber, "0446502220");
      assert.equal(query.category, "BRAKING");
      assert.equal(query.criteria.rankingHints?.prioritizeStock, true);
    });

    it("rejects search queries with empty raw query strings", () => {
      assert.throws(() => {
        createSparePartsSearchQuery({ rawQuery: "   " });
      }, SearchQueryValidationError);
    });
  });
});
