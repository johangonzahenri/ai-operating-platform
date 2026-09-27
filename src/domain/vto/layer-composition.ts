/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Multi-Layer Composition & Occlusion Resolution Domain Model.
 * 
 * Invariants:
 * 1. Renderer-Agnostic: Pure structural composition with zero CanvasRenderingContext2D, Three.js, WebGL or DOM dependencies.
 * 2. Canonical Layer Hierarchy: Enforces deterministic bottom-to-top z-ordering:
 *    BACKGROUND (0) -> BODY (10) -> GARMENT (20) -> GARMENT_OVERLAY (30) -> ACCESSORY (40) -> OCCLUSION (50).
 * 3. Occlusion-Aware: Correctly resolves visibility when body parts (e.g. crossing arms) occlude garment regions.
 * 4. Graceful Degradation: Missing optional layers (e.g. ACCESSORY) do not fail the composition.
 */

import { ImageAssetReference } from "./virtual-tryon.js";
import {
  LayerKind,
  LayerVisibility,
  SegmentationMask,
  OcclusionMap,
} from "./segmentation-types.js";
import { WarpField2D } from "./warp-field.js";

export type CompositionQuality =
  | "COMPOSITION_VALID"
  | "COMPOSITION_DEGRADED"
  | "INSUFFICIENT_DATA";

export interface LayerSpec {
  readonly layerId: string;
  readonly layerKind: LayerKind;
  readonly visibility: LayerVisibility;
  readonly zIndex: number;
  readonly opacity: number; // 0.0 (transparent) to 1.0 (opaque)
  readonly mask?: SegmentationMask | undefined;
  readonly warpField?: WarpField2D | undefined;
  readonly assetReference?: ImageAssetReference | undefined;
}

export interface LayerCompositionRequest {
  readonly requestId: string;
  readonly tenantId: string;
  readonly layers: readonly LayerSpec[];
  readonly occlusionMap?: OcclusionMap | undefined;
}

export interface LayerCompositionResult {
  readonly requestId: string;
  readonly status: "SUCCESS" | "DEGRADED" | "FAILED";
  readonly compositionQuality: CompositionQuality;
  readonly orderedLayers: readonly LayerSpec[];
  readonly visibleLayerCount: number;
  readonly occludedLayerCount: number;
  readonly overallOpacity: number;
  readonly details: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
}

const CANONICAL_Z_INDEX: Readonly<Record<LayerKind, number>> = {
  BACKGROUND: 0,
  BODY: 10,
  GARMENT: 20,
  GARMENT_OVERLAY: 30,
  ACCESSORY: 40,
  OCCLUSION: 50,
};

export class MultiLayerCompositor {
  /**
   * Sorts and resolves multi-layer visibility based on canonical z-ordering and occlusion mapping.
   */
  public static compose(request: LayerCompositionRequest): LayerCompositionResult {
    const startTime = Date.now();

    if (!request || !Array.isArray(request.layers) || request.layers.length === 0) {
      return {
        requestId: request?.requestId ?? "unknown",
        status: "FAILED",
        compositionQuality: "INSUFFICIENT_DATA",
        orderedLayers: [],
        visibleLayerCount: 0,
        occludedLayerCount: 0,
        overallOpacity: 0,
        details: { error: "No layers provided in composition request" },
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Sort layers according to canonical z-index
    const sortedLayers: LayerSpec[] = [...request.layers].sort((a, b) => {
      const zA = CANONICAL_Z_INDEX[a.layerKind] ?? a.zIndex ?? 0;
      const zB = CANONICAL_Z_INDEX[b.layerKind] ?? b.zIndex ?? 0;
      return zA - zB;
    });

    let visibleCount = 0;
    let occludedCount = 0;
    let isDegraded = false;

    // 2. Resolve layer visibility and apply occlusion modifications
    const resolvedLayers: LayerSpec[] = sortedLayers.map((layer) => {
      let resolvedVisibility: LayerVisibility = layer.visibility;

      if (layer.opacity <= 0.001) {
        resolvedVisibility = "TRANSPARENT_OR_UNKNOWN";
      } else if (request.occlusionMap && layer.layerKind === "GARMENT") {
        if (request.occlusionMap.bodyOccludingRatio > 0.5) {
          resolvedVisibility = "OCCLUDED";
          occludedCount++;
          isDegraded = true;
        } else {
          visibleCount++;
        }
      } else if (resolvedVisibility === "VISIBLE") {
        visibleCount++;
      }

      const canonicalZ = CANONICAL_Z_INDEX[layer.layerKind] ?? layer.zIndex;

      return {
        ...layer,
        zIndex: canonicalZ,
        visibility: resolvedVisibility,
      };
    });

    // Verify presence of mandatory core layers (BODY or GARMENT)
    const hasBody = resolvedLayers.some((l) => l.layerKind === "BODY" && l.visibility !== "NOT_PRESENT");
    const hasGarment = resolvedLayers.some((l) => l.layerKind === "GARMENT" && l.visibility !== "NOT_PRESENT");

    if (!hasBody && !hasGarment) {
      return {
        requestId: request.requestId,
        status: "FAILED",
        compositionQuality: "INSUFFICIENT_DATA",
        orderedLayers: resolvedLayers,
        visibleLayerCount: visibleCount,
        occludedLayerCount: occludedCount,
        overallOpacity: 0,
        details: { error: "Composition missing both BODY and GARMENT layers" },
        durationMs: Date.now() - startTime,
      };
    }

    const compositionQuality: CompositionQuality = isDegraded ? "COMPOSITION_DEGRADED" : "COMPOSITION_VALID";
    const status = isDegraded ? "DEGRADED" : "SUCCESS";

    return {
      requestId: request.requestId,
      status,
      compositionQuality,
      orderedLayers: resolvedLayers,
      visibleLayerCount: visibleCount,
      occludedLayerCount: occludedCount,
      overallOpacity: 1.0,
      details: {
        layerCount: resolvedLayers.length,
        hasOcclusionMap: Boolean(request.occlusionMap),
        bodyOccludingRatio: request.occlusionMap?.bodyOccludingRatio ?? 0,
      },
      durationMs: Date.now() - startTime,
    };
  }
}
