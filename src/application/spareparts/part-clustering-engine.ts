/**
 * src/application/spareparts/part-clustering-engine.ts
 * Deterministic, Order-Independent & Idempotent Canonical Part Clustering Engine.
 */

import { Offer } from "../../domain/spareparts/product-offer.js";
import { CanonicalPartCluster, createPartCluster } from "../../domain/spareparts/part-cluster.js";
import { PartNumber, createPartNumber, normalizePartNumber } from "../../domain/spareparts/part-number.js";
import { Brand } from "../../domain/spareparts/part.js";
import { CrossReference } from "../../domain/spareparts/cross-reference.js";
import { StructuredClaimEvidence } from "../../domain/agent/agent-taxonomy.js";
import { PartNormalizationService } from "./part-normalization-service.js";
import { DuplicateDetectionService } from "./duplicate-detection-service.js";
import { CrossReferenceService } from "./cross-reference-service.js";

export interface ClusteringOptions {
  readonly crossReferences?: readonly CrossReference[] | undefined;
  readonly minConfidence?: number | undefined;
}

export class PartClusteringEngine {
  constructor(
    private readonly normalizer: PartNormalizationService = new PartNormalizationService(),
    private readonly duplicateDetector: DuplicateDetectionService = new DuplicateDetectionService(),
    private readonly crossRefService?: CrossReferenceService | undefined
  ) {}

  /**
   * Clusters a list of raw offers into canonical part clusters.
   * Guarantees:
   * 1. Order Independence: regardless of input ordering, output clusters are identical.
   * 2. Idempotency: clustering the offers of an already clustered result produces identical clusters.
   * 3. Lossless: all offers and their evidence claims are preserved without data destruction.
   */
  clusterOffers(offers: readonly Offer[], options?: ClusteringOptions): readonly CanonicalPartCluster[] {
    if (!offers || offers.length === 0) {
      return Object.freeze([]);
    }

    // 1. Deterministic sort of input offers by canonicalOfferId to guarantee order independence
    const sortedOffers = [...offers].sort((a, b) => a.canonicalOfferId.localeCompare(b.canonicalOfferId));

    // Combine provided cross references with CrossReferenceService if present
    const allCrossRefs: CrossReference[] = [];
    if (this.crossRefService) {
      allCrossRefs.push(...this.crossRefService.getAll());
    }
    if (options?.crossReferences) {
      allCrossRefs.push(...options.crossReferences);
    }

    // 2. Build equivalence groups (disjoint-set / connected components)
    // Map each offer index to a cluster group
    const parent: number[] = sortedOffers.map((_, idx) => idx);

    function find(i: number): number {
      let root = i;
      while (root !== parent[root]) {
        root = parent[root];
      }
      let curr = i;
      while (curr !== root) {
        const next = parent[curr];
        parent[curr] = root;
        curr = next;
      }
      return root;
    }

    function union(i: number, j: number): void {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        // Deterministic union by index: lower index is root
        if (rootI < rootJ) {
          parent[rootJ] = rootI;
        } else {
          parent[rootI] = rootJ;
        }
      }
    }

    // Grouping reasons and matched cross references per cluster
    const clusterCrossRefs = new Map<number, Set<CrossReference>>();
    const clusterReasons = new Map<number, Set<string>>();

    for (let i = 0; i < sortedOffers.length; i++) {
      for (let j = i + 1; j < sortedOffers.length; j++) {
        const offerA = sortedOffers[i];
        const offerB = sortedOffers[j];

        const matchResult = this.duplicateDetector.classifyPair(offerA, offerB, {
          knownCrossReferences: allCrossRefs,
        });

        if (matchResult.classification === "EXACT_DUPLICATE") {
          union(i, j);
          const root = find(i);
          if (!clusterReasons.has(root)) {
            clusterReasons.set(root, new Set());
          }
          clusterReasons.get(root)!.add(matchResult.reason);

          // Find associated cross references
          for (const xref of allCrossRefs) {
            if (matchResult.matchedKeys.includes(xref.crossReferenceId)) {
              if (!clusterCrossRefs.has(root)) {
                clusterCrossRefs.set(root, new Set());
              }
              clusterCrossRefs.get(root)!.add(xref);
            }
          }
        }
      }
    }

    // 3. Assemble clusters
    const groupMap = new Map<number, Offer[]>();
    for (let i = 0; i < sortedOffers.length; i++) {
      const root = find(i);
      if (!groupMap.has(root)) {
        groupMap.set(root, []);
      }
      groupMap.get(root)!.push(sortedOffers[i]);
    }

    const clusters: CanonicalPartCluster[] = [];

    for (const [rootIdx, groupOffers] of groupMap.entries()) {
      // Offers in this group are deterministically sorted
      // Select representative offer: prefer OEM brand or OE part number if available
      let representativeOffer = groupOffers[0];
      for (const off of groupOffers) {
        const offParts = off.canonicalPartId.split(":");
        const offBrand = offParts.length >= 2 ? offParts[1] : "";
        const normBrand = this.normalizer.normalizeBrand(offBrand);
        if (normBrand.tier === "OEM_GENUINE") {
          representativeOffer = off;
          break;
        }
      }

      // Extract canonical part details from representative
      const parts = representativeOffer.canonicalPartId.split(":");
      const rawBrand = parts.length >= 2 ? parts[1] : "Generic";
      const rawPn = parts.length >= 3 ? parts[2] : representativeOffer.canonicalPartId;

      const brand = this.normalizer.normalizeBrand(rawBrand);
      const primaryPn = this.normalizer.normalizePartNumber(rawPn, {
        brand: brand.name,
        type: brand.tier === "OEM_GENUINE" ? "OEM" : "MPN",
      });

      // Collect alternate part numbers across all group offers
      const altPnMap = new Map<string, PartNumber>();
      for (const off of groupOffers) {
        const offParts = off.canonicalPartId.split(":");
        const offPn = offParts.length >= 3 ? offParts[2] : "";
        if (offPn && offPn.toUpperCase() !== primaryPn.normalizedValue) {
          if (!altPnMap.has(offPn.toUpperCase())) {
            altPnMap.set(
              offPn.toUpperCase(),
              createPartNumber({
                rawValue: offPn,
                type: "MPN",
                brand: brand.name,
                isPrimary: false,
              })
            );
          }
        }
      }

      const xrefSet = clusterCrossRefs.get(rootIdx) || new Set();
      const reasons = clusterReasons.get(rootIdx) || new Set(["Direct canonical part identity"]);

      const cluster = createPartCluster({
        canonicalPartId: representativeOffer.canonicalPartId,
        primaryPartNumber: primaryPn,
        alternatePartNumbers: Array.from(altPnMap.values()),
        brand,
        condition: representativeOffer.condition,
        members: groupOffers,
        crossReferences: Array.from(xrefSet),
        mergeReason: Array.from(reasons).join("; "),
      });

      clusters.push(cluster);
    }

    // 4. Deterministic cluster ordering by clusterId
    return Object.freeze(clusters.sort((a, b) => a.clusterId.localeCompare(b.clusterId)));
  }
}
