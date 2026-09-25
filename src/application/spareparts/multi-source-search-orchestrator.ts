/**
 * src/application/spareparts/multi-source-search-orchestrator.ts
 * Multi-Source Search Orchestration, Failure Isolation & Specialized Agent Routing.
 */

import {
  Offer,
  createOffer,
  createSeller,
  createPrice,
} from "../../domain/spareparts/product-offer.js";
import { generateCanonicalPartId } from "../../domain/spareparts/part.js";
import { SparePartsSearchQuery } from "../../domain/spareparts/search-query.js";
import {
  SearchIntent,
  SearchBudget,
  DEFAULT_SEARCH_BUDGET,
  decomposeSearchQuery,
} from "../../domain/spareparts/search-intent.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";
import { SourceSelectionService, SourceSelectionResult } from "./source-selection-service.js";
import {
  AutomotiveSourceConnector,
  SourceProductOffer,
  SourceSearchResult,
} from "./automotive-source-connector.js";

export type SearchExecutionStatus =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NO_RESULTS"
  | "FAILED"
  | "CANCELLED";

export type SourceExecutionStatus =
  | "SUCCESS"
  | "NO_RESULTS"
  | "TIMEOUT"
  | "BLOCKED"
  | "RATE_LIMITED"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE"
  | "ERROR";

export interface SourceExecutionReport {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly status: SourceExecutionStatus;
  readonly offersFound: number;
  readonly latencyMs: number;
  readonly error?: string | undefined;
  readonly evidenceCount: number;
  readonly selectionReason?: string | undefined;
}

export interface SparePartsSearchResult {
  readonly searchId: string;
  readonly query: SparePartsSearchQuery;
  readonly intent: SearchIntent;
  readonly status: SearchExecutionStatus;
  readonly sourcesAttempted: number;
  readonly sourcesSucceeded: number;
  readonly sourcesFailed: number;
  readonly sourceReports: readonly SourceExecutionReport[];
  readonly offers: readonly Offer[];
  readonly evidence: readonly StructuredClaimEvidence[];
  readonly warnings: readonly string[];
  readonly timing: {
    readonly startedAt: Date;
    readonly completedAt: Date;
    readonly durationMs: number;
  };
}

export type ConnectorResolver = (sourceId: string) => Promise<AutomotiveSourceConnector | undefined>;

export class MultiSourceSearchOrchestrator {
  constructor(
    private readonly sourceSelector: SourceSelectionService,
    private readonly connectorResolver: ConnectorResolver
  ) {}

