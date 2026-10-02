/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Spatial-to-Render Mapper.
 * Maps neutral SpatialWarpingComposite data to renderer-agnostic RenderSceneDescriptor.
 * 
 * Invariants:
 * 1. Hexagonal Application Layer: Decoupled from concrete WebGL/Three.js renderers;
 *    outputs pure geometric and material descriptors.
 * 2. Continuous Warp Geometry: Generates deterministic 3D triangle mesh grids from WarpField2D
 *    without Thin-Plate Splines (TPS).
 * 3. Stale Rejection: Detects and flags superseded or out-of-order sequences before scene generation.
 * 4. Coordinate Consistency: Enforces deterministic space transitions (NORMALIZED -> SCENE_3D)
 *    including selfie mirroring and vertical axis inversion.
 */

import {
  RenderSceneDescriptor,
  RenderLayerDescriptor,
  RenderViewportModel,
  DEFAULT_VIEWPORT_MODEL,
  LayerGeometryDescriptor,
  LayerMaterialDescriptor,
  CameraDescriptor,
  LightingHintsDescriptor,
  SceneQualityStatus,
  SpatialCoordinateTransformer,
} from "../../domain/vto/render-contract.js";
import {
  SpatialWarpingComposite,
  SpatialCompositeLayer,
} from "../../domain/vto/spatial-warping-compositor.js";
import { WarpField2D } from "../../domain/vto/warp-field.js";

export interface SpatialToRenderMapperOptions {
  readonly viewport?: RenderViewportModel | undefined;
  readonly latestRenderedSequenceNumber?: number | undefined;
  readonly defaultFovDegrees?: number | undefined;
  readonly enableWireframe?: boolean | undefined;
}

export class SpatialToRenderMapper {
  /**
   * Maps a SpatialWarpingComposite to a RenderSceneDescriptor.
   */
  public static mapToSceneDescriptor(
    composite: SpatialWarpingComposite,
    options?: SpatialToRenderMapperOptions
  ): RenderSceneDescriptor {
    const viewport = options?.viewport ?? DEFAULT_VIEWPORT_MODEL;
    const latestSeq = options?.latestRenderedSequenceNumber ?? -1;

    const isStale =
      composite.isStale ||
      (latestSeq >= 0 && composite.sequenceNumber <= latestSeq);

    const qualityStatus: SceneQualityStatus =
      composite.status === "SUCCESS"
        ? "OPTIMAL"
        : composite.status === "FAILED"
        ? "FALLBACK"
        : "DEGRADED";

    const sceneId = `scene-${composite.frameId}-${composite.sequenceNumber}-${Date.now()}`;

    const layers: RenderLayerDescriptor[] = composite.layers.map((layer) =>
      SpatialToRenderMapper.mapLayer(layer, viewport, options?.enableWireframe)
    );

    const camera: CameraDescriptor = {
      fovDegrees: options?.defaultFovDegrees ?? 45,
      near: 0.1,
      far: 100.0,
      position: { x: 0, y: 0, z: 2.0 },
      target: { x: 0, y: 0, z: 0 },
      isOrthographic: false,
    };

    const lighting: LightingHintsDescriptor = {
      ambientColor: "#ffffff",
      ambientIntensity: 0.6,
      keyLightColor: "#fff8f0",
      keyLightIntensity: 0.8,
      keyLightDirection: { x: 0.5, y: 1.0, z: 1.0 },
    };

    return {
      sceneId,
      frameId: composite.frameId,
      sequenceNumber: composite.sequenceNumber,
      generation: composite.generation,
      timestampMs: composite.timestampMs,
      viewport,
      layers: Object.freeze(layers),
      camera,
      lighting,
      qualityStatus,
      isStale,
      details: Object.freeze({
        compositeId: composite.compositeId,
        warpQuality: composite.warpQuality,
        alignmentScore: composite.alignmentScore,
        layerCount: layers.length,
      }),
    };
  }

