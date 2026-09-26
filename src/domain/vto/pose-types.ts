/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Pose Landmark Representation, Coordinate Systems & Validation.
 * 
 * Invariants:
 * - Provider-neutral, framework-agnostic geometric representations.
 * - Explicit coordinate systems: PIXEL vs NORMALIZED_2D vs NORMALIZED_3D.
 * - UNKNOWN ≠ 0: Missing landmarks are explicitly marked with valid: false or undefined rather than (0,0,0).
 * - Zero external dependencies: pure mathematical types and deterministic validation functions.
 */

// ============================================================================
// 1. COORDINATE SYSTEMS & ENUMS
// ============================================================================

export type CoordinateSystem =
  | "PIXEL_SPACE"     // (x: [0, width], y: [0, height], z?: camera-relative pixels)
  | "NORMALIZED_2D"   // (x: [0.0, 1.0], y: [0.0, 1.0], origin top-left)
  | "NORMALIZED_3D";  // (x: [0.0, 1.0], y: [0.0, 1.0], z: [-1.0, 1.0] relative depth, origin top-left)

export type LandmarkSemanticGroup =
  | "HEAD"
  | "SHOULDERS"
  | "CHEST"
  | "TORSO"
  | "ARMS"
  | "HANDS"
  | "HIPS"
  | "LEGS"
  | "FEET";

export type LandmarkVisibilityStatus =
  | "VISIBLE"
  | "OCCLUDED"
  | "LOW_CONFIDENCE"
  | "OUT_OF_FRAME"
  | "UNKNOWN";

// ============================================================================
// 2. CANONICAL LANDMARK DEFINITIONS (33-Point Standard Mapping)
// ============================================================================

export enum CanonicalLandmarkIndex {
  NOSE = 0,
  LEFT_EYE_INNER = 1,
  LEFT_EYE = 2,
  LEFT_EYE_OUTER = 3,
  RIGHT_EYE_INNER = 4,
  RIGHT_EYE = 5,
  RIGHT_EYE_OUTER = 6,
  LEFT_EAR = 7,
  RIGHT_EAR = 8,
  MOUTH_LEFT = 9,
  MOUTH_RIGHT = 10,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14,
  LEFT_WRIST = 15,
  RIGHT_WRIST = 16,
  LEFT_PINKY = 17,
  RIGHT_PINKY = 18,
  LEFT_INDEX = 19,
  RIGHT_INDEX = 20,
  LEFT_THUMB = 21,
  RIGHT_THUMB = 22,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
  LEFT_HEEL = 29,
  RIGHT_HEEL = 30,
  LEFT_FOOT_INDEX = 31,
  RIGHT_FOOT_INDEX = 32,
}

export interface Landmark2D {
  readonly x: number;
  readonly y: number;
  readonly confidence: number;
  readonly visibility: LandmarkVisibilityStatus;
}

export interface Landmark3D extends Landmark2D {
  readonly z: number; // Depth relative to hips/midpoint (negative = closer to camera, positive = farther)
}

export interface PoseLandmark {
  readonly id: number; // CanonicalLandmarkIndex or custom index
  readonly name: string;
  readonly group: LandmarkSemanticGroup;
  readonly position: Landmark3D;
  readonly isValid: boolean;
}

export interface PoseFrame {
  readonly frameId: string;
  readonly timestampMs: number;
  readonly coordinateSystem: CoordinateSystem;
  readonly imageDimensions?: {
    readonly widthPx: number;
    readonly heightPx: number;
  } | undefined;
  readonly landmarks: ReadonlyMap<number, PoseLandmark>;
  readonly overallConfidence: number;
  readonly isMirrored: boolean;
}

// ============================================================================
// 3. SEMANTIC GROUP RESOLUTION
// ============================================================================

