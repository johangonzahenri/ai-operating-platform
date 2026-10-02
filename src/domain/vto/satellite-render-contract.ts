/**
 * AI Operating Platform — Virtual Try-On 3D / AR Spatial Commerce Domain
 * 
 * Satellite Browser Integration Contract & 3D Scene Specification.
 * 
 * Invariants:
 * 1. Hexagonal Domain Purity: Zero references to DOM, HTMLCanvasElement, THREE, WebGL, or WebGPU.
 * 2. Neutral Platform-to-Satellite Bridge: Translates internal RenderSceneDescriptor to a canonical
 *    3D scene specification consumable by external satellite applications using Three.js,
 *    Babylon.js, or WebGL2 engines.
 * 3. Typed Geometry & Material Buffers: Exposes explicit typed arrays (Float32Array vertices/uvs,
 *    Uint16Array indices) ready for direct mapping to THREE.BufferGeometry and THREE.MeshPhysicalMaterial.
 * 4. Stale Frame Invariant: Passes explicit sequence numbers and staleness flags to protect the satellite
 *    render loop against regressions.
 */

import {
  RenderSceneDescriptor,
  RenderLayerDescriptor,
  Point3D,
  Point2D,
} from "./render-contract.js";

export type SatelliteLayerRenderMode = "MESH" | "QUAD" | "MASK";

export type SatelliteMaterialType = "PBR_PHYSICAL" | "UNLIT_TEXTURE" | "OCCLUSION_MASK";

export interface SatelliteGeometrySpec {
  readonly type: "BUFFER_GEOMETRY";
  readonly vertexPositions: Float32Array; // 3 floats per vertex (x, y, z)
  readonly uvCoordinates: Float32Array;   // 2 floats per vertex (u, v)
  readonly triangleIndices: Uint16Array;  // Index buffer for drawElements
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly gridDimensions?: { readonly cols: number; readonly rows: number } | undefined;
}

export interface SatelliteMaterialSpec {
  readonly type: SatelliteMaterialType;
  readonly roughness: number;
  readonly metalness: number;
  readonly sheen: number;
  readonly clearcoat: number;
  readonly opacity: number;
  readonly doubleSided: boolean;
  readonly wireframe: boolean;
  readonly blending: "NORMAL" | "ADDITIVE" | "MASKED";
  readonly colorHex: string;
}

