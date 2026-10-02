/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Continuous Processing Loop Coordinator & Temporal Pipeline Scheduler.
 * 
 * Invariants:
 * 1. Latest-Frame Priority: Prioritizes the newest valid frame; coalesces or supersedes lagging frames.
 * 2. Stale-Result Protection: Out-of-order or lagging worker outputs never overwrite newer visual state.
 * 3. Bounded Backpressure: Ingestion queue depth is strictly bounded; rejects or evicts under congestion.
 * 4. Cooperative Cancellation: Propagates AbortSignal to cancel superseded in-flight work safely.
 * 5. Lifecycle Sandboxing: Enforces explicit finite state transitions with full resource cleanup upon dispose.
 * 6. Privacy by Design: Aggregates purely numerical metrics (latencies, counts); zero visual frame storage.
 */

import {
  VideoFrameInput,
  validateVideoFrameInput,
} from "../../domain/vto/frame-protocol.js";
import { FrameSourcePort } from "../../domain/vto/frame-source-port.js";
import {
  ContinuousLoopConfig,
  ContinuousLoopEventListener,
  ContinuousLoopMetrics,
  ContinuousLoopSnapshot,
  ContinuousLoopState,
  DEFAULT_CONTINUOUS_LOOP_CONFIG,
  isValidLoopStateTransition,
} from "../../domain/vto/continuous-processing-loop.js";
import {
  TemporalSynchronizer,
} from "../../domain/vto/temporal-synchronizer.js";
import {
  SpatialCompositionInput,
  SpatialWarpingComposite,
  SpatialWarpingCompositor,
} from "../../domain/vto/spatial-warping-compositor.js";
import { GarmentReference, BodyProfileReference } from "../../domain/vto/virtual-tryon.js";

export interface FrameProcessingContext {
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly timestampMs: number;
  readonly signal: AbortSignal;
}

export interface FrameProcessingOutput {
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly compositionInput?: Partial<SpatialCompositionInput> | undefined;
  readonly isCancelled?: boolean | undefined;
  readonly error?: string | undefined;
}

export type FrameProcessingHandler = (
  frame: VideoFrameInput,
  context: FrameProcessingContext
) => Promise<FrameProcessingOutput>;

export interface ContinuousCoordinatorOptions {
  readonly config?: Partial<ContinuousLoopConfig> | undefined;
  readonly frameSource?: FrameSourcePort | undefined;
  readonly processingHandler?: FrameProcessingHandler | undefined;
  readonly eventListener?: ContinuousLoopEventListener | undefined;
  readonly garment?: GarmentReference | undefined;
  readonly bodyProfile?: BodyProfileReference | undefined;
  readonly abortOnSupersede?: boolean | undefined;
}

interface QueuedFrameItem {
  readonly frame: VideoFrameInput;
  readonly generation: number;
  readonly sequenceNumber: number;
  readonly enqueuedAtMs: number;
}

interface ActiveProcessingItem {
  readonly frame: VideoFrameInput;
  readonly generation: number;
  readonly sequenceNumber: number;
  readonly abortController: AbortController;
  readonly startedAtMs: number;
}

export class ContinuousProcessingCoordinator {
  private _state: ContinuousLoopState = "UNINITIALIZED";
  private readonly _config: ContinuousLoopConfig;
  private readonly _frameSource?: FrameSourcePort | undefined;
  private readonly _processingHandler?: FrameProcessingHandler | undefined;
  private readonly _eventListener?: ContinuousLoopEventListener | undefined;
  private readonly _listeners: ContinuousLoopEventListener[] = [];
  private readonly _abortOnSupersede: boolean;

  private readonly _synchronizer: TemporalSynchronizer;
  private _queuedItem: QueuedFrameItem | null = null;
  private _activeItem: ActiveProcessingItem | null = null;

  private _latestValidResult?: SpatialWarpingComposite | undefined;
  private _activeFrameId?: string | undefined;

