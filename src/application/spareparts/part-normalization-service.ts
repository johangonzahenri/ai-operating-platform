/**
 * src/application/spareparts/part-normalization-service.ts
 * Deterministic Normalization Service for Automotive Entities (Part Numbers, Brands, Sellers, URLs).
 */

import { PartNumber, normalizePartNumber, createPartNumber, PartNumberType } from "../../domain/spareparts/part-number.js";
import { Brand } from "../../domain/spareparts/part.js";

export interface NormalizedListingInfo {
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly sellerName: string;
  readonly sellerDomain?: string | undefined;
}

export interface NormalizedBrandInfo {
  readonly canonicalName: string;
  readonly normalizedBrandId: string;
  readonly aliasOf?: string | undefined;
  readonly tier: "OEM_GENUINE" | "PREMIUM_AFTERMARKET" | "STANDARD_AFTERMARKET" | "BUDGET_AFTERMARKET" | "UNKNOWN";
}

/**
 * Known canonical brand mappings and standardizations.
 */
const CANONICAL_BRANDS: Readonly<Record<string, { name: string; tier: NormalizedBrandInfo["tier"] }>> = Object.freeze({
  "TOYOTA": { name: "Toyota", tier: "OEM_GENUINE" },
  "NISSAN": { name: "Nissan", tier: "OEM_GENUINE" },
  "HYUNDAI": { name: "Hyundai", tier: "OEM_GENUINE" },
  "CHEVROLET": { name: "Chevrolet", tier: "OEM_GENUINE" },
  "KIA": { name: "Kia", tier: "OEM_GENUINE" },
  "FORD": { name: "Ford", tier: "OEM_GENUINE" },
  "VOLKSWAGEN": { name: "Volkswagen", tier: "OEM_GENUINE" },
  "VW": { name: "Volkswagen", tier: "OEM_GENUINE" },
  "HONDA": { name: "Honda", tier: "OEM_GENUINE" },
  "MITSUBISHI": { name: "Mitsubishi", tier: "OEM_GENUINE" },
  "MAZDA": { name: "Mazda", tier: "OEM_GENUINE" },
  "SUZUKI": { name: "Suzuki", tier: "OEM_GENUINE" },
  "PEUGEOT": { name: "Peugeot", tier: "OEM_GENUINE" },
  "RENAULT": { name: "Renault", tier: "OEM_GENUINE" },
  "BMW": { name: "BMW", tier: "OEM_GENUINE" },
  "MERCEDES": { name: "Mercedes-Benz", tier: "OEM_GENUINE" },
  "MERCEDES-BENZ": { name: "Mercedes-Benz", tier: "OEM_GENUINE" },
  "MERCEDESBENZ": { name: "Mercedes-Benz", tier: "OEM_GENUINE" },
  "BOSCH": { name: "Bosch", tier: "PREMIUM_AFTERMARKET" },
  "DENSO": { name: "Denso", tier: "PREMIUM_AFTERMARKET" },
  "BREMBO": { name: "Brembo", tier: "PREMIUM_AFTERMARKET" },
  "VALEO": { name: "Valeo", tier: "PREMIUM_AFTERMARKET" },
  "MANN": { name: "Mann-Filter", tier: "PREMIUM_AFTERMARKET" },
  "MANN-FILTER": { name: "Mann-Filter", tier: "PREMIUM_AFTERMARKET" },
  "MANNFILTER": { name: "Mann-Filter", tier: "PREMIUM_AFTERMARKET" },
  "MAHLE": { name: "Mahle", tier: "PREMIUM_AFTERMARKET" },
  "NGK": { name: "NGK", tier: "PREMIUM_AFTERMARKET" },
  "TRW": { name: "TRW", tier: "PREMIUM_AFTERMARKET" },
  "FERODO": { name: "Ferodo", tier: "PREMIUM_AFTERMARKET" },
  "SKF": { name: "SKF", tier: "PREMIUM_AFTERMARKET" },
  "GATES": { name: "Gates", tier: "PREMIUM_AFTERMARKET" },
  "INA": { name: "INA", tier: "PREMIUM_AFTERMARKET" },
  "ACDELCO": { name: "ACDelco", tier: "STANDARD_AFTERMARKET" },
  "MONROE": { name: "Monroe", tier: "STANDARD_AFTERMARKET" },
  "KYB": { name: "KYB", tier: "STANDARD_AFTERMARKET" },
  "DELPHI": { name: "Delphi", tier: "PREMIUM_AFTERMARKET" },
});

export class PartNormalizationService {
  /**
   * Normalizes a raw part number while strictly preserving the raw representation and metadata.
   */
  normalizePartNumber(
    rawInput: string,
    options?: {
      readonly brand?: string | undefined;
      readonly type?: PartNumberType | undefined;
      readonly sourceId?: string | undefined;
    }
  ): PartNumber {
    if (!rawInput || typeof rawInput !== "string" || rawInput.trim().length === 0) {
      throw new Error("Raw part number cannot be empty");
    }

    const normalizedValue = normalizePartNumber(rawInput);
    const type = options?.type || "UNKNOWN";

    return createPartNumber({
      rawValue: rawInput,
      type,
      brand: options?.brand,
      sourceId: options?.sourceId,
      confidence: 1.0,
      isPrimary: true,
    });
  }

  /**
   * Normalizes brand names and infers standard manufacturer tier.
   */
  normalizeBrand(rawBrand: string): Brand {
    const trimmed = (rawBrand || "").trim();
    if (!trimmed) {
      return {
        brandId: "brand-generic",
        name: "Generic",
        tier: "UNKNOWN",
      };
    }

    const key = trimmed.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const match = CANONICAL_BRANDS[key];

    if (match) {
      const brandId = `brand-${match.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      return {
        brandId,
        name: match.name,
        tier: match.tier,
      };
    }

    // Capitalize first letters for clean presentation
    const cleanName = trimmed
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    const brandId = `brand-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    return {
      brandId,
      name: cleanName,
      tier: "UNKNOWN",
    };
  }

  /**
   * Normalizes a listing URL by stripping tracking/affiliate query parameters and normalizing domain casing.
   */
  normalizeListingUrl(rawUrl: string): string {
    const trimmed = (rawUrl || "").trim();
    if (!trimmed) {
      return "";
    }

    try {
      const parsed = new URL(trimmed);
      // Strip common marketing and tracking query parameters
      const trackingParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
        "msclkid",
        "ref",
        "ref_",
        "tracking_id",
        "spm",
      ];
      for (const param of trackingParams) {
        parsed.searchParams.delete(param);
      }
      // Remove trailing slash if path is more than just "/"
      let clean = parsed.toString();
      if (clean.endsWith("/") && parsed.pathname.length > 1) {
        clean = clean.slice(0, -1);
      }
      return clean;
    } catch {
      // If not a valid full URL, strip spaces and trailing slash
      return trimmed.replace(/\/+$/, "");
    }
  }

  /**
   * Normalizes seller name by stripping redundant business suffixes (e.g., Ltd, S.A., SpA, Store, Oficial).
   */
  normalizeSellerName(rawSeller: string): string {
    const trimmed = (rawSeller || "").trim();
    if (!trimmed) {
      return "Direct Vendor";
    }

    // Strip common legal entity or marketplace redundant suffixes for identity matching
    const clean = trimmed
      .replace(/\s+(SPA|S\.A\.|LTDA|LLC|INC|GMBH|CORP|OFICIAL|STORE|TIENDA OFICIAL)$/i, "")
      .trim();

    return clean || trimmed;
  }
}
