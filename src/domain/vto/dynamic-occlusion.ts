/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Dynamic Depth-Aware Occlusion & Temporal Hysteresis Resolver.
 * 
 * Invariants:
 * 1. Truth Invariant: UNKNOWN_OCCLUSION ≠ VISIBLE and UNKNOWN_OCCLUSION ≠ OCCLUDED.
 * 2. Camera-Relative Depth Comparison: \Delta z = z_{garment} - z_{body}.
 *    - \Delta z < -\epsilon \implies GARMENT_IN_FRONT (Garment renders over body).
 *    - \Delta z > +\epsilon \implies GARMENT_BEHIND / BODY_IN_FRONT (Body occludes garment, e.g. crossing arms).
 *    - |\Delta z| \le \epsilon \implies SAME_DEPTH (Coplanar surface boundary).
 * 3. Temporal Stability: Applies dual-threshold hysteresis (enterOcclusion / exitOcclusion) to prevent edge flickering.
 * 4. Hexagonal Isolation: Pure geometry and numerical comparison without WebGL or Canvas dependencies.
 */

import { DepthMap } from "./depth-types.js";
import { SegmentationMask } from "./segmentation-types.js";

export type DepthOcclusionState =
  | "GARMENT_IN_FRONT"
  | "GARMENT_BEHIND"
  | "BODY_IN_FRONT"
  | "BODY_BEHIND"
  | "SAME_DEPTH"
  | "UNKNOWN";

export interface DepthOcclusionConfig {
  readonly depthEpsilon?: number;              // Threshold \epsilon for SAME_DEPTH classification (default: 0.03)
  readonly enterOcclusionThreshold?: number;   // Threshold to transition from VISIBLE to OCCLUDED (default: 0.04)
  readonly exitOcclusionThreshold?: number;    // Threshold to transition from OCCLUDED to VISIBLE (default: 0.02)
  readonly minConfidenceThreshold?: number;    // Minimum confidence required for valid occlusion assessment (default: 0.4)
}

export interface DynamicOcclusionMap {
  readonly width: number;
  readonly height: number;
  readonly states: readonly DepthOcclusionState[];
  readonly confidence: number;
  readonly garmentInFrontRatio: number;
  readonly garmentBehindRatio: number;
  readonly sameDepthRatio: number;
  readonly unknownRatio: number;
  readonly isDegraded: boolean;
}

export class DynamicOcclusionResolver {
  /**
   * Resolves pixel-wise dynamic depth occlusion between body and garment surfaces.
   */
  public static resolveOcclusion(
    bodyDepth: DepthMap,
    garmentDepth: DepthMap,
    bodyMask?: SegmentationMask,
    garmentMask?: SegmentationMask,
    previousMap?: DynamicOcclusionMap,
    config?: DepthOcclusionConfig
  ): DynamicOcclusionMap {
    const epsilon = config?.depthEpsilon ?? 0.03;
    const enterThresh = config?.enterOcclusionThreshold ?? 0.04;
    const exitThresh = config?.exitOcclusionThreshold ?? 0.02;
    const minConf = config?.minConfidenceThreshold ?? 0.4;

    const width = bodyDepth.width;
    const height = bodyDepth.height;
    const totalPixels = width * height;

    if (
      garmentDepth.width !== width ||
      garmentDepth.height !== height ||
      !Array.isArray(bodyDepth.values) ||
      !Array.isArray(garmentDepth.values)
    ) {
      // Dimensions mismatch or invalid data -> Return fail-closed UNKNOWN map
      return {
        width,
        height,
        states: new Array(totalPixels).fill("UNKNOWN"),
        confidence: 0,
        garmentInFrontRatio: 0,
        garmentBehindRatio: 0,
        sameDepthRatio: 0,
        unknownRatio: 1.0,
        isDegraded: true,
      };
    }

    const states: DepthOcclusionState[] = new Array(totalPixels);
    let frontCount = 0;
    let behindCount = 0;
    let sameCount = 0;
    let unknownCount = 0;

    const overallConfidence = Math.min(bodyDepth.overallConfidence, garmentDepth.overallConfidence);
    const isDegraded = overallConfidence < minConf;

    for (let i = 0; i < totalPixels; i++) {
      const zBody = bodyDepth.values[i];
      const zGarment = garmentDepth.values[i];

      const bodyConf = bodyDepth.confidenceMap ? bodyDepth.confidenceMap[i] : bodyDepth.overallConfidence;
      const garmentConf = garmentDepth.confidenceMap ? garmentDepth.confidenceMap[i] : garmentDepth.overallConfidence;

      // Fail-closed on non-finite depth or low confidence
      if (
        !Number.isFinite(zBody) ||
        !Number.isFinite(zGarment) ||
        bodyConf < minConf ||
        garmentConf < minConf
      ) {
        states[i] = "UNKNOWN";
        unknownCount++;
        continue;
      }

      // Check segmentation masks if present (0 = outside region)
      const inBody = bodyMask ? (bodyMask.data[i] > 0.2) : true;
      const inGarment = garmentMask ? (garmentMask.data[i] > 0.2) : true;

      if (!inBody && !inGarment) {
        states[i] = "UNKNOWN";
        unknownCount++;
        continue;
      }

      const deltaZ = zGarment - zBody; // Nearer objects have smaller Z

      // Temporal hysteresis comparison
      const prevState = previousMap?.states ? previousMap.states[i] : undefined;

      if (prevState === "GARMENT_BEHIND") {
        // Need deltaZ to become significantly negative (exiting occlusion) to switch back to FRONT
        if (deltaZ < -exitThresh) {
          states[i] = "GARMENT_IN_FRONT";
          frontCount++;
        } else {
          states[i] = "GARMENT_BEHIND";
          behindCount++;
        }
      } else if (prevState === "GARMENT_IN_FRONT") {
        // Need deltaZ to exceed enterThresh to transition into BEHIND
        if (deltaZ > enterThresh) {
          states[i] = "GARMENT_BEHIND";
          behindCount++;
        } else {
          states[i] = "GARMENT_IN_FRONT";
          frontCount++;
        }
      } else {
        // Standard static depth comparison
        if (deltaZ < -epsilon) {
          states[i] = "GARMENT_IN_FRONT";
          frontCount++;
        } else if (deltaZ > epsilon) {
          states[i] = "GARMENT_BEHIND";
          behindCount++;
        } else {
          states[i] = "SAME_DEPTH";
          sameCount++;
        }
      }
    }

    return {
      width,
      height,
      states,
      confidence: overallConfidence,
      garmentInFrontRatio: frontCount / totalPixels,
      garmentBehindRatio: behindCount / totalPixels,
      sameDepthRatio: sameCount / totalPixels,
      unknownRatio: unknownCount / totalPixels,
      isDegraded,
    };
  }
}
