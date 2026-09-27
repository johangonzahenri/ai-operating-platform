/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Depth Occlusion & Material Appearance Pipeline Coordinator.
 * 
 * Pipeline Flow:
 * [PreparedVirtualTryOnInput (Phase 154)]
 *          ↓
 * [Segmentation Provider (Phase 155)] → Body & Garment Masks
 *          ↓
 * [Garment Warp Engine (Phase 155)]   → WarpField2D
 *          ↓
 * [Depth Estimation Provider]         → Relative Depth Maps (Body & Garment)
 *          ↓
 * [Dynamic Occlusion Resolver]        → DepthOcclusionMap & Temporal Stability
 *          ↓
 * [Material Provider / Catalog]       → GarmentMaterialProfile & Appearance Hints
 *          ↓
 * [Depth-Aware Compositor]            → Depth-Aware Ordered Layers & Material Metadata
 *          ↓
 * [PreparedVtoRenderInput (Extended)] → Complete multi-layer render specification with artifacts
 */

import {
  GarmentReference,
  BodyProfileReference,
  VirtualTryOnArtifact,
} from "./virtual-tryon.js";
import { PreparedVirtualTryOnInput } from "./pose-preprocessing-pipeline.js";
import {
  SegmentationMask,
  OcclusionMap,
  SegmentationQuality,
} from "./segmentation-types.js";
import { SegmentationProviderPort } from "./segmentation-provider.js";
import { WarpField2D } from "./warp-field.js";
import { GarmentWarpEngine, GarmentWarpQuality } from "./garment-warping.js";
import { CompositionQuality } from "./layer-composition.js";
import { DepthMap } from "./depth-types.js";
import { DepthProviderPort } from "./depth-provider.js";
import { DynamicOcclusionMap, DynamicOcclusionResolver, DepthOcclusionConfig } from "./dynamic-occlusion.js";
import { GarmentMaterialProfile, MaterialAppearanceHints, DeterministicMaterialProvider, deriveAppearanceHints } from "./material-types.js";
import { DepthAwareLayerSpec, DepthAwareCompositor } from "./depth-aware-compositor.js";
import { PreparedVtoRenderInput } from "./cloth-warping-pipeline.js";

export interface DepthMaterialRenderInput extends PreparedVtoRenderInput {
  readonly depthMap?: DepthMap | undefined;
  readonly dynamicOcclusionMap?: DynamicOcclusionMap | undefined;
  readonly materialProfile?: GarmentMaterialProfile | undefined;
  readonly materialHints?: MaterialAppearanceHints | undefined;
  readonly depthStatus: "SUCCESS" | "DEGRADED" | "NOT_AVAILABLE";
  readonly depthConfidence: number;
  readonly depthAwareLayers: readonly DepthAwareLayerSpec[];
}

export interface DepthMaterialPipelineConfig {
  readonly segmentationProvider: SegmentationProviderPort;
  readonly depthProvider?: DepthProviderPort | undefined;
  readonly occlusionConfig?: DepthOcclusionConfig | undefined;
}

export class DepthMaterialPipeline {
  private _segmentationProvider: SegmentationProviderPort;
  private _depthProvider?: DepthProviderPort | undefined;
  private _occlusionConfig?: DepthOcclusionConfig | undefined;
  private _lastOcclusionMap?: DynamicOcclusionMap | undefined;

  constructor(config: DepthMaterialPipelineConfig) {
    this._segmentationProvider = config.segmentationProvider;
    this._depthProvider = config.depthProvider;
    this._occlusionConfig = config.occlusionConfig;
  }

