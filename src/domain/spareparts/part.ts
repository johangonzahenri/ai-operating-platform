/**
 * src/domain/spareparts/part.ts
 * Automotive Part Entity, Categories, Condition, Position & Specifications.
 */

import { PartNumber, normalizePartNumber } from "./part-number.js";

export type PartCategory =
  | "ENGINE"
  | "BRAKING"
  | "SUSPENSION"
  | "STEERING"
  | "TRANSMISSION"
  | "ELECTRICAL"
  | "COOLING"
  | "FUEL"
  | "EXHAUST"
  | "BODY"
  | "INTERIOR"
  | "LIGHTING"
  | "FILTERS"
  | "LUBRICANTS"
  | "MAINTENANCE"
  | "ACCESSORIES"
  | "WHEELS"
  | "TIRES"
  | "OTHER";

export const VALID_PART_CATEGORIES: readonly PartCategory[] = Object.freeze([
  "ENGINE",
  "BRAKING",
  "SUSPENSION",
  "STEERING",
  "TRANSMISSION",
  "ELECTRICAL",
  "COOLING",
  "FUEL",
  "EXHAUST",
  "BODY",
  "INTERIOR",
  "LIGHTING",
  "FILTERS",
  "LUBRICANTS",
  "MAINTENANCE",
  "ACCESSORIES",
  "WHEELS",
  "TIRES",
  "OTHER",
]);

export type PartCondition =
  | "NEW"
  | "USED"
  | "REFURBISHED"
  | "REMANUFACTURED"
  | "UNKNOWN";

export const VALID_PART_CONDITIONS: readonly PartCondition[] = Object.freeze([
  "NEW",
  "USED",
  "REFURBISHED",
  "REMANUFACTURED",
  "UNKNOWN",
]);

export type PartPosition =
  | "FRONT"
  | "REAR"
  | "LEFT"
  | "RIGHT"
  | "FRONT_LEFT"
  | "FRONT_RIGHT"
  | "REAR_LEFT"
  | "REAR_RIGHT"
  | "CENTER"
  | "UPPER"
  | "LOWER"
  | "INTERNAL"
  | "EXTERNAL"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export const VALID_PART_POSITIONS: readonly PartPosition[] = Object.freeze([
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "FRONT_LEFT",
  "FRONT_RIGHT",
  "REAR_LEFT",
  "REAR_RIGHT",
  "CENTER",
  "UPPER",
  "LOWER",
  "INTERNAL",
  "EXTERNAL",
  "NOT_APPLICABLE",
  "UNKNOWN",
]);

export interface Manufacturer {
  readonly manufacturerId: string;
  readonly name: string;
  readonly country?: string | undefined;
  readonly isOemSupplier: boolean;
}

export interface Brand {
  readonly brandId: string;
  readonly name: string;
  readonly manufacturerId?: string | undefined;
  readonly tier?: "OEM_GENUINE" | "PREMIUM_AFTERMARKET" | "STANDARD_AFTERMARKET" | "BUDGET_AFTERMARKET" | "UNKNOWN" | undefined;
}

export interface PartDimensions {
  readonly lengthMm?: number | undefined;
  readonly widthMm?: number | undefined;
  readonly heightMm?: number | undefined;
  readonly diameterMm?: number | undefined;
  readonly thicknessMm?: number | undefined;
}

export interface Part {
  readonly canonicalPartId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly category: PartCategory;
  readonly subcategory?: string | undefined;
  readonly brand: Brand;
  readonly manufacturer?: Manufacturer | undefined;
  readonly primaryPartNumber: PartNumber;
  readonly alternatePartNumbers: readonly PartNumber[];
  readonly condition: PartCondition;
  readonly position: PartPosition;
  readonly dimensions?: PartDimensions | undefined;
  readonly weightKg?: number | undefined;
  readonly specifications?: Readonly<Record<string, unknown>> | undefined;
}

export class PartValidationError extends Error {
  readonly code = "PART_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PartValidationError";
  }
}

/**
 * Deterministic generation of canonical part ID.
 * Syntax: part:<normalized-brand>:<normalized-part-number>
 */
export function generateCanonicalPartId(brandName: string, primaryPartNumber: string | PartNumber): string {
  if (!brandName || brandName.trim().length === 0) {
    throw new PartValidationError("Brand name is required for canonical part ID");
  }
  const rawPn = typeof primaryPartNumber === "string" ? primaryPartNumber : primaryPartNumber.rawValue;
  const normPn = normalizePartNumber(rawPn);
  const normBrand = brandName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  return `part:${normBrand}:${normPn.toLowerCase()}`;
}

/**
 * Factory to create a validated Part aggregate.
 */
export function createPart(params: {
  readonly name: string;
  readonly description?: string | undefined;
  readonly category: PartCategory;
  readonly subcategory?: string | undefined;
  readonly brand: Brand | string;
  readonly manufacturer?: Manufacturer | undefined;
  readonly primaryPartNumber: PartNumber;
  readonly alternatePartNumbers?: readonly PartNumber[] | undefined;
  readonly condition?: PartCondition | undefined;
  readonly position?: PartPosition | undefined;
  readonly dimensions?: PartDimensions | undefined;
  readonly weightKg?: number | undefined;
  readonly specifications?: Record<string, unknown> | undefined;
}): Part {
  if (!params.name || params.name.trim().length === 0) {
    throw new PartValidationError("Part name cannot be empty");
  }
  if (!VALID_PART_CATEGORIES.includes(params.category)) {
    throw new PartValidationError(`Invalid PartCategory: '${params.category}'`);
  }
  if (!params.primaryPartNumber || !params.primaryPartNumber.normalizedValue) {
    throw new PartValidationError("Primary PartNumber is required");
  }

  const brandObj: Brand = typeof params.brand === "string"
    ? {
        brandId: `brand-${params.brand.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        name: params.brand.trim(),
        tier: "UNKNOWN",
      }
    : params.brand;

  if (!brandObj.name || brandObj.name.trim().length === 0) {
    throw new PartValidationError("Brand name cannot be empty");
  }

  const condition = params.condition || "UNKNOWN";
  if (!VALID_PART_CONDITIONS.includes(condition)) {
    throw new PartValidationError(`Invalid PartCondition: '${condition}'`);
  }

  const position = params.position || "UNKNOWN";
  if (!VALID_PART_POSITIONS.includes(position)) {
    throw new PartValidationError(`Invalid PartPosition: '${position}'`);
  }

  const canonicalId = generateCanonicalPartId(brandObj.name, params.primaryPartNumber);

  return Object.freeze({
    canonicalPartId: canonicalId,
    name: params.name.trim(),
    description: params.description?.trim(),
    category: params.category,
    subcategory: params.subcategory?.trim(),
    brand: Object.freeze(brandObj),
    manufacturer: params.manufacturer ? Object.freeze(params.manufacturer) : undefined,
    primaryPartNumber: params.primaryPartNumber,
    alternatePartNumbers: Object.freeze(params.alternatePartNumbers || []),
    condition,
    position,
    dimensions: params.dimensions ? Object.freeze(params.dimensions) : undefined,
    weightKg: params.weightKg !== undefined && params.weightKg >= 0 ? params.weightKg : undefined,
    specifications: params.specifications ? Object.freeze({ ...params.specifications }) : undefined,
  });
}
