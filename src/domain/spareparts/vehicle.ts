/**
 * src/domain/spareparts/vehicle.ts
 * Automotive Vehicle Domain Aggregates, Variants, Identifiers & Normalization.
 */

export type VehicleIdentificationType =
  | "CANONICAL"
  | "VIN"
  | "OEM_CODE"
  | "CATALOG_ID"
  | "KBA"
  | "EXTERNAL_SOURCE";

export interface VehicleIdentifier {
  readonly type: VehicleIdentificationType;
  readonly value: string;
  readonly sourceId?: string | undefined;
  readonly isPrimary: boolean;
}

export interface VehicleSpecification {
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly generation?: string | undefined;
  readonly trim?: string | undefined;
  readonly engine?: string | undefined;
  readonly engineCode?: string | undefined;
  readonly displacementLiters?: number | undefined;
  readonly fuelType?: "GASOLINE" | "DIESEL" | "HYBRID" | "ELECTRIC" | "FLEX" | "LPG" | "UNKNOWN" | undefined;
  readonly transmission?: "MANUAL" | "AUTOMATIC" | "CVT" | "DUAL_CLUTCH" | "UNKNOWN" | undefined;
  readonly driveType?: "FWD" | "RWD" | "AWD" | "4WD" | "4X4" | "UNKNOWN" | undefined;
  readonly bodyType?: "SEDAN" | "HATCHBACK" | "SUV" | "PICKUP" | "COUPE" | "WAGON" | "VAN" | "CONVERTIBLE" | "OTHER" | undefined;
  readonly market?: "CL" | "LATAM" | "US" | "EU" | "JP" | "GLOBAL" | string | undefined;
  readonly country?: string | undefined;
}

export interface VehicleVariant {
  readonly variantId: string;
  readonly variantName: string;
  readonly specification: VehicleSpecification;
}

export interface VehicleProfile {
  readonly canonicalVehicleId: string;
  readonly rawMake: string;
  readonly rawModel: string;
  readonly normalizedMake: string;
  readonly normalizedModel: string;
  readonly year: number;
  readonly specification: VehicleSpecification;
  readonly identifiers: readonly VehicleIdentifier[];
  readonly variants?: readonly VehicleVariant[] | undefined;
}

export class VehicleValidationError extends Error {
  readonly code = "VEHICLE_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "VehicleValidationError";
  }
}

/**
 * Normalizes a vehicle manufacturer make string.
 * Example: "TOYOTA MOTOR CORP" -> "Toyota"
 */
