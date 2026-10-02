/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Simulated Continuous Pipeline & Deterministic Test Double.
 * 
 * Invariants:
 * 1. Deterministic Control: Empowers unit and E2E tests to simulate out-of-order completions,
 *    controlled latency bursts, queue congestion, and cooperative cancellations without real timing nondeterminism.
 * 2. Neutral Synthetic Frames: Produces fully compliant VideoFrameInput fixtures with valid metadata.
 * 3. Step-by-Step Resolution: Supports manual deferred resolution to test out-of-order arrival scenarios:
 *    e.g. resolve Frame 12 before resolving Frames 10 and 11, proving stale rejection.
 * 4. Zero DOM/Browser APIs: Operates 100% in Node.js test environments.
 */

import {
  FrameDimensions,
  PixelFormat,
  VideoFrameInput,
} from "../../domain/vto/frame-protocol.js";
import {
  ContinuousProcessingCoordinator,
  FrameProcessingContext,
  FrameProcessingOutput,
} from "./continuous-processing-coordinator.js";
import { WarpField2D, createAffineWarpField } from "../../domain/vto/warp-field.js";

export interface SyntheticFrameOptions {
  readonly sequenceNumber: number;
  readonly frameId?: string | undefined;
  readonly timestampMs?: number | undefined;
  readonly dimensions?: FrameDimensions | undefined;
  readonly pixelFormat?: PixelFormat | undefined;
}

export function createSyntheticVideoFrame(options: SyntheticFrameOptions): VideoFrameInput {
  const width = options.dimensions?.width ?? 640;
  const height = options.dimensions?.height ?? 480;
  const format = options.pixelFormat ?? "RGBA8";
  const bytesPerPixel = format === "RGBA8" || format === "BGRA8" ? 4 : format === "RGB8" ? 3 : 1;
  const byteLength = width * height * bytesPerPixel;
  const buffer = new Uint8Array(byteLength);

  const timestampMs = options.timestampMs ?? Date.now();
  const frameId = options.frameId ?? `synth-frame-${options.sequenceNumber}-${timestampMs}`;

  return {
    frameId,
    buffer,
    metadata: {
      dimensions: { width, height },
      pixelFormat: format,
      colorSpace: "srgb",
      byteLength,
      timestamp: {
        acquisitionTimestampMs: timestampMs,
        sequenceNumber: options.sequenceNumber,
      },
      isSynthetic: true,
    },
  };
}

export interface DeferredFrameTask {
  readonly frame: VideoFrameInput;
  readonly context: FrameProcessingContext;
  resolve(output: FrameProcessingOutput): void;
  reject(error: Error): void;
}

export class SimulatedContinuousPipeline {
  private readonly _deferredTasks: Map<number, DeferredFrameTask> = new Map();
  private _delayMs: number = 0;
  private _shouldFail: boolean = false;
  private _failErrorMessage: string = "Simulated worker execution failure";

  public setSimulatedDelay(delayMs: number): void {
    this._delayMs = delayMs;
  }

  public setShouldFail(shouldFail: boolean, message?: string): void {
    this._shouldFail = shouldFail;
    if (message) this._failErrorMessage = message;
  }

  /**
   * Processing handler suitable for injection into ContinuousProcessingCoordinator.
   */
  public createProcessingHandler(
    warpFieldGenerator?: (seq: number) => WarpField2D
  ) {
    return async (
      frame: VideoFrameInput,
      context: FrameProcessingContext
    ): Promise<FrameProcessingOutput> => {
      if (this._shouldFail) {
        throw new Error(this._failErrorMessage);
      }

      if (context.signal.aborted) {
        return {
          frameId: frame.frameId,
          sequenceNumber: context.sequenceNumber,
          generation: context.generation,
          isCancelled: true,
        };
      }

      // Check if we are in manual deferred resolution mode (delayMs === -1)
      if (this._delayMs === -1) {
        return new Promise<FrameProcessingOutput>((resolve, reject) => {
          this._deferredTasks.set(context.sequenceNumber, {
            frame,
            context,
            resolve,
            reject,
          });

          context.signal.addEventListener("abort", () => {
            if (this._deferredTasks.has(context.sequenceNumber)) {
              this._deferredTasks.delete(context.sequenceNumber);
              resolve({
                frameId: frame.frameId,
                sequenceNumber: context.sequenceNumber,
                generation: context.generation,
                isCancelled: true,
              });
            }
          });
        });
      }

      if (this._delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => resolve(), this._delayMs);
          context.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      if (context.signal.aborted) {
        return {
          frameId: frame.frameId,
          sequenceNumber: context.sequenceNumber,
          generation: context.generation,
          isCancelled: true,
        };
      }

      const warp = warpFieldGenerator
        ? warpFieldGenerator(context.sequenceNumber)
        : createAffineWarpField(8, 8, {
            scale: { x: 1.0, y: 1.0 },
            rotationDegrees: 0,
            translation: { x: 0, y: 0 },
            anchorOrigin: { x: 0.5, y: 0.5 },
            boundingBox: { xMin: 0.2, yMin: 0.2, xMax: 0.8, yMax: 0.8 },
          });

      return {
        frameId: frame.frameId,
        sequenceNumber: context.sequenceNumber,
        generation: context.generation,
        compositionInput: {
          dimensions: frame.metadata.dimensions,
          warpField: warp,
          alignmentScore: 0.95,
        },
      };
    };
  }

  /**
   * Manually resolves a deferred frame task by sequence number to simulate out-of-order arrival.
   */
  public resolveFrameManually(
    sequenceNumber: number,
    warpField?: WarpField2D
  ): boolean {
    const task = this._deferredTasks.get(sequenceNumber);
    if (!task) return false;

    this._deferredTasks.delete(sequenceNumber);
    const warp = warpField ?? createAffineWarpField(8, 8, {
      scale: { x: 1.0, y: 1.0 },
      rotationDegrees: 0,
      translation: { x: 0, y: 0 },
      anchorOrigin: { x: 0.5, y: 0.5 },
      boundingBox: { xMin: 0.2, yMin: 0.2, xMax: 0.8, yMax: 0.8 },
    });

    task.resolve({
      frameId: task.frame.frameId,
      sequenceNumber: task.context.sequenceNumber,
      generation: task.context.generation,
      compositionInput: {
        dimensions: task.frame.metadata.dimensions,
        warpField: warp,
        alignmentScore: 0.95,
      },
    });

    return true;
  }

  public getPendingTaskCount(): number {
    return this._deferredTasks.size;
  }

  public getPendingSequences(): number[] {
    return Array.from(this._deferredTasks.keys()).sort((a, b) => a - b);
  }

  public cancelAll(): void {
    for (const [seq, task] of this._deferredTasks.entries()) {
      task.resolve({
        frameId: task.frame.frameId,
        sequenceNumber: task.context.sequenceNumber,
        generation: task.context.generation,
        isCancelled: true,
      });
    }
    this._deferredTasks.clear();
  }
}
