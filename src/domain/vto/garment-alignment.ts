/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Garment Anchor & Geometric Alignment Transformation Engine.
 * 
 * Invariants:
 * - Geometric alignment computation, NOT physical cloth simulation.
 * - Framework-agnostic: uses pure Vector2/Vector3 and AffineTransform2D.
 * - Resolves category-specific anchors (UPPER_BODY -> shoulders/chest; LOWER_BODY -> hips/ankles).
 * - Deterministic alignment quality rating: ALIGNED | PARTIALLY_ALIGNED | MISALIGNED | INSUFFICIENT_DATA.
 */

import {
  PoseFrame,
  CanonicalLandmarkIndex,
  Landmark3D,
} from "./pose-types.js";
import { GarmentCategory, GarmentReference } from "./virtual-tryon.js";
import { AnthropometricProfile, calculateMidpoint, euclideanDistance2D } from "./anthropometrics.js";

// ============================================================================
// 1. GEOMETRIC TRANSFORMATION CONTRACTS
// ============================================================================

export type BodyAnchorPointType =
  | "HEAD_TOP"
  | "EYE_MIDPOINT"
  | "SHOULDER_CENTER"
  | "LEFT_SHOULDER"
  | "RIGHT_SHOULDER"
  | "CHEST_CENTER"
  | "WAIST_CENTER"
  | "HIP_CENTER"
  | "LEFT_HIP"
  | "RIGHT_HIP"
  | "LEFT_KNEE"
  | "RIGHT_KNEE"
  | "ANKLE_CENTER"
  | "LEFT_ANKLE"
  | "RIGHT_ANKLE";

export type AlignmentQuality =
  | "ALIGNED"           // High confidence, within bounding tolerances
  | "PARTIALLY_ALIGNED" // Moderate confidence or minor occlusion
  | "MISALIGNED"        // Significant angle or scale deviation
  | "INSUFFICIENT_DATA";// Crucial anchor landmarks missing or occluded

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export interface Vector3D extends Vector2D {
  readonly z: number;
}

export interface AffineTransform2D {
  readonly translation: Vector2D; // Normalized (tx, ty)
  readonly scale: Vector2D;       // (sx, sy) relative to unit garment asset
  readonly rotationDegrees: number; // In-plane rotation angle (-180 to 180)
  readonly anchorOrigin: Vector2D; // Normalized anchor point on body
  readonly boundingBox: {
    readonly xMin: number;
    readonly yMin: number;
    readonly xMax: number;
    readonly yMax: number;
  };
}

export interface GarmentAlignmentResult {
  readonly garmentId: string;
  readonly category: GarmentCategory;
  readonly primaryAnchor: BodyAnchorPointType;
  readonly secondaryAnchor?: BodyAnchorPointType | undefined;
  readonly transform: AffineTransform2D;
  readonly quality: AlignmentQuality;
  readonly alignmentScore: number; // 0.0 to 1.0
  readonly details: {
    readonly anchorConfidence: number;
    readonly scaleFactor: number;
    readonly rotationAngleDeg: number;
    readonly missingAnchors: readonly string[];
  };
}

// ============================================================================
// 2. CATEGORY-TO-ANCHOR MAPPING
// ============================================================================

export function getCategoryPrimaryAnchor(category: GarmentCategory): {
  primary: BodyAnchorPointType;
  secondary?: BodyAnchorPointType;
} {
  switch (category) {
    case "UPPER_BODY":
      return { primary: "SHOULDER_CENTER", secondary: "HIP_CENTER" };
    case "LOWER_BODY":
      return { primary: "HIP_CENTER", secondary: "ANKLE_CENTER" };
    case "FULL_BODY":
      return { primary: "SHOULDER_CENTER", secondary: "ANKLE_CENTER" };
    case "FOOTWEAR":
      return { primary: "ANKLE_CENTER" };
    case "EYEWEAR":
      return { primary: "EYE_MIDPOINT" };
    case "ACCESSORY":
    case "JEWELRY":
      return { primary: "CHEST_CENTER" };
    default:
      return { primary: "SHOULDER_CENTER" };
  }
}

