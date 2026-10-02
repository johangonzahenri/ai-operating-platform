/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Neutral Browser Render Contract, Viewport Model & Spatial Coordinate Transforms.
 * 
 * Invariants:
 * 1. Hexagonal Domain Purity: Zero references to DOM, window, document, HTMLCanvasElement, THREE, WebGL, or WebGPU.
 * 2. Five Deterministic Coordinate Spaces:
 *    - IMAGE_SPACE: Raw sensor/video pixel coordinates [0..W, 0..H], top-left origin (Y-down).
 *    - NORMALIZED_SPACE: Canonical UV coordinates [0.0..1.0, 0.0..1.0], top-left origin.
 *    - VTO_SPATIAL_SPACE: Pure geometry space for WarpField2D and anatomical alignment anchors.
 *    - SCENE_3D_SPACE: Normalized 3D device space [-1.0..1.0, -1.0..1.0], center origin (Y-up, Z relative depth).
 *    - VIEWPORT_SCREEN_SPACE: Canvas/screen display coordinates [0..viewportWidth, 0..viewportHeight].
 * 3. Explicit Spatial Transformations: Converts coordinates deterministically between spaces,
 *    handling vertical axis flipping (WebGL Y-up vs Image Y-down) and selfie-camera horizontal mirroring.
 * 4. Renderer-Agnostic Scene Descriptor: Represents 3D scene layers, camera projections, and lighting
 *    hints as pure data structures consumable by Three.js in satellite apps or 2D/WebGL canvas adapters.
 */

import { FrameDimensions } from "./frame-protocol.js";
import { SpatialLayerKind } from "./spatial-warping-compositor.js";
import { MaterialAppearanceHints } from "./material-types.js";

export type CoordinateSpace =
  | "IMAGE_SPACE"
  | "NORMALIZED_SPACE"
  | "VTO_SPATIAL_SPACE"
  | "SCENE_3D_SPACE"
  | "VIEWPORT_SCREEN_SPACE";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Point3D extends Point2D {
  readonly z: number;
}

export interface RenderViewportModel {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number; // width / height
  readonly devicePixelRatio: number; // e.g. 1.0, 2.0, 3.0
  readonly scale: number;
  readonly translation: Point2D;
  readonly zoom: number; // 1.0 = 100%
  readonly rotationDeg: number;
  readonly isMirrored: boolean; // Selfie mirror mode
}

export const DEFAULT_VIEWPORT_MODEL: RenderViewportModel = Object.freeze({
  width: 1280,
  height: 720,
  aspectRatio: 1280 / 720,
  devicePixelRatio: 1.0,
  scale: 1.0,
  translation: Object.freeze({ x: 0, y: 0 }),
  zoom: 1.0,
  rotationDeg: 0,
  isMirrored: false,
});

export type GeometryType =
  | "FULLSCREEN_QUAD"
  | "DEFORMED_MESH_GRID"
  | "SILHOUETTE_PLANE";

export interface LayerGeometryDescriptor {
  readonly type: GeometryType;
  readonly gridWidth?: number | undefined;
  readonly gridHeight?: number | undefined;
  readonly vertexCount: number;
  readonly vertices?: Float32Array | undefined; // 3 floats per vertex (x, y, z)
  readonly uvs?: Float32Array | undefined;      // 2 floats per vertex (u, v)
  readonly indices?: Uint16Array | undefined;   // Triangle indices
}

export interface LayerMaterialDescriptor {
  readonly appearanceHints?: MaterialAppearanceHints | undefined;
  readonly opacity: number; // 0.0 to 1.0
  readonly doubleSided: boolean;
  readonly blending: "NORMAL" | "ADDITIVE" | "MASKED";
  readonly wireframe?: boolean | undefined;
}

export interface LayerTextureDescriptor {
  readonly sourceUriOrHandle?: string | undefined;
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: string;
  readonly isDynamicVideo?: boolean | undefined;
}

