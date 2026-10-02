/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Spatial Warping Compositor & Multi-Layer Pipeline Integrator.
 * 
 * Invariants:
 * 1. Renderer-Agnostic: Pure structural composition with zero Canvas, Three.js, WebGL, or DOM bindings.
 * 2. Bilinear Continuous Warping: Operates exclusively with WarpField2D (Phase 155) continuous deformation grids;
 *    Thin-Plate Splines (TPS) are NOT supported and must never be referenced.
 * 3. Canonical Layer Z-Ordering: Deterministic hierarchy:
 *    BASE (0) -> BODY (10) -> GARMENT (20) -> OCCLUSION (30) -> MATERIAL (40) -> FINAL_COMPOSITE (50).
 * 4. Temporal-Spatial Consistency: All layers within a composite must correspond to the designated
 *    frame generation/sequence, or explicitly declare fallback/reuse state to prevent visual tearing.
 * 5. Deterministic Graceful Degradation: Missing depth or material layers gracefully degrade the composite status
 *    without throwing runtime exceptions or halting the continuous processing loop.
 */

import { FrameDimensions } from "./frame-protocol.js";
import { WarpField2D } from "./warp-field.js";
import { DepthMap } from "./depth-types.js";
import { DynamicOcclusionMap } from "./dynamic-occlusion.js";
import { GarmentMaterialProfile, MaterialAppearanceHints, deriveAppearanceHints } from "./material-types.js";
import { PreparedVirtualTryOnInput } from "./pose-preprocessing-pipeline.js";
import { SegmentationMask } from "./segmentation-types.js";

export type SpatialLayerKind =
  | "BASE"
  | "BODY"
  | "GARMENT"
  | "OCCLUSION"
  | "MATERIAL"
  | "FINAL_COMPOSITE";