export interface SatelliteLayerSpec {
  readonly layerId: string;
  readonly layerKind: "BASE" | "BODY" | "GARMENT" | "OCCLUSION" | "MATERIAL" | "FINAL_COMPOSITE";
  readonly zIndex: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly renderMode: SatelliteLayerRenderMode;
  readonly geometry: SatelliteGeometrySpec;
  readonly material: SatelliteMaterialSpec;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SatelliteViewportSpec {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly devicePixelRatio: number;
  readonly zoom: number;
  readonly pan: Point2D;
  readonly rotationDeg: number;
  readonly isMirrored: boolean;
}

export interface SatelliteCameraSpec {
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
  readonly position: Point3D;
  readonly target: Point3D;
  readonly isOrthographic: boolean;
}

export interface SatelliteLightingSpec {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly keyLightColor: string;
  readonly keyLightIntensity: number;
  readonly keyLightDirection: Point3D;
}

export interface SatelliteVtoSceneSpec {
  readonly sceneId: string;
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly timestampMs: number;
  readonly viewport: SatelliteViewportSpec;
  readonly camera: SatelliteCameraSpec;
  readonly lighting: SatelliteLightingSpec;
  readonly layers: readonly SatelliteLayerSpec[];
  readonly qualityStatus: "OPTIMAL" | "DEGRADED" | "FALLBACK";
  readonly isStale: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Validates a SatelliteVtoSceneSpec structure fail-closed.
 */
export function validateSatelliteVtoSceneSpec(
  spec: unknown
): { isValid: boolean; error?: string } {
  if (!spec || typeof spec !== "object") {
    return { isValid: false, error: "Scene specification must be a non-null object" };
  }

  const s = spec as Partial<SatelliteVtoSceneSpec>;
  if (!s.sceneId || typeof s.sceneId !== "string") {
    return { isValid: false, error: "Missing or invalid sceneId" };
  }
  if (!s.frameId || typeof s.frameId !== "string") {
    return { isValid: false, error: "Missing or invalid frameId" };
  }
  if (typeof s.sequenceNumber !== "number" || !Number.isInteger(s.sequenceNumber) || s.sequenceNumber < 0) {
    return { isValid: false, error: "Missing or invalid sequenceNumber (must be non-negative integer)" };
  }
  if (!s.viewport || typeof s.viewport !== "object" || s.viewport.width <= 0 || s.viewport.height <= 0) {
    return { isValid: false, error: "Invalid viewport dimensions in scene specification" };
  }
  if (!s.camera || typeof s.camera !== "object" || s.camera.fovDegrees <= 0) {
    return { isValid: false, error: "Invalid camera parameters in scene specification" };
  }
  if (!Array.isArray(s.layers)) {
    return { isValid: false, error: "Layers must be an array" };
  }

  for (let i = 0; i < s.layers.length; i++) {
    const l = s.layers[i];
    if (!l || !l.layerId || !l.geometry || !l.material) {
      return { isValid: false, error: `Invalid layer at index ${i}: missing id, geometry, or material` };
    }
    if (!(l.geometry.vertexPositions instanceof Float32Array)) {
      return { isValid: false, error: `Layer ${l.layerId} vertexPositions must be a Float32Array` };
    }
    if (!(l.geometry.uvCoordinates instanceof Float32Array)) {
      return { isValid: false, error: `Layer ${l.layerId} uvCoordinates must be a Float32Array` };
    }
    if (!(l.geometry.triangleIndices instanceof Uint16Array)) {
      return { isValid: false, error: `Layer ${l.layerId} triangleIndices must be a Uint16Array` };
    }
  }

  return { isValid: true };
}

/**
 * Translates an internal RenderSceneDescriptor to a SatelliteVtoSceneSpec ready for Three.js.
 */
export function mapRenderDescriptorToSatelliteSpec(
  descriptor: RenderSceneDescriptor
): SatelliteVtoSceneSpec {
  const materialLayer = descriptor.layers.find((l: RenderLayerDescriptor) => l.layerKind === "MATERIAL");
  const fallbackHints = materialLayer?.material.appearanceHints;

  const satelliteLayers: SatelliteLayerSpec[] = descriptor.layers.map((layer: RenderLayerDescriptor) => {
    let vertexPositions: Float32Array;
    let uvCoordinates: Float32Array;
    let triangleIndices: Uint16Array;
    let gridDims: { cols: number; rows: number } | undefined;

    if (layer.geometry.type === "DEFORMED_MESH_GRID" && layer.geometry.vertices && layer.geometry.uvs && layer.geometry.indices) {
      vertexPositions = layer.geometry.vertices;
      uvCoordinates = layer.geometry.uvs;
      triangleIndices = layer.geometry.indices;
      if (layer.geometry.gridWidth && layer.geometry.gridHeight) {
        gridDims = { cols: layer.geometry.gridWidth, rows: layer.geometry.gridHeight };
      }
    } else if (layer.geometry.vertices && layer.geometry.uvs && layer.geometry.indices) {
      vertexPositions = layer.geometry.vertices;
      uvCoordinates = layer.geometry.uvs;
      triangleIndices = layer.geometry.indices;
    } else {
      // Fallback Quad
      vertexPositions = new Float32Array([
        -1.0, -1.0, layer.zIndex * 0.001,
         1.0, -1.0, layer.zIndex * 0.001,
         1.0,  1.0, layer.zIndex * 0.001,
        -1.0,  1.0, layer.zIndex * 0.001,
      ]);
      uvCoordinates = new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
      ]);
      triangleIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    }

    const renderMode: SatelliteLayerRenderMode =
      layer.layerKind === "GARMENT" ? "MESH" : layer.layerKind === "OCCLUSION" ? "MASK" : "QUAD";

    const materialType: SatelliteMaterialType =
      layer.layerKind === "OCCLUSION"
        ? "OCCLUSION_MASK"
        : layer.layerKind === "GARMENT" || layer.layerKind === "MATERIAL"
        ? "PBR_PHYSICAL"
        : "UNLIT_TEXTURE";

    const hints = layer.material.appearanceHints ?? fallbackHints;
    const material: SatelliteMaterialSpec = {
      type: materialType,
      roughness: hints?.roughnessFactor ?? 0.6,
      metalness: hints?.metallicFactor ?? 0.1,
      sheen: hints?.surfaceClassification === "SILK" ? 0.8 : hints?.surfaceClassification === "GLOSSY_FABRIC" ? 0.6 : 0.1,
      clearcoat: hints?.surfaceClassification === "LEATHER" ? 0.4 : 0.0,
      opacity: layer.material.opacity,
      doubleSided: layer.material.doubleSided,
      wireframe: layer.material.wireframe ?? false,
      blending: layer.material.blending,
      colorHex: layer.layerKind === "GARMENT" ? "#3498db" : "#ffffff",
    };

    const vertexCount = vertexPositions.length / 3;
    const triangleCount = triangleIndices.length / 3;

    return {
      layerId: layer.layerId,
      layerKind: layer.layerKind,
      zIndex: layer.zIndex,
      opacity: layer.opacity,
      visible: layer.visible,
      renderMode,
      geometry: {
        type: "BUFFER_GEOMETRY",
        vertexPositions,
        uvCoordinates,
        triangleIndices,
        vertexCount,
        triangleCount,
        gridDimensions: gridDims,
      },
      material,
      depthTest: layer.depthTest,
      depthWrite: layer.depthWrite,
      metadata: Object.freeze({
        ...layer.metadata,
        layerKind: layer.layerKind,
      }),
    };
  });

