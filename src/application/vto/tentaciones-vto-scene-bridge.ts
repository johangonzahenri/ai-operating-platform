/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Tentaciones VTO Scene Bridge & Application Integrator.
 * 
 * Invariants:
 * 1. Computational Decoupling: The 3D render loop displays the latest available scene state
 *    in O(1) time and NEVER triggers or blocks heavy Computer Vision / neural inference loops.
 * 2. Latest-Frame Priority: Late-arriving or superseded composites (sequence <= latestRenderedSequence)
 *    are discarded to eliminate visual tearing and flickering.
 * 3. Reactive Interactive Viewport: User camera manipulation (zoom, pan, orbit, reset) updates
 *    the active 3D scene without restarting or recomputing the CV pipeline.
 * 4. Privacy by Design: Aggregates purely numerical telemetry; zero caching or persistence of camera frames.
 */

import { VideoFrameInput } from "../../domain/vto/frame-protocol.js";
import { SpatialWarpingComposite } from "../../domain/vto/spatial-warping-compositor.js";
import { ContinuousLoopEventListener } from "../../domain/vto/continuous-processing-loop.js";
import { RenderViewportModel } from "../../domain/vto/render-contract.js";
import { ContinuousProcessingCoordinator } from "./continuous-processing-coordinator.js";
import { SpatialToRenderMapper } from "./spatial-to-render-mapper.js";
import { InteractiveViewportController } from "./interactive-viewport-controller.js";
import { Satellite3DRendererAdapter, Satellite3DRendererOptions } from "./satellite-3d-renderer-adapter.js";
import { RenderFrameResult } from "./browser-render-adapter.js";
import { DisposalReceipt } from "../../domain/vto/scene-lifecycle.js";

export interface VtoBridgeMetrics {
  readonly framesFed: number;
  readonly compositesReceived: number;
  readonly scenesRendered: number;
  readonly staleCompositesDropped: number;
  readonly interactiveUpdatesCount: number;
  readonly latestRenderedSequence: number;
}

export interface TentacionesVtoSceneBridgeOptions {
  readonly coordinator?: ContinuousProcessingCoordinator | undefined;
  readonly renderer?: Satellite3DRendererAdapter | undefined;
  readonly rendererOptions?: Satellite3DRendererOptions | undefined;
  readonly viewport?: RenderViewportModel | undefined;
  readonly autoRender?: boolean | undefined;
  readonly onRender?: ((result: RenderFrameResult) => void) | undefined;
  readonly onError?: ((error: Error) => void) | undefined;
}

export class TentacionesVtoSceneBridge {
  private readonly coordinator?: ContinuousProcessingCoordinator | undefined;
  private readonly renderer: Satellite3DRendererAdapter;
  private readonly viewportController: InteractiveViewportController;
  private readonly onRenderCallback?: ((result: RenderFrameResult) => void) | undefined;
  private readonly onErrorCallback?: ((error: Error) => void) | undefined;
  private unregisterCoordinatorListener?: (() => void) | undefined;

  private latestValidComposite?: SpatialWarpingComposite | undefined;
  private isInitialized: boolean = false;

  // Telemetry metrics
  private framesFedCount: number = 0;
  private compositesReceivedCount: number = 0;
  private scenesRenderedCount: number = 0;
  private staleCompositesDroppedCount: number = 0;
  private interactiveUpdatesCount: number = 0;

  constructor(options?: TentacionesVtoSceneBridgeOptions) {
    this.coordinator = options?.coordinator;
    this.renderer = options?.renderer ?? new Satellite3DRendererAdapter(options?.rendererOptions);
    this.viewportController = new InteractiveViewportController({
      initialViewport: options?.viewport,
    });
    this.onRenderCallback = options?.onRender;
    this.onErrorCallback = options?.onError;

    // Reactively refresh current scene when viewport changes (pan, zoom, orbit)
    this.viewportController.addListener(() => {
      this.handleViewportChanged();
    });

    // Wire coordinator event listener if autoRender is enabled
    if (options?.autoRender && this.coordinator && typeof (this.coordinator as any).addEventListener === "function") {
      this.unregisterCoordinatorListener = (this.coordinator as any).addEventListener(
        this.createLoopEventListener()
      );
    }
  }

  public async initialize(canvas?: unknown): Promise<void> {
    if (this.isInitialized) return;

    await this.renderer.initialize(canvas);

    if (this.coordinator && this.coordinator.getState() === "UNINITIALIZED") {
      await this.coordinator.start();
    }

    this.isInitialized = true;
  }