export function normalizeVehicleMake(rawMake: string): string {
  if (!rawMake || typeof rawMake !== "string") {
    throw new VehicleValidationError("Vehicle make cannot be empty");
  }
  const clean = rawMake.trim();
  if (clean.length === 0) {
    throw new VehicleValidationError("Vehicle make cannot be whitespace only");
  }

  const upper = clean.toUpperCase();
  const KNOWN_MAKES: Record<string, string> = {
    "TOYOTA": "Toyota",
    "TOYOTA MOTOR": "Toyota",
    "TOYOTA MOTOR CORP": "Toyota",
    "CHEVROLET": "Chevrolet",
    "CHEVY": "Chevrolet",
    "HYUNDAI": "Hyundai",
    "HYUNDAI MOTOR": "Hyundai",
    "NISSAN": "Nissan",
    "SUZUKI": "Suzuki",
    "VOLKSWAGEN": "Volkswagen",
    "VW": "Volkswagen",
    "FORD": "Ford",
    "HONDA": "Honda",
    "KIA": "Kia",
    "MAZDA": "Mazda",
    "MERCEDES": "Mercedes-Benz",
    "MERCEDES-BENZ": "Mercedes-Benz",
    "MERCEDES BENZ": "Mercedes-Benz",
    "BMW": "BMW",
    "PEUGEOT": "Peugeot",
    "RENAULT": "Renault",
    "MITSUBISHI": "Mitsubishi",
    "SUBARU": "Subaru",
    "AUDI": "Audi",
    "JEEP": "Jeep",
    "FIAT": "Fiat",
    "CHERY": "Chery",
    "MG": "MG",
    "GREAT WALL": "Great Wall",
    "HAVAL": "Haval",
    "GEELY": "Geely",
    "CHANGAN": "Changan",
    "JAC": "JAC",
    "MAXUS": "Maxus",
  };

  if (KNOWN_MAKES[upper]) {
    return KNOWN_MAKES[upper];
  }

  // Title-case generic normalization
  return clean
    .toLowerCase()
    .split(/[\s-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Normalizes a vehicle model string.
 * Example: "COROLLA SEDAN (E170)" -> "Corolla"
 */
export function normalizeVehicleModel(rawModel: string): string {
  if (!rawModel || typeof rawModel !== "string") {
    throw new VehicleValidationError("Vehicle model cannot be empty");
  }
  const clean = rawModel.trim();
  if (clean.length === 0) {
    throw new VehicleValidationError("Vehicle model cannot be whitespace only");
  }

  // Remove common parenthetical noise like "(E170)" or "Sedan" suffix if separate
  const stripped = clean
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+(Sedan|Hatchback|Coupe|SUV|Wagon|Station Wagon)\s*$/i, "")
    .trim();

  return stripped
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Deterministic generation of canonical vehicle ID.
 * Syntax: veh:<normalized-make>:<normalized-model>:<year>[:<generation>][:<engine>]
 */
export function generateCanonicalVehicleId(
  make: string,
  model: string,
  year: number,
  generation?: string,
  engine?: string,
  market?: string
): string {
  if (!year || isNaN(year) || year < 1900 || year > 2100) {
    throw new VehicleValidationError(`Invalid vehicle year: ${year}`);
  }
  const normMake = normalizeVehicleMake(make).toLowerCase().replace(/[^a-z0-9]/g, "");
  const normModel = normalizeVehicleModel(model).toLowerCase().replace(/[^a-z0-9]/g, "");

  const parts = ["veh", normMake, normModel, String(year)];

  if (generation && generation.trim().length > 0) {
    parts.push(generation.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  }
  if (engine && engine.trim().length > 0) {
    parts.push(engine.trim().toLowerCase().replace(/[^a-z0-9.]/g, ""));
  }
  if (market && market.trim().length > 0) {
    parts.push(market.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  }

  return parts.join(":");
}

/**
 * Creates a validated VehicleProfile.
 */
export function createVehicleProfile(
  spec: VehicleSpecification,
  identifiers: VehicleIdentifier[] = []
): VehicleProfile {
  if (!spec.make) {
    throw new VehicleValidationError("Vehicle make is required");
  }
  if (!spec.model) {
    throw new VehicleValidationError("Vehicle model is required");
  }
  if (!spec.year || spec.year < 1900 || spec.year > 2100) {
    throw new VehicleValidationError(`Invalid vehicle year: ${spec.year}`);
  }

  const normMake = normalizeVehicleMake(spec.make);
  const normModel = normalizeVehicleModel(spec.model);
  const canonicalId = generateCanonicalVehicleId(
    normMake,
    normModel,
    spec.year,
    spec.generation,
    spec.engine,
    spec.market
  );

  const fullIdentifiers: VehicleIdentifier[] = [
    {
      type: "CANONICAL",
      value: canonicalId,
      isPrimary: true,
    },
    ...identifiers.filter(i => i.type !== "CANONICAL"),
  ];

  return Object.freeze({
    canonicalVehicleId: canonicalId,
    rawMake: spec.make,
    rawModel: spec.model,
    normalizedMake: normMake,
    normalizedModel: normModel,
    year: spec.year,
    specification: Object.freeze({ ...spec }),
    identifiers: Object.freeze(fullIdentifiers),
  });
}
