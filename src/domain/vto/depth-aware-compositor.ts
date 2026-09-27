/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Depth-Aware Multi-Layer Compositor & Material Integration Engine.
 * 
 * Invariants:
 * 1. Depth-Modified Ordering: Physical depth overrides static Z-order when dynamic depth occlusion
 *    detects that a layer is physically behind an occluder.
 * 2. Deterministic Degradation: If depth estimation is unavailable or degraded, gracefully falls back
 *    to Phase 155 static semantic Z-order with explicit DEGRADED status (depthOrderApplied = false).
 * 3. Renderer-Neutral: Pure structural layer composition without Canvas, WebGL, or DOM calls.
 * 4. Material Hint Propagation: Carries lighting-neutral material appearance hints for downstream rendering.
 */

import { LayerSpec, CompositionQuality } from "./layer-composition.js";
import { DepthMap } from "./depth-types.js";
import { DynamicOcclusionMap, DepthOcclusionState } from "./dynamic-occlusion.js";
import { GarmentMaterialProfile, MaterialAppearanceHints, deriveAppearanceHints } from "./material-types.js";

export interface DepthAwareLayerSpec extends LayerSpec {
  readonly depthMap?: DepthMap | undefined;
  readonly materialProfile?: GarmentMaterialProfile | undefined;
  readonly materialHints?: MaterialAppearanceHints | undefined;
  readonly depthOcclusionState?: DepthOcclusionState | undefined;
}

export interface DepthAwareCompositionRequest {
  readonly requestId: string;
  readonly tenantId: string;
  readonly layers: readonly DepthAwareLayerSpec[];
  readonly dynamicOcclusionMap?: DynamicOcclusionMap | undefined;
  readonly fallbackToStaticZOrder?: boolean | undefined;
}

export interface DepthAwareCompositionResult {
  readonly requestId: string;
  readonly status: "SUCCESS" | "DEGRADED" | "FAILED";
  readonly compositionQuality: CompositionQuality;
  readonly orderedLayers: readonly DepthAwareLayerSpec[];
  readonly depthOrderApplied: boolean;
  readonly occludedLayerCount: number;
  readonly visibleLayerCount: number;
  readonly durationMs: number;
  readonly details: Readonly<Record<string, unknown>>;
}

const CANONICAL_BASE_Z_INDEX: Readonly<Record<string, number>> = {
  BACKGROUND: 0,
  BODY: 10,
  GARMENT: 20,
  GARMENT_OVERLAY: 30,
  ACCESSORY: 40,
  OCCLUSION: 50,
};

export class DepthAwareCompositor {
  /**
   * Composes layers taking into account 3D relative depth, dynamic occlusions, and material appearance.
   */
  public static compose(request: DepthAwareCompositionRequest): DepthAwareCompositionResult {
    const startTime = Date.now();

    if (!request || !Array.isArray(request.layers) || request.layers.length === 0) {
      return {
        requestId: request?.requestId ?? "unknown",
        status: "FAILED",
        compositionQuality: "INSUFFICIENT_DATA",
        orderedLayers: [],
        depthOrderApplied: false,
        occludedLayerCount: 0,
        visibleLayerCount: 0,
        durationMs: Date.now() - startTime,
        details: { error: "Empty or missing layer list in depth-aware composition request" },
      };
    }

    let isDepthApplicable = Boolean(request.dynamicOcclusionMap && !request.dynamicOcclusionMap.isDegraded);
    if (request.fallbackToStaticZOrder) {
      isDepthApplicable = false;
    }

    let occludedCount = 0;
    let visibleCount = 0;
    let isDegraded = false;

    // 1. Process layer specs, attach material hints, and calculate effective Z-index
    const processedLayers: DepthAwareLayerSpec[] = request.layers.map((layer) => {
      let effectiveZ = CANONICAL_BASE_Z_INDEX[layer.layerKind] ?? layer.zIndex ?? 0;
      let effectiveVisibility = layer.visibility;
      let layerOcclusionState: DepthOcclusionState | undefined = undefined;

      // Material hints derivation
      const materialHints = layer.materialProfile ? deriveAppearanceHints(layer.materialProfile) : undefined;

      if (layer.opacity <= 0.001) {
        effectiveVisibility = "TRANSPARENT_OR_UNKNOWN";
      } else if (isDepthApplicable && request.dynamicOcclusionMap && layer.layerKind === "GARMENT") {
        const occMap = request.dynamicOcclusionMap;

        if (occMap.garmentBehindRatio > 0.5) {
          // Garment is physically behind body occluder -> shift Z-index under body
          effectiveZ = 5; // Behind BODY (10)
          effectiveVisibility = "OCCLUDED";
          layerOcclusionState = "GARMENT_BEHIND";
          occludedCount++;
          isDegraded = true;
        } else if (occMap.garmentInFrontRatio > 0.5) {
          effectiveZ = 20; // In front of BODY
          effectiveVisibility = "VISIBLE";
          layerOcclusionState = "GARMENT_IN_FRONT";
          visibleCount++;
        } else if (occMap.sameDepthRatio > 0.4) {
          effectiveZ = 20;
          layerOcclusionState = "SAME_DEPTH";
          visibleCount++;
        } else {
          layerOcclusionState = "UNKNOWN";
        }
      } else {
        if (effectiveVisibility === "VISIBLE") visibleCount++;
      }

      return {
        ...layer,
        zIndex: effectiveZ,
        visibility: effectiveVisibility,
        materialHints,
        depthOcclusionState: layerOcclusionState,
      };
    });

    // 2. Sort according to effective Z-index
    const sortedLayers = [...processedLayers].sort((a, b) => a.zIndex - b.zIndex);

    // 3. Validate mandatory core layers
    const hasBody = sortedLayers.some((l) => l.layerKind === "BODY" && l.visibility !== "NOT_PRESENT");
    const hasGarment = sortedLayers.some((l) => l.layerKind === "GARMENT" && l.visibility !== "NOT_PRESENT");

    if (!hasBody && !hasGarment) {
      return {
        requestId: request.requestId,
        status: "FAILED",
        compositionQuality: "INSUFFICIENT_DATA",
        orderedLayers: sortedLayers,
        depthOrderApplied: isDepthApplicable,
        occludedLayerCount: occludedCount,
        visibleLayerCount: visibleCount,
        durationMs: Date.now() - startTime,
        details: { error: "Composition missing both BODY and GARMENT layers" },
      };
    }

    if (!isDepthApplicable && request.dynamicOcclusionMap?.isDegraded) {
      isDegraded = true;
    }

    const quality: CompositionQuality = isDegraded ? "COMPOSITION_DEGRADED" : "COMPOSITION_VALID";
    const status = isDegraded ? "DEGRADED" : "SUCCESS";

    return {
      requestId: request.requestId,
      status,
      compositionQuality: quality,
      orderedLayers: sortedLayers,
      depthOrderApplied: isDepthApplicable,
      occludedLayerCount: occludedCount,
      visibleLayerCount: visibleCount,
      durationMs: Date.now() - startTime,
      details: {
        depthOrderApplied: isDepthApplicable,
        hasDynamicOcclusionMap: Boolean(request.dynamicOcclusionMap),
        garmentBehindRatio: request.dynamicOcclusionMap?.garmentBehindRatio ?? 0,
      },
    };
  }
}
