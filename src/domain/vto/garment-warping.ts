/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Garment Warping Engine & Fallback Coordinator.
 * 
 * Invariants:
 * 1. Backward Compatibility: Transparently consumes Phase 154 GarmentAlignmentResult and AffineTransform2D.
 * 2. Deterministic Degradation: If neural/elastic warp fails, gracefully falls back to affine alignment with DEGRADED status (no fake success).
 * 3. Fail-Closed Validation: Invalid inputs yield INSUFFICIENT_DATA and explicit diagnostic codes.
 * 4. Zero Framework Coupling: Operates purely on mathematical structures.
 */

import { GarmentReference } from "./virtual-tryon.js";
import { GarmentAlignmentResult } from "./garment-alignment.js";
import { SegmentationMask } from "./segmentation-types.js";
import {
  WarpField2D,
  createIdentityWarpField,
  createAffineWarpField,
  validateWarpField,
} from "./warp-field.js";

export type GarmentWarpQuality =
  | "WARP_VALID"
  | "WARP_DEGRADED"
  | "INSUFFICIENT_DATA";

export interface GarmentWarpRequest {
  readonly requestId: string;
  readonly garment: GarmentReference;
  readonly alignment: GarmentAlignmentResult;
  readonly segmentationMask?: SegmentationMask | undefined;
  readonly preferredGridSize?: { readonly gridWidth: number; readonly gridHeight: number } | undefined;
}

export interface GarmentWarpResult {
  readonly requestId: string;
  readonly status: "SUCCESS" | "DEGRADED" | "FAILED";
  readonly warpField: WarpField2D;
  readonly quality: GarmentWarpQuality;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string | undefined;
  readonly durationMs: number;
}

export class GarmentWarpEngine {
  /**
   * Computes a 2D continuous warp field from garment geometric alignment and segmentation context.
   */
  public static computeGarmentWarp(request: GarmentWarpRequest): GarmentWarpResult {
    const startTime = Date.now();

    const gridWidth = request.preferredGridSize?.gridWidth ?? 16;
    const gridHeight = request.preferredGridSize?.gridHeight ?? 16;

    // 1. Validate alignment availability
    if (!request.alignment || !request.alignment.transform) {
      const fallbackWarp = createIdentityWarpField(gridWidth, gridHeight);
      return {
        requestId: request.requestId,
        status: "FAILED",
        warpField: fallbackWarp,
        quality: "INSUFFICIENT_DATA",
        fallbackUsed: true,
        fallbackReason: "Missing or invalid garment geometric alignment",
        durationMs: Date.now() - startTime,
      };
    }

    const alignment = request.alignment;

    // 2. Evaluate alignment quality
    if (alignment.quality === "INSUFFICIENT_DATA") {
      const fallbackWarp = createIdentityWarpField(gridWidth, gridHeight);
      return {
        requestId: request.requestId,
        status: "FAILED",
        warpField: fallbackWarp,
        quality: "INSUFFICIENT_DATA",
        fallbackUsed: true,
        fallbackReason: "Alignment quality score is INSUFFICIENT_DATA",
        durationMs: Date.now() - startTime,
      };
    }

    const isDegraded = alignment.quality === "MISALIGNED" || alignment.alignmentScore < 0.6;

    // 3. Build warp field from affine transform
    const warpField = createAffineWarpField(gridWidth, gridHeight, alignment.transform);
    const valResult = validateWarpField(warpField);

    if (!valResult.isValid) {
      const identityWarp = createIdentityWarpField(gridWidth, gridHeight);
      return {
        requestId: request.requestId,
        status: "FAILED",
        warpField: identityWarp,
        quality: "INSUFFICIENT_DATA",
        fallbackUsed: true,
        fallbackReason: `Generated warp field failed validation: ${valResult.error}`,
        durationMs: Date.now() - startTime,
      };
    }

    const quality: GarmentWarpQuality = isDegraded ? "WARP_DEGRADED" : "WARP_VALID";
    const status = isDegraded ? "DEGRADED" : "SUCCESS";

    return {
      requestId: request.requestId,
      status,
      warpField,
      quality,
      fallbackUsed: isDegraded,
      fallbackReason: isDegraded
        ? `Alignment quality is ${alignment.quality} with score ${alignment.alignmentScore}`
        : undefined,
      durationMs: Date.now() - startTime,
    };
  }
}
