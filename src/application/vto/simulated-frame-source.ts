/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Simulated Frame Source — Deterministic Test Double for Video / Camera Streams.
 * 
 * Invariants:
 * - Implements FrameSourcePort with 100% deterministic synthetic pattern generation.
 * - Full lifecycle state machine transitions with explicit status checks.
 * - Deterministic backpressure enforcement (DROP_OLDEST, DROP_NEWEST, BACKPRESSURE_REJECT).
 * - Bounded queue depth and zero unmanaged timer leaks on stop/release.
 * - Accurate technical metrics without storing or logging private visual data.
 */

import {
  FrameSourcePort,
  FrameSourceStatus,
  FrameSourceConfig,
  FrameSourceMetrics,
  FrameConsumer,
  FrameDropPolicy,
} from "../../domain/vto/frame-source-port.js";
import {
  VideoFrameInput,
  FrameDimensions,
  PixelFormat,
  getBytesPerPixel,
} from "../../domain/vto/frame-protocol.js";

export interface SimulatedFrameSourceOptions extends FrameSourceConfig {
  readonly syntheticPattern?: "COLOR_BARS" | "GRADIENT" | "SOLID_COLOR" | undefined;
  readonly simulatedFailureProbability?: number | undefined;
}

export class SimulatedFrameSource implements FrameSourcePort {
  private _status: FrameSourceStatus = "UNINITIALIZED";
  private _config: FrameSourceConfig;
  private _options: SimulatedFrameSourceOptions;
  private _consumer?: FrameConsumer | undefined;
  private _intervalTimer?: NodeJS.Timeout | undefined;
  private _frameCounter = 0;
  private _queue: VideoFrameInput[] = [];

  // Metrics
  private _framesAcquired = 0;
  private _framesDelivered = 0;
  private _framesDropped = 0;
  private _lastAcquisitionTimestampMs = 0;
  private _totalBytesTransferred = 0;
  private _errorsCount = 0;
  private _startActiveTimestampMs = 0;

  constructor(options?: SimulatedFrameSourceOptions) {
    this._options = options ?? {};
    this._config = {
      targetFps: options?.targetFps ?? 30,
      preferredDimensions: options?.preferredDimensions ?? { width: 640, height: 480 },
      pixelFormat: options?.pixelFormat ?? "RGBA8",
      dropPolicy: options?.dropPolicy ?? "DROP_OLDEST",
      maxQueueCapacity: options?.maxQueueCapacity ?? 5,
      mirrorHorizontal: options?.mirrorHorizontal ?? false,
      deviceId: options?.deviceId ?? "simulated-camera-0",
    };
  }

  public async initialize(config?: FrameSourceConfig): Promise<void> {
    if (this._status === "RELEASED") {
      throw new Error("Cannot initialize a released frame source");
    }
    this._status = "INITIALIZING";

    if (config) {
      this._config = {
        targetFps: config.targetFps ?? this._config.targetFps,
        preferredDimensions: config.preferredDimensions ?? this._config.preferredDimensions,
        pixelFormat: config.pixelFormat ?? this._config.pixelFormat,
        dropPolicy: config.dropPolicy ?? this._config.dropPolicy,
        maxQueueCapacity: config.maxQueueCapacity ?? this._config.maxQueueCapacity,
        mirrorHorizontal: config.mirrorHorizontal ?? this._config.mirrorHorizontal,
        deviceId: config.deviceId ?? this._config.deviceId,
      };
    }

    this._status = "STOPPED";
  }

  public async start(onFrame: FrameConsumer): Promise<void> {
    if (this._status === "RELEASED") {
      throw new Error("Cannot start a released frame source");
    }
    if (this._status === "ACTIVE") {
      return; // Already active, idempotent
    }

    this._consumer = onFrame;
    this._status = "ACTIVE";
    this._startActiveTimestampMs = Date.now();

    // If targetFps > 0 and automatic emission is desired, schedule interval
    const fps = this._config.targetFps ?? 30;
    if (fps > 0 && typeof setInterval !== "undefined") {
      const intervalMs = Math.max(1, Math.round(1000 / fps));
      this._intervalTimer = setInterval(() => {
        if (this._status === "ACTIVE") {
          this.emitFrameInternal().catch((err) => {
            this._errorsCount++;
          });
        }
      }, intervalMs);
    }
  }

  public async pause(): Promise<void> {
    if (this._status !== "ACTIVE") {
      return;
    }
    this._status = "PAUSED";
  }

  public async resume(): Promise<void> {
    if (this._status !== "PAUSED") {
      return;
    }
    this._status = "ACTIVE";
  }

  public async stop(): Promise<void> {
    if (this._status === "RELEASED" || this._status === "STOPPED") {
      return;
    }
    this.clearTimer();
    this._queue = [];
    this._status = "STOPPED";
  }

  public async release(): Promise<void> {
    this.clearTimer();
    this._queue = [];
    this._consumer = undefined;
    this._status = "RELEASED";
  }

  public async acquireFrame(): Promise<VideoFrameInput | null> {
    if (this._status === "RELEASED" || this._status === "ERROR") {
      return null;
    }
    return this.generateSyntheticFrame();
  }

  public getStatus(): FrameSourceStatus {
    return this._status;
  }

