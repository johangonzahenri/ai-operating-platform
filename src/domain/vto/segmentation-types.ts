/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Segmentation, Occlusion & Multi-Layer Domain Contracts.
 * 
 * Invariants:
 * 1. Provider-Neutral: Abstract contracts completely decoupled from CV frameworks (MediaPipe, ONNX, TFLite, FASHN).
 * 2. Hexagonal Isolation: Pure domain mathematics and data structures with zero DOM, Canvas, Three.js or WebGL dependencies.
 * 3. UNKNOWN ≠ ZERO: Low-confidence, missing or occluded areas are marked explicitly without injecting fake zeros.
 * 4. Distinct Semantics: Provider confidence (0..1 execution score) is strictly separated from pixel probabilities (0..1 spatial values).
 * 5. Fail-Closed Validation: Masks with invalid dimensions, non-finite values, or out-of-range probabilities fail closed.
 */

import { ImageAssetReference } from "./virtual-tryon.js";

// ============================================================================
// 1. LAYER & CLASS TAXONOMIES
// ============================================================================

export type LayerKind =
  | "BACKGROUND"
  | "BODY"
  | "GARMENT"
  | "GARMENT_OVERLAY"
  | "ACCESSORY"
  | "OCCLUSION";

export type LayerVisibility =
  | "VISIBLE"
  | "OCCLUDED"
  | "TRANSPARENT_OR_UNKNOWN"
  | "NOT_PRESENT";

export type SegmentationClass =
  | "PERSON"
  | "GARMENT"
  | "BACKGROUND"
  | "OCCLUSION"
  | "UNKNOWN";

export type MaskFormat =
  | "BINARY_MAP"
  | "SOFT_PROBABILITY_MAP"
  | "INDEXED_LABELS";

export type MaskType =
  | "BODY_MASK"
  | "GARMENT_MASK"
  | "FULL_PARSING"
  | "OCCLUSION_MASK";

export type SegmentationSource =
  | "ON_DEVICE_NEURAL"
  | "SIMULATED_DETERMINISTIC"
  | "CLOUD_ESTIMATE";

export type OcclusionState =
  | "GARMENT_VISIBLE"
  | "BODY_VISIBLE"
  | "GARMENT_OCCLUDED"
  | "BODY_OCCLUDING"
  | "UNKNOWN";

export type SegmentationQuality =
  | "MASK_VALID"
  | "MASK_LOW_CONFIDENCE"
  | "MASK_INCOMPLETE"
  | "INSUFFICIENT_DATA";

// ============================================================================
// 2. SEGMENTATION MASK CONTRACT
// ============================================================================

export interface SegmentationMask {
  readonly width: number;
  readonly height: number;
  readonly format: MaskFormat;
  readonly maskType: MaskType;
  readonly confidence: number; // 0.0 to 1.0 overall provider confidence score
  readonly source: SegmentationSource;
  readonly data: readonly number[]; // Row-major flattened array of length width * height
  readonly checksumSha256?: string | undefined;
}

export interface MaskValidationResult {
  readonly isValid: boolean;
  readonly error?: string | undefined;
  readonly activePixelsCount: number;
  readonly meanValue: number;
}

/**
 * Validates a segmentation mask against dimensional, numerical, and format constraints.
 * Fails closed if data is corrupted, non-finite, out of range, or dimensions mismatch.
 */
