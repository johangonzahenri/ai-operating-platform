/**
 * src/application/spareparts/source-selection-service.ts
 * Automotive Source Selection Service with Explicit Rationale and Rejection Tracking.
 */

import {
  AutomotiveSource,
  SourceDataCapabilities,
} from "../../domain/spareparts/automotive-source.js";
import { SparePartsSearchQuery } from "../../domain/spareparts/search-query.js";
import { SearchIntent, classifySearchIntent } from "../../domain/spareparts/search-intent.js";
import { AutomotiveSourceRegistryPort } from "./automotive-source-registry.js";

export type SourceExclusionReason =
  | "NOT_SUPPORTED_CAPABILITY"
  | "WRONG_REGION"
  | "SOURCE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "POLICY_RESTRICTED"
  | "NO_RELEVANT_COVERAGE"
  | "DISABLED"
  | "LOW_TRUST_RATING";

export interface SelectedSource {
  readonly source: AutomotiveSource;
  readonly selectionReason: string;
  readonly priorityScore: number;
}

export interface ExcludedSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly reason: SourceExclusionReason;
  readonly detail: string;
}

export interface SourceSelectionResult {
  readonly selected: readonly SelectedSource[];
  readonly excluded: readonly ExcludedSource[];
  readonly intent: SearchIntent;
}

export class SourceSelectionService {
  constructor(private readonly registry: AutomotiveSourceRegistryPort) {}

  /**
   * Selects candidate sources matching query parameters and intent, explaining selection and exclusion reasons.
   */
  async selectSources(
    query: SparePartsSearchQuery,
    options?: {
      readonly maxSources?: number | undefined;
      readonly targetRegion?: string | undefined;
      readonly minReliability?: number | undefined;
    }
  ): Promise<SourceSelectionResult> {
    const allSources = await this.registry.list();
    const intent = classifySearchIntent(query);

    const selected: SelectedSource[] = [];
    const excluded: ExcludedSource[] = [];

    const regionFilter = options?.targetRegion || query.region || "CL";
    const minTrust = options?.minReliability !== undefined ? options.minReliability : 0.6;
    const maxAllowed = options?.maxSources || 6;

    for (const source of allSources) {
      // 1. Status check
      if (source.status === "DISABLED") {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "DISABLED",
          detail: "Source is administratively disabled in registry",
        });
        continue;
      }

      if (source.status === "UNAVAILABLE" || source.status === "DEPRECATED") {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "SOURCE_UNAVAILABLE",
          detail: `Source status is '${source.status}'`,
        });
        continue;
      }

      // 2. Policy check
      if (!source.accessPolicy.allowed) {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "POLICY_RESTRICTED",
          detail: source.accessPolicy.restrictionsNote || "Access not permitted by policy",
        });
        continue;
      }

      // 3. Trust rating check
      if (source.trustRating.sourceReliability < minTrust) {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "LOW_TRUST_RATING",
          detail: `Source reliability (${source.trustRating.sourceReliability}) is below threshold (${minTrust})`,
        });
        continue;
      }

      // 4. Region coverage check
      const sourceRegions = source.coverage.regions.map(r => r.toUpperCase());
      const isGlobal = sourceRegions.includes("GLOBAL");
      const matchesRegion = isGlobal || sourceRegions.includes(regionFilter.toUpperCase());

      if (!matchesRegion && query.region) {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "WRONG_REGION",
          detail: `Source regions [${source.coverage.regions.join(", ")}] do not cover requested region '${regionFilter}'`,
        });
        continue;
      }

      // 5. Vehicle make coverage check
      if (query.vehicle?.make) {
        const queryMake = query.vehicle.make.toLowerCase();
        const makes = source.coverage.vehicleMakes.map(m => m.toLowerCase());
        const hasUniversalMake = makes.includes("all") || makes.includes("universal");
        const hasMake = hasUniversalMake || makes.includes(queryMake);

        if (!hasMake) {
          excluded.push({
            sourceId: source.sourceId,
            sourceName: source.displayName,
            reason: "NO_RELEVANT_COVERAGE",
            detail: `Source does not provide coverage for vehicle make '${query.vehicle.make}'`,
          });
          continue;
        }
      }

      // 6. Capability check based on intent
      if (intent.primaryIntent === "PART_NUMBER_LOOKUP" && source.capabilities.searchByPartNumber === "UNSUPPORTED") {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "NOT_SUPPORTED_CAPABILITY",
          detail: "Source does not support search by part number",
        });
        continue;
      }

      if (intent.primaryIntent === "OEM_LOOKUP" && source.capabilities.searchByOemNumber === "UNSUPPORTED") {
        excluded.push({
          sourceId: source.sourceId,
          sourceName: source.displayName,
          reason: "NOT_SUPPORTED_CAPABILITY",
          detail: "Source does not support OEM number lookup",
        });
        continue;
      }

      // Calculate priority score
      let score = source.trustRating.sourceReliability * 10;
      const reasons: string[] = [];

      if (sourceRegions.includes(regionFilter.toUpperCase())) {
        score += 5;
        reasons.push(`Direct regional coverage for ${regionFilter}`);
      } else if (isGlobal) {
        score += 2;
        reasons.push("Global catalog coverage");
      }

      if (query.vehicle && source.capabilities.getFitmentMatrix === "SUPPORTED") {
        score += 4;
        reasons.push("Verified fitment matrix available");
      }

      if (source.capabilities.getPrice === "SUPPORTED") {
        score += 3;
        reasons.push("Live pricing supported");
      }

      selected.push({
        source,
        selectionReason: reasons.join("; "),
        priorityScore: score,
      });
    }

    // Sort selected by priority score descending
    selected.sort((a, b) => b.priorityScore - a.priorityScore);

    return Object.freeze({
      selected: Object.freeze(selected.slice(0, maxAllowed)),
      excluded: Object.freeze(excluded),
      intent,
    });
  }
}
