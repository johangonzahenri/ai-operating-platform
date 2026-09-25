/**
 * src/application/spareparts/spare-parts-facade.ts
 * Unified Application Facade for Automotive Spare Parts Search, Normalization, Fitment & Price Comparison.
 * Designed for frontend UI consumption, satellite adapters, and REST endpoints.
 */

import { SparePartsSearchQuery, createSparePartsSearchQuery } from "../../domain/spareparts/search-query.js";
import { VehicleSpecification } from "../../domain/spareparts/vehicle.js";
import { CanonicalPartCluster } from "../../domain/spareparts/part-cluster.js";
import { FitmentVerificationResult, FitmentVerdict } from "../../domain/spareparts/fitment-verdict.js";
import {
  TransparentPriceComparison,
  PriceComparisonOfferItem,
} from "../../domain/spareparts/price-intelligence.js";
import { MultiSourceSearchOrchestrator, SourceExecutionReport, ConnectorResolver } from "./multi-source-search-orchestrator.js";
import { SourceSelectionService } from "./source-selection-service.js";
import { PartClusteringEngine } from "./part-clustering-engine.js";
import { FitmentVerificationEngine } from "./fitment-verification-engine.js";
import { PriceIntelligenceEngine } from "./price-intelligence-engine.js";
import { InMemoryAutomotiveSourceRegistry } from "./automotive-source-registry.js";
import { AutomotiveSourceConnector } from "./automotive-source-connector.js";
import { CrossReference } from "../../domain/spareparts/cross-reference.js";
import { FitmentRule } from "../../domain/spareparts/fitment.js";
import { CANONICAL_AUTOMOTIVE_SOURCES } from "../../infrastructure/spareparts/canonical-sources.js";
import { TestFixtureAutomotiveConnector } from "../../infrastructure/spareparts/fixture-connectors.js";

export interface SparePartsSearchRequest {
  readonly query: string;
  readonly vehicle?: {
    readonly make: string;
    readonly model: string;
    readonly year: number;
    readonly generation?: string | undefined;
    readonly engine?: string | undefined;
    readonly market?: string | undefined;
  } | undefined;
  readonly options?: {
    readonly comparisonCurrency?: string | undefined;
    readonly requestedQuantity?: number | undefined;
    readonly targetDestinationCountry?: string | undefined;
    readonly targetDestinationRegion?: string | undefined;
    readonly maxBudgetMs?: number | undefined;
    readonly allowedSources?: readonly string[] | undefined;
  } | undefined;
}

export interface SparePartsSearchFilterOptions {
  readonly maxPrice?: number | undefined;
  readonly minPrice?: number | undefined;
  readonly fitmentVerdict?: FitmentVerdict | "ALL" | undefined;
  readonly onlyInStock?: boolean | undefined;
  readonly minSellerTrust?: number | undefined;
}

export interface SparePartsSearchResponse {
  readonly searchId: string;
  readonly queryText: string;
  readonly targetVehicle?: VehicleSpecification | undefined;
  readonly status: "SUCCESS" | "PARTIAL_SUCCESS" | "NO_RESULTS" | "FAILED";
  readonly executionTimeMs: number;
  readonly sourceReports: readonly SourceExecutionReport[];
  readonly totalOffersFound: number;
  readonly clustersCount: number;
  readonly clusters: readonly {
    readonly clusterId: string;
    readonly canonicalPartNumber: string;
    readonly canonicalBrand: string;
    readonly description: string;
    readonly offerCount: number;
    readonly comparison: TransparentPriceComparison;
    readonly fitmentResult?: FitmentVerificationResult | undefined;
  }[];
  readonly warnings: readonly string[];
}

export interface SparePartsFacadeDependencies {
  readonly orchestrator?: MultiSourceSearchOrchestrator | undefined;
  readonly clusteringEngine?: PartClusteringEngine | undefined;
  readonly fitmentEngine?: FitmentVerificationEngine | undefined;
  readonly priceEngine?: PriceIntelligenceEngine | undefined;
  readonly registry?: InMemoryAutomotiveSourceRegistry | undefined;
  readonly connectors?: readonly AutomotiveSourceConnector[] | undefined;
  readonly crossReferences?: readonly CrossReference[] | undefined;
  readonly fitmentRules?: readonly FitmentRule[] | undefined;
}