  public isRunning(): boolean {
    return this.isInitialized;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public createLoopEventListener(): ContinuousLoopEventListener {
    return {
      onResult: (composite) => {
        this.updateSceneFromComposite(composite).catch((err) => {
          this.onErrorCallback?.(err instanceof Error ? err : new Error(String(err)));
        });
      },
      onError: (err) => {
        this.onErrorCallback?.(err);
      },
    };
  }

  /**
   * Primary entry point for acquired camera/video frames from browser stream.
   */
  public async feedVideoFrame(frame: VideoFrameInput): Promise<boolean> {
    this.framesFedCount++;
    if (!this.coordinator) {
      return false;
    }
    return this.coordinator.feedFrame(frame);
  }

  /**
   * Consumes an assembled SpatialWarpingComposite from the continuous processing loop.
   */
  public async updateSceneFromComposite(composite: SpatialWarpingComposite): Promise<RenderFrameResult> {
    this.compositesReceivedCount++;

    const latestSeq = this.renderer.getLatestRenderedSequence();
    if (composite.isStale || composite.sequenceNumber <= latestSeq) {
      this.staleCompositesDroppedCount++;
      return {
        sceneId: `stale-${composite.frameId}`,
        sequenceNumber: composite.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: "STALE_FRAME_REJECTED",
        layersRenderedCount: 0,
        environmentMode: this.renderer.getEnvironmentMode(),
      };
    }

    this.latestValidComposite = composite;

    // Map composite to RenderSceneDescriptor with current viewport state
    const sceneDescriptor = SpatialToRenderMapper.mapToSceneDescriptor(composite, {
      viewport: this.viewportController.getViewportModel(),
      latestRenderedSequenceNumber: latestSeq,
    });

    const renderResult = await this.renderer.renderScene(sceneDescriptor);
    if (renderResult.rendered) {
      this.scenesRenderedCount++;
    }

    try {
      this.onRenderCallback?.(renderResult);
    } catch {
      // Callback safety
    }

    return renderResult;
  }

  public getViewportController(): InteractiveViewportController {
    return this.viewportController;
  }

  public getRenderer(): Satellite3DRendererAdapter {
    return this.renderer;
  }

  public getLatestValidComposite(): SpatialWarpingComposite | undefined {
    return this.latestValidComposite;
  }

  public getMetrics(): VtoBridgeMetrics {
    return {
      framesFed: this.framesFedCount,
      compositesReceived: this.compositesReceivedCount,
      scenesRendered: this.scenesRenderedCount,
      staleCompositesDropped: this.staleCompositesDroppedCount,
      interactiveUpdatesCount: this.interactiveUpdatesCount,
      latestRenderedSequence: this.renderer.getLatestRenderedSequence(),
    };
  }

  public resize(width: number, height: number, devicePixelRatio?: number): void {
    this.viewportController.setDimensions(width, height, devicePixelRatio);
    this.renderer.resize(width, height, devicePixelRatio);
  }

  public async dispose(): Promise<DisposalReceipt> {
    this.isInitialized = false;

    if (this.unregisterCoordinatorListener) {
      this.unregisterCoordinatorListener();
      this.unregisterCoordinatorListener = undefined;
    }

    if (this.coordinator && this.coordinator.getState() !== "DISPOSED") {
      await this.coordinator.dispose();
    }

    return this.renderer.dispose();
  }

  /**
   * Fast-path interactive redraw: updates viewport parameters in O(1)
   * without re-running CV inference or pose estimation.
   */
  public async handleInteractiveViewportUpdate(
    viewport?: RenderViewportModel
  ): Promise<RenderFrameResult> {
    if (viewport) {
      this.viewportController.setDimensions(viewport.width, viewport.height, viewport.devicePixelRatio);
    }
    return this.handleViewportChangedAsync(viewport);
  }

  private handleViewportChanged(): void {
    this.handleViewportChangedAsync().catch((err) => {
      this.onErrorCallback?.(err instanceof Error ? err : new Error(String(err)));
    });
  }

  private async handleViewportChangedAsync(
    overrideViewport?: RenderViewportModel
  ): Promise<RenderFrameResult> {
    if (!this.latestValidComposite || !this.isInitialized) {
      return {
        sceneId: "interactive-uninitialized",
        sequenceNumber: this.renderer.getLatestRenderedSequence() + 1,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: "NO_ACTIVE_COMPOSITE",
        layersRenderedCount: 0,
        environmentMode: this.renderer.getEnvironmentMode(),
      };
    }

    this.interactiveUpdatesCount++;

    const sceneDescriptor = SpatialToRenderMapper.mapToSceneDescriptor(this.latestValidComposite, {
      viewport: overrideViewport ?? this.viewportController.getViewportModel(),
      latestRenderedSequenceNumber: -1, // Force update for interactive refresh
    });

    const nextSeq = Math.max(1, this.renderer.getLatestRenderedSequence() + 1);
    const interactiveScene = {
      ...sceneDescriptor,
      sequenceNumber: nextSeq,
    };

    const res = await this.renderer.renderScene(interactiveScene);
    if (res.rendered) {
      this.scenesRenderedCount++;
    }
    this.onRenderCallback?.(res);
    return res;
  }
}
