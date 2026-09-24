import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VALID_AUTOMOTIVE_SOURCE_TYPES,
  VALID_AUTOMOTIVE_ACCESS_METHODS,
  VALID_AUTOMOTIVE_SOURCE_STATUSES,
  AutomotiveSourceRestrictedError,
} from "../../src/domain/spareparts/automotive-source.js";
import { InMemoryAutomotiveSourceRegistry } from "../../src/application/spareparts/automotive-source-registry.js";
import { CANONICAL_AUTOMOTIVE_SOURCES } from "../../src/infrastructure/spareparts/canonical-sources.js";
import { BaseAutomotiveSourceConnector } from "../../src/application/spareparts/automotive-source-connector.js";

describe("Phase 142: Automotive Source Discovery & Source Intelligence Layer", () => {
  describe("Automotive Source Taxonomy & Contracts", () => {
    it("defines valid source types, access methods and lifecycle statuses", () => {
      assert.ok(VALID_AUTOMOTIVE_SOURCE_TYPES.includes("OFFICIAL_OEM"));
      assert.ok(VALID_AUTOMOTIVE_SOURCE_TYPES.includes("MARKETPLACE"));
      assert.ok(VALID_AUTOMOTIVE_SOURCE_TYPES.includes("SPECIALIZED_RETAILER"));
      assert.ok(VALID_AUTOMOTIVE_ACCESS_METHODS.includes("OFFICIAL_API"));
      assert.ok(VALID_AUTOMOTIVE_ACCESS_METHODS.includes("STRUCTURED_DATA"));
      assert.ok(VALID_AUTOMOTIVE_SOURCE_STATUSES.includes("AVAILABLE"));
      assert.ok(VALID_AUTOMOTIVE_SOURCE_STATUSES.includes("RESTRICTED"));
    });
  });

  describe("Automotive Source Registry & Discovery", () => {
    it("loads canonical sources and filters by region (Chile & Global)", async () => {
      const registry = new InMemoryAutomotiveSourceRegistry(CANONICAL_AUTOMOTIVE_SOURCES);
      const allSources = await registry.list();
      assert.equal(allSources.length, 7);

      // Chilean sources (Mercado Libre CL, Autoplanet, Repuestos Boston + Global sources covering CL)
      const chileanSources = await registry.findByRegion("CL");
      assert.ok(chileanSources.length >= 3);
      const chileanIds = chileanSources.map((s) => s.sourceId);
      assert.ok(chileanIds.includes("mercadolibre-cl"));
      assert.ok(chileanIds.includes("autoplanet-cl"));
      assert.ok(chileanIds.includes("repuestos-boston-cl"));

      // International / Pure Catalog sources
      const oemCatalog = await registry.get("oem-catalog-reference");
      assert.ok(oemCatalog);
      assert.equal(oemCatalog?.capabilities.getFitmentMatrix, "SUPPORTED");
      assert.equal(oemCatalog?.capabilities.getPrice, "UNSUPPORTED"); // Pure catalog distinction
    });

    it("filters sources by specific capabilities and trust ratings", async () => {
      const registry = new InMemoryAutomotiveSourceRegistry(CANONICAL_AUTOMOTIVE_SOURCES);

      const pricingSources = await registry.list({ requiresPrice: true });
      assert.ok(pricingSources.length > 0);
      assert.ok(!pricingSources.some((s) => s.sourceId === "oem-catalog-reference"));

      const fitmentSources = await registry.list({ requiresFitment: true, minReliability: 0.9 });
      assert.ok(fitmentSources.length >= 4);
    });
  });

  describe("Automotive Source Connector Contract & Pilot", () => {
    it("executes source search and produces structured offers with claim evidence", async () => {
      const autoplanet = CANONICAL_AUTOMOTIVE_SOURCES.find((s) => s.sourceId === "autoplanet-cl")!;
      const connector = new BaseAutomotiveSourceConnector(autoplanet);

      const health = await connector.healthCheck();
      assert.equal(health.healthy, true);

      const searchResult = await connector.search({
        query: "pastillas de freno",
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          year: 2018,
          engine: "1.8L",
        },
        partCategory: "brakes",
      });

      assert.equal(searchResult.success, true);
      assert.ok(searchResult.offers.length > 0);
      const offer = searchResult.offers[0];
      assert.equal(offer.sourceId, "autoplanet-cl");
      assert.equal(offer.fitmentVerified, true);
      assert.ok(offer.evidenceClaims.length > 0);
      assert.equal(offer.evidenceClaims[0].verifiedDeterministically, true);
    });

    it("rejects search on disabled or restricted sources fail-closed", async () => {
      const disabledSource = {
        ...CANONICAL_AUTOMOTIVE_SOURCES[0],
        status: "DISABLED" as const,
      };
      const connector = new BaseAutomotiveSourceConnector(disabledSource);

      await assert.rejects(
        async () => {
          await connector.search({ query: "filtro aceite" });
        },
        (err: any) => err instanceof AutomotiveSourceRestrictedError
      );
    });
  });
});
