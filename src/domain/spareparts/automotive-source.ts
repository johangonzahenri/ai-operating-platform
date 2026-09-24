import { StructuredClaimEvidence } from "../agent/agent-taxonomy.js";

export type AutomotiveSourceType =
  | "OFFICIAL_OEM"
  | "OEM_DEALER"
  | "AUTOMOTIVE_CATALOG"
  | "AFTERMARKET_CATALOG"
  | "MARKETPLACE"
  | "RETAILER"
  | "SPECIALIZED_RETAILER"
  | "WHOLESALER"
  | "PARTS_DISTRIBUTOR"
  | "USED_PARTS_MARKETPLACE"
  | "SEARCH_ENGINE"
  | "PRICE_AGGREGATOR"
  | "MANUFACTURER"
  | "LOCAL_STORE"
  | "COMMUNITY"
  | "OTHER";

export const VALID_AUTOMOTIVE_SOURCE_TYPES: readonly AutomotiveSourceType[] = Object.freeze([
  "OFFICIAL_OEM",
  "OEM_DEALER",
  "AUTOMOTIVE_CATALOG",
  "AFTERMARKET_CATALOG",
  "MARKETPLACE",
  "RETAILER",
  "SPECIALIZED_RETAILER",
  "WHOLESALER",
  "PARTS_DISTRIBUTOR",
  "USED_PARTS_MARKETPLACE",
  "SEARCH_ENGINE",
  "PRICE_AGGREGATOR",
  "MANUFACTURER",
  "LOCAL_STORE",
  "COMMUNITY",
  "OTHER",
]);

export type AutomotiveAccessMethod =
  | "OFFICIAL_API"
  | "PUBLIC_API"
  | "PARTNER_API"
  | "WEB_PAGE"
  | "STRUCTURED_DATA"
  | "SEARCH_RESULT"
  | "FEED"
  | "CATALOG_FILE"
  | "DATABASE_EXPORT"
  | "MANUAL_REVIEW"
  | "EXTERNAL_AGENT"
  | "NOT_SUPPORTED";

export const VALID_AUTOMOTIVE_ACCESS_METHODS: readonly AutomotiveAccessMethod[] = Object.freeze([
  "OFFICIAL_API",
  "PUBLIC_API",
  "PARTNER_API",
  "WEB_PAGE",
  "STRUCTURED_DATA",
  "SEARCH_RESULT",
  "FEED",
  "CATALOG_FILE",
  "DATABASE_EXPORT",
  "MANUAL_REVIEW",
  "EXTERNAL_AGENT",
  "NOT_SUPPORTED",
]);

export type AutomotiveSourceStatus =
  | "DISCOVERED"
  | "ASSESSED"
  | "VERIFIED"
  | "AVAILABLE"
  | "RESTRICTED"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "DISABLED"
  | "DEPRECATED";

export const VALID_AUTOMOTIVE_SOURCE_STATUSES: readonly AutomotiveSourceStatus[] = Object.freeze([
  "DISCOVERED",
  "ASSESSED",
  "VERIFIED",
  "AVAILABLE",
  "RESTRICTED",
  "DEGRADED",
  "UNAVAILABLE",
  "DISABLED",
  "DEPRECATED",
]);

export type CapabilitySupportLevel = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN" | "DEGRADED";

export interface SourceDataCapabilities {
  readonly searchByText: CapabilitySupportLevel;
  readonly searchByPartNumber: CapabilitySupportLevel;
  readonly searchByOemNumber: CapabilitySupportLevel;
  readonly searchByVehicle: CapabilitySupportLevel;
  readonly searchByVin: CapabilitySupportLevel;
  readonly getProductDetail: CapabilitySupportLevel;
  readonly getPrice: CapabilitySupportLevel;
  readonly getStockAvailability: CapabilitySupportLevel;
  readonly getFitmentMatrix: CapabilitySupportLevel;
  readonly getCrossReferences: CapabilitySupportLevel;
  readonly getSellerReputation: CapabilitySupportLevel;
  readonly getReviews: CapabilitySupportLevel;
  readonly getShippingOptions: CapabilitySupportLevel;
  readonly providesEvidence: CapabilitySupportLevel;
}

export interface SourceAccessPolicy {
  readonly allowed: boolean;
  readonly requiresAuthentication: boolean;
  readonly credentialsType?: "API_KEY" | "OAUTH2" | "BASIC" | "NONE" | undefined;
  readonly rateLimitPerMinute?: number | undefined;
  readonly paginationSupported: boolean;
  readonly javascriptRequired: boolean;
  readonly antiBotDetected: boolean;
  readonly termsUrl?: string | undefined;
  readonly robotsAllowed: boolean;
  readonly restrictionsNote?: string | undefined;
}

export interface SourceCoverage {
  readonly regions: readonly string[]; // e.g. ["CL", "LATAM", "GLOBAL", "US", "EU"]
  readonly vehicleMakes: readonly string[]; // e.g. ["Toyota", "Chevrolet", "Hyundai", "Nissan", "ALL"]
  readonly partCategories: readonly string[]; // e.g. ["brakes", "filters", "ignition", "suspension", "engine", "ALL"]
  readonly supportedPartIdentifiers: readonly string[]; // e.g. ["OEM", "MPN", "SKU", "EAN", "GTIN"]
}

export interface SourceTrustRating {
  readonly sourceReliability: number; // 0.0 to 1.0
  readonly dataCompleteness: number; // 0.0 to 1.0
  readonly fitmentConfidence: number; // 0.0 to 1.0
  readonly priceFreshnessHours: number;
  readonly evidenceQualityScore: number; // 0.0 to 1.0
  readonly lastEvaluatedAt?: Date | undefined;
}

export interface AutomotiveSource {
  readonly sourceId: string;
  readonly name: string;
  readonly displayName: string;
  readonly sourceType: AutomotiveSourceType;
  readonly primaryUrl: string;
  readonly baseUrl?: string | undefined;
  readonly accessMethod: AutomotiveAccessMethod;
  readonly accessPolicy: SourceAccessPolicy;
  readonly capabilities: SourceDataCapabilities;
  readonly coverage: SourceCoverage;
  readonly trustRating: SourceTrustRating;
  readonly status: AutomotiveSourceStatus;
  readonly allowedAgentTypes: readonly string[];
  readonly lastCheckedAt?: Date | undefined;
  readonly lastSuccessfulAccessAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class AutomotiveSourceValidationError extends Error {
  readonly code = "SOURCE_VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "AutomotiveSourceValidationError";
  }
}

export class AutomotiveSourceNotFoundError extends Error {
  readonly code = "SOURCE_NOT_FOUND";
  constructor(readonly sourceId: string) {
    super(`Automotive source not found: '${sourceId}'`);
    this.name = "AutomotiveSourceNotFoundError";
  }
}

export class AutomotiveSourceRestrictedError extends Error {
  readonly code = "SOURCE_RESTRICTED";
  constructor(readonly sourceId: string, message: string) {
    super(`Automotive source '${sourceId}' is restricted: ${message}`);
    this.name = "AutomotiveSourceRestrictedError";
  }
}
