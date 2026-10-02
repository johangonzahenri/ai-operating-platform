/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Interactive Viewport & Camera Controller.
 * Manages user interactions (pan, zoom, orbit, rotate, reset) independently of CV pipelines.
 * 
 * Invariants:
 * 1. Computational Isolation: Interactive camera/viewport updates execute in O(1) time
 *    without triggering CV inference, neural re-runs, or garment re-warping.
 * 2. Fail-Closed Numerical Clamping: Non-finite inputs, NaNs, and out-of-bounds zooms/rotations
 *    are safely clamped to deterministic bounds.
 * 3. Bidirectional Projection: Provides project (Scene3D -> Screen) and unproject (Screen -> Scene3D)
 *    utilities for raycasting, selection, and touch/mouse interaction.
 */

import {
  RenderViewportModel,
  DEFAULT_VIEWPORT_MODEL,
  Point2D,
  SpatialCoordinateTransformer,
} from "../../domain/vto/render-contract.js";

export interface ViewportControllerConfig {
  readonly minZoom?: number | undefined; // default 0.25
  readonly maxZoom?: number | undefined; // default 4.0
  readonly minPitchDeg?: number | undefined; // default -45
  readonly maxPitchDeg?: number | undefined; // default 45
  readonly minYawDeg?: number | undefined;   // default -90
  readonly maxYawDeg?: number | undefined;   // default 90
  readonly initialViewport?: RenderViewportModel | undefined;
}

export type ViewportChangeListener = (viewport: RenderViewportModel) => void;

export class InteractiveViewportController {
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly minPitchDeg: number;
  private readonly maxPitchDeg: number;
  private readonly minYawDeg: number;
  private readonly maxYawDeg: number;

  private width: number;
  private height: number;
  private devicePixelRatio: number;
  private zoom: number;
  private rotationDeg: number;
  private pitchDeg: number = 0;
  private yawDeg: number = 0;
  private translation: Point2D;
  private isMirrored: boolean;

  private readonly initialSnapshot: RenderViewportModel;
  private readonly listeners: ViewportChangeListener[] = [];

  constructor(config?: ViewportControllerConfig) {
    const init = config?.initialViewport ?? DEFAULT_VIEWPORT_MODEL;
    this.minZoom = config?.minZoom ?? 0.25;
    this.maxZoom = config?.maxZoom ?? 4.0;
    this.minPitchDeg = config?.minPitchDeg ?? -45;
    this.maxPitchDeg = config?.maxPitchDeg ?? 45;
    this.minYawDeg = config?.minYawDeg ?? -90;
    this.maxYawDeg = config?.maxYawDeg ?? 90;

    this.width = Math.max(1, init.width);
    this.height = Math.max(1, init.height);
    this.devicePixelRatio = Math.max(0.1, init.devicePixelRatio);
    this.zoom = this.clampZoom(init.zoom);
    this.rotationDeg = this.normalizeAngle(init.rotationDeg);
    this.translation = { ...init.translation };
    this.isMirrored = !!init.isMirrored;

    this.initialSnapshot = Object.freeze({ ...this.getViewportModel() });
  }

  public getViewportModel(): RenderViewportModel {
    const aspectRatio = this.width / this.height;
    return Object.freeze({
      width: this.width,
      height: this.height,
      aspectRatio,
      devicePixelRatio: this.devicePixelRatio,
      scale: 1.0,
      translation: Object.freeze({ ...this.translation }),
      zoom: this.zoom,
      rotationDeg: this.rotationDeg,
      isMirrored: this.isMirrored,
    });
  }

  public getOrbitAngles(): { yawDeg: number; pitchDeg: number } {
    return { yawDeg: this.yawDeg, pitchDeg: this.pitchDeg };
  }

  public addListener(listener: ViewportChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  public setDimensions(width: number, height: number, devicePixelRatio?: number): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return;
    }
    this.width = Math.round(width);
    this.height = Math.round(height);
    if (devicePixelRatio !== undefined && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0) {
      this.devicePixelRatio = devicePixelRatio;
    }
    this.notify();
  }

  public pan(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return;
    }
    this.translation = {
      x: this.translation.x + deltaX,
      y: this.translation.y + deltaY,
    };
    this.notify();
  }

  public setTranslation(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    this.translation = { x, y };
    this.notify();
  }

  public zoomBy(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    this.zoom = this.clampZoom(this.zoom * factor);
    this.notify();
  }

  public setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return;
    }
    this.zoom = this.clampZoom(zoom);
    this.notify();
  }

  public rotateBy(degrees: number): void {
    if (!Number.isFinite(degrees)) {
      return;
    }
    this.rotationDeg = this.normalizeAngle(this.rotationDeg + degrees);
    this.notify();
  }

  public setRotation(degrees: number): void {
    if (!Number.isFinite(degrees)) {
      return;
    }
    this.rotationDeg = this.normalizeAngle(degrees);
    this.notify();
  }

  public orbit(deltaYaw: number, deltaPitch: number): void {
    if (!Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch)) {
      return;
    }
    this.yawDeg = Math.max(this.minYawDeg, Math.min(this.maxYawDeg, this.yawDeg + deltaYaw));
    this.pitchDeg = Math.max(this.minPitchDeg, Math.min(this.maxPitchDeg, this.pitchDeg + deltaPitch));
    this.notify();
  }

  public setMirror(isMirrored: boolean): void {
    if (this.isMirrored !== isMirrored) {
      this.isMirrored = isMirrored;
      this.notify();
    }
  }

  public reset(): void {
    this.width = this.initialSnapshot.width;
    this.height = this.initialSnapshot.height;
    this.devicePixelRatio = this.initialSnapshot.devicePixelRatio;
    this.zoom = this.initialSnapshot.zoom;
    this.rotationDeg = this.initialSnapshot.rotationDeg;
    this.pitchDeg = 0;
    this.yawDeg = 0;
    this.translation = { ...this.initialSnapshot.translation };
    this.isMirrored = this.initialSnapshot.isMirrored;
    this.notify();
  }

  public project(scenePoint: Point2D): Point2D {
    return SpatialCoordinateTransformer.scene3DToViewport(scenePoint, this.getViewportModel());
  }

  public unproject(screenPoint: Point2D): Point2D {
    return SpatialCoordinateTransformer.viewportToScene3D(screenPoint, this.getViewportModel());
  }

  private clampZoom(val: number): number {
    if (!Number.isFinite(val) || val <= 0) return 1.0;
    return Math.max(this.minZoom, Math.min(this.maxZoom, val));
  }

  private normalizeAngle(deg: number): number {
    if (!Number.isFinite(deg)) return 0;
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
  }

  private notify(): void {
    const current = this.getViewportModel();
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch {
        // Listener safety
      }
    }
  }
}
