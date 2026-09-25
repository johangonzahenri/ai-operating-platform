import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  createSparePartsSearchQuery,
  classifySearchIntent,
  decomposeSearchQuery,
  DEFAULT_SEARCH_BUDGET,
} from "../../src/domain/spareparts/index.js";
import { CANONICAL_AUTOMOTIVE_SOURCES } from "../../src/infrastructure/spareparts/canonical-sources.js";
import { InMemoryAutomotiveSourceRegistry } from "../../src/application/spareparts/automotive-source-registry.js";
import { SourceSelectionService } from "../../src/application/spareparts/source-selection-service.js";
import {
  MultiSourceSearchOrchestrator,
  ConnectorResolver,
} from "../../src/application/spareparts/multi-source-search-orchestrator.js";
import { TestFixtureAutomotiveConnector } from "../../src/infrastructure/spareparts/fixture-connectors.js";
import { AutomotiveSourceConnector } from "../../src/application/spareparts/automotive-source-connector.js";

describe("Phase 144: Multi-Source Search & Specialized Search Agents", () => {
  let registry: InMemoryAutomotiveSourceRegistry;
  let sourceSelector: SourceSelectionService;
  let connectorsMap: Map<string, TestFixtureAutomotiveConnector>;
  let connectorResolver: ConnectorResolver;
  let orchestrator: MultiSourceSearchOrchestrator;

  beforeEach(() => {
    registry = new InMemoryAutomotiveSourceRegistry(CANONICAL_AUTOMOTIVE_SOURCES);
    sourceSelector = new SourceSelectionService(registry);

    connectorsMap = new Map();
    for (const source of CANONICAL_AUTOMOTIVE_SOURCES) {
      connectorsMap.set(source.sourceId, new TestFixtureAutomotiveConnector(source, { mode: "SUCCESS" }));
    }

    connectorResolver = async (sourceId: string): Promise<AutomotiveSourceConnector | undefined> => {
      return connectorsMap.get(sourceId);
    };

    orchestrator = new MultiSourceSearchOrchestrator(sourceSelector, connectorResolver);
  });

  describe("Search Intent Classification & Query Decomposition", () => {
    it("classifies OEM lookup intent when OEM code is present", () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "pastillas oem 04465-02220 para Corolla",
        oemNumber: "04465-02220",
      });
      const intent = classifySearchIntent(query);
      assert.equal(intent.primaryIntent, "OEM_LOOKUP");
      assert.ok(intent.confidence >= 0.9);
      assert.ok(intent.rationale.includes("OEM"));
    });

    it("classifies Vehicle Fitment search with secondary Price Discovery intent", () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "cotizar precio pastillas de freno para Toyota Corolla 2018",
        vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
        category: "BRAKING",
      });
      const intent = classifySearchIntent(query);
      assert.equal(intent.primaryIntent, "VEHICLE_FITMENT_SEARCH");
      assert.ok(intent.secondaryIntents.includes("PRICE_DISCOVERY"));
    });

    it("decomposes query into prioritized SearchTasks distributed across sources within budget", () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "filtro de aceite para Chevrolet Sail 2017",
        vehicle: { make: "Chevrolet", model: "Sail", year: 2017 },
      });
      const sources = ["mercadolibre-cl", "autoplanet-cl", "repuestos-boston-cl"];
      const tasks = decomposeSearchQuery(query, sources, DEFAULT_SEARCH_BUDGET);

      assert.equal(tasks.length, 3);
      assert.equal(tasks[0].sourceId, "mercadolibre-cl");
      assert.equal(tasks[0].priority, "HIGH");
      assert.equal(tasks[1].priority, "MEDIUM");
      assert.ok(tasks[0].evidenceRequired);
    });
  });

  describe("Source Selection Service", () => {
    it("selects candidate sources matching Chilean market and brake parts with clear rationale", async () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno Toyota Corolla 2018",
        vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
        category: "BRAKING",
        region: "CL",
      });

      const selection = await sourceSelector.selectSources(query);

      assert.ok(selection.selected.length >= 3);
      const selectedIds = selection.selected.map(s => s.source.sourceId);

      // Chilean stores and global stores covering CL
      assert.ok(selectedIds.includes("mercadolibre-cl"));
      assert.ok(selectedIds.includes("autoplanet-cl"));
      assert.ok(selectedIds.includes("repuestos-boston-cl"));

      // Verifies explicit selection rationale is recorded
      for (const sel of selection.selected) {
        assert.ok(sel.selectionReason.length > 0);
        assert.ok(sel.priorityScore > 0);
      }
    });

    it("excludes sources with non-matching coverage and tracks explicit exclusion reasons", async () => {
      // 1. Query for EU region: mercadolibre-cl (CL/LATAM only) must be excluded with WRONG_REGION
      const euQuery = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno para Renault Clio",
        vehicle: { make: "Renault", model: "Clio", year: 2018 },
        region: "EU",
      });

      const euSelection = await sourceSelector.selectSources(euQuery, { targetRegion: "EU" });
      const mlExclusion = euSelection.excluded.find(e => e.sourceId === "mercadolibre-cl");
      assert.ok(mlExclusion);
      assert.equal(mlExclusion?.reason, "WRONG_REGION");
      assert.ok(mlExclusion?.detail.includes("do not cover requested region"));

      // 2. Query for Volvo: repuestos-boston-cl (Asian makes only) must be excluded with NO_RELEVANT_COVERAGE
      const volvoQuery = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno para Volvo XC60",
        vehicle: { make: "Volvo", model: "XC60", year: 2020 },
        region: "CL",
      });

      const volvoSelection = await sourceSelector.selectSources(volvoQuery, { targetRegion: "CL" });
      const bostonExclusion = volvoSelection.excluded.find(e => e.sourceId === "repuestos-boston-cl");
      assert.ok(bostonExclusion);
      assert.equal(bostonExclusion?.reason, "NO_RELEVANT_COVERAGE");
      assert.ok(bostonExclusion?.detail.includes("does not provide coverage for vehicle make"));
    });
  });

  describe("Multi-Source Search Orchestration & Parallel Execution", () => {
    it("executes parallel search across sources and produces unified canonical results with evidence", async () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno para Toyota Corolla 2018",
        vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
        category: "BRAKING",
        region: "CL",
      });

      const result = await orchestrator.search(query, {
        forceSourceIds: ["mercadolibre-cl", "autoplanet-cl", "repuestos-boston-cl"],
      });

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.sourcesAttempted, 3);
      assert.equal(result.sourcesSucceeded, 3);
      assert.equal(result.sourcesFailed, 0);
      assert.ok(result.offers.length >= 6); // 2 offers per fixture
      assert.ok(result.evidence.length >= 6);

      // Verify canonical offer mapping
      const firstOffer = result.offers[0];
      assert.ok(firstOffer.canonicalOfferId.startsWith("off:"));
      assert.ok(firstOffer.price.amount > 0);
      assert.equal(firstOffer.price.currency, "CLP");
      assert.ok(firstOffer.seller.sellerId.length > 0);
      assert.ok(firstOffer.evidenceClaims.length > 0);
    });

    it("handles partial failure gracefully when one source times out and another rate-limits", async () => {
      // Configure fixtures: ML succeeds, Autoplanet times out, Boston rate-limits
      connectorsMap.get("autoplanet-cl")!.setBehavior({ mode: "TIMEOUT", delayMs: 10 });
      connectorsMap.get("repuestos-boston-cl")!.setBehavior({ mode: "RATE_LIMITED", delayMs: 5 });

      const query = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno para Toyota Corolla 2018",
        vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
        region: "CL",
      });

      const result = await orchestrator.search(query, {
        forceSourceIds: ["mercadolibre-cl", "autoplanet-cl", "repuestos-boston-cl"],
      });

      // Partial success: ML returned offers, but 2 sources failed
      assert.equal(result.status, "PARTIAL_SUCCESS");
      assert.equal(result.sourcesAttempted, 3);
      assert.equal(result.sourcesSucceeded, 1);
      assert.equal(result.sourcesFailed, 2);
      assert.ok(result.offers.length > 0); // ML offers retained!
      assert.equal(result.warnings.length, 2);

      // Verify source reports detail
      const autoplanetReport = result.sourceReports.find(r => r.sourceId === "autoplanet-cl");
      assert.equal(autoplanetReport?.status, "TIMEOUT");

      const bostonReport = result.sourceReports.find(r => r.sourceId === "repuestos-boston-cl");
      assert.equal(bostonReport?.status, "RATE_LIMITED");
    });

    it("returns NO_RESULTS status when all sources report 0 offers without errors", async () => {
      connectorsMap.get("mercadolibre-cl")!.setBehavior({ mode: "EMPTY" });
      connectorsMap.get("autoplanet-cl")!.setBehavior({ mode: "EMPTY" });

      const query = createSparePartsSearchQuery({
        rawQuery: "pieza inexistente xyz123999",
      });

      const result = await orchestrator.search(query, {
        forceSourceIds: ["mercadolibre-cl", "autoplanet-cl"],
      });

      assert.equal(result.status, "NO_RESULTS");
      assert.equal(result.sourcesSucceeded, 2);
      assert.equal(result.sourcesFailed, 0);
      assert.equal(result.offers.length, 0);
    });

    it("returns FAILED status when all attempted sources fail", async () => {
      connectorsMap.get("mercadolibre-cl")!.setBehavior({ mode: "ERROR", errorMessage: "500 Server Error" });
      connectorsMap.get("autoplanet-cl")!.setBehavior({ mode: "BLOCKED" });

      const query = createSparePartsSearchQuery({
        rawQuery: "pastillas de freno Toyota Corolla",
      });

      const result = await orchestrator.search(query, {
        forceSourceIds: ["mercadolibre-cl", "autoplanet-cl"],
      });

      assert.equal(result.status, "FAILED");
      assert.equal(result.sourcesSucceeded, 0);
      assert.equal(result.sourcesFailed, 2);
      assert.equal(result.offers.length, 0);
      assert.equal(result.warnings.length, 2);
    });

    it("enforces search budget limits on source count and execution timeout", async () => {
      const query = createSparePartsSearchQuery({
        rawQuery: "bujias de encendido iridium",
        region: "CL",
      });

      const result = await orchestrator.search(query, {
        budget: { maxSources: 2, maxDurationMs: 2000 },
      });

      assert.ok(result.sourcesAttempted <= 2);
      assert.ok(result.timing.durationMs >= 0);
    });
  });
});