export class SparePartsFacade {
  private readonly orchestrator: MultiSourceSearchOrchestrator;
  private readonly clusteringEngine: PartClusteringEngine;
  private readonly fitmentEngine: FitmentVerificationEngine;
  private readonly priceEngine: PriceIntelligenceEngine;
  private readonly crossReferences: readonly CrossReference[];
  private readonly fitmentRules: readonly FitmentRule[];

  constructor(deps: SparePartsFacadeDependencies = {}) {
    if (deps.orchestrator) {
      this.orchestrator = deps.orchestrator;
    } else {
      const reg = deps.registry || new InMemoryAutomotiveSourceRegistry(CANONICAL_AUTOMOTIVE_SOURCES);
      const selector = new SourceSelectionService(reg);

      const connectorsMap = new Map<string, AutomotiveSourceConnector>();
      if (deps.connectors) {
        for (const conn of deps.connectors) {
          connectorsMap.set(conn.source.sourceId, conn);
        }
      } else {
        // Setup default fixture connectors for canonical sources
        for (const src of CANONICAL_AUTOMOTIVE_SOURCES) {
          connectorsMap.set(src.sourceId, new TestFixtureAutomotiveConnector(src, { mode: "SUCCESS" }));
        }
      }

      const resolver: ConnectorResolver = async (sourceId: string) => connectorsMap.get(sourceId);
      this.orchestrator = new MultiSourceSearchOrchestrator(selector, resolver);
    }

    this.clusteringEngine = deps.clusteringEngine || new PartClusteringEngine();
    this.fitmentEngine = deps.fitmentEngine || new FitmentVerificationEngine();
    this.priceEngine = deps.priceEngine || new PriceIntelligenceEngine();
    this.crossReferences = deps.crossReferences || Object.freeze([]);
    this.fitmentRules = deps.fitmentRules || Object.freeze([]);
  }