  public getMetrics(): Readonly<FrameSourceMetrics> {
    const elapsedSec = Math.max(0.001, (Date.now() - (this._startActiveTimestampMs || Date.now())) / 1000);
    const dropRate = this._framesAcquired > 0 ? this._framesDropped / this._framesAcquired : 0;
    const averageFps = this._framesDelivered / elapsedSec;

    return {
      framesAcquired: this._framesAcquired,
      framesDelivered: this._framesDelivered,
      framesDropped: this._framesDropped,
      dropRate,
      lastAcquisitionTimestampMs: this._lastAcquisitionTimestampMs,
      averageFps,
      queueDepth: this._queue.length,
      totalBytesTransferred: this._totalBytesTransferred,
      errorsCount: this._errorsCount,
    };
  }

  /**
   * Deterministically emits the next synthetic frame (useful in unit tests without timers).
   */
  public async stepEmit(): Promise<VideoFrameInput | null> {
    if (this._status === "RELEASED" || this._status === "ERROR") {
      return null;
    }
    return this.emitFrameInternal();
  }

  /**
   * Simulates an error transition for testing fail-safe handling.
   */
  public simulateError(errorMessage: string): void {
    this.clearTimer();
    this._status = "ERROR";
    this._errorsCount++;
  }

  private clearTimer(): void {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = undefined;
    }
  }

  private async emitFrameInternal(): Promise<VideoFrameInput | null> {
    const frame = this.generateSyntheticFrame();
    this._framesAcquired++;
    this._lastAcquisitionTimestampMs = frame.metadata.timestamp.acquisitionTimestampMs;

    const maxQueue = this._config.maxQueueCapacity ?? 5;
    const policy = this._config.dropPolicy ?? "DROP_OLDEST";

    // Enforce backpressure queue policy
    if (this._queue.length >= maxQueue) {
      if (policy === "DROP_OLDEST") {
        this._queue.shift(); // Drop oldest
        this._framesDropped++;
        this._queue.push(frame);
      } else if (policy === "DROP_NEWEST") {
        this._framesDropped++;
        return null; // Drop current newest frame
      } else if (policy === "BACKPRESSURE_REJECT") {
        this._framesDropped++;
        this._errorsCount++;
        throw new Error(`Backpressure limit exceeded: queue at capacity ${maxQueue}`);
      }
    } else {
      this._queue.push(frame);
    }

    // Process queued frame only if status is ACTIVE
    if (this._status === "ACTIVE") {
      const nextFrame = this._queue.shift();
      if (nextFrame && this._consumer) {
        try {
          await this._consumer(nextFrame);
          this._framesDelivered++;
          this._totalBytesTransferred += nextFrame.metadata.byteLength;
          return nextFrame;
        } catch (err) {
          this._errorsCount++;
          return null;
        }
      }
      return nextFrame ?? null;
    }

    // While PAUSED or STOPPED, frames accumulate in the queue
    return frame;
  }

  private generateSyntheticFrame(): VideoFrameInput {
    const dims = this._config.preferredDimensions ?? { width: 640, height: 480 };
    const format = this._config.pixelFormat ?? "RGBA8";
    const bpp = getBytesPerPixel(format);
    const byteLength = dims.width * dims.height * bpp;
    const buffer = new Uint8Array(byteLength);

    const seq = this._frameCounter++;
    const now = Date.now();
    const pattern = this._options.syntheticPattern ?? "COLOR_BARS";

    if (pattern === "COLOR_BARS") {
      // 8 standard color bars across columns
      const barWidth = Math.max(1, Math.floor(dims.width / 8));
      const palette = [
        [255, 255, 255], // White
        [255, 255, 0],   // Yellow
        [0, 255, 255],   // Cyan
        [0, 255, 0],     // Green
        [255, 0, 255],   // Magenta
        [255, 0, 0],     // Red
        [0, 0, 255],     // Blue
        [0, 0, 0],       // Black
      ];

      for (let y = 0; y < dims.height; y++) {
        for (let x = 0; x < dims.width; x++) {
          const barIdx = Math.min(palette.length - 1, Math.floor(x / barWidth));
          const [r, g, b] = palette[barIdx]!;
          const offset = (y * dims.width + x) * bpp;

          if (format === "RGBA8") {
            buffer[offset] = r!;
            buffer[offset + 1] = g!;
            buffer[offset + 2] = b!;
            buffer[offset + 3] = 255;
          } else if (format === "BGRA8") {
            buffer[offset] = b!;
            buffer[offset + 1] = g!;
            buffer[offset + 2] = r!;
            buffer[offset + 3] = 255;
          } else if (format === "RGB8") {
            buffer[offset] = r!;
            buffer[offset + 1] = g!;
            buffer[offset + 2] = b!;
          } else if (format === "GRAYSCALE8") {
            buffer[offset] = Math.round(0.299 * r! + 0.587 * g! + 0.114 * b!);
          }
        }
      }
    } else {
      // Fill with solid or gradient
      buffer.fill(128);
    }

    return {
      frameId: `sim-frame-${seq}`,
      buffer,
      metadata: {
        dimensions: dims,
        pixelFormat: format,
        colorSpace: "srgb",
        timestamp: {
          acquisitionTimestampMs: now,
          presentationTimestampMs: now,
          sequenceNumber: seq,
        },
        byteLength,
        stride: dims.width * bpp,
        mirrored: this._config.mirrorHorizontal ?? false,
        rotationDegrees: 0,
        sourceDeviceId: this._config.deviceId,
        isSynthetic: true,
      },
    };
  }
}