export function validateSegmentationMask(mask: SegmentationMask): MaskValidationResult {
  if (!mask || typeof mask !== "object") {
    return { isValid: false, error: "Mask is null or undefined", activePixelsCount: 0, meanValue: 0 };
  }

  if (!Number.isInteger(mask.width) || mask.width <= 0 || !Number.isInteger(mask.height) || mask.height <= 0) {
    return { isValid: false, error: `Invalid mask dimensions: ${mask.width}x${mask.height}`, activePixelsCount: 0, meanValue: 0 };
  }

  if (!Number.isFinite(mask.confidence) || mask.confidence < 0.0 || mask.confidence > 1.0) {
    return { isValid: false, error: `Invalid mask confidence score: ${mask.confidence}`, activePixelsCount: 0, meanValue: 0 };
  }

  const expectedLength = mask.width * mask.height;
  if (!Array.isArray(mask.data) || mask.data.length !== expectedLength) {
    return {
      isValid: false,
      error: `Mask data length mismatch: expected ${expectedLength}, got ${mask.data?.length ?? 0}`,
      activePixelsCount: 0,
      meanValue: 0,
    };
  }

  let activeCount = 0;
  let sum = 0;

  for (let i = 0; i < mask.data.length; i++) {
    const val = mask.data[i];
    if (!Number.isFinite(val)) {
      return {
        isValid: false,
        error: `Non-finite pixel value at index ${i}: ${val}`,
        activePixelsCount: 0,
        meanValue: 0,
      };
    }

    if (mask.format === "SOFT_PROBABILITY_MAP") {
      if (val < 0.0 || val > 1.0) {
        return {
          isValid: false,
          error: `Soft probability out of bounds [0.0, 1.0] at index ${i}: ${val}`,
          activePixelsCount: 0,
          meanValue: 0,
        };
      }
      if (val > 0.5) activeCount++;
    } else if (mask.format === "BINARY_MAP") {
      if (val !== 0 && val !== 1) {
        return {
          isValid: false,
          error: `Binary map value must be 0 or 1 at index ${i}: ${val}`,
          activePixelsCount: 0,
          meanValue: 0,
        };
      }
      if (val === 1) activeCount++;
    } else if (mask.format === "INDEXED_LABELS") {
      if (!Number.isInteger(val) || val < 0) {
        return {
          isValid: false,
          error: `Indexed label must be a non-negative integer at index ${i}: ${val}`,
          activePixelsCount: 0,
          meanValue: 0,
        };
      }
      if (val > 0) activeCount++;
    }

    sum += val;
  }

  const mean = mask.data.length > 0 ? sum / mask.data.length : 0;
  return {
    isValid: true,
    activePixelsCount: activeCount,
    meanValue: mean,
  };
}

// ============================================================================
// 3. OCCLUSION MAP CONTRACT
// ============================================================================

export interface OcclusionMap {
  readonly width: number;
  readonly height: number;
  readonly states: readonly OcclusionState[];
  readonly confidence: number;
  readonly garmentVisibleRatio: number;
  readonly bodyOccludingRatio: number;
}

export function validateOcclusionMap(map: OcclusionMap): boolean {
  if (!map || typeof map !== "object") return false;
  if (!Number.isInteger(map.width) || map.width <= 0 || !Number.isInteger(map.height) || map.height <= 0) return false;
  const expectedLength = map.width * map.height;
  if (!Array.isArray(map.states) || map.states.length !== expectedLength) return false;
  return true;
}

// ============================================================================
// 4. REQUEST / RESULT CONTRACTS
// ============================================================================

export interface SegmentationOptions {
  readonly preferredFormat?: MaskFormat | undefined;
  readonly targetResolution?: { readonly width: number; readonly height: number } | undefined;
  readonly minConfidenceThreshold?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface SegmentationRequest {
  readonly requestId: string;
  readonly tenantId: string;
  readonly sourceImage: ImageAssetReference;
  readonly targetClasses: readonly SegmentationClass[];
  readonly options?: SegmentationOptions | undefined;
}

export interface SegmentationResult {
  readonly requestId: string;
  readonly status: "SUCCESS" | "DEGRADED" | "FAILED";
  readonly masks: Readonly<Record<string, SegmentationMask>>;
  readonly occlusionMap?: OcclusionMap | undefined;
  readonly overallConfidence: number;
  readonly quality: SegmentationQuality;
  readonly durationMs: number;
  readonly providerId: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  } | undefined;
}
