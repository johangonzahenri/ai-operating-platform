/**
 * src/domain/spareparts/part-number.ts
 * Automotive Part Number Aggregates, Types, Normalization & Equivalence.
 */

export type PartNumberType =
  | "OEM"
  | "MPN" // Manufacturer Part Number
  | "SKU"
  | "EAN"
  | "GTIN"
  | "UPC"
  | "CATALOG_NUMBER"
  | "MANUFACTURER_PART_NUMBER"
  | "EXTERNAL_PART_NUMBER"
  | "UNKNOWN";

export const VALID_PART_NUMBER_TYPES: readonly PartNumberType[] = Object.freeze([
  "OEM",
  "MPN",
  "SKU",
  "EAN",
  "GTIN",
  "UPC",
  "CATALOG_NUMBER",
  "MANUFACTURER_PART_NUMBER",
  "EXTERNAL_PART_NUMBER",
  "UNKNOWN",
]);

export interface PartNumber {
  readonly value: string;
  readonly rawValue: string;
  readonly normalizedValue: string;
  readonly type: PartNumberType;
  readonly manufacturer?: string | undefined;
  readonly brand?: string | undefined;
  readonly sourceId?: string | undefined;
  readonly confidence: number; // 0.0 to 1.0
  readonly isPrimary: boolean;
}

export class PartNumberValidationError extends Error {
  readonly code = "PART_NUMBER_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PartNumberValidationError";
  }
}

/**
 * Normalizes an automotive part number by stripping punctuation, spaces, and converting to uppercase.
 * Example: "04465-02220" -> "0446502220"
 * Example: "BOSCH / 0 986 494 657" -> "0986494657" (when brand prefix stripped)
 */
export function normalizePartNumber(raw: string): string {
  if (!raw || typeof raw !== "string") {
    throw new PartNumberValidationError("Part number cannot be empty");
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new PartNumberValidationError("Part number cannot be whitespace only");
  }

  // Remove common brand prefixes separated by colon, slash, or hyphen if present
  let clean = trimmed.replace(/^(BOSCH|DENSO|BREMBO|VALEO|MANN|MAHLE|NGK|ACDELCO|TRW|FERODO|SKF|GATES|INA)\s*[:/\-]\s*/i, "");

  // Strip spaces, dashes, slashes, dots, underscores
  clean = clean.replace(/[\s\-_/.\\]/g, "").toUpperCase();

  if (clean.length === 0) {
    throw new PartNumberValidationError(`Part number contains no alphanumeric characters: '${raw}'`);
  }

  return clean;
}

/**
 * Evaluates whether two part numbers represent equivalent identifiers.
 */
export function arePartNumbersEquivalent(pn1: string | PartNumber, pn2: string | PartNumber): boolean {
  const norm1 = typeof pn1 === "string" ? normalizePartNumber(pn1) : pn1.normalizedValue;
  const norm2 = typeof pn2 === "string" ? normalizePartNumber(pn2) : pn2.normalizedValue;
  return norm1 === norm2;
}

/**
 * Factory to create a validated PartNumber value object.
 */
export function createPartNumber(params: {
  readonly rawValue: string;
  readonly type?: PartNumberType | undefined;
  readonly manufacturer?: string | undefined;
  readonly brand?: string | undefined;
  readonly sourceId?: string | undefined;
  readonly confidence?: number | undefined;
  readonly isPrimary?: boolean | undefined;
}): PartNumber {
  const normalized = normalizePartNumber(params.rawValue);
  const confidence = params.confidence !== undefined ? params.confidence : 1.0;

  if (confidence < 0 || confidence > 1 || isNaN(confidence)) {
    throw new PartNumberValidationError(`Confidence must be between 0.0 and 1.0, got: ${confidence}`);
  }

  const type = params.type || "UNKNOWN";
  if (!VALID_PART_NUMBER_TYPES.includes(type)) {
    throw new PartNumberValidationError(`Invalid PartNumberType: '${type}'`);
  }

  return Object.freeze({
    value: params.rawValue.trim(),
    rawValue: params.rawValue,
    normalizedValue: normalized,
    type,
    manufacturer: params.manufacturer?.trim(),
    brand: params.brand?.trim(),
    sourceId: params.sourceId?.trim(),
    confidence,
    isPrimary: Boolean(params.isPrimary),
  });
}
