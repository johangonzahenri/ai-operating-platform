/**
 * src/domain/spareparts/search-intent.ts
 * Search Intent Classification, Query Decomposition & Search Task Contracts.
 */

import { SourceDataCapabilities } from "./automotive-source.js";
import { SparePartsSearchQuery } from "./search-query.js";

export type SearchIntentType =
  | "PART_DISCOVERY"
  | "PART_NUMBER_LOOKUP"
  | "OEM_LOOKUP"
  | "VEHICLE_FITMENT_SEARCH"
  | "PRICE_DISCOVERY"
  | "ALTERNATIVE_PART_SEARCH"
  | "CROSS_REFERENCE_SEARCH"
  | "SELLER_SEARCH";

export const VALID_SEARCH_INTENT_TYPES: readonly SearchIntentType[] = Object.freeze([
  "PART_DISCOVERY",
  "PART_NUMBER_LOOKUP",
  "OEM_LOOKUP",
  "VEHICLE_FITMENT_SEARCH",
  "PRICE_DISCOVERY",
  "ALTERNATIVE_PART_SEARCH",
  "CROSS_REFERENCE_SEARCH",
  "SELLER_SEARCH",
]);

export interface SearchIntent {
  readonly primaryIntent: SearchIntentType;
  readonly secondaryIntents: readonly SearchIntentType[];
  readonly confidence: number; // 0.0 to 1.0
  readonly rationale: string;
}

export interface SearchBudget {
  readonly maxSources: number;
  readonly maxRequests: number;
  readonly maxAgentSteps: number;
  readonly maxHandoffs: number;
  readonly maxDurationMs: number;
}

export const DEFAULT_SEARCH_BUDGET: SearchBudget = Object.freeze({
  maxSources: 6,
  maxRequests: 12,
  maxAgentSteps: 8,
  maxHandoffs: 4,
  maxDurationMs: 10000,
});

export interface SearchTask {
  readonly taskId: string;
  readonly query: SparePartsSearchQuery;
  readonly sourceId: string;
  readonly intent: SearchIntent;
  readonly requiredCapabilities: readonly (keyof SourceDataCapabilities)[];
  readonly priority: "HIGH" | "MEDIUM" | "LOW";
  readonly timeoutMs: number;
  readonly maxResults: number;
  readonly evidenceRequired: boolean;
}

/**
 * Deterministically classifies search intent from a SparePartsSearchQuery.
 */
export function classifySearchIntent(query: SparePartsSearchQuery): SearchIntent {
  const secondary: SearchIntentType[] = [];
  let primary: SearchIntentType = "PART_DISCOVERY";
  let confidence = 0.8;
  const rationaleParts: string[] = [];

  const rawLower = query.rawQuery.toLowerCase();

  // 1. OEM Part number explicit lookup
  if (query.oemNumber || /oem\s*[:#]?\s*[a-z0-9-]+/i.test(query.rawQuery)) {
    primary = "OEM_LOOKUP";
    confidence = 0.95;
    rationaleParts.push("OEM part number explicitly identified");
  }
  // 2. Part number / MPN lookup
  else if (query.partNumber || query.normalizedInput.normalizedPartNumber) {
    primary = "PART_NUMBER_LOOKUP";
    confidence = 0.92;
    rationaleParts.push("Part number or MPN identified in query");
  }
  // 3. Vehicle fitment search
  else if (query.vehicle || (query.normalizedInput.normalizedMake && query.normalizedInput.normalizedModel)) {
    primary = "VEHICLE_FITMENT_SEARCH";
    confidence = 0.88;
    rationaleParts.push("Vehicle specification (make/model/year) provided");
  }

  // Detect secondary intents
  if (
    query.priceRange ||
    rawLower.includes("precio") ||
    rawLower.includes("barato") ||
    rawLower.includes("cotizar") ||
    rawLower.includes("cuanto cuesta") ||
    rawLower.includes("price")
  ) {
    if (primary !== "PRICE_DISCOVERY") {
      secondary.push("PRICE_DISCOVERY");
      rationaleParts.push("Price comparison intent detected");
    }
  }

  if (
    rawLower.includes("alternativa") ||
    rawLower.includes("equivalente") ||
    rawLower.includes("reemplazo") ||
    rawLower.includes("aftermarket")
  ) {
    secondary.push("ALTERNATIVE_PART_SEARCH");
    rationaleParts.push("Alternative or aftermarket part intent detected");
  }

  if (
    rawLower.includes("oem") ||
    rawLower.includes("original") ||
    rawLower.includes("genuino")
  ) {
    if (primary !== "OEM_LOOKUP" && !secondary.includes("OEM_LOOKUP")) {
      secondary.push("OEM_LOOKUP");
    }
  }

  if (query.vehicle && primary !== "VEHICLE_FITMENT_SEARCH" && !secondary.includes("VEHICLE_FITMENT_SEARCH")) {
    secondary.push("VEHICLE_FITMENT_SEARCH");
  }

  return Object.freeze({
    primaryIntent: primary,
    secondaryIntents: Object.freeze(secondary),
    confidence,
    rationale: rationaleParts.length > 0 ? rationaleParts.join("; ") : "Default automotive part discovery intent",
  });
}

/**
 * Decomposes a search query into concrete SearchTasks distributed across selected sources.
 */
export function decomposeSearchQuery(
  query: SparePartsSearchQuery,
  sourceIds: readonly string[],
  budget: SearchBudget = DEFAULT_SEARCH_BUDGET
): readonly SearchTask[] {
  const intent = classifySearchIntent(query);
  const tasks: SearchTask[] = [];

  // Determine required capabilities based on intent
  const requiredCapabilities: (keyof SourceDataCapabilities)[] = ["searchByText", "getPrice"];

  if (intent.primaryIntent === "PART_NUMBER_LOOKUP" || intent.primaryIntent === "OEM_LOOKUP") {
    requiredCapabilities.push("searchByPartNumber");
  }
  if (intent.primaryIntent === "OEM_LOOKUP" || intent.secondaryIntents.includes("OEM_LOOKUP")) {
    requiredCapabilities.push("searchByOemNumber");
  }
  if (intent.primaryIntent === "VEHICLE_FITMENT_SEARCH" || intent.secondaryIntents.includes("VEHICLE_FITMENT_SEARCH")) {
    requiredCapabilities.push("searchByVehicle");
  }

  // Limit sources to budget
  const targetSources = sourceIds.slice(0, budget.maxSources);

  for (let i = 0; i < targetSources.length; i++) {
    const sourceId = targetSources[i];
    const taskId = `task-search-${query.queryId}-${sourceId}-${i + 1}`;

    tasks.push(
      Object.freeze({
        taskId,
        query,
        sourceId,
        intent,
        requiredCapabilities: Object.freeze([...requiredCapabilities]),
        priority: i === 0 ? "HIGH" : "MEDIUM",
        timeoutMs: Math.min(budget.maxDurationMs, 5000),
        maxResults: 10,
        evidenceRequired: true,
      })
    );
  }

  return Object.freeze(tasks);
}