  /**
   * Maps an individual spatial layer to a render layer descriptor.
   */
  public static mapLayer(
    layer: SpatialCompositeLayer,
    viewport: RenderViewportModel,
    enableWireframe?: boolean
  ): RenderLayerDescriptor {
    let geometry: LayerGeometryDescriptor;

    if (layer.warpField && layer.warpField.isValid) {
      geometry = SpatialToRenderMapper.generateDeformedMeshGrid(
        layer.warpField,
        viewport.isMirrored,
        layer.zIndex * 0.001
      );
    } else {
      geometry = SpatialToRenderMapper.generateFullscreenQuad(layer.zIndex * 0.001);
    }

    const material: LayerMaterialDescriptor = {
      appearanceHints: layer.materialHints,
      opacity: layer.opacity,
      doubleSided: true,
      blending: layer.layerKind === "OCCLUSION" ? "MASKED" : "NORMAL",
      wireframe: enableWireframe ?? false,
    };

    return {
      layerId: layer.layerId,
      layerKind: layer.layerKind,
      zIndex: layer.zIndex,
      opacity: layer.opacity,
      visible: layer.visible,
      geometry,
      material,
      depthTest: true,
      depthWrite: layer.layerKind === "BASE" || layer.layerKind === "BODY",
      metadata: Object.freeze({
        ...layer.metadata,
        hasWarpField: !!layer.warpField,
        hasDepthMap: !!layer.depthMap,
        hasOcclusionMap: !!layer.occlusionMap,
      }),
    };
  }

  /**
   * Generates a 3D deformed triangle mesh grid from a WarpField2D.
   */
  public static generateDeformedMeshGrid(
    warpField: WarpField2D,
    isMirrored: boolean = false,
    depthZ: number = 0
  ): LayerGeometryDescriptor {
    const cols = warpField.gridWidth;
    const rows = warpField.gridHeight;
    const vertexCount = cols * rows;

    const vertices = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    for (let gy = 0; gy < rows; gy++) {
      const v = gy / (rows - 1);
      for (let gx = 0; gx < cols; gx++) {
        const u = gx / (cols - 1);
        const idx = gy * cols + gx;

        const dispX = warpField.dx[idx] ?? 0;
        const dispY = warpField.dy[idx] ?? 0;

        const uPrime = Math.max(0, Math.min(1, u + dispX));
        const vPrime = Math.max(0, Math.min(1, v + dispY));

        const scenePt = SpatialCoordinateTransformer.normalizedToScene3D(
          { x: uPrime, y: vPrime },
          isMirrored,
          depthZ
        );

        const vOffset = idx * 3;
        vertices[vOffset] = scenePt.x;
        vertices[vOffset + 1] = scenePt.y;
        vertices[vOffset + 2] = scenePt.z;

        const uvOffset = idx * 2;
        uvs[uvOffset] = u;
        uvs[uvOffset + 1] = 1.0 - v; // Standard WebGL UV Y-up
      }
    }

    const quadCount = (cols - 1) * (rows - 1);
    const indices = new Uint16Array(quadCount * 6);
    let indexOffset = 0;

    for (let gy = 0; gy < rows - 1; gy++) {
      for (let gx = 0; gx < cols - 1; gx++) {
        const topLeft = gy * cols + gx;
        const topRight = topLeft + 1;
        const bottomLeft = (gy + 1) * cols + gx;
        const bottomRight = bottomLeft + 1;

        // Triangle 1
        indices[indexOffset++] = topLeft;
        indices[indexOffset++] = bottomLeft;
        indices[indexOffset++] = topRight;

        // Triangle 2
        indices[indexOffset++] = topRight;
        indices[indexOffset++] = bottomLeft;
        indices[indexOffset++] = bottomRight;
      }
    }

    return {
      type: "DEFORMED_MESH_GRID",
      gridWidth: cols,
      gridHeight: rows,
      vertexCount,
      vertices,
      uvs,
      indices,
    };
  }

  /**
   * Generates a standard fullscreen quad for backdrop or base layers.
   */
  public static generateFullscreenQuad(depthZ: number = 0): LayerGeometryDescriptor {
    const vertices = new Float32Array([
      -1.0, -1.0, depthZ,
       1.0, -1.0, depthZ,
       1.0,  1.0, depthZ,
      -1.0,  1.0, depthZ,
    ]);

    const uvs = new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      1.0, 1.0,
      0.0, 1.0,
    ]);

    const indices = new Uint16Array([
      0, 1, 2,
      0, 2, 3,
    ]);

    return {
      type: "FULLSCREEN_QUAD",
      vertexCount: 4,
      vertices,
      uvs,
      indices,
    };
  }
}