  /**
   * Executes end-to-end multi-source search, clustering, fitment verification, and price comparison.
   */
  async searchAndCompare(request: SparePartsSearchRequest): Promise<SparePartsSearchResponse> {
    const startTime = Date.now();
    const queryText = (request.query || "").trim();

    if (!queryText) {
      return Object.freeze({
        searchId: `search-${Date.now().toString(36)}`,
        queryText: "",
        status: "FAILED",
        executionTimeMs: 0,
        sourceReports: Object.freeze([]),
        totalOffersFound: 0,
        clustersCount: 0,
        clusters: Object.freeze([]),
        warnings: Object.freeze(["Search query cannot be empty"]),
      });
    }

    // 1. Prepare target vehicle if provided
    let vehicleSpec: VehicleSpecification | undefined = undefined;
    if (request.vehicle && request.vehicle.make && request.vehicle.model && request.vehicle.year) {
      vehicleSpec = Object.freeze({
        make: request.vehicle.make.trim(),
        model: request.vehicle.model.trim(),
        year: Number(request.vehicle.year),
        generation: request.vehicle.generation?.trim() || undefined,
        engine: request.vehicle.engine?.trim() || undefined,
        market: request.vehicle.market?.trim() || undefined,
      });
    }

    // 2. Build domain query with canonical helper
    const domainQuery: SparePartsSearchQuery = createSparePartsSearchQuery({
      rawQuery: queryText,
      partNumber: queryText.includes("-") || /[0-9]/.test(queryText) ? queryText : undefined,
      vehicle: vehicleSpec,
      region: request.options?.targetDestinationCountry || "CL",
    });

    // 3. Execute Multi-Source Search
    const searchResult = await this.orchestrator.search(domainQuery, {
      budget: {
        timeoutMs: request.options?.maxBudgetMs || 3000,
      },
      targetRegion: request.options?.targetDestinationCountry || "CL",
      forceSourceIds: request.options?.allowedSources,
    });

    const warnings: string[] = [...searchResult.warnings];

    if (searchResult.offers.length === 0) {
      return Object.freeze({
        searchId: searchResult.searchId,
        queryText,
        targetVehicle: vehicleSpec,
        status: searchResult.status,
        executionTimeMs: Date.now() - startTime,
        sourceReports: searchResult.sourceReports,
        totalOffersFound: 0,
        clustersCount: 0,
        clusters: Object.freeze([]),
        warnings: Object.freeze(warnings),
      });
    }

    // 4. Cluster Offers deterministically
    const clusters = this.clusteringEngine.clusterOffers(searchResult.offers, {
      crossReferences: this.crossReferences,
    });

    // 5. Fitment & Price Comparison per cluster
    const clusterResponses = clusters.map(cluster => {
      let fitmentResult: FitmentVerificationResult | undefined = undefined;
      if (vehicleSpec) {
        fitmentResult = this.fitmentEngine.verifyFitment({
          targetVehicle: vehicleSpec,
          canonicalPartId: cluster.clusterId,
          cluster,
          offers: cluster.members,
          crossReferences: this.crossReferences,
          rules: this.fitmentRules,
        });
      }

      // Price comparison with fitment results mapped to member offers and cluster
      const fitmentResultsList: FitmentVerificationResult[] = [];
      if (fitmentResult) {
        fitmentResultsList.push(fitmentResult);
        for (const member of cluster.members) {
          if (member.canonicalPartId !== fitmentResult.canonicalPartId) {
            fitmentResultsList.push({
              ...fitmentResult,
              canonicalPartId: member.canonicalPartId,
            });
          }
        }
      }

      const comparison = this.priceEngine.compareOffers(cluster, {
        comparisonCurrency: request.options?.comparisonCurrency || "CLP",
        requestedQuantity: request.options?.requestedQuantity || 1,
        targetDestinationCountry: request.options?.targetDestinationCountry || "CL",
        targetDestinationRegion: request.options?.targetDestinationRegion,
        fitmentResults: fitmentResultsList.length > 0 ? Object.freeze(fitmentResultsList) : undefined,
      });

      const canonicalPartNum = cluster.primaryPartNumber?.value || (cluster as any).canonicalPartNumber?.value || String((cluster as any).canonicalPartNumber || cluster.clusterId);
      const canonicalBrandName = cluster.brand?.name || (cluster as any).canonicalBrand?.name || String((cluster as any).canonicalBrand || "Generic");

      return Object.freeze({
        clusterId: cluster.clusterId,
        canonicalPartNumber: canonicalPartNum,
        canonicalBrand: canonicalBrandName,
        description: cluster.members[0]?.title || `Part ${canonicalPartNum}`,
        offerCount: cluster.members.length,
        comparison,
        fitmentResult,
      });
    });

    return Object.freeze({
      searchId: searchResult.searchId,
      queryText,
      targetVehicle: vehicleSpec,
      status: searchResult.status,
      executionTimeMs: Date.now() - startTime,
      sourceReports: searchResult.sourceReports,
      totalOffersFound: searchResult.offers.length,
      clustersCount: clusterResponses.length,
      clusters: Object.freeze(clusterResponses),
      warnings: Object.freeze(warnings),
    });
  }

  /**
   * Filters price comparison items reactively without re-running full search or recalculating domain logic.
   */
  filterComparisonItems(
    items: readonly PriceComparisonOfferItem[],
    filters: SparePartsSearchFilterOptions
  ): readonly PriceComparisonOfferItem[] {
    return items.filter(item => {
      // 1. Fitment verdict filter
      if (filters.fitmentVerdict && filters.fitmentVerdict !== "ALL") {
        if (item.fitmentVerdict !== filters.fitmentVerdict) {
          return false;
        }
      }

      // 2. Only in-stock
      if (filters.onlyInStock) {
        if (item.incomparabilityReasons?.some(r => r.toLowerCase().includes("stock"))) {
          return false;
        }
      }

      // 3. Minimum seller trust
      if (filters.minSellerTrust !== undefined) {
        if (item.sellerTrust.score < filters.minSellerTrust) {
          return false;
        }
      }

      // 4. Price range filter (on totalAmount if available, or basePrice)
      const effectivePrice = item.totalCost.totalAmount !== undefined
        ? item.totalCost.totalAmount
        : item.basePrice.amount;

      if (filters.minPrice !== undefined && effectivePrice < filters.minPrice) {
        return false;
      }
      if (filters.maxPrice !== undefined && effectivePrice > filters.maxPrice) {
        return false;
      }

      return true;
    });
  }
}
