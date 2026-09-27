/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Depth Map & Spatial Geometry Domain Model.
 * 
 * Invariants:
 * 1. Truth Hierarchy: UNKNOWN_DEPTH ≠ ZERO and UNKNOWN_DEPTH ≠ FAR. Missing depth is not falsely set to 0 or 1.
 * 2. Camera-Relative Convention: Coordinate Z represents distance along optical axis (Z >= 0).
 *    Near represents closer to camera (e.g. 0.0 normalized), Far represents further (e.g. 1.0 normalized).
 * 3. Relative vs Metric Purity: Do NOT claim metric depth (meters) without physical hardware sensor calibration.
 * 4. Fail-Closed Validation: Invalid dimensions, non-finite values (NaN/Infinity), or out-of-range depths fail closed.
 * 5. Hexagonal Purity: Pure mathematical structures without WebGL, Three.js, or GPU framework dependencies.
 */

import { ImageAssetReference } from "./virtual-tryon.js";

// ============================================================================
// 1. DEPTH IDENTIFIERS & ENUMS
// ============================================================================

export type DepthType =
  | "RELATIVE_DEPTH"    // Relative depth ordering (monocular estimate)
  | "NORMALIZED_DEPTH"  // Unitless [0.0, 1.0] range (0=near, 1=far)
  | "METRIC_DEPTH"      // Physical depth in meters (requires calibrated sensor)
  | "UNKNOWN_DEPTH";    // Depth unavailable or uncalibrated

export type DepthFormat =
  | "FLOAT32"
  | "FLOAT16"
  | "NORMALIZED_UINT8"
  | "NORMALIZED_UINT16";

export type DepthSource =
  | "ON_DEVICE_NEURAL"
  | "SIMULATED_DETERMINISTIC"
  | "CLOUD_ESTIMATE"
  | "HARDWARE_SENSOR";

export interface DepthRange {
  readonly near: number;
  readonly far: number;
  readonly unit?: "METERS" | "NORMALIZED_UNITLESS" | undefined;
}

// ============================================================================
// 2. DEPTH MAP CONTRACT
// ============================================================================

export interface DepthMap {
  readonly width: number;
  readonly height: number;
  readonly depthType: DepthType;
  readonly format: DepthFormat;
  readonly values: readonly number[]; // Row-major flattened array of length width * height
  readonly confidenceMap?: readonly number[] | undefined; // Optional pixel-wise confidence in [0.0, 1.0]
  readonly range: DepthRange;
  readonly overallConfidence: number; // 0.0 to 1.0 provider-level confidence
  readonly source: DepthSource;
  readonly checksumSha256?: string | undefined;
}

export interface DepthValidationResult {
  readonly isValid: boolean;
  readonly error?: string | undefined;
  readonly minDepth: number;
  readonly maxDepth: number;
  readonly meanDepth: number;
  readonly validPixelsCount: number;
}

/**
 * Validates a depth map for dimensional integrity, numerical sanity, and range boundaries.
 */
export function validateDepthMap(map: DepthMap): DepthValidationResult {
  if (!map || typeof map !== "object") {
    return { isValid: false, error: "DepthMap is null or undefined", minDepth: 0, maxDepth: 0, meanDepth: 0, validPixelsCount: 0 };
  }

  if (!Number.isInteger(map.width) || map.width <= 0 || !Number.isInteger(map.height) || map.height <= 0) {
    return { isValid: false, error: `Invalid depth dimensions: ${map.width}x${map.height}`, minDepth: 0, maxDepth: 0, meanDepth: 0, validPixelsCount: 0 };
  }

  if (!Number.isFinite(map.overallConfidence) || map.overallConfidence < 0.0 || map.overallConfidence > 1.0) {
    return { isValid: false, error: `Invalid overall confidence: ${map.overallConfidence}`, minDepth: 0, maxDepth: 0, meanDepth: 0, validPixelsCount: 0 };
  }

  if (!map.range || !Number.isFinite(map.range.near) || !Number.isFinite(map.range.far) || map.range.near >= map.range.far) {
    return { isValid: false, error: `Invalid depth range: [${map.range?.near}, ${map.range?.far}]`, minDepth: 0, maxDepth: 0, meanDepth: 0, validPixelsCount: 0 };
  }

  const expectedLength = map.width * map.height;
  if (!Array.isArray(map.values) || map.values.length !== expectedLength) {
    return {
      isValid: false,
      error: `Depth values length mismatch: expected ${expectedLength}, got ${map.values?.length ?? 0}`,
      minDepth: 0,
      maxDepth: 0,
      meanDepth: 0,
      validPixelsCount: 0,
    };
  }

  if (map.confidenceMap && (!Array.isArray(map.confidenceMap) || map.confidenceMap.length !== expectedLength)) {
    return {
      isValid: false,
      error: `Confidence map length mismatch: expected ${expectedLength}, got ${map.confidenceMap.length}`,
      minDepth: 0,
      maxDepth: 0,
      meanDepth: 0,
      validPixelsCount: 0,
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let validCount = 0;

  for (let i = 0; i < expectedLength; i++) {
    const val = map.values[i];
    if (!Number.isFinite(val)) {
      return {
        isValid: false,
        error: `Non-finite depth value at index ${i}: ${val}`,
        minDepth: 0,
        maxDepth: 0,
        meanDepth: 0,
        validPixelsCount: 0,
      };
    }

    if (map.depthType === "NORMALIZED_DEPTH" && (val < 0.0 || val > 1.0)) {
      return {
        isValid: false,
        error: `Normalized depth value out of bounds [0.0, 1.0] at index ${i}: ${val}`,
        minDepth: 0,
        maxDepth: 0,
        meanDepth: 0,
        validPixelsCount: 0,
      };
    }

    if (map.confidenceMap) {
      const conf = map.confidenceMap[i];
      if (!Number.isFinite(conf) || conf < 0.0 || conf > 1.0) {
        return {
          isValid: false,
          error: `Confidence map value out of bounds [0.0, 1.0] at index ${i}: ${conf}`,
          minDepth: 0,
          maxDepth: 0,
          meanDepth: 0,
          validPixelsCount: 0,
        };
      }
    }

    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
    validCount++;
  }

  const mean = validCount > 0 ? sum / validCount : 0;
  return {
    isValid: true,
    minDepth: min === Infinity ? 0 : min,
    maxDepth: max === -Infinity ? 0 : max,
    meanDepth: mean,
    validPixelsCount: validCount,
  };
}

// ============================================================================
// 3. DEPTH REQUEST / RESULT CONTRACTS
// ============================================================================

export interface DepthEstimationOptions {
  readonly targetResolution?: { readonly width: number; readonly height: number } | undefined;
  readonly preferredFormat?: DepthFormat | undefined;
  readonly preferredDepthType?: DepthType | undefined;
  readonly minConfidenceThreshold?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface DepthRequest {
  readonly requestId: string;
  readonly tenantId: string;
  readonly sourceImage: ImageAssetReference;
  readonly options?: DepthEstimationOptions | undefined;
}

export interface DepthResult {
  readonly requestId: string;
  readonly status: "SUCCESS" | "DEGRADED" | "FAILED";
  readonly depthMap?: DepthMap | undefined;
  readonly overallConfidence: number;
  readonly durationMs: number;
  readonly providerId: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  } | undefined;
}