  /**
   * Executes a multi-source parallel search across selected sources with failure isolation.
   */
  async search(
    query: SparePartsSearchQuery,
    options?: {
      readonly budget?: Partial<SearchBudget> | undefined;
      readonly targetRegion?: string | undefined;
      readonly forceSourceIds?: readonly string[] | undefined;
    }
  ): Promise<SparePartsSearchResult> {
    const startedAt = new Date();
    const startTime = Date.now();
    const searchId = `search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const warnings: string[] = [];

    const budget: SearchBudget = {
      ...DEFAULT_SEARCH_BUDGET,
      ...(options?.budget || {}),
    };

    // 1. Source Selection & Intent Decomposition
    const selectionResult: SourceSelectionResult = await this.sourceSelector.selectSources(query, {
      maxSources: budget.maxSources,
      targetRegion: options?.targetRegion || query.region,
    });

    const candidateSources = options?.forceSourceIds && options.forceSourceIds.length > 0
      ? selectionResult.selected.filter(s => options.forceSourceIds!.includes(s.source.sourceId))
      : selectionResult.selected;

    if (candidateSources.length === 0) {
      warnings.push("No candidate sources matched the query and region requirements");
      const completedAt = new Date();
      return Object.freeze({
        searchId,
        query,
        intent: selectionResult.intent,
        status: "NO_RESULTS",
        sourcesAttempted: 0,
        sourcesSucceeded: 0,
        sourcesFailed: 0,
        sourceReports: Object.freeze([]),
        offers: Object.freeze([]),
        evidence: Object.freeze([]),
        warnings: Object.freeze(warnings),
        timing: {
          startedAt,
          completedAt,
          durationMs: Date.now() - startTime,
        },
      });
    }

    const sourceIds = candidateSources.map(s => s.source.sourceId);
    const searchTasks = decomposeSearchQuery(query, sourceIds, budget);

    // 2. Parallel Source Execution with Timeouts & Failure Isolation
    const sourcePromises = searchTasks.map(async task => {
      const selectedSource = candidateSources.find(s => s.source.sourceId === task.sourceId)!;
      const sourceStart = Date.now();

      try {
        const connector = await this.connectorResolver(task.sourceId);
        if (!connector) {
          return {
            sourceId: task.sourceId,
            sourceName: selectedSource.source.displayName,
            status: "UNAVAILABLE" as SourceExecutionStatus,
            offers: [] as SourceProductOffer[],
            latencyMs: Date.now() - sourceStart,
            error: `Connector for source '${task.sourceId}' is not registered`,
            evidenceCount: 0,
            selectionReason: selectedSource.selectionReason,
          };
        }

        // Execute with timeout race
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Source '${task.sourceId}' exceeded timeout limit of ${task.timeoutMs}ms`));
          }, task.timeoutMs);
        });

        const resultPromise = connector.search({
          query: query.rawQuery,
          vehicle: query.vehicle
            ? {
                make: query.vehicle.make,
                model: query.vehicle.model,
                year: query.vehicle.year,
                engine: query.vehicle.engine,
              }
            : undefined,
          partCategory: query.category,
          maxResults: task.maxResults,
        });

        const searchResult: SourceSearchResult = await Promise.race([resultPromise, timeoutPromise]);

        const rawOffers = searchResult.offers || [];
        const status: SourceExecutionStatus = rawOffers.length > 0 ? "SUCCESS" : "NO_RESULTS";

        let totalEvCount = 0;
        for (const off of rawOffers) {
          totalEvCount += off.evidenceClaims ? off.evidenceClaims.length : 0;
        }

        return {
          sourceId: task.sourceId,
          sourceName: selectedSource.source.displayName,
          status,
          offers: rawOffers,
          latencyMs: Date.now() - sourceStart,
          evidenceCount: totalEvCount,
          selectionReason: selectedSource.selectionReason,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        let status: SourceExecutionStatus = "ERROR";

        if (errMsg.toLowerCase().includes("timeout")) {
          status = "TIMEOUT";
        } else if (errMsg.includes("429") || errMsg.toLowerCase().includes("rate limit")) {
          status = "RATE_LIMITED";
        } else if (errMsg.includes("403") || errMsg.toLowerCase().includes("blocked")) {
          status = "BLOCKED";
        }

        return {
          sourceId: task.sourceId,
          sourceName: selectedSource.source.displayName,
          status,
          offers: [] as SourceProductOffer[],
          latencyMs: Date.now() - sourceStart,
          error: errMsg,
          evidenceCount: 0,
          selectionReason: selectedSource.selectionReason,
        };
      }
    });

    const executionResults = await Promise.all(sourcePromises);

    // 3. Collate reports and verify results with Verification Agent
    const sourceReports: SourceExecutionReport[] = [];
    const allEvidence: StructuredClaimEvidence[] = [];
    const canonicalOffers: Offer[] = [];

    let succeededCount = 0;
    let failedCount = 0;

    for (const res of executionResults) {
      sourceReports.push({
        sourceId: res.sourceId,
        sourceName: res.sourceName,
        status: res.status,
        offersFound: res.offers.length,
        latencyMs: res.latencyMs,
        error: res.error,
        evidenceCount: res.evidenceCount,
        selectionReason: res.selectionReason,
      });

      if (res.status === "SUCCESS" || res.status === "NO_RESULTS") {
        succeededCount++;
      } else {
        failedCount++;
        warnings.push(`Source '${res.sourceName}' failed with status ${res.status}: ${res.error || "unknown error"}`);
      }

      // 4. Verification Agent & Canonical Mapping
      for (const raw of res.offers) {
        // Verification step: ensure price >= 0, currency present
        if (raw.price < 0 || !raw.currency) {
          warnings.push(`Offer '${raw.offerId}' from ${res.sourceId} dropped: invalid price or currency`);
          continue;
        }

        // Evidence capture
        if (raw.evidenceClaims && raw.evidenceClaims.length > 0) {
          for (const ev of raw.evidenceClaims) {
            allEvidence.push(ev);
          }
        }

        // Canonical mapping
        const brandName = raw.brand || query.brand || "Generic";
        const primaryPn = raw.oemNumber || raw.partNumber || "UNKNOWN";
        const canonicalPartId = generateCanonicalPartId(brandName, primaryPn);

        const seller = createSeller({
          sellerId: `seller-${res.sourceId}-${(raw.sellerName || "direct").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
          name: raw.sellerName || `${res.sourceName} Vendor`,
          sourceId: res.sourceId,
          country: options?.targetRegion || query.region || "CL",
          verified: Boolean(raw.sellerTrustScore && raw.sellerTrustScore > 0.8),
        });

        const price = createPrice({
          amount: raw.price,
          currency: raw.currency,
          taxIncluded: true,
          sourceId: res.sourceId,
        });

        let shippingInfo = undefined;
        if (raw.shipping) {
          shippingInfo = {
            cost: raw.shipping.fee !== undefined ? raw.shipping.fee : (raw.shipping.freeShipping ? 0 : 0),
            currency: raw.currency,
            destinationCountry: options?.targetRegion || query.region || "CL",
            estimatedDeliveryDays: raw.shipping.estimatedDaysMax || raw.shipping.estimatedDaysMin,
            carrier: raw.shipping.carrier,
            isFreeShipping: Boolean(raw.shipping.freeShipping || raw.shipping.fee === 0),
          };
        }

        const canonicalOffer = createOffer({
          canonicalPartId,
          sourceId: res.sourceId,
          seller,
          listing: {
            sourceListingId: raw.offerId,
            sourceId: res.sourceId,
            rawTitle: raw.title,
            sourceUrl: raw.productUrl,
            rawPrice: raw.price,
            rawCurrency: raw.currency,
            sellerName: raw.sellerName,
            retrievedAt: raw.lastCheckedAt || new Date(),
          },
          price,
          availability: {
            status: raw.inStock ? "IN_STOCK" : "OUT_OF_STOCK",
            checkedAt: raw.lastCheckedAt || new Date(),
          },
          shipping: shippingInfo,
          warrantyMonths: raw.warrantyMonths,
          returnPolicyDays: raw.returnPolicyDays,
          evidenceClaims: raw.evidenceClaims || [],
          retrievedAt: raw.lastCheckedAt || new Date(),
        });

        canonicalOffers.push(canonicalOffer);
      }
    }

    // 5. Determine overall search status
    let searchStatus: SearchExecutionStatus = "SUCCESS";
    if (succeededCount === 0 && failedCount > 0) {
      searchStatus = "FAILED";
    } else if (failedCount > 0 && canonicalOffers.length > 0) {
      searchStatus = "PARTIAL_SUCCESS";
    } else if (canonicalOffers.length === 0 && succeededCount > 0) {
      searchStatus = "NO_RESULTS";
    }

    const completedAt = new Date();
    return Object.freeze({
      searchId,
      query,
      intent: selectionResult.intent,
      status: searchStatus,
      sourcesAttempted: candidateSources.length,
      sourcesSucceeded: succeededCount,
      sourcesFailed: failedCount,
      sourceReports: Object.freeze(sourceReports),
      offers: Object.freeze(canonicalOffers),
      evidence: Object.freeze(allEvidence),
      warnings: Object.freeze(warnings),
      timing: {
        startedAt,
        completedAt,
        durationMs: Date.now() - startTime,
      },
    });
  }
}
