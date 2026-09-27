/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Neural Garment Warping & Multi-Layer Cloth Segmentation Pipeline.
 * 
 * Flow:
 * [PreparedVirtualTryOnInput]
 *          ↓
 * [Segmentation Provider]  → Body Mask, Garment Mask, Occlusion Map
 *          ↓
 * [Garment Warp Engine]     → WarpField2D (Affine / Continuous deformation)
 *          ↓
 * [Multi-Layer Compositor]  → Ordered & Occlusion-Resolved Layers
 *          ↓
 * [PreparedVtoRenderInput]  → Complete multi-layer render specification with artifacts
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
import {
  GarmentWarpEngine,
  GarmentWarpQuality,
} from "./garment-warping.js";
import {
  LayerSpec,
  MultiLayerCompositor,
  CompositionQuality,
} from "./layer-composition.js";

export interface PreparedVtoRenderInput {
  readonly requestId: string;
  readonly tenantId: string;
  readonly garment: GarmentReference;
  readonly bodyProfile?: BodyProfileReference | undefined;
  readonly preparedPoseInput: PreparedVirtualTryOnInput;
  readonly segmentationMasks: Readonly<Record<string, SegmentationMask>>;
  readonly occlusionMap?: OcclusionMap | undefined;
  readonly warpField: WarpField2D;
  readonly compositionLayers: readonly LayerSpec[];
  readonly artifacts: readonly VirtualTryOnArtifact[];
  readonly quality: {
    readonly segmentation: SegmentationQuality;
    readonly warping: GarmentWarpQuality;
    readonly composition: CompositionQuality;
  };
  readonly isDegraded: boolean;
  readonly processedAt: Date;
}

export interface ClothWarpingPipelineConfig {
  readonly segmentationProvider: SegmentationProviderPort;
}

export class ClothSegmentationWarpingPipeline {
  private _segmentationProvider: SegmentationProviderPort;

  constructor(config: ClothWarpingPipelineConfig) {
    this._segmentationProvider = config.segmentationProvider;
  }

  /**
   * Executes the full segmentation, warping, and layer composition pipeline.
   */
  public async process(
    input: PreparedVirtualTryOnInput,
    garment: GarmentReference,
    tenantId: string,
    bodyProfile?: BodyProfileReference
  ): Promise<PreparedVtoRenderInput> {
    const requestId = input.preparedInputId;
    const now = new Date();

    // 1. Execute segmentation
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

    // 2. Compute garment warping field
    const warpResult = GarmentWarpEngine.computeGarmentWarp({
      requestId,
      garment,
      alignment: input.garmentAlignment,
      segmentationMask: garmentMask,
      preferredGridSize: { gridWidth: 16, gridHeight: 16 },
    });

    // 3. Assemble layer specifications
    const layers: LayerSpec[] = [
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
      },
      {
        layerId: `layer-garment-${requestId}`,
        layerKind: "GARMENT",
        visibility: "VISIBLE",
        zIndex: 20,
        opacity: 1.0,
        mask: garmentMask,
        warpField: warpResult.warpField,
        assetReference: garment.primaryAsset,
      },
    ];

    // 4. Multi-layer composition
    const compResult = MultiLayerCompositor.compose({
      requestId,
      tenantId,
      layers,
      occlusionMap: segResult.occlusionMap,
    });

    // 5. Generate structured artifacts adhering to Phase 153 artifact model
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

    const isDegraded =
      segResult.status === "DEGRADED" ||
      warpResult.status === "DEGRADED" ||
      compResult.status === "DEGRADED";

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
    };
  }
}