  // Numerical Metrics
  private _framesReceived: number = 0;
  private _framesAccepted: number = 0;
  private _framesDropped: number = 0;
  private _framesSuperseded: number = 0;
  private _framesProcessed: number = 0;
  private _resultsAccepted: number = 0;
  private _resultsStale: number = 0;
  private _resultsDiscarded: number = 0;
  private _processingErrors: number = 0;
  private _totalLoopLatencyMs: number = 0;
  private _maxLoopLatencyMs: number = 0;

  private _pollIntervalTimer?: ReturnType<typeof setInterval> | undefined;

  constructor(options?: ContinuousCoordinatorOptions) {
    this._config = {
      ...DEFAULT_CONTINUOUS_LOOP_CONFIG,
      ...(options?.config ?? {}),
    };
    this._frameSource = options?.frameSource;
    this._processingHandler = options?.processingHandler;
    this._eventListener = options?.eventListener;
    this._abortOnSupersede = options?.abortOnSupersede ?? true;
    this._synchronizer = new TemporalSynchronizer();
  }

  public getState(): ContinuousLoopState {
    return this._state;
  }

  public addEventListener(listener: ContinuousLoopEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx !== -1) {
        this._listeners.splice(idx, 1);
      }
    };
  }

  public async start(): Promise<void> {
    this._transitionTo("STARTING");

    if (this._frameSource) {
      await this._frameSource.initialize();
      await this._frameSource.start();
      this._startSourcePolling();
    }

    this._transitionTo("RUNNING");
  }

  public pause(): void {
    if (this._state === "RUNNING") {
      this._transitionTo("PAUSED");
      if (this._frameSource) {
        this._frameSource.pause().catch(() => {});
      }
    }
  }

  public resume(): void {
    if (this._state === "PAUSED") {
      this._transitionTo("RUNNING");
      if (this._frameSource) {
        this._frameSource.resume().catch(() => {});
      }
    }
  }

  public async stop(): Promise<void> {
    if (this._state === "STOPPED" || this._state === "DISPOSED") {
      return;
    }

    this._transitionTo("STOPPING");
    this._stopSourcePolling();

    // Cancel any active in-flight frame
    if (this._activeItem) {
      this._activeItem.abortController.abort("LOOP_STOPPED");
      this._synchronizer.markCancelled(this._activeItem.sequenceNumber);
      this._activeItem = null;
    }

    // Clear queued frame
    if (this._queuedItem) {
      this._framesDropped++;
      this._queuedItem = null;
    }

    if (this._frameSource) {
      await this._frameSource.stop().catch(() => {});
    }

    this._activeFrameId = undefined;
    this._transitionTo("STOPPED");
  }

  public async dispose(): Promise<void> {
    await this.stop();
    this._transitionTo("DISPOSED");

    if (this._frameSource) {
      await this._frameSource.release().catch(() => {});
    }

    this._synchronizer.reset();
  }

  /**
   * Primary entry point for feeding an acquired frame into the continuous loop.
   */
  public async feedFrame(frame: VideoFrameInput): Promise<boolean> {
    this._framesReceived++;

    if (this._state !== "RUNNING") {
      this._framesDropped++;
      this._eventListener?.onFrameDropped?.(
        frame?.frameId ?? "unknown",
        `Loop not running (state: ${this._state})`
      );
      return false;
    }

    // 1. Fail-closed validation
    const validation = validateVideoFrameInput(frame);
    if (!validation.isValid) {
      this._framesDropped++;
      this._eventListener?.onFrameDropped?.(
        frame?.frameId ?? "unknown",
        `Invalid frame: ${validation.error ?? "validation failed"}`
      );
      return false;
    }

    // 2. Register frame with temporal synchronizer (allocates sequence & generation)
    const { generation, sequenceNumber } = this._synchronizer.registerFrame(frame);
    this._framesAccepted++;

    const item: QueuedFrameItem = {
      frame,
      generation,
      sequenceNumber,
      enqueuedAtMs: Date.now(),
    };

    // 3. Scheduling & Backpressure Management
    if (this._activeItem) {
      // Worker is currently busy processing an earlier frame
      if (this._config.enableCoalescing) {
        if (this._queuedItem) {
          // Coalesce: supersede existing waiting frame with the newer one
          this._synchronizer.markSuperseded(this._queuedItem.sequenceNumber);
          this._framesSuperseded++;
        }
        this._queuedItem = item;

        // If cooperative cancellation is enabled, abort active frame because a newer one is waiting
        if (this._abortOnSupersede && this._activeItem) {
          this._activeItem.abortController.abort("SUPERSEDED_BY_NEWER_FRAME");
          this._synchronizer.markCancelled(this._activeItem.sequenceNumber);
          this._framesSuperseded++;
        }
      } else {
        // Coalescing disabled: check queue depth bounds
        if (this._queuedItem) {
          // Queue full: DROP_OLDEST
          this._synchronizer.markSuperseded(this._queuedItem.sequenceNumber);
          this._framesDropped++;
          this._queuedItem = item;
        } else {
          this._queuedItem = item;
        }
      }
    } else {
      // No active frame in progress: dispatch immediately
      this._dispatchFrame(item);
    }

    return true;
  }

  /**
   * Dispatches a frame to the processing handler asynchronously.
   */
  private async _dispatchFrame(item: QueuedFrameItem): Promise<void> {
    const abortController = new AbortController();
    this._activeItem = {
      frame: item.frame,
      generation: item.generation,
      sequenceNumber: item.sequenceNumber,
      abortController,
      startedAtMs: Date.now(),
    };
    this._activeFrameId = item.frame.frameId;

    const context: FrameProcessingContext = {
      frameId: item.frame.frameId,
      sequenceNumber: item.sequenceNumber,
      generation: item.generation,
      timestampMs: item.frame.metadata.timestamp?.acquisitionTimestampMs ?? Date.now(),
      signal: abortController.signal,
    };

    try {
      if (this._processingHandler) {
        const output = await this._processingHandler(item.frame, context);
        await this._handleProcessingOutput(output, item);
      } else {
        // Default transparent passthrough: directly compose spatial layer
        const defaultOutput: FrameProcessingOutput = {
          frameId: item.frame.frameId,
          sequenceNumber: item.sequenceNumber,
          generation: item.generation,
          compositionInput: {
            dimensions: item.frame.metadata.dimensions,
          },
        };
        await this._handleProcessingOutput(defaultOutput, item);
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        // Cooperative cancellation due to superseding: not an execution error
        this._resultsDiscarded++;
      } else {
        this._processingErrors++;
        const error = err instanceof Error ? err : new Error(String(err));
        this._eventListener?.onError?.(error);
      }
    } finally {
      if (this._activeItem?.sequenceNumber === item.sequenceNumber) {
        this._activeItem = null;
        this._activeFrameId = undefined;
      }

      // Check if another frame arrived while processing: dispatch next
      if (this._queuedItem && this._state === "RUNNING") {
        const nextItem = this._queuedItem;
        this._queuedItem = null;
        this._dispatchFrame(nextItem).catch(() => {});
      }
    }
  }

  /**
   * Evaluates the output of a frame processing task against temporal synchronization policies.
   */
  private async _handleProcessingOutput(
    output: FrameProcessingOutput,
    item: QueuedFrameItem
  ): Promise<void> {
    const classification = this._synchronizer.classifyResult(
      output.generation,
      output.sequenceNumber
    );

    if (classification === "STALE" || classification === "SUPERSEDED" || classification === "DUPLICATE") {
      this._resultsStale++;
      this._resultsDiscarded++;
      return;
    }

    if (classification !== "CURRENT") {
      this._resultsDiscarded++;
      return;
    }

    // Commit to temporal synchronizer (advances committed sequence marker)
    const committed = this._synchronizer.commitResult(output.generation, output.sequenceNumber);
    if (!committed) {
      this._resultsStale++;
      this._resultsDiscarded++;
      return;
    }

    // Build the final spatial warping composite
    const compositionInput: SpatialCompositionInput = {
      frameId: item.frame.frameId,
      sequenceNumber: item.sequenceNumber,
      generation: item.generation,
      timestampMs: item.frame.metadata.timestamp?.acquisitionTimestampMs ?? Date.now(),
      dimensions: item.frame.metadata.dimensions,
      previousValidComposite: this._latestValidResult,
      ...(output.compositionInput ?? {}),
    };

    const composite = SpatialWarpingCompositor.compose(compositionInput);
    this._latestValidResult = composite;
    this._resultsAccepted++;
    this._framesProcessed++;

    const latency = Date.now() - item.enqueuedAtMs;
    this._totalLoopLatencyMs += latency;
    if (latency > this._maxLoopLatencyMs) {
      this._maxLoopLatencyMs = latency;
    }

    this._eventListener?.onResult?.(composite);
    for (const listener of this._listeners) {
      try {
        listener.onResult?.(composite);
      } catch {
        // Listener safety
      }
    }
  }

  public getSnapshot(): ContinuousLoopSnapshot {
    return Object.freeze({
      state: this._state,
      currentGeneration: this._synchronizer.getCurrentGeneration(),
      latestAcceptedSequenceNumber: this._synchronizer.getLatestCommittedSequence(),
      activeFrameId: this._activeFrameId,
      metrics: this.getMetrics(),
      latestValidResult: this._latestValidResult,
      timestampMs: Date.now(),
    });
  }

  public getMetrics(): ContinuousLoopMetrics {
    const avgLatency = this._framesProcessed > 0
      ? Math.round(this._totalLoopLatencyMs / this._framesProcessed)
      : 0;

    return Object.freeze({
      framesReceived: this._framesReceived,
      framesAccepted: this._framesAccepted,
      framesDropped: this._framesDropped,
      framesSuperseded: this._framesSuperseded,
      framesProcessed: this._framesProcessed,
      resultsAccepted: this._resultsAccepted,
      resultsStale: this._resultsStale,
      resultsDiscarded: this._resultsDiscarded,
      processingErrors: this._processingErrors,
      currentQueueDepth: this._queuedItem ? 1 : 0,
      activeProcessing: this._activeItem !== null,
      currentGeneration: this._synchronizer.getCurrentGeneration(),
      latestAcceptedSequenceNumber: this._synchronizer.getLatestCommittedSequence(),
      averageLoopLatencyMs: avgLatency,
      maxLoopLatencyMs: this._maxLoopLatencyMs,
    });
  }

  public getLatestValidResult(): SpatialWarpingComposite | undefined {
    return this._latestValidResult;
  }

  private _transitionTo(newState: ContinuousLoopState): void {
    if (this._state === newState) return;
    if (!isValidLoopStateTransition(this._state, newState)) {
      throw new Error(`Invalid ContinuousLoopState transition from ${this._state} to ${newState}`);
    }
    const oldState = this._state;
    this._state = newState;
    this._eventListener?.onStateChange?.(oldState, newState);
  }

  private _startSourcePolling(): void {
    if (!this._frameSource) return;
    const intervalMs = Math.max(10, Math.floor(1000 / (this._config.targetFrameRateFps ?? 60)));

    this._pollIntervalTimer = setInterval(async () => {
      if (this._state !== "RUNNING" || !this._frameSource) return;
      try {
        const frame = await this._frameSource.acquireFrame();
        if (frame) {
          await this.feedFrame(frame);
        }
      } catch (err: unknown) {
        // Frame acquisition error handled gracefully
        this._processingErrors++;
      }
    }, intervalMs);
  }

  private _stopSourcePolling(): void {
    if (this._pollIntervalTimer) {
      clearInterval(this._pollIntervalTimer);
      this._pollIntervalTimer = undefined;
    }
  }
}
