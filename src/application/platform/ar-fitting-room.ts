/**
 * AR Asset Governance & Virtual Fitting Room
 * AI Operating Platform - Application Layer Integration
 */

export type ARCategory = "footwear" | "apparel" | "outerwear" | "accessories";
export type ARProfile = "Nova" | "Sora" | "Mateo";

export type ARStatus =
  | "AR_AVAILABLE"
  | "AR_NOT_AVAILABLE"
  | "AR_ASSET_INVALID"
  | "AR_ASSET_OUTDATED"
  | "AR_PREVIEW_FAILED";

export interface ARProfileDefinition {
  readonly id: ARProfile;
  readonly name: string;
  readonly build: "Athletic / Slim" | "Standard / Regular" | "Broad / Plus";
  readonly defaultChestCm: number;
  readonly defaultWaistCm: number;
  readonly defaultHipsCm: number;
  readonly defaultFootLengthCm: number;
}

export const AR_PROFILES: Readonly<Record<ARProfile, ARProfileDefinition>> = Object.freeze({
  Nova: {
    id: "Nova",
    name: "Nova",
    build: "Athletic / Slim",
    defaultChestCm: 88,
    defaultWaistCm: 72,
    defaultHipsCm: 92,
    defaultFootLengthCm: 25.5,
  },
  Sora: {
    id: "Sora",
    name: "Sora",
    build: "Standard / Regular",
    defaultChestCm: 98,
    defaultWaistCm: 82,
    defaultHipsCm: 100,
    defaultFootLengthCm: 27.0,
  },
  Mateo: {
    id: "Mateo",
    name: "Mateo",
    build: "Broad / Plus",
    defaultChestCm: 110,
    defaultWaistCm: 96,
    defaultHipsCm: 112,
    defaultFootLengthCm: 28.5,
  },
});

export interface ARAsset {
  readonly urn: string;
  readonly category: ARCategory;
  readonly productSlug: string;
  readonly version: string;
  readonly status: ARStatus;
  readonly supportedProfiles: readonly ARProfile[];
  readonly previewUrl?: string | undefined;
}

const URN_REGEX = /^urn:tentaciones:ar:(footwear|apparel|outerwear|accessories):([a-z0-9-]+)$/;
const SEMVER_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function parseAndValidateUrn(urn: string): { readonly category: ARCategory; readonly productSlug: string } | null {
  const match = urn.trim().match(URN_REGEX);
  if (!match) return null;
  return {
    category: match[1] as ARCategory,
    productSlug: match[2] as string,
  };
}

export function isValidSemVer(version: string): boolean {
  return SEMVER_REGEX.test(version.trim());
}

export interface SizeRecommendationInput {
  readonly category: ARCategory;
  readonly chestCm?: number | undefined;
  readonly waistCm?: number | undefined;
  readonly hipsCm?: number | undefined;
  readonly footLengthCm?: number | undefined;
  readonly profile?: ARProfile | undefined;
}

export interface SizeRecommendationResult {
  readonly recommendedSize: string;
  readonly confidence: number;
  readonly fitSummary: string;
  readonly appliedCategory: ARCategory;
  readonly measurementsEvaluated: Readonly<Record<string, number>>;
}

export function recommendSize(input: SizeRecommendationInput): SizeRecommendationResult {
  const profileDefaults = input.profile ? AR_PROFILES[input.profile] : AR_PROFILES.Sora;
  const chest = input.chestCm ?? profileDefaults.defaultChestCm;
  const waist = input.waistCm ?? profileDefaults.defaultWaistCm;
  const hips = input.hipsCm ?? profileDefaults.defaultHipsCm;
  const foot = input.footLengthCm ?? profileDefaults.defaultFootLengthCm;

  if (input.category === "footwear") {
    let size = "42";
    if (foot < 24.5) size = "38";
    else if (foot < 25.5) size = "39";
    else if (foot < 26.5) size = "40";
    else if (foot < 27.5) size = "41";
    else if (foot <= 28.5) size = "42";
    else if (foot < 29.5) size = "43";
    else size = "44";

    return {
      recommendedSize: size,
      confidence: 0.95,
      fitSummary: `Talla ${size} recomendada para longitud de pie de ${foot} cm (calce estándar).`,
      appliedCategory: "footwear",
      measurementsEvaluated: { footLengthCm: foot },
    };
  }

  let size = "M";
  if (chest < 92 && waist < 76) {
    size = "S";
  } else if (chest <= 102 && waist <= 86) {
    size = "M";
  } else if (chest <= 112 && waist <= 96) {
    size = "L";
  } else {
    size = "XL";
  }

  return {
    recommendedSize: size,
    confidence: 0.92,
    fitSummary: `Talla ${size} recomendada con base en pecho ${chest} cm y cintura ${waist} cm.`,
    appliedCategory: input.category,
    measurementsEvaluated: { chestCm: chest, waistCm: waist, hipsCm: hips },
  };
}