export function getLandmarkSemanticGroup(id: number): LandmarkSemanticGroup {
  if (id <= 10) return "HEAD";
  if (id === 11 || id === 12) return "SHOULDERS";
  if (id === 13 || id === 14 || id === 15 || id === 16) return "ARMS";
  if (id >= 17 && id <= 22) return "HANDS";
  if (id === 23 || id === 24) return "HIPS";
  if (id === 25 || id === 26 || id === 27 || id === 28) return "LEGS";
  if (id >= 29 && id <= 32) return "FEET";
  return "TORSO";
}

export function getLandmarkCanonicalName(id: number): string {
  const name = CanonicalLandmarkIndex[id];
  return name ?? `CUSTOM_LANDMARK_${id}`;
}

// ============================================================================
// 4. COORDINATE NORMALIZATION & VALIDATION
// ============================================================================

export interface CoordinateNormalizationOptions {
  readonly clampToBounds?: boolean;
  readonly minConfidenceThreshold?: number;
}

export function normalizePixelCoordinates(
  pixelX: number,
  pixelY: number,
  pixelZ: number | undefined,
  widthPx: number,
  heightPx: number,
  options?: CoordinateNormalizationOptions
): { x: number; y: number; z: number; isValid: boolean } {
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    return { x: 0, y: 0, z: 0, isValid: false };
  }

  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
    return { x: 0, y: 0, z: 0, isValid: false };
  }

  let normX = pixelX / widthPx;
  let normY = pixelY / heightPx;
  let normZ = Number.isFinite(pixelZ) ? (pixelZ! / Math.max(widthPx, heightPx)) : 0;

  if (options?.clampToBounds) {
    normX = Math.max(0.0, Math.min(1.0, normX));
    normY = Math.max(0.0, Math.min(1.0, normY));
    normZ = Math.max(-1.0, Math.min(1.0, normZ));
  }

  const isValid =
    normX >= -0.5 && normX <= 1.5 &&
    normY >= -0.5 && normY <= 1.5 &&
    normZ >= -2.0 && normZ <= 2.0;

  return { x: normX, y: normY, z: normZ, isValid };
}

export function denormalizeToPixels(
  normX: number,
  normY: number,
  normZ: number | undefined,
  widthPx: number,
  heightPx: number
): { pixelX: number; pixelY: number; pixelZ: number; isValid: boolean } {
  if (
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0 ||
    !Number.isFinite(normX) ||
    !Number.isFinite(normY)
  ) {
    return { pixelX: 0, pixelY: 0, pixelZ: 0, isValid: false };
  }

  return {
    pixelX: normX * widthPx,
    pixelY: normY * heightPx,
    pixelZ: Number.isFinite(normZ) ? normZ! * Math.max(widthPx, heightPx) : 0,
    isValid: true,
  };
}

export function validateLandmark(
  lm: Partial<PoseLandmark>,
  confidenceThreshold = 0.5
): { isValid: boolean; visibility: LandmarkVisibilityStatus; reason?: string } {
  if (lm.id === undefined || !Number.isInteger(lm.id)) {
    return { isValid: false, visibility: "UNKNOWN", reason: "Missing or non-integer landmark ID" };
  }

  if (!lm.position) {
    return { isValid: false, visibility: "UNKNOWN", reason: "Missing position coordinates" };
  }

  const { x, y, z, confidence } = lm.position;

  if (!Number.isFinite(x) || !Number.isFinite(y) || (z !== undefined && !Number.isFinite(z))) {
    return { isValid: false, visibility: "UNKNOWN", reason: "Coordinates contain NaN or Infinity" };
  }

  if (!Number.isFinite(confidence) || confidence < 0.0 || confidence > 1.0) {
    return { isValid: false, visibility: "UNKNOWN", reason: "Confidence must be a finite number in range [0.0, 1.0]" };
  }

  if (confidence < confidenceThreshold) {
    return { isValid: false, visibility: "LOW_CONFIDENCE", reason: `Confidence ${confidence} is below threshold ${confidenceThreshold}` };
  }

  if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) {
    return { isValid: true, visibility: "OUT_OF_FRAME", reason: "Landmark position is outside visible frame" };
  }

  return { isValid: true, visibility: "VISIBLE" };
}
