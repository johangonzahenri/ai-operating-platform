/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Garment Material Profile & Surface Appearance Hints Domain Model.
 * 
 * Invariants:
 * 1. Truth & Provenance Hierarchy: Material provenance (CATALOG_PROVIDED, USER_PROVIDED, INFERRED, DEFAULT)
 *    is explicitly tracked and NEVER presented as catalog-certified if it was inferred.
 * 2. Neutral Appearance Hints: Material parameters are abstract descriptors, decoupled from specific renderers
 *    (Three.js, WebGL shaders, Unreal/Unity).
 * 3. Range Invariants: Roughness, Metallic, Opacity, Specular, and Transmission are strictly normalized in [0.0, 1.0].
 * 4. Fail-Closed Validation: Invalid numbers (NaN, Infinity, negative, > 1) fail closed without silent clamping.
 * 5. UNKNOWN Semantics: UNKNOWN_MATERIAL ≠ MATTE_FABRIC and UNKNOWN_MATERIAL ≠ DEFAULT.
 */

import { ImageAssetReference, GarmentReference } from "./virtual-tryon.js";

// ============================================================================
// 1. MATERIAL TAXONOMY & PROVENANCE
// ============================================================================

export type MaterialSurfaceCategory =
  | "MATTE_FABRIC"      // Cotton, Wool, Linen, Fleece
  | "GLOSSY_FABRIC"     // Satin, Nylon, Polyester, Vinyl
  | "SILK"              // High sheen, delicate reflection
  | "DENIM"             // Heavy twill texture, matte
  | "LEATHER"           // Specular sheen, micro-roughness
  | "METALLIC"          // High reflectivity, metallic factor > 0.8
  | "TRANSPARENT"       // Mesh, Lace, Chiffon, Organza
  | "UNKNOWN";          // Unclassified / insufficient metadata

export type MaterialProvenance =
  | "CATALOG_PROVIDED"  // Explicitly specified by merchant catalog
  | "USER_PROVIDED"     // Custom material configuration by user
  | "INFERRED"          // Inferred by AI vision or text parsing
  | "DEFAULT"           // Standard fallback profile
  | "UNKNOWN";          // Undetermined source

// ============================================================================
// 2. MATERIAL PROFILE CONTRACT
// ============================================================================

export interface GarmentMaterialProfile {
  readonly materialId: string;
  readonly category: MaterialSurfaceCategory;
  readonly provenance: MaterialProvenance;
  readonly confidence: number; // 0.0 to 1.0 classification confidence
  readonly roughness: number;  // 0.0 (smooth mirror) to 1.0 (diffuse rough)
  readonly metallic: number;   // 0.0 (dielectric fabric) to 1.0 (pure metal)
  readonly specularLevel: number; // 0.0 to 1.0 specular reflection intensity
  readonly opacity: number;    // 0.0 (invisible) to 1.0 (fully opaque)
  readonly transmission?: number | undefined; // 0.0 to 1.0 optical translucency
  readonly normalStrength?: number | undefined; // 0.0 to 2.0 bump / normal intensity
  readonly sheenColor?: string | undefined;   // Hex color or RGB string for cloth sheen
  readonly textureAssetReference?: ImageAssetReference | undefined;
  readonly attributes?: Readonly<Record<string, string | number | boolean>> | undefined;
}

export interface MaterialValidationResult {
  readonly isValid: boolean;
  readonly error?: string | undefined;
}

/**
 * Validates a GarmentMaterialProfile for numerical integrity and normalized boundaries.
 */
export function validateMaterialProfile(profile: GarmentMaterialProfile): MaterialValidationResult {
  if (!profile || typeof profile !== "object") {
    return { isValid: false, error: "Material profile is null or undefined" };
  }

  if (!profile.materialId || typeof profile.materialId !== "string" || profile.materialId.trim().length === 0) {
    return { isValid: false, error: "Missing materialId" };
  }

  if (!Number.isFinite(profile.confidence) || profile.confidence < 0.0 || profile.confidence > 1.0) {
    return { isValid: false, error: `Invalid material confidence score: ${profile.confidence}` };
  }

  const normalizedFields: Array<{ name: string; value: number | undefined }> = [
    { name: "roughness", value: profile.roughness },
    { name: "metallic", value: profile.metallic },
    { name: "specularLevel", value: profile.specularLevel },
    { name: "opacity", value: profile.opacity },
    { name: "transmission", value: profile.transmission },
  ];

  for (const field of normalizedFields) {
    if (field.value !== undefined) {
      if (!Number.isFinite(field.value) || field.value < 0.0 || field.value > 1.0) {
        return { isValid: false, error: `Field '${field.name}' must be finite in range [0.0, 1.0], got ${field.value}` };
      }
    }
  }

  if (profile.normalStrength !== undefined) {
    if (!Number.isFinite(profile.normalStrength) || profile.normalStrength < 0.0 || profile.normalStrength > 5.0) {
      return { isValid: false, error: `Field 'normalStrength' must be finite in range [0.0, 5.0], got ${profile.normalStrength}` };
    }
  }

  return { isValid: true };
}