export interface RenderLayerDescriptor {
  readonly layerId: string;
  readonly layerKind: SpatialLayerKind;
  readonly zIndex: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly geometry: LayerGeometryDescriptor;
  readonly material: LayerMaterialDescriptor;
  readonly texture?: LayerTextureDescriptor | undefined;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CameraDescriptor {
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
  readonly position: Point3D;
  readonly target: Point3D;
  readonly isOrthographic?: boolean | undefined;
}

export interface LightingHintsDescriptor {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly keyLightColor: string;
  readonly keyLightIntensity: number;
  readonly keyLightDirection: Point3D;
}

export type SceneQualityStatus = "OPTIMAL" | "DEGRADED" | "FALLBACK";

export interface RenderSceneDescriptor {
  readonly sceneId: string;
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly timestampMs: number;
  readonly viewport: RenderViewportModel;
  readonly layers: readonly RenderLayerDescriptor[];
  readonly camera: CameraDescriptor;
  readonly lighting: LightingHintsDescriptor;
  readonly qualityStatus: SceneQualityStatus;
  readonly isStale: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * Pure mathematical coordinate transforms across VTO spaces.
 */
export class SpatialCoordinateTransformer {
  /**
   * Converts raw image pixel coordinates [0..W, 0..H] to normalized UV [0.0..1.0, 0.0..1.0].
   */
  public static imageToNormalized(pixel: Point2D, imageDimensions: FrameDimensions): Point2D {
    if (!imageDimensions || imageDimensions.width <= 0 || imageDimensions.height <= 0) {
      return { x: 0, y: 0 };
    }
    const u = Math.max(0, Math.min(1, pixel.x / imageDimensions.width));
    const v = Math.max(0, Math.min(1, pixel.y / imageDimensions.height));
    return { x: u, y: v };
  }

  /**
   * Converts normalized UV coordinates [0.0..1.0, 0.0..1.0] (top-left, Y-down)
   * to 3D Scene / NDC space [-1.0..1.0, -1.0..1.0] (center origin, Y-up).
   */
  public static normalizedToScene3D(uv: Point2D, isMirrored: boolean = false, depthZ: number = 0): Point3D {
    const rawX = uv.x * 2.0 - 1.0;
    const x = isMirrored ? -rawX : rawX;
    const y = 1.0 - uv.y * 2.0; // Flip Y: UV 0 (top) -> Scene +1 (top)
    return { x, y, z: depthZ };
  }

  /**
   * Converts 3D Scene space coordinates [-1.0..1.0, -1.0..1.0]
   * to Viewport Screen pixel coordinates [0..viewportWidth, 0..viewportHeight].
   */
  public static scene3DToViewport(scenePoint: Point2D, viewport: RenderViewportModel): Point2D {
    const halfW = viewport.width / 2.0;
    const halfH = viewport.height / 2.0;

    // Apply scale, zoom, and translation
    const effectiveScale = viewport.scale * viewport.zoom;
    const rad = (viewport.rotationDeg * Math.PI) / 180.0;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const scaledX = scenePoint.x * effectiveScale;
    const scaledY = scenePoint.y * effectiveScale;

    const rotX = scaledX * cosR - scaledY * sinR;
    const rotY = scaledX * sinR + scaledY * cosR;

    const screenX = halfW + rotX * halfW + viewport.translation.x;
    const screenY = halfH - rotY * halfH + viewport.translation.y; // Flip back to screen Y-down

    return { x: screenX, y: screenY };
  }

  /**
   * Converts Viewport Screen pixel coordinates back to 3D Scene space (unproject).
   */
  public static viewportToScene3D(screenPoint: Point2D, viewport: RenderViewportModel): Point2D {
    const halfW = viewport.width / 2.0;
    const halfH = viewport.height / 2.0;

    if (halfW <= 0 || halfH <= 0) return { x: 0, y: 0 };

    const unTransX = screenPoint.x - halfW - viewport.translation.x;
    const unTransY = halfH - screenPoint.y + viewport.translation.y;

    const normX = unTransX / halfW;
    const normY = unTransY / halfH;

    const effectiveScale = (viewport.scale * viewport.zoom) || 1.0;
    const rad = (-viewport.rotationDeg * Math.PI) / 180.0;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const unRotX = (normX * cosR - normY * sinR) / effectiveScale;
    const unRotY = (normX * sinR + normY * cosR) / effectiveScale;

    return { x: unRotX, y: unRotY };
  }
}
