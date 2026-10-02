/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Continuous Processing Loop Domain Contracts & Lifecycle Model.
 * 
 * Invariants:
 * 1. Hexagonal Domain Purity: Zero references to DOM, Canvas, WebGL, Worker globals, or browser APIs.
 * 2. Explicit State Machine: UNINITIALIZED -> STARTING -> RUNNING <-> PAUSED -> STOPPING -> STOPPED -> DISPOSED.
 * 3. Priority Principle: LATEST VALID FRAME > OLD FRAME, and LATEST VALID RESULT > STALE RESULT.
 * 4. Architectural Separation: The Loop is the continuous temporal scheduling policy;
 *    execution workers or inference providers are interchangeable processing resources.
 * 5. Privacy by Design: Metrics and snapshots aggregate exclusively numeric telemetry;
 *    zero persistence of raw pixel buffers, frame bytes, or facial/body biometrics.
 */

import { VideoFrameInput } from "./frame-protocol.js";
import { SpatialWarpingComposite } from "./spatial-warping-compositor.js";

export type ContinuousLoopState =
  | "UNINITIALIZED"
  | "STARTING"
  | "RUNNING"
  | "PAUSED"
  | "STOPPING"
  | "STOPPED"
  | "DISPOSED"
  | "ERROR";

export type StaleResultPolicy =
  | "DISCARD"
  | "LOG_METRIC_AND_DISCARD";

export type PartialResultPolicy =
  | "REUSE_PREVIOUS_VALID"
  | "DEGRADE_GRACEFULLY"
  | "DISCARD";

export interface ContinuousLoopConfig {
  /**
   * Maximum queue depth for incoming frames awaiting processing.
   * Strictly bounded to prevent unbounded memory growth (e.g. 1 or 2).
   */
  readonly maxQueueDepth: number;

  /**
   * Frame rate target limit (fps) for pacing, throttling, or backpressure.
   * e.g., 30 or 60.
   */
  readonly targetFrameRateFps?: number | undefined;

  /**
   * If true, a newly arrived frame replaces an existing queued frame that hasn't started yet.
   */
  readonly enableCoalescing: boolean;

  /**
   * Policy governing handling of results belonging to superseded or older frames.
   */
  readonly staleResultPolicy: StaleResultPolicy;

  /**
   * Policy governing how the compositor handles temporarily missing pipeline outputs (e.g. depth pending).
   */
  readonly partialResultPolicy: PartialResultPolicy;

  /**
   * Processing timeout per frame in milliseconds before triggering cancellation.
   */
  readonly frameTimeoutMs?: number | undefined;
}

export const DEFAULT_CONTINUOUS_LOOP_CONFIG: ContinuousLoopConfig = Object.freeze({
  maxQueueDepth: 2,
  targetFrameRateFps: 60,
  enableCoalescing: true,
  staleResultPolicy: "LOG_METRIC_AND_DISCARD",
  partialResultPolicy: "REUSE_PREVIOUS_VALID",
  frameTimeoutMs: 1000,
});

export interface ContinuousLoopMetrics {
  readonly framesReceived: number;
  readonly framesAccepted: number;
  readonly framesDropped: number;
  readonly framesSuperseded: number;
  readonly framesProcessed: number;
  readonly resultsAccepted: number;
  readonly resultsStale: number;
  readonly resultsDiscarded: number;
  readonly processingErrors: number;
  readonly currentQueueDepth: number;
  readonly activeProcessing: boolean;
  readonly currentGeneration: number;
  readonly latestAcceptedSequenceNumber: number;
  readonly averageLoopLatencyMs: number;
  readonly maxLoopLatencyMs: number;
}

export interface ContinuousLoopSnapshot {
  readonly state: ContinuousLoopState;
  readonly currentGeneration: number;
  readonly latestAcceptedSequenceNumber: number;
  readonly activeFrameId?: string | undefined;
  readonly metrics: ContinuousLoopMetrics;
  readonly latestValidResult?: SpatialWarpingComposite | undefined;
  readonly timestampMs: number;
}

export interface ContinuousLoopEventListener {
  onResult?(result: SpatialWarpingComposite): void;
  onFrameDropped?(frameId: string, reason: string): void;
  onStateChange?(from: ContinuousLoopState, to: ContinuousLoopState): void;
  onError?(error: Error): void;
}

/**
 * Validates a ContinuousLoopState transition according to canonical finite state machine rules.
 */
export function isValidLoopStateTransition(
  from: ContinuousLoopState,
  to: ContinuousLoopState
): boolean {
  if (from === to) return true;

  switch (from) {
    case "UNINITIALIZED":
      return to === "STARTING" || to === "DISPOSED";
    case "STARTING":
      return to === "RUNNING" || to === "ERROR" || to === "STOPPED";
    case "RUNNING":
      return to === "PAUSED" || to === "STOPPING" || to === "ERROR" || to === "DISPOSED";
    case "PAUSED":
      return to === "RUNNING" || to === "STOPPING" || to === "ERROR" || to === "DISPOSED";
    case "STOPPING":
      return to === "STOPPED" || to === "ERROR";
    case "STOPPED":
      return to === "STARTING" || to === "RUNNING" || to === "DISPOSED";
    case "ERROR":
      return to === "STARTING" || to === "STOPPED" || to === "DISPOSED";
    case "DISPOSED":
      return false; // Terminal state
    default:
      return false;
  }
}
