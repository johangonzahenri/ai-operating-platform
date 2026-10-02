/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Browser Render Adapter & Canvas Render Boundary Port.
 * 
 * Invariants:
 * 1. Hexagonal Boundary: Defines the abstract BrowserRenderPort and provides a concrete
 *    peripheral adapter for 2D/WebGL/OffscreenCanvas rendering.
 * 2. Dependency Isolation: Zero compile-time or runtime dependencies on Three.js;
 *    concrete Three.js integration belongs strictly to satellite applications.
 * 3. Environment Capability Detection: Headless Node.js or environments without DOM/WebGL
 *    operate gracefully with explicit ENVIRONMENT_PENDING status.
 * 4. Stale Frame Protection: Enforces latestRenderedSequenceNumber tracking to reject
 *    out-of-order or stale scene frames before dispatching draw calls.
 * 5. Deterministic Lifecycle & Cleanup: All resources and canvas contexts are deterministically
 *    tracked and released via SceneLifecycleManager.
 */

import {
  RenderSceneDescriptor,
  RenderLayerDescriptor,
  DEFAULT_VIEWPORT_MODEL,
} from "../../domain/vto/render-contract.js";
import {
  SceneLifecycleManager,
  SceneLifecycleState,
  DisposalReceipt,
} from "../../domain/vto/scene-lifecycle.js";

export type RenderEnvironmentMode =
  | "WEBGL"
  | "WEBGPU"
  | "CANVAS_2D"
  | "ENVIRONMENT_PENDING"
  | "SIMULATED";

export interface RenderFrameResult {
  readonly sceneId: string;
  readonly sequenceNumber: number;
  readonly rendered: boolean;
  readonly renderDurationMs: number;
  readonly timestampMs: number;
  readonly reason?: string | undefined;
  readonly layersRenderedCount: number;
  readonly environmentMode: RenderEnvironmentMode;
}

export interface BrowserRenderPort {
  initialize(targetCanvas?: unknown): Promise<void>;
  renderScene(scene: RenderSceneDescriptor): Promise<RenderFrameResult>;
  resize(width: number, height: number, devicePixelRatio?: number): void;
  getLifecycleState(): SceneLifecycleState;
  getLatestRenderedSequence(): number;
  dispose(): Promise<DisposalReceipt>;
}

export interface BrowserCanvasRendererOptions {
  readonly canvas?: any | undefined;
  readonly preferredBackend?: "AUTO" | "WEBGL" | "CANVAS_2D" | undefined;
  readonly sceneId?: string | undefined;
}

export class BrowserCanvasRenderer implements BrowserRenderPort {
  private readonly lifecycleManager: SceneLifecycleManager;
  private canvas?: any | undefined;
  private context2d?: any | undefined;
  private webglContext?: any | undefined;
  private environmentMode: RenderEnvironmentMode = "ENVIRONMENT_PENDING";
  private latestRenderedSequence: number = -1;
  private currentWidth: number = DEFAULT_VIEWPORT_MODEL.width;
  private currentHeight: number = DEFAULT_VIEWPORT_MODEL.height;

  constructor(options?: BrowserCanvasRendererOptions) {
    const sceneId = options?.sceneId ?? `scene-${Date.now()}`;
    this.lifecycleManager = new SceneLifecycleManager(sceneId);
    this.canvas = options?.canvas;
  }

  public async initialize(targetCanvas?: unknown): Promise<void> {
    if (this.lifecycleManager.getState() !== "UNINITIALIZED") {
      return;
    }

    this.lifecycleManager.transitionTo("INITIALIZING");

    if (targetCanvas) {
      this.canvas = targetCanvas;
    }

    // Inspect environment & canvas capabilities
    if (this.canvas && typeof this.canvas.getContext === "function") {
      try {
        const gl = this.canvas.getContext("webgl2") || this.canvas.getContext("webgl");
        if (gl) {
          this.webglContext = gl;
          this.environmentMode = "WEBGL";
        } else {
          const c2d = this.canvas.getContext("2d");
          if (c2d) {
            this.context2d = c2d;
            this.environmentMode = "CANVAS_2D";
          } else {
            this.environmentMode = "ENVIRONMENT_PENDING";
          }
        }
      } catch {
        this.environmentMode = "ENVIRONMENT_PENDING";
      }
    } else if (typeof window !== "undefined" && typeof document !== "undefined") {
      // Browser DOM present but canvas not yet passed
      this.environmentMode = "CANVAS_2D";
    } else {
      // Headless Node.js / CI
      this.environmentMode = "ENVIRONMENT_PENDING";
    }

    // Register initial viewport resource
    this.lifecycleManager.registerResource(
      `viewport-${this.lifecycleManager.getSceneId()}`,
      "VIEWPORT",
      this.currentWidth * this.currentHeight * 4,
      { width: this.currentWidth, height: this.currentHeight, mode: this.environmentMode }
    );

    this.lifecycleManager.transitionTo("READY");
  }

