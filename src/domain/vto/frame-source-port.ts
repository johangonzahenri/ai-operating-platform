/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Frame Source Port — Hexagonal Secondary/Driven Port for Video & Camera Stream Acquisition.
 * 
 * Invariants:
 * - Domain layer is 100% pure: ZERO references or bindings to browser camera/DOM APIs.
 * - Full lifecycle state machine (UNINITIALIZED -> INITIALIZING -> ACTIVE <-> PAUSED -> STOPPED -> RELEASED / ERROR).
 * - Pluggable frame drop and backpressure policies (DROP_OLDEST, DROP_NEWEST, BACKPRESSURE_REJECT).
 * - Deterministic technical metrics (zero raw image logging, zero biometric template persistence).
 */

import {
  VideoFrameInput,
  FrameDimensions,
  PixelFormat,
} from "./frame-protocol.js";

export type FrameSourceStatus =
  | "UNINITIALIZED"
  | "INITIALIZING"
  | "ACTIVE"
  | "PAUSED"
  | "STOPPED"
  | "ERROR"
  | "RELEASED";

export type FrameDropPolicy =
  | "DROP_OLDEST"
  | "DROP_NEWEST"
  | "BACKPRESSURE_REJECT";

export interface FrameSourceConfig {
  readonly targetFps?: number | undefined;
  readonly preferredDimensions?: FrameDimensions | undefined;
  readonly pixelFormat?: PixelFormat | undefined;
  readonly dropPolicy?: FrameDropPolicy | undefined;
  readonly maxQueueCapacity?: number | undefined;
  readonly mirrorHorizontal?: boolean | undefined;
  readonly deviceId?: string | undefined;
}

export interface FrameSourceMetrics {
  readonly framesAcquired: number;
  readonly framesDelivered: number;
  readonly framesDropped: number;
  readonly dropRate: number;
  readonly lastAcquisitionTimestampMs: number;
  readonly averageFps: number;
  readonly queueDepth: number;
  readonly totalBytesTransferred: number;
  readonly errorsCount: number;
}

export type FrameConsumer = (frame: VideoFrameInput) => Promise<void> | void;

export interface FrameSourcePort {
  /**
   * Initializes the acquisition source with given configurations.
   */
  initialize(config?: FrameSourceConfig): Promise<void>;

  /**
   * Starts frame acquisition and stream delivery to the consumer callback.
   */
  start(onFrame: FrameConsumer): Promise<void>;

  /**
   * Temporarily pauses frame stream emissions without releasing hardware/buffers.
   */
  pause(): Promise<void>;

  /**
   * Resumes frame stream emissions from paused state.
   */
  resume(): Promise<void>;

  /**
   * Stops frame streaming.
   */
  stop(): Promise<void>;

  /**
   * Releases all underlying hardware handles, tracks, and memory.
   */
  release(): Promise<void>;

  /**
   * Acquires a single discrete frame if supported by the provider.
   */
  acquireFrame(): Promise<VideoFrameInput | null>;

  /**
   * Returns the current lifecycle status.
   */
  getStatus(): FrameSourceStatus;

  /**
   * Returns current aggregated operational metrics.
   */
  getMetrics(): Readonly<FrameSourceMetrics>;
}