// ============================================================================
// 3. ANCHOR EXTRACTION & TRANSFORMATION
// ============================================================================

export function resolveAnchorPosition(
  anchorType: BodyAnchorPointType,
  frame: PoseFrame
): { position: Landmark3D; isFound: boolean } {
  const lms = frame.landmarks;

  const getLm = (idx: CanonicalLandmarkIndex) => lms.get(idx)?.position;

  switch (anchorType) {
    case "SHOULDER_CENTER": {
      const ls = getLm(CanonicalLandmarkIndex.LEFT_SHOULDER);
      const rs = getLm(CanonicalLandmarkIndex.RIGHT_SHOULDER);
      if (ls && rs) return { position: calculateMidpoint(ls, rs), isFound: true };
      return { position: ls ?? rs ?? { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: false };
    }
    case "LEFT_SHOULDER": {
      const p = getLm(CanonicalLandmarkIndex.LEFT_SHOULDER);
      return { position: p ?? { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: Boolean(p) };
    }
    case "RIGHT_SHOULDER": {
      const p = getLm(CanonicalLandmarkIndex.RIGHT_SHOULDER);
      return { position: p ?? { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: Boolean(p) };
    }
    case "HIP_CENTER": {
      const lh = getLm(CanonicalLandmarkIndex.LEFT_HIP);
      const rh = getLm(CanonicalLandmarkIndex.RIGHT_HIP);
      if (lh && rh) return { position: calculateMidpoint(lh, rh), isFound: true };
      return { position: lh ?? rh ?? { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: false };
    }
    case "CHEST_CENTER": {
      const ls = getLm(CanonicalLandmarkIndex.LEFT_SHOULDER);
      const rs = getLm(CanonicalLandmarkIndex.RIGHT_SHOULDER);
      const lh = getLm(CanonicalLandmarkIndex.LEFT_HIP);
      const rh = getLm(CanonicalLandmarkIndex.RIGHT_HIP);
      if (ls && rs && lh && rh) {
        const midS = calculateMidpoint(ls, rs);
        const midH = calculateMidpoint(lh, rh);
        // Chest is roughly 1/3 down from shoulders to hips
        return {
          position: {
            x: midS.x * 0.7 + midH.x * 0.3,
            y: midS.y * 0.7 + midH.y * 0.3,
            z: (midS.z ?? 0) * 0.7 + (midH.z ?? 0) * 0.3,
            confidence: Math.min(midS.confidence, midH.confidence),
            visibility: "VISIBLE",
          },
          isFound: true,
        };
      }
      return { position: { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: false };
    }
    case "EYE_MIDPOINT": {
      const le = getLm(CanonicalLandmarkIndex.LEFT_EYE);
      const re = getLm(CanonicalLandmarkIndex.RIGHT_EYE);
      if (le && re) return { position: calculateMidpoint(le, re), isFound: true };
      return { position: le ?? re ?? { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: false };
    }
    case "ANKLE_CENTER": {
      const la = getLm(CanonicalLandmarkIndex.LEFT_ANKLE);
      const ra = getLm(CanonicalLandmarkIndex.RIGHT_ANKLE);
      if (la && ra) return { position: calculateMidpoint(la, ra), isFound: true };
      return { position: la ?? ra ?? { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: false };
    }
    default:
      return { position: { x: 0, y: 0, z: 0, confidence: 0, visibility: "UNKNOWN" }, isFound: false };
  }
}

// ============================================================================
// 4. ALIGNMENT ENGINE
// ============================================================================

export function computeGarmentAlignment(
  garment: GarmentReference,
  frame: PoseFrame,
  profile: AnthropometricProfile
): GarmentAlignmentResult {
  const missingAnchors: string[] = [];
  const { primary: primaryAnchorType, secondary: secondaryAnchorType } = getCategoryPrimaryAnchor(garment.category);

  const primaryRes = resolveAnchorPosition(primaryAnchorType, frame);
  if (!primaryRes.isFound) missingAnchors.push(primaryAnchorType);

  let secondaryRes: { position: Landmark3D; isFound: boolean } | undefined;
  if (secondaryAnchorType) {
    secondaryRes = resolveAnchorPosition(secondaryAnchorType, frame);
    if (!secondaryRes.isFound) missingAnchors.push(secondaryAnchorType);
  }

  // 1. Compute Scale & Dimensions based on category and anthropometrics
  let widthSpan = 0.3; // Default normalized width
  let heightSpan = 0.4; // Default normalized height
  let rotDeg = 0;

  if (garment.category === "UPPER_BODY") {
    const ls = frame.landmarks.get(CanonicalLandmarkIndex.LEFT_SHOULDER)?.position;
    const rs = frame.landmarks.get(CanonicalLandmarkIndex.RIGHT_SHOULDER)?.position;
    if (ls && rs) {
      const shoulderWidth = euclideanDistance2D(ls, rs);
      widthSpan = shoulderWidth * 1.25; // 25% ease allowance around shoulders
      heightSpan = (profile.torsoLengthRatio.value > 0 ? profile.torsoLengthRatio.value : 0.35) * 1.1;
      const dy = rs.y - ls.y;
      const dx = rs.x - ls.x;
      rotDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  } else if (garment.category === "LOWER_BODY") {
    const lh = frame.landmarks.get(CanonicalLandmarkIndex.LEFT_HIP)?.position;
    const rh = frame.landmarks.get(CanonicalLandmarkIndex.RIGHT_HIP)?.position;
    if (lh && rh) {
      const hipWidth = euclideanDistance2D(lh, rh);
      widthSpan = hipWidth * 1.3;
      heightSpan = (profile.legLengthRatio.value > 0 ? profile.legLengthRatio.value : 0.45);
    }
  } else if (garment.category === "FULL_BODY") {
    widthSpan = 0.35;
    heightSpan = (profile.estimatedHeightRatio.value > 0 ? profile.estimatedHeightRatio.value : 0.7) * 0.85;
  }

  const anchorPos = primaryRes.position;
  const translation: Vector2D = { x: anchorPos.x, y: anchorPos.y };
  const scale: Vector2D = { x: widthSpan, y: heightSpan };

  const boundingBox = {
    xMin: translation.x - widthSpan / 2.0,
    yMin: translation.y,
    xMax: translation.x + widthSpan / 2.0,
    yMax: translation.y + heightSpan,
  };

  const transform: AffineTransform2D = {
    translation,
    scale,
    rotationDegrees: Number(rotDeg.toFixed(2)),
    anchorOrigin: { x: anchorPos.x, y: anchorPos.y },
    boundingBox,
  };

  // 2. Determine Alignment Quality & Score
  const anchorConf = primaryRes.position.confidence;
  let quality: AlignmentQuality = "ALIGNED";
  let score = 0.95;

  if (missingAnchors.length > 0) {
    quality = "INSUFFICIENT_DATA";
    score = 0.2;
  } else if (anchorConf < 0.4) {
    quality = "MISALIGNED";
    score = 0.45;
  } else if (anchorConf < 0.7 || Math.abs(rotDeg) > 35) {
    quality = "PARTIALLY_ALIGNED";
    score = 0.75;
  }

  return Object.freeze({
    garmentId: garment.productId,
    category: garment.category,
    primaryAnchor: primaryAnchorType,
    secondaryAnchor: secondaryAnchorType,
    transform,
    quality,
    alignmentScore: Number(score.toFixed(2)),
    details: {
      anchorConfidence: Number(anchorConf.toFixed(2)),
      scaleFactor: Number(widthSpan.toFixed(3)),
      rotationAngleDeg: Number(rotDeg.toFixed(2)),
      missingAnchors,
    },
  });
}
