/**
 * src/domain/spareparts/search-query.ts
 * Automotive Spare Parts Search Query Domain Contracts, Criteria & Normalization.
 */

import { PartCategory } from "./part.js";
import { PartCondition } from "./part.js";
import { VehicleSpecification } from "./vehicle.js";
import { normalizeVehicleMake, normalizeVehicleModel } from "./vehicle.js";
import { normalizePartNumber } from "./part-number.js";

export interface NormalizedSearchInput {
  readonly normalizedMake?: string | undefined;
  readonly normalizedModel?: string | undefined;
  readonly year?: number | undefined;
  readonly normalizedPartNumber?: string | undefined;
  readonly normalizedBrand?: string | undefined;
  readonly cleanTerms: readonly string[];
}

export interface SearchCriteria {
  readonly requiredFilters: Readonly<Record<string, unknown>>;
  readonly preferredFilters?: Readonly<Record<string, unknown>> | undefined;
  readonly rankingHints?: Readonly<{
    readonly prioritizeStock?: boolean | undefined;
    readonly prioritizeLocalSellers?: boolean | undefined;
    readonly prioritizeLowestPrice?: boolean | undefined;
    readonly minSellerRating?: number | undefined;
    readonly minTrustConfidence?: number | undefined;
  }> | undefined;
}

export interface SparePartsSearchQuery {
  readonly queryId: string;
  readonly rawQuery: string;
  readonly normalizedInput: NormalizedSearchInput;
  readonly vehicle?: VehicleSpecification | undefined;
  readonly partName?: string | undefined;
  readonly category?: PartCategory | undefined;
  readonly brand?: string | undefined;
  readonly manufacturer?: string | undefined;
  readonly partNumber?: string | undefined;
  readonly oemNumber?: string | undefined;
  readonly priceRange?: Readonly<{
    readonly min?: number | undefined;
    readonly max?: number | undefined;
    readonly currency: string;
  }> | undefined;
  readonly condition?: PartCondition | undefined;
  readonly sourceIds?: readonly string[] | undefined;
  readonly region?: string | undefined; // e.g. "CL", "US", "GLOBAL"
  readonly availabilityOnly?: boolean | undefined;
  readonly criteria: SearchCriteria;
  readonly createdAt: Date;
}

export class SearchQueryValidationError extends Error {
  readonly code = "SEARCH_QUERY_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "SearchQueryValidationError";
  }
}

/**
 * Parses and normalizes raw search parameters into a NormalizedSearchInput.
 */
export function normalizeSearchInput(rawQuery: string, params?: {
  readonly make?: string | undefined;
  readonly model?: string | undefined;
  readonly year?: number | undefined;
  readonly partNumber?: string | undefined;
  readonly brand?: string | undefined;
}): NormalizedSearchInput {
  if (!rawQuery || typeof rawQuery !== "string") {
    throw new SearchQueryValidationError("Raw query string cannot be empty");
  }

  const terms = rawQuery
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0);

  let normMake: string | undefined;
  let normModel: string | undefined;
  let normPn: string | undefined;

  if (params?.make) {
    try {
      normMake = normalizeVehicleMake(params.make);
    } catch {
      normMake = params.make.trim();
    }
  }

  if (params?.model) {
    try {
      normModel = normalizeVehicleModel(params.model);
    } catch {
      normModel = params.model.trim();
    }
  }

  if (params?.partNumber) {
    try {
      normPn = normalizePartNumber(params.partNumber);
    } catch {
      normPn = params.partNumber.trim();
    }
  }

  return Object.freeze({
    normalizedMake: normMake,
    normalizedModel: normModel,
    year: params?.year,
    normalizedPartNumber: normPn,
    normalizedBrand: params?.brand?.trim().toLowerCase(),
    cleanTerms: Object.freeze(terms),
  });
}

/**
 * Factory to create a validated SparePartsSearchQuery.
 */
export function createSparePartsSearchQuery(params: {
  readonly rawQuery: string;
  readonly vehicle?: VehicleSpecification | undefined;
  readonly partName?: string | undefined;
  readonly category?: PartCategory | undefined;
  readonly brand?: string | undefined;
  readonly manufacturer?: string | undefined;
  readonly partNumber?: string | undefined;
  readonly oemNumber?: string | undefined;
  readonly priceRange?: { readonly min?: number; readonly max?: number; readonly currency: string } | undefined;
  readonly condition?: PartCondition | undefined;
  readonly sourceIds?: readonly string[] | undefined;
  readonly region?: string | undefined;
  readonly availabilityOnly?: boolean | undefined;
  readonly criteria?: SearchCriteria | undefined;
}): SparePartsSearchQuery {
  if (!params.rawQuery || params.rawQuery.trim().length === 0) {
    throw new SearchQueryValidationError("rawQuery cannot be empty");
  }

  const normInput = normalizeSearchInput(params.rawQuery, {
    make: params.vehicle?.make,
    model: params.vehicle?.model,
    year: params.vehicle?.year,
    partNumber: params.partNumber || params.oemNumber,
    brand: params.brand,
  });

  const queryId = `query-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const defaultCriteria: SearchCriteria = params.criteria || {
    requiredFilters: {},
    rankingHints: {
      prioritizeStock: true,
      prioritizeLowestPrice: true,
    },
  };

  return Object.freeze({
    queryId,
    rawQuery: params.rawQuery.trim(),
    normalizedInput: normInput,
    vehicle: params.vehicle ? Object.freeze({ ...params.vehicle }) : undefined,
    partName: params.partName?.trim(),
    category: params.category,
    brand: params.brand?.trim(),
    manufacturer: params.manufacturer?.trim(),
    partNumber: params.partNumber?.trim(),
    oemNumber: params.oemNumber?.trim(),
    priceRange: params.priceRange ? Object.freeze({ ...params.priceRange }) : undefined,
    condition: params.condition,
    sourceIds: params.sourceIds ? Object.freeze([...params.sourceIds]) : undefined,
    region: params.region?.trim(),
    availabilityOnly: Boolean(params.availabilityOnly),
    criteria: Object.freeze(defaultCriteria),
    createdAt: new Date(),
  });
}