  /**
   * Processes a preprocessed pose and garment into a depth-aware, material-enriched render input.
   */
  public async process(
    input: PreparedVirtualTryOnInput,
    garment: GarmentReference,
    tenantId: string,
    bodyProfile?: BodyProfileReference
  ): Promise<DepthMaterialRenderInput> {
    const requestId = input.preparedInputId;
    const now = new Date();

    // 1. Segmentation (Phase 155)
    const segResult = await this._segmentationProvider.segment({
      requestId,
      tenantId,
      sourceImage: garment.primaryAsset,
      targetClasses: ["PERSON", "GARMENT", "OCCLUSION"],
      options: {
        preferredFormat: "SOFT_PROBABILITY_MAP",
        targetResolution: { width: 64, height: 64 },
      },
    });

    const garmentMask = segResult.masks["GARMENT"];
    const bodyMask = segResult.masks["PERSON"];

    // 2. Garment Warp (Phase 155)
    const warpResult = GarmentWarpEngine.computeGarmentWarp({
      requestId,
      garment,
      alignment: input.garmentAlignment,
      segmentationMask: garmentMask,
      preferredGridSize: { gridWidth: 16, gridHeight: 16 },
    });

    // 3. Depth Estimation & Dynamic Occlusion (Phase 156)
    let bodyDepth: DepthMap | undefined = undefined;
    let garmentDepth: DepthMap | undefined = undefined;
    let dynamicOcclusion: DynamicOcclusionMap | undefined = undefined;
    let depthStatus: "SUCCESS" | "DEGRADED" | "NOT_AVAILABLE" = "NOT_AVAILABLE";
    let depthConfidence = 0.0;

    if (this._depthProvider) {
      const depthEstimate = await this._depthProvider.estimateDepth({
        requestId,
        tenantId,
        sourceImage: garment.primaryAsset,
        options: {
          targetResolution: { width: 64, height: 64 },
          preferredFormat: "FLOAT32",
          preferredDepthType: "NORMALIZED_DEPTH",
        },
      });

      if (depthEstimate.status === "SUCCESS" || depthEstimate.status === "DEGRADED") {
        bodyDepth = depthEstimate.depthMap;
        // Physically grounded garment depth: garment sits slightly in front of body surface (nearer camera)
        // over the garment region, allowing dynamic occlusion resolver to compute true front/behind relationships
        garmentDepth = {
          ...depthEstimate.depthMap,
          values: depthEstimate.depthMap.values.map((z, idx) => {
            const inGarment = garmentMask ? garmentMask.data[idx] > 0.2 : true;
            return inGarment ? Math.max(0, z - 0.05) : z;
          }),
        };
        depthStatus = depthEstimate.status;
        depthConfidence = depthEstimate.overallConfidence;

        if (bodyDepth && garmentDepth) {
          dynamicOcclusion = DynamicOcclusionResolver.resolveOcclusion(
            bodyDepth,
            garmentDepth,
            bodyMask,
            garmentMask,
            this._lastOcclusionMap,
            this._occlusionConfig
          );
          this._lastOcclusionMap = dynamicOcclusion;
        }
      } else {
        depthStatus = "DEGRADED";
      }
    }

    // 4. Material Appearance Profile Resolution (Phase 156)
    const materialProfile = DeterministicMaterialProvider.resolveMaterialProfile(garment);
    const materialHints = deriveAppearanceHints(materialProfile);

    // 5. Depth-Aware Multi-Layer Composition (Phase 156)
    const layers: DepthAwareLayerSpec[] = [
      {
        layerId: `layer-bg-${requestId}`,
        layerKind: "BACKGROUND",
        visibility: "VISIBLE",
        zIndex: 0,
        opacity: 1.0,
      },
      {
        layerId: `layer-body-${requestId}`,
        layerKind: "BODY",
        visibility: "VISIBLE",
        zIndex: 10,
        opacity: 1.0,
        mask: bodyMask,
        depthMap: bodyDepth,
      },
      {
        layerId: `layer-garment-${requestId}`,
        layerKind: "GARMENT",
        visibility: "VISIBLE",
        zIndex: 20,
        opacity: 1.0,
        mask: garmentMask,
        warpField: warpResult.warpField,
        depthMap: garmentDepth,
        materialProfile,
        materialHints,
        assetReference: garment.primaryAsset,
      },
    ];

    const compResult = DepthAwareCompositor.compose({
      requestId,
      tenantId,
      layers,
      dynamicOcclusionMap: dynamicOcclusion,
      fallbackToStaticZOrder: depthStatus === "NOT_AVAILABLE" || depthStatus === "DEGRADED",
    });

    // 6. Assemble Canonical Artifacts adhering to Phase 153/155/156 model
    const artifacts: VirtualTryOnArtifact[] = [];

    if (bodyMask) {
      artifacts.push({
        artifactId: `art-body-mask-${requestId}`,
        kind: "BODY_MASK",
        uriOrHandle: `memory://vto/masks/${requestId}/body.bin`,
        mimeType: "application/octet-stream",
        widthPx: bodyMask.width,
        heightPx: bodyMask.height,
        createdAt: now,
      });
    }

    if (garmentMask) {
      artifacts.push({
        artifactId: `art-garment-mask-${requestId}`,
        kind: "GARMENT_MASK",
        uriOrHandle: `memory://vto/masks/${requestId}/garment.bin`,
        mimeType: "application/octet-stream",
        widthPx: garmentMask.width,
        heightPx: garmentMask.height,
        createdAt: now,
      });
    }

    if (segResult.occlusionMap) {
      artifacts.push({
        artifactId: `art-occlusion-${requestId}`,
        kind: "OCCLUSION_MAP",
        uriOrHandle: `memory://vto/occlusion/${requestId}/map.bin`,
        mimeType: "application/octet-stream",
        widthPx: segResult.occlusionMap.width,
        heightPx: segResult.occlusionMap.height,
        createdAt: now,
      });
    }

    artifacts.push({
      artifactId: `art-warp-field-${requestId}`,
      kind: "WARP_FIELD",
      uriOrHandle: `memory://vto/warp/${requestId}/field.json`,
      mimeType: "application/json",
      createdAt: now,
    });

    if (bodyDepth) {
      artifacts.push({
        artifactId: `art-depth-map-${requestId}`,
        kind: "DEPTH_MAP",
        uriOrHandle: `memory://vto/depth/${requestId}/depth.bin`,
        mimeType: "application/octet-stream",
        widthPx: bodyDepth.width,
        heightPx: bodyDepth.height,
        createdAt: now,
      });
    }

    if (dynamicOcclusion) {
      artifacts.push({
        artifactId: `art-dynamic-occ-${requestId}`,
        kind: "DYNAMIC_OCCLUSION_MAP",
        uriOrHandle: `memory://vto/occlusion/${requestId}/dynamic.bin`,
        mimeType: "application/octet-stream",
        widthPx: dynamicOcclusion.width,
        heightPx: dynamicOcclusion.height,
        createdAt: now,
      });
    }

    artifacts.push({
      artifactId: `art-material-profile-${requestId}`,
      kind: "MATERIAL_PROFILE",
      uriOrHandle: `memory://vto/materials/${requestId}/profile.json`,
      mimeType: "application/json",
      createdAt: now,
    });

    artifacts.push({
      artifactId: `art-depth-comp-${requestId}`,
      kind: "DEPTH_AWARE_COMPOSITION",
      uriOrHandle: `memory://vto/composition/${requestId}/depth-aware.json`,
      mimeType: "application/json",
      createdAt: now,
    });

    const isDegraded =
      segResult.status === "DEGRADED" ||
      warpResult.status === "DEGRADED" ||
      compResult.status === "DEGRADED" ||
      depthStatus === "DEGRADED";

    return {
      requestId,
      tenantId,
      garment,
      bodyProfile,
      preparedPoseInput: input,
      segmentationMasks: segResult.masks,
      occlusionMap: segResult.occlusionMap,
      warpField: warpResult.warpField,
      compositionLayers: compResult.orderedLayers,
      artifacts,
      quality: {
        segmentation: segResult.quality,
        warping: warpResult.quality,
        composition: compResult.compositionQuality,
      },
      isDegraded,
      processedAt: now,
      depthMap: bodyDepth,
      dynamicOcclusionMap: dynamicOcclusion,
      materialProfile,
      materialHints,
      depthStatus,
      depthConfidence,
      depthAwareLayers: compResult.orderedLayers,
    };
  }
}