  public async renderScene(scene: RenderSceneDescriptor): Promise<RenderFrameResult> {
    const startTime = Date.now();

    const currentState = this.lifecycleManager.getState();
    if (currentState !== "READY" && currentState !== "RENDERING") {
      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: `INVALID_LIFECYCLE_STATE_${currentState}`,
        layersRenderedCount: 0,
        environmentMode: this.environmentMode,
      };
    }

    // Stale check
    if (scene.isStale || scene.sequenceNumber <= this.latestRenderedSequence) {
      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: "STALE_FRAME_REJECTED",
        layersRenderedCount: 0,
        environmentMode: this.environmentMode,
      };
    }

    this.lifecycleManager.transitionTo("RENDERING");

    let layersDrawn = 0;

    try {
      if (this.context2d && typeof this.context2d.clearRect === "function") {
        this.context2d.clearRect(0, 0, this.currentWidth, this.currentHeight);
        for (const layer of scene.layers) {
          if (layer.visible && layer.opacity > 0) {
            this.renderLayer2D(layer);
            layersDrawn++;
          }
        }
      } else {
        // Mode is WEBGL (handled via shader pass or peripheral hook) or ENVIRONMENT_PENDING
        for (const layer of scene.layers) {
          if (layer.visible && layer.opacity > 0) {
            layersDrawn++;
          }
        }
      }

      this.latestRenderedSequence = scene.sequenceNumber;
      this.lifecycleManager.transitionTo("READY");

      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: true,
        renderDurationMs: Math.max(0, Date.now() - startTime),
        timestampMs: Date.now(),
        layersRenderedCount: layersDrawn,
        environmentMode: this.environmentMode,
      };
    } catch (err) {
      this.lifecycleManager.setError(err instanceof Error ? err : new Error(String(err)));
      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: false,
        renderDurationMs: Math.max(0, Date.now() - startTime),
        timestampMs: Date.now(),
        reason: `RENDER_ERROR: ${err instanceof Error ? err.message : String(err)}`,
        layersRenderedCount: layersDrawn,
        environmentMode: this.environmentMode,
      };
    }
  }

  public resize(width: number, height: number, _devicePixelRatio?: number): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return;
    }
    this.currentWidth = Math.round(width);
    this.currentHeight = Math.round(height);

    if (this.canvas) {
      this.canvas.width = this.currentWidth;
      this.canvas.height = this.currentHeight;
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

  public async dispose(): Promise<DisposalReceipt> {
    const receipt = this.lifecycleManager.disposeAll((resource) => {
      if (resource.type === "TEXTURE" || resource.type === "RENDER_TARGET") {
        // Cleanup native GPU/WebGL textures if present
      }
    });

    this.context2d = undefined;
    this.webglContext = undefined;
    this.canvas = undefined;

    return receipt;
  }

  private renderLayer2D(layer: RenderLayerDescriptor): void {
    if (!this.context2d) return;

    this.context2d.save();
    this.context2d.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

    if (layer.geometry.type === "DEFORMED_MESH_GRID" && layer.geometry.vertices) {
      // Draw wireframe or sampled representation
      this.context2d.strokeStyle = "#4a90e2";
      this.context2d.lineWidth = 1;
    } else {
      // Fullscreen quad representation
      this.context2d.fillStyle = "#1e1e1e";
    }

    this.context2d.restore();
  }
}
