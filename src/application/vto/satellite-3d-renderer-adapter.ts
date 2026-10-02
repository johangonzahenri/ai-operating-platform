/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Satellite 3D Renderer Adapter & Three.js Bridge.
 * 
 * Invariants:
 * 1. Zero Core Dependencies: ai-operating-platform does not import or bundle Three.js;
 *    the adapter bridges dynamically to Three.js runtime when injected or available in the browser window,
 *    and operates gracefully in ENVIRONMENT_PENDING / SIMULATED mode in headless environments.
 * 2. Hexagonal Conformance: Strictly implements BrowserRenderPort.
 * 3. Latest-Result Invariant: Enforces LATEST_VALID_RESULT > STALE_RESULT at the 3D scene boundary.
 * 4. Deterministic Resource Lifecycle: Registers and tracks all 3D geometries, materials, and textures
 *    in SceneLifecycleManager, ensuring deterministic disposal with zero memory leaks.
 */

import {
  RenderSceneDescriptor,
  DEFAULT_VIEWPORT_MODEL,
} from "../../domain/vto/render-contract.js";
import {
  SceneLifecycleManager,
  SceneLifecycleState,
  DisposalReceipt,
} from "../../domain/vto/scene-lifecycle.js";
import {
  BrowserRenderPort,
  RenderFrameResult,
  RenderEnvironmentMode,
} from "./browser-render-adapter.js";
import {
  SatelliteVtoSceneSpec,
  SatelliteLayerSpec,
  mapRenderDescriptorToSatelliteSpec,
  validateSatelliteVtoSceneSpec,
} from "../../domain/vto/satellite-render-contract.js";

export interface ThreeJsShim {
  Scene: new () => any;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => any;
  WebGLRenderer: new (options?: any) => any;
  BufferGeometry: new () => any;
  BufferAttribute: new (array: ArrayLike<number>, itemSize: number) => any;
  MeshPhysicalMaterial: new (parameters?: any) => any;
  MeshBasicMaterial: new (parameters?: any) => any;
  Mesh: new (geometry?: any, material?: any) => any;
  AmbientLight: new (color?: any, intensity?: number) => any;
  DirectionalLight: new (color?: any, intensity?: number) => any;
  Color: new (color?: any) => any;
  Vector3: new (x?: number, y?: number, z?: number) => any;
}

export interface Satellite3DRendererOptions {
  readonly sceneId?: string | undefined;
  readonly canvas?: any | undefined;
  readonly threeJsInstance?: ThreeJsShim | undefined;
  readonly threeInstance?: ThreeJsShim | undefined;
  readonly pixelRatio?: number | undefined;
  readonly satelliteAppName?: string | undefined;
}

export class Satellite3DRendererAdapter implements BrowserRenderPort {
  private readonly lifecycleManager: SceneLifecycleManager;
  private canvas?: any | undefined;
  private three?: ThreeJsShim | undefined;
  private scene3D?: any | undefined;
  private camera3D?: any | undefined;
  private renderer3D?: any | undefined;
  private readonly meshMap = new Map<string, any>();

  private environmentMode: RenderEnvironmentMode = "ENVIRONMENT_PENDING";
  private latestRenderedSequence: number = -1;
  private lastRenderedSpec?: SatelliteVtoSceneSpec | undefined;
  private currentWidth: number = DEFAULT_VIEWPORT_MODEL.width;
  private currentHeight: number = DEFAULT_VIEWPORT_MODEL.height;

  private readonly renderedFrames: RenderFrameResult[] = [];
  private readonly droppedFrames: RenderFrameResult[] = [];
  private latestRenderResult?: RenderFrameResult | undefined;

  constructor(options?: Satellite3DRendererOptions) {
    const sceneId = options?.sceneId ?? `sat-scene-${Date.now()}`;
    this.lifecycleManager = new SceneLifecycleManager(sceneId);
    this.canvas = options?.canvas;
    const rawThree = options?.threeJsInstance ?? options?.threeInstance;
    this.three = (rawThree && (rawThree as any).three) ? (rawThree as any).three : rawThree;
  }