  return Object.freeze({
    sceneId: descriptor.sceneId,
    frameId: descriptor.frameId,
    sequenceNumber: descriptor.sequenceNumber,
    generation: descriptor.generation,
    timestampMs: descriptor.timestampMs,
    viewport: Object.freeze({
      width: descriptor.viewport.width,
      height: descriptor.viewport.height,
      aspectRatio: descriptor.viewport.aspectRatio,
      devicePixelRatio: descriptor.viewport.devicePixelRatio,
      zoom: descriptor.viewport.zoom,
      pan: Object.freeze({ ...descriptor.viewport.translation }),
      rotationDeg: descriptor.viewport.rotationDeg,
      isMirrored: descriptor.viewport.isMirrored,
    }),
    camera: Object.freeze({
      fovDegrees: descriptor.camera.fovDegrees,
      near: descriptor.camera.near,
      far: descriptor.camera.far,
      position: Object.freeze({ ...descriptor.camera.position }),
      target: Object.freeze({ ...descriptor.camera.target }),
      isOrthographic: descriptor.camera.isOrthographic ?? false,
    }),
    lighting: Object.freeze({
      ambientColor: descriptor.lighting.ambientColor,
      ambientIntensity: descriptor.lighting.ambientIntensity,
      keyLightColor: descriptor.lighting.keyLightColor,
      keyLightIntensity: descriptor.lighting.keyLightIntensity,
      keyLightDirection: Object.freeze({ ...descriptor.lighting.keyLightDirection }),
    }),
    layers: Object.freeze(satelliteLayers),
    qualityStatus: descriptor.qualityStatus,
    isStale: descriptor.isStale,
    metadata: Object.freeze({
      ...descriptor.details,
      satelliteTargetApp: "satellite-3d-app",
      targetEngine: "threejs",
    }),
  });
}