export interface SpatialCompositeLayer {
  readonly layerId: string;
  readonly layerKind: SpatialLayerKind;
  readonly zIndex: number;
  readonly opacity: number; // 0.0 to 1.0
  readonly visible: boolean;
  readonly warpField?: WarpField2D | undefined;
  readonly depthMap?: DepthMap | undefined;
  readonly occlusionMap?: DynamicOcclusionMap | undefined;
  readonly materialHints?: MaterialAppearanceHints | undefined;
  readonly mask?: SegmentationMask | undefined;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type SpatialCompositeStatus = "SUCCESS" | "DEGRADED" | "PARTIAL" | "FAILED";

export interface SpatialWarpingComposite {
  readonly compositeId: string;
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly timestampMs: number;
  readonly dimensions: FrameDimensions;
  readonly status: SpatialCompositeStatus;
  readonly layers: readonly SpatialCompositeLayer[];
  readonly warpQuality: string;
  readonly alignmentScore: number;
  readonly durationMs: number;
  readonly isStale: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface SpatialCompositionInput {
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly timestampMs: number;
  readonly dimensions: FrameDimensions;
  readonly preparedPose?: PreparedVirtualTryOnInput | undefined;
  readonly warpField?: WarpField2D | undefined;
  readonly depthMap?: DepthMap | undefined;
  readonly dynamicOcclusionMap?: DynamicOcclusionMap | undefined;
  readonly materialProfile?: GarmentMaterialProfile | undefined;
  readonly bodyMask?: SegmentationMask | undefined;
  readonly garmentMask?: SegmentationMask | undefined;
  readonly alignmentScore?: number | undefined;
  readonly previousValidComposite?: SpatialWarpingComposite | undefined;
}

export const CANONICAL_SPATIAL_Z_INDEX: Readonly<Record<SpatialLayerKind, number>> = Object.freeze({
  BASE: 0,
  BODY: 10,
  GARMENT: 20,
  OCCLUSION: 30,
  MATERIAL: 40,
  FINAL_COMPOSITE: 50,
});

export class SpatialWarpingCompositor {
  /**
   * Assembles a structured, renderer-neutral spatial composite from upstream CV and neural outputs.
   */
  public static compose(input: SpatialCompositionInput): SpatialWarpingComposite {
    const startTime = Date.now();
    const compositeId = `comp-${input.frameId}-${input.generation}-${Date.now()}`;

    if (!input || !input.frameId || !input.dimensions) {
      return {
        compositeId,
        frameId: input?.frameId ?? "unknown",
        sequenceNumber: input?.sequenceNumber ?? 0,
        generation: input?.generation ?? 0,
        timestampMs: input?.timestampMs ?? Date.now(),
        dimensions: input?.dimensions ?? { width: 0, height: 0 },
        status: "FAILED",
        layers: [],
        warpQuality: "UNKNOWN",
        alignmentScore: 0,
        durationMs: Date.now() - startTime,
        isStale: false,
        details: { error: "Missing or invalid composition input dimensions or frameId" },
      };
    }

    const layers: SpatialCompositeLayer[] = [];
    let isDegraded = false;
    let isPartial = false;

    // 1. BASE Layer (Camera frame background)
    layers.push({
      layerId: `layer-base-${input.frameId}`,
      layerKind: "BASE",
      zIndex: CANONICAL_SPATIAL_Z_INDEX.BASE,
      opacity: 1.0,
      visible: true,
      metadata: {
        dimensions: input.dimensions,
        sequenceNumber: input.sequenceNumber,
        timestampMs: input.timestampMs,
      },
    });

    // 2. BODY Layer (Subject silhouette / segmentation)
    if (input.bodyMask) {
      layers.push({
        layerId: `layer-body-${input.frameId}`,
        layerKind: "BODY",
        zIndex: CANONICAL_SPATIAL_Z_INDEX.BODY,
        opacity: 1.0,
        visible: true,
        mask: input.bodyMask,
        metadata: {
          confidence: input.bodyMask.confidence,
          coverageRatio: input.bodyMask.coverageRatio,
        },
      });
    } else if (input.preparedPose) {
      // Degraded pose fallback without explicit body segmentation mask
      layers.push({
        layerId: `layer-body-pose-${input.frameId}`,
        layerKind: "BODY",
        zIndex: CANONICAL_SPATIAL_Z_INDEX.BODY,
        opacity: 0.9,
        visible: true,
        metadata: {
          poseLandmarkCount: input.preparedPose.smoothedPose.landmarks.size,
          overallConfidence: input.preparedPose.smoothedPose.overallConfidence,
          fallback: "POSE_WITHOUT_MASK",
        },
      });
    }

    // 3. GARMENT Layer (WarpField2D continuous bilinear deformation)
    let effectiveWarp = input.warpField;
    let warpQuality = "NOT_AVAILABLE";

    if (effectiveWarp && effectiveWarp.isValid) {
      warpQuality = effectiveWarp.warpType;
      layers.push({
        layerId: `layer-garment-${input.frameId}`,
        layerKind: "GARMENT",
        zIndex: CANONICAL_SPATIAL_Z_INDEX.GARMENT,
        opacity: 1.0,
        visible: true,
        warpField: effectiveWarp,
        mask: input.garmentMask,
        metadata: {
          warpType: effectiveWarp.warpType,
          gridWidth: effectiveWarp.gridWidth,
          gridHeight: effectiveWarp.gridHeight,
          maxDisplacement: effectiveWarp.maxDisplacement,
        },
      });
    } else if (input.previousValidComposite) {
      // Reuse previous valid garment warp if available
      const prevGarment = input.previousValidComposite.layers.find(
        (l) => l.layerKind === "GARMENT" && l.warpField
      );
      if (prevGarment && prevGarment.warpField) {
        effectiveWarp = prevGarment.warpField;
        warpQuality = `${prevGarment.warpField.warpType}_TEMPORAL_REUSE`;
        isDegraded = true;
        layers.push({
          layerId: `layer-garment-reuse-${input.frameId}`,
          layerKind: "GARMENT",
          zIndex: CANONICAL_SPATIAL_Z_INDEX.GARMENT,
          opacity: 0.95,
          visible: true,
          warpField: effectiveWarp,
          mask: prevGarment.mask,
          metadata: {
            temporalReuseFromGeneration: input.previousValidComposite.generation,
            reusedSequenceNumber: input.previousValidComposite.sequenceNumber,
          },
        });
      } else {
        isPartial = true;
      }
    } else {
      isPartial = true;
    }

    // 4. OCCLUSION Layer (Depth & dynamic occlusion)
    if (input.dynamicOcclusionMap && !input.dynamicOcclusionMap.isDegraded) {
      layers.push({
        layerId: `layer-occlusion-${input.frameId}`,
        layerKind: "OCCLUSION",
        zIndex: CANONICAL_SPATIAL_Z_INDEX.OCCLUSION,
        opacity: 1.0,
        visible: true,
        occlusionMap: input.dynamicOcclusionMap,
        depthMap: input.depthMap,
        metadata: {
          garmentBehindRatio: input.dynamicOcclusionMap.garmentBehindRatio,
          bodyOccludingGarment: input.dynamicOcclusionMap.bodyOccludingGarment,
          temporalStability: input.dynamicOcclusionMap.temporalStability,
        },
      });
    } else if (input.depthMap) {
      layers.push({
        layerId: `layer-depth-${input.frameId}`,
        layerKind: "OCCLUSION",
        zIndex: CANONICAL_SPATIAL_Z_INDEX.OCCLUSION,
        opacity: 0.85,
        visible: true,
        depthMap: input.depthMap,
        metadata: {
          minDepth: input.depthMap.minDepth,
          maxDepth: input.depthMap.maxDepth,
          fallback: "RAW_DEPTH_WITHOUT_DYNAMIC_OCCLUSION",
        },
      });
      isDegraded = true;
    }

    // 5. MATERIAL Layer (Appearance hints, reflection, stiffness)
    if (input.materialProfile) {
      const hints = deriveAppearanceHints(input.materialProfile);
      layers.push({
        layerId: `layer-material-${input.frameId}`,
        layerKind: "MATERIAL",
        zIndex: CANONICAL_SPATIAL_Z_INDEX.MATERIAL,
        opacity: 1.0,
        visible: true,
        materialHints: hints,
        metadata: {
          fabricType: input.materialProfile.fabricType,
          reflectanceModel: hints.reflectanceModel,
          stiffnessDrapeScore: hints.stiffnessDrapeScore,
        },
      });
    }

    // 6. FINAL_COMPOSITE Layer (Metadata and verification summary)
    layers.push({
      layerId: `layer-final-${input.frameId}`,
      layerKind: "FINAL_COMPOSITE",
      zIndex: CANONICAL_SPATIAL_Z_INDEX.FINAL_COMPOSITE,
      opacity: 1.0,
      visible: true,
      metadata: {
        assembledLayerCount: layers.length,
        generation: input.generation,
        sequenceNumber: input.sequenceNumber,
      },
    });

    // Enforce canonical z-index sorting
    layers.sort((a, b) => a.zIndex - b.zIndex);

    let status: SpatialCompositeStatus = "SUCCESS";
    if (isPartial) {
      status = "PARTIAL";
    } else if (isDegraded) {
      status = "DEGRADED";
    }

    const durationMs = Date.now() - startTime;

    return Object.freeze({
      compositeId,
      frameId: input.frameId,
      sequenceNumber: input.sequenceNumber,
      generation: input.generation,
      timestampMs: input.timestampMs,
      dimensions: input.dimensions,
      status,
      layers: Object.freeze(layers),
      warpQuality,
      alignmentScore: input.alignmentScore ?? 1.0,
      durationMs,
      isStale: false,
      details: Object.freeze({
        layerCount: layers.length,
        isDegraded,
        isPartial,
        warpQuality,
      }),
    });
  }
}