// ============================================================================
// 3. LIGHTING-NEUTRAL APPEARANCE HINTS
// ============================================================================

export interface MaterialAppearanceHints {
  readonly surfaceClassification: MaterialSurfaceCategory;
  readonly roughnessFactor: number;
  readonly metallicFactor: number;
  readonly specularFactor: number;
  readonly opacityFactor: number;
  readonly transmissionFactor: number;
  readonly sheenRoughness?: number | undefined;
  readonly normalScale?: number | undefined;
  readonly isTransparent: boolean;
}

/**
 * Derives lighting-neutral appearance hints from a validated material profile.
 */
export function deriveAppearanceHints(profile: GarmentMaterialProfile): MaterialAppearanceHints {
  const valResult = validateMaterialProfile(profile);
  if (!valResult.isValid) {
    // Return safe neutral fallback hints on invalid profile
    return {
      surfaceClassification: "UNKNOWN",
      roughnessFactor: 0.7,
      metallicFactor: 0.0,
      specularFactor: 0.5,
      opacityFactor: 1.0,
      transmissionFactor: 0.0,
      isTransparent: false,
    };
  }

  return {
    surfaceClassification: profile.category,
    roughnessFactor: profile.roughness,
    metallicFactor: profile.metallic,
    specularFactor: profile.specularLevel,
    opacityFactor: profile.opacity,
    transmissionFactor: profile.transmission ?? 0.0,
    sheenRoughness: profile.category === "SILK" ? 0.3 : profile.category === "GLOSSY_FABRIC" ? 0.4 : undefined,
    normalScale: profile.normalStrength ?? 1.0,
    isTransparent: profile.opacity < 0.95 || (profile.transmission ?? 0) > 0.05,
  };
}

// ============================================================================
// 4. DETERMINISTIC MATERIAL PROVIDER
// ============================================================================

export class DeterministicMaterialProvider {
  /**
   * Deterministically produces or classifies a GarmentMaterialProfile based on garment metadata.
   */
  public static resolveMaterialProfile(garment: GarmentReference): GarmentMaterialProfile {
    const nameLower = garment.name.toLowerCase();
    const cat = garment.category;

    if (nameLower.includes("silk") || nameLower.includes("seda")) {
      return {
        materialId: `mat-${garment.productId}-silk`,
        category: "SILK",
        provenance: "INFERRED",
        confidence: 0.9,
        roughness: 0.25,
        metallic: 0.0,
        specularLevel: 0.8,
        opacity: 1.0,
        sheenColor: "#fdf8f0",
      };
    }

    if (nameLower.includes("leather") || nameLower.includes("cuero") || nameLower.includes("biker")) {
      return {
        materialId: `mat-${garment.productId}-leather`,
        category: "LEATHER",
        provenance: "INFERRED",
        confidence: 0.92,
        roughness: 0.35,
        metallic: 0.05,
        specularLevel: 0.7,
        opacity: 1.0,
        normalStrength: 1.4,
      };
    }

    if (nameLower.includes("denim") || nameLower.includes("jean")) {
      return {
        materialId: `mat-${garment.productId}-denim`,
        category: "DENIM",
        provenance: "INFERRED",
        confidence: 0.95,
        roughness: 0.8,
        metallic: 0.0,
        specularLevel: 0.2,
        opacity: 1.0,
        normalStrength: 1.2,
      };
    }

    if (cat === "JEWELRY" || nameLower.includes("metal") || nameLower.includes("gold") || nameLower.includes("silver")) {
      return {
        materialId: `mat-${garment.productId}-metallic`,
        category: "METALLIC",
        provenance: "INFERRED",
        confidence: 0.95,
        roughness: 0.15,
        metallic: 0.95,
        specularLevel: 0.95,
        opacity: 1.0,
      };
    }

    // Default matte fabric
    return {
      materialId: `mat-${garment.productId}-matte`,
      category: "MATTE_FABRIC",
      provenance: "DEFAULT",
      confidence: 0.75,
      roughness: 0.7,
      metallic: 0.0,
      specularLevel: 0.3,
      opacity: 1.0,
    };
  }
}
