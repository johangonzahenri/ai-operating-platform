/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Simulated Browser Render Adapter — Deterministic Test Double for CI & Unit/E2E Testing.
 * 
 * Invariants:
 * 1. Deterministic Execution: Synchronous or precisely timed frame rendering without DOM/WebGL requirements.
 * 2. Invariant Verification: Verifies layer counts, geometry types, and stale frame rejection rules.
 * 3. Telemetry & History: Records all rendered scenes, dropped frames, and state transitions for assertions.
 * 4. Hexagonal Contract Compliance: Implements BrowserRenderPort strictly.
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
} from "./browser-render-adapter.js";

export interface SimulatedRenderRecord {
  readonly sceneId: string;
  readonly sequenceNumber: number;
  readonly timestampMs: number;
  readonly layerCount: number;
  readonly qualityStatus: string;
  readonly isStale: boolean;
}

export interface DroppedFrameRecord {
  readonly sceneId: string;
  readonly sequenceNumber: number;
  readonly timestampMs: number;
  readonly reason: string;
}

export class SimulatedBrowserRenderAdapter implements BrowserRenderPort {
  private readonly lifecycleManager: SceneLifecycleManager;
  private latestRenderedSequence: number = -1;
  private currentWidth: number = DEFAULT_VIEWPORT_MODEL.width;
  private currentHeight: number = DEFAULT_VIEWPORT_MODEL.height;

  // Telemetry & assertion buffers
  private readonly renderedFrames: RenderFrameResult[] = [];
  private readonly renderedScenes: RenderSceneDescriptor[] = [];
  private readonly droppedFrames: DroppedFrameRecord[] = [];
  private readonly stateTransitions: Array<{ from: SceneLifecycleState; to: SceneLifecycleState }> = [];

  // Controllable test double behaviors
  private simulatedDelayMs: number = 0;
  private shouldFailNextRender: boolean = false;
  private nextRenderErrorMessage?: string | undefined;

  constructor(sceneId?: string) {
    const id = sceneId ?? `sim-scene-${Date.now()}`;
    this.lifecycleManager = new SceneLifecycleManager(id);
    this.lifecycleManager.addListener({
      onStateChange: (from, to) => {
        this.stateTransitions.push({ from, to });
      },
    });
  }

  public async initialize(_targetCanvas?: unknown): Promise<void> {
    if (this.lifecycleManager.getState() !== "UNINITIALIZED") {
      return;
    }

    this.lifecycleManager.transitionTo("INITIALIZING");

    this.lifecycleManager.registerResource(
      `sim-viewport-${this.lifecycleManager.getSceneId()}`,
      "VIEWPORT",
      this.currentWidth * this.currentHeight * 4,
      { width: this.currentWidth, height: this.currentHeight, mode: "SIMULATED" }
    );

    this.lifecycleManager.transitionTo("READY");
  }

  public async renderScene(scene: RenderSceneDescriptor): Promise<RenderFrameResult> {
    const startTime = Date.now();

    if (this.simulatedDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedDelayMs));
    }

    const state = this.lifecycleManager.getState();
    if (state !== "READY" && state !== "RENDERING") {
      const drop: DroppedFrameRecord = {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        timestampMs: Date.now(),
        reason: `INVALID_STATE_${state}`,
      };
      this.droppedFrames.push(drop);
      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: drop.reason,
        layersRenderedCount: 0,
        environmentMode: "SIMULATED",
      };
    }

    if (this.shouldFailNextRender) {
      this.shouldFailNextRender = false;
      const err = new Error(this.nextRenderErrorMessage ?? "Simulated render failure");
      this.lifecycleManager.setError(err);
      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: false,
        renderDurationMs: Date.now() - startTime,
        timestampMs: Date.now(),
        reason: `SIMULATED_FAILURE: ${err.message}`,
        layersRenderedCount: 0,
        environmentMode: "SIMULATED",
      };
    }

    // Stale sequence check (LATEST VALID RESULT > STALE RESULT)
    if (scene.isStale || scene.sequenceNumber <= this.latestRenderedSequence) {
      const drop: DroppedFrameRecord = {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        timestampMs: Date.now(),
        reason: "STALE_FRAME_REJECTED",
      };
      this.droppedFrames.push(drop);
      return {
        sceneId: scene.sceneId,
        sequenceNumber: scene.sequenceNumber,
        rendered: false,
        renderDurationMs: 0,
        timestampMs: Date.now(),
        reason: "STALE_FRAME_REJECTED",
        layersRenderedCount: 0,
        environmentMode: "SIMULATED",
      };
    }

    this.lifecycleManager.transitionTo("RENDERING");

    const layersRenderedCount = scene.layers.filter((l) => l.visible && l.opacity > 0).length;
    this.latestRenderedSequence = scene.sequenceNumber;

    const result: RenderFrameResult = {
      sceneId: scene.sceneId,
      sequenceNumber: scene.sequenceNumber,
      rendered: true,
      renderDurationMs: Math.max(0, Date.now() - startTime),
      timestampMs: Date.now(),
      layersRenderedCount,
      environmentMode: "SIMULATED",
    };

    this.renderedFrames.push(result);
    this.renderedScenes.push(scene);

    this.lifecycleManager.transitionTo("READY");

    return result;
  }

  public resize(width: number, height: number, _devicePixelRatio?: number): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return;
    }
    this.currentWidth = Math.round(width);
    this.currentHeight = Math.round(height);
  }

  public getLifecycleState(): SceneLifecycleState {
    return this.lifecycleManager.getState();
  }

  public getLatestRenderedSequence(): number {
    return this.latestRenderedSequence;
  }

  public async dispose(): Promise<DisposalReceipt> {
    return this.lifecycleManager.disposeAll();
  }

  // --- Test & Assertion Helpers ---

  public getRenderedFrames(): readonly RenderFrameResult[] {
    return this.renderedFrames;
  }

  public getRenderedScenes(): readonly RenderSceneDescriptor[] {
    return this.renderedScenes;
  }

  public getDroppedFrames(): readonly DroppedFrameRecord[] {
    return this.droppedFrames;
  }

  public getStateTransitions(): readonly Array<{ from: SceneLifecycleState; to: SceneLifecycleState }> {
    return this.stateTransitions;
  }

  public setSimulatedDelay(ms: number): void {
    this.simulatedDelayMs = Math.max(0, ms);
  }

  public triggerFailureOnNextRender(errorMessage?: string): void {
    this.shouldFailNextRender = true;
    this.nextRenderErrorMessage = errorMessage;
  }

  public clearHistory(): void {
    this.renderedFrames.length = 0;
    this.renderedScenes.length = 0;
    this.droppedFrames.length = 0;
    this.stateTransitions.length = 0;
  }
}