  public async initialize(targetCanvas?: unknown): Promise<void> {
    if (this.lifecycleManager.getState() === "DISPOSED") {
      throw new Error("Cannot initialize adapter in terminal state DISPOSED");
    }
    if (this.lifecycleManager.getState() !== "UNINITIALIZED") {
      return;
    }

    this.lifecycleManager.transitionTo("INITIALIZING");

    if (targetCanvas) {
      this.canvas = targetCanvas;
    }

    // Capability detection: Check if Three.js and WebGL are present
    const globalThree = typeof window !== "undefined" ? (window as any).THREE : undefined;
    const effectiveThree = this.three ?? globalThree;

    if (effectiveThree && this.canvas && typeof this.canvas.getContext === "function") {
      try {
        const gl = this.canvas.getContext("webgl2") || this.canvas.getContext("webgl");
        if (gl) {
          this.three = effectiveThree;
          this.scene3D = new effectiveThree.Scene();
          this.camera3D = new effectiveThree.PerspectiveCamera(
            45,
            this.currentWidth / this.currentHeight,
            0.1,
            100
          );
          this.renderer3D = new effectiveThree.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true,
          });
          this.environmentMode = "WEBGL";
        } else {
          this.environmentMode = "ENVIRONMENT_PENDING";
        }
      } catch {
        this.environmentMode = "ENVIRONMENT_PENDING";
      }
    } else {
      // Headless Node.js / CI
      this.environmentMode = "ENVIRONMENT_PENDING";
    }

    // Register initial viewport resource
    this.lifecycleManager.registerResource(
      `sat-viewport-${this.lifecycleManager.getSceneId()}`,
      "VIEWPORT",
      this.currentWidth * this.currentHeight * 4,
      { width: this.currentWidth, height: this.currentHeight, mode: this.environmentMode }
    );

    this.lifecycleManager.transitionTo("READY");
  }

  public async renderScene(descriptor: RenderSceneDescriptor): Promise<RenderFrameResult> {
    const startTime = Date.now();

    const currentState = this.lifecycleManager.getState();
    if (currentState === "DISPOSED") {
      throw new Error("Cannot render scene while adapter is in terminal state DISPOSED");
    }

    if (currentState !== "READY" && currentState !== "RENDERING") {
      const res: RenderFrameResult = {
        sceneId: descriptor.sceneId,
        sequenceNumber: descriptor.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: `INVALID_LIFECYCLE_STATE_${currentState}`,
        layersRenderedCount: 0,
        environmentMode: this.environmentMode,
      };
      this.droppedFrames.push(res);
      this.latestRenderResult = res;
      return res;
    }

    // Stale check
    if (descriptor.isStale || descriptor.sequenceNumber <= this.latestRenderedSequence) {
      const res: RenderFrameResult = {
        sceneId: descriptor.sceneId,
        sequenceNumber: descriptor.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: "STALE_FRAME_REJECTED",
        layersRenderedCount: 0,
        environmentMode: this.environmentMode,
      };
      this.droppedFrames.push(res);
      this.latestRenderResult = res;
      return res;
    }

    // Map to Satellite 3D Specification
    const satelliteSpec = mapRenderDescriptorToSatelliteSpec(descriptor);
    const validation = validateSatelliteVtoSceneSpec(satelliteSpec);
    if (!validation.isValid) {
      const res: RenderFrameResult = {
        sceneId: descriptor.sceneId,
        sequenceNumber: descriptor.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: `INVALID_SCENE_SPEC: ${validation.error}`,
        layersRenderedCount: 0,
        environmentMode: this.environmentMode,
      };
      this.droppedFrames.push(res);
      this.latestRenderResult = res;
      return res;
    }

    this.lifecycleManager.transitionTo("RENDERING");

    let layersDrawn = 0;

    try {
      if (this.three && this.scene3D && this.renderer3D) {
        // Real Three.js scene update
        this.updateThreeJsScene(satelliteSpec);
        this.renderer3D.render(this.scene3D, this.camera3D);
        layersDrawn = satelliteSpec.layers.filter((l) => l.visible && l.opacity > 0).length;
      } else {
        // Headless Node.js / simulated pass
        layersDrawn = satelliteSpec.layers.filter((l) => l.visible && l.opacity > 0).length;
      }

      this.latestRenderedSequence = descriptor.sequenceNumber;
      this.lastRenderedSpec = satelliteSpec;
      this.lifecycleManager.transitionTo("READY");

      const successResult: RenderFrameResult = {
        sceneId: descriptor.sceneId,
        sequenceNumber: descriptor.sequenceNumber,
        rendered: true,
        renderDurationMs: Math.max(0, Date.now() - startTime),
        timestampMs: Date.now(),
        layersRenderedCount: layersDrawn,
        environmentMode: this.environmentMode,
      };
      this.renderedFrames.push(successResult);
      this.latestRenderResult = successResult;
      return successResult;
    } catch (err) {
      this.lifecycleManager.setError(err instanceof Error ? err : new Error(String(err)));
      const errorResult: RenderFrameResult = {
        sceneId: descriptor.sceneId,
        sequenceNumber: descriptor.sequenceNumber,
        rendered: false,
        renderDurationMs: Math.max(0, Date.now() - startTime),
        timestampMs: Date.now(),
        reason: `RENDER_ERROR: ${err instanceof Error ? err.message : String(err)}`,
        layersRenderedCount: layersDrawn,
        environmentMode: this.environmentMode,
      };
      this.droppedFrames.push(errorResult);
      this.latestRenderResult = errorResult;
      return errorResult;
    }
  }

  public resize(width: number, height: number, devicePixelRatio?: number): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return;
    }
    this.currentWidth = Math.round(width);
    this.currentHeight = Math.round(height);

    if (this.canvas) {
      this.canvas.width = this.currentWidth;
      this.canvas.height = this.currentHeight;
    }

    if (this.camera3D) {
      this.camera3D.aspect = this.currentWidth / this.currentHeight;
      if (typeof this.camera3D.updateProjectionMatrix === "function") {
        this.camera3D.updateProjectionMatrix();
      }
    }

    if (this.renderer3D && typeof this.renderer3D.setSize === "function") {
      this.renderer3D.setSize(this.currentWidth, this.currentHeight, false);
      if (devicePixelRatio && typeof this.renderer3D.setPixelRatio === "function") {
        this.renderer3D.setPixelRatio(devicePixelRatio);
      }
    }
  }

  public getLifecycleState(): SceneLifecycleState {
    return this.lifecycleManager.getState();
  }

  public getLatestRenderedSequence(): number {
    return this.latestRenderedSequence;
  }

  public getEnvironmentMode(): RenderEnvironmentMode {
    return this.environmentMode;
  }

  public getLastRenderedSpec(): SatelliteVtoSceneSpec | undefined {
    return this.lastRenderedSpec;
  }

  public getLatestSatelliteSpec(): SatelliteVtoSceneSpec | undefined {
    return this.lastRenderedSpec;
  }

  public getRenderedFrames(): readonly RenderFrameResult[] {
    return this.renderedFrames;
  }

  public getDroppedFrames(): readonly RenderFrameResult[] {
    return this.droppedFrames;
  }

  public getLatestRenderResult(): RenderFrameResult | undefined {
    return this.latestRenderResult;
  }

  public async dispose(): Promise<DisposalReceipt> {
    for (const mesh of this.meshMap.values()) {
      if (mesh.geometry?.dispose) {
        mesh.geometry.dispose();
      }
      if (mesh.material?.dispose) {
        mesh.material.dispose();
      }
      if (this.scene3D && typeof this.scene3D.remove === "function") {
        this.scene3D.remove(mesh);
      }
    }

    const receipt = this.lifecycleManager.disposeAll();

    if (this.renderer3D && typeof this.renderer3D.dispose === "function") {
      this.renderer3D.dispose();
    }

    this.meshMap.clear();
    this.scene3D = undefined;
    this.camera3D = undefined;
    this.renderer3D = undefined;
    this.three = undefined;
    this.canvas = undefined;

    return receipt;
  }

  private updateThreeJsScene(spec: SatelliteVtoSceneSpec): void {
    if (!this.three || !this.scene3D) return;

    for (const layer of spec.layers) {
      if (!layer.visible) {
        const existing = this.meshMap.get(layer.layerId);
        if (existing) existing.visible = false;
        continue;
      }

      let mesh = this.meshMap.get(layer.layerId);
      if (!mesh) {
        mesh = this.createThreeMesh(layer);
        this.meshMap.set(layer.layerId, mesh);
        this.scene3D.add(mesh);

        // Register in lifecycle tracker
        this.lifecycleManager.registerResource(
          layer.layerId,
          "GEOMETRY",
          layer.geometry.vertexPositions.byteLength,
          { layerKind: layer.layerKind }
        );
      } else {
        // Update geometry buffers in place
        this.updateMeshGeometry(mesh, layer);
      }

      mesh.visible = true;
      if (mesh.material) {
        mesh.material.opacity = layer.opacity;
      }
    }
  }

  private createThreeMesh(layer: SatelliteLayerSpec): any {
    const geom = new this.three!.BufferGeometry();
    geom.setAttribute(
      "position",
      new this.three!.BufferAttribute(layer.geometry.vertexPositions, 3)
    );
    geom.setAttribute(
      "uv",
      new this.three!.BufferAttribute(layer.geometry.uvCoordinates, 2)
    );
    geom.setIndex(new this.three!.BufferAttribute(layer.geometry.triangleIndices, 1));

    let mat: any;
    if (layer.material.type === "PBR_PHYSICAL") {
      mat = new this.three!.MeshPhysicalMaterial({
        roughness: layer.material.roughness,
        metalness: layer.material.metalness,
        sheen: layer.material.sheen,
        clearcoat: layer.material.clearcoat,
        opacity: layer.material.opacity,
        transparent: layer.material.opacity < 1.0,
        wireframe: layer.material.wireframe,
      });
    } else {
      mat = new this.three!.MeshBasicMaterial({
        opacity: layer.material.opacity,
        transparent: layer.material.opacity < 1.0,
        wireframe: layer.material.wireframe,
      });
    }

    return new this.three!.Mesh(geom, mat);
  }

  private updateMeshGeometry(mesh: any, layer: SatelliteLayerSpec): void {
    if (mesh.geometry) {
      const posAttr = mesh.geometry.getAttribute("position");
      if (posAttr && posAttr.array) {
        posAttr.array.set(layer.geometry.vertexPositions);
        posAttr.needsUpdate = true;
      }
      const uvAttr = mesh.geometry.getAttribute("uv");
      if (uvAttr && uvAttr.array) {
        uvAttr.array.set(layer.geometry.uvCoordinates);
        uvAttr.needsUpdate = true;
      }
    }
  }
}
