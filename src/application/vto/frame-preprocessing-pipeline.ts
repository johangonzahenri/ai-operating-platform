/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Frame Preprocessing Pipeline — Pure Neutral Video Frame Normalization & Scaling.
 * 
 * Invariants:
 * - Operates purely on TypedArray / ArrayBuffer memory buffers (zero DOM/browser dependencies).
 * - Aspect-ratio preserving downscaling and bounding box constraints.
 * - Spatial orientation normalization (0, 90, 180, 270 deg rotation & horizontal mirroring).
 * - Color format normalization (RGBA8, RGB8, BGRA8, GRAYSCALE8).
 * - Monotonic timestamp sequencing compatible with Pose/Alignment and One-Euro filters.
 * - Deterministic corruption rejection and bounded memory footprint.
 */

import {
  VideoFrameInput,
  FrameDimensions,
  PixelFormat,
  FrameOrientation,
  FrameMetadata,
  validateVideoFrameInput,
  getBytesPerPixel,
} from "../../domain/vto/frame-protocol.js";

export interface PreprocessingPipelineConfig {
  readonly maxDimensions?: FrameDimensions | undefined;
  readonly targetDimensions?: FrameDimensions | undefined;
  readonly targetFormat?: PixelFormat | undefined;
  readonly normalizeOrientation?: boolean | undefined;
  readonly mirrorHorizontal?: boolean | undefined;
  readonly enforceMonotonicTimestamps?: boolean | undefined;
}

export interface FramePreprocessingResult {
  readonly success: boolean;
  readonly frame?: VideoFrameInput | undefined;
  readonly error?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly processingDurationMs: number;
  readonly bytesTransformed: number;
  readonly dropped: boolean;
}

export class FramePreprocessingPipeline {
  private readonly _config: PreprocessingPipelineConfig;
  private _lastTimestampMs = 0;
  private _nextSequenceNumber = 0;

  constructor(config?: PreprocessingPipelineConfig) {
    this._config = {
      maxDimensions: config?.maxDimensions ?? { width: 1920, height: 1080 },
      targetDimensions: config?.targetDimensions,
      targetFormat: config?.targetFormat ?? "RGBA8",
      normalizeOrientation: config?.normalizeOrientation ?? true,
      mirrorHorizontal: config?.mirrorHorizontal ?? false,
      enforceMonotonicTimestamps: config?.enforceMonotonicTimestamps ?? true,
    };
  }

  public reset(): void {
    this._lastTimestampMs = 0;
    this._nextSequenceNumber = 0;
  }

  /**
   * Preprocesses an incoming neutral video frame:
   * 1. Fail-closed structural and numerical validation.
   * 2. Orientation & mirror normalization.
   * 3. Dimension bounds check & bilinear/nearest-neighbor scaling.
   * 4. Color format normalization.
   * 5. Monotonic timestamp verification.
   */
  public process(input: VideoFrameInput): FramePreprocessingResult {
    const startMs = Date.now();

    // 1. Validation
    const val = validateVideoFrameInput(input);
    if (!val.isValid || !val.frame) {
      return {
        success: false,
        error: val.error ?? "Invalid frame input",
        errorCode: val.errorCode ?? "INVALID_PAYLOAD",
        processingDurationMs: Math.max(0, Date.now() - startMs),
        bytesTransformed: 0,
        dropped: true,
      };
    }

    const { frameId, buffer, metadata } = val.frame;
    const srcWidth = metadata.dimensions.width;
    const srcHeight = metadata.dimensions.height;
    const srcFormat = metadata.pixelFormat;

    // Convert input buffer view to Uint8Array
    let srcBytes: Uint8Array;
    if (buffer instanceof ArrayBuffer) {
      srcBytes = new Uint8Array(buffer);
    } else if (ArrayBuffer.isView(buffer)) {
      srcBytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      return {
        success: false,
        error: "Unrecognized buffer type",
        errorCode: "INVALID_BUFFER",
        processingDurationMs: Math.max(0, Date.now() - startMs),
        bytesTransformed: 0,
        dropped: true,
      };
    }

    // 2. Monotonic timestamp check
    let effectiveTimestampMs = metadata.timestamp.acquisitionTimestampMs;
    if (this._config.enforceMonotonicTimestamps) {
      if (effectiveTimestampMs < this._lastTimestampMs) {
        // Enforce monotonic progression
        effectiveTimestampMs = this._lastTimestampMs + 1;
      }
      this._lastTimestampMs = effectiveTimestampMs;
    }
    const sequenceNumber = this._nextSequenceNumber++;

    // 3. Normalize format to standard RGBA8 if needed
    let currentPixels: Uint8ClampedArray;
    if (srcFormat === "RGBA8") {
      currentPixels = new Uint8ClampedArray(srcBytes.subarray(0, srcWidth * srcHeight * 4));
    } else if (srcFormat === "BGRA8") {
      currentPixels = new Uint8ClampedArray(srcWidth * srcHeight * 4);
      for (let i = 0; i < srcWidth * srcHeight; i++) {
        const off = i * 4;
        currentPixels[off] = srcBytes[off + 2]!; // R <- B
        currentPixels[off + 1] = srcBytes[off + 1]!; // G <- G
        currentPixels[off + 2] = srcBytes[off]!; // B <- R
        currentPixels[off + 3] = srcBytes[off + 3]!; // A <- A
      }
    } else if (srcFormat === "RGB8") {
      currentPixels = new Uint8ClampedArray(srcWidth * srcHeight * 4);
      for (let i = 0; i < srcWidth * srcHeight; i++) {
        const srcOff = i * 3;
        const dstOff = i * 4;
        currentPixels[dstOff] = srcBytes[srcOff]!;
        currentPixels[dstOff + 1] = srcBytes[srcOff + 1]!;
        currentPixels[dstOff + 2] = srcBytes[srcOff + 2]!;
        currentPixels[dstOff + 3] = 255;
      }
    } else if (srcFormat === "GRAYSCALE8") {
      currentPixels = new Uint8ClampedArray(srcWidth * srcHeight * 4);
      for (let i = 0; i < srcWidth * srcHeight; i++) {
        const gray = srcBytes[i]!;
        const dstOff = i * 4;
        currentPixels[dstOff] = gray;
        currentPixels[dstOff + 1] = gray;
        currentPixels[dstOff + 2] = gray;
        currentPixels[dstOff + 3] = 255;
      }
    } else {
      return {
        success: false,
        error: `Unsupported pixel format: ${srcFormat}`,
        errorCode: "UNSUPPORTED_PIXEL_FORMAT",
        processingDurationMs: Math.max(0, Date.now() - startMs),
        bytesTransformed: 0,
        dropped: true,
      };
    }

    let curWidth = srcWidth;
    let curHeight = srcHeight;

    // 4. Spatial orientation & mirroring
    const shouldRotate = this._config.normalizeOrientation && metadata.rotationDegrees && metadata.rotationDegrees !== 0;
    const shouldMirror = (this._config.mirrorHorizontal ?? false) !== (metadata.mirrored ?? false);

    if (shouldRotate || shouldMirror) {
      const rot = (metadata.rotationDegrees ?? 0) as FrameOrientation;
      const res = this.applyOrientation(currentPixels, curWidth, curHeight, rot, shouldMirror);
      currentPixels = res.pixels;
      curWidth = res.width;
      curHeight = res.height;
    }

    // 5. Downscaling / Target Dimension adjustment
    let targetWidth = curWidth;
    let targetHeight = curHeight;

    if (this._config.targetDimensions) {
      targetWidth = this._config.targetDimensions.width;
      targetHeight = this._config.targetDimensions.height;
    } else if (this._config.maxDimensions) {
      const maxWidth = this._config.maxDimensions.width;
      const maxHeight = this._config.maxDimensions.height;
      if (curWidth > maxWidth || curHeight > maxHeight) {
        const scale = Math.min(maxWidth / curWidth, maxHeight / curHeight);
        targetWidth = Math.max(1, Math.floor(curWidth * scale));
        targetHeight = Math.max(1, Math.floor(curHeight * scale));
      }
    }

    if (targetWidth !== curWidth || targetHeight !== curHeight) {
      currentPixels = this.scaleBilinear(currentPixels, curWidth, curHeight, targetWidth, targetHeight);
      curWidth = targetWidth;
      curHeight = targetHeight;
    }

    // 6. Convert to targetFormat if different from RGBA8
    const finalFormat = this._config.targetFormat ?? "RGBA8";
    let finalBuffer: Uint8ClampedArray | Uint8Array = currentPixels;

    if (finalFormat === "RGB8") {
      const rgb = new Uint8Array(curWidth * curHeight * 3);
      for (let i = 0; i < curWidth * curHeight; i++) {
        rgb[i * 3] = currentPixels[i * 4]!;
        rgb[i * 3 + 1] = currentPixels[i * 4 + 1]!;
        rgb[i * 3 + 2] = currentPixels[i * 4 + 2]!;
      }
      finalBuffer = rgb;
    } else if (finalFormat === "GRAYSCALE8") {
      const gray = new Uint8Array(curWidth * curHeight);
      for (let i = 0; i < curWidth * curHeight; i++) {
        // Luminance weighting: 0.299R + 0.587G + 0.114B
        const r = currentPixels[i * 4]!;
        const g = currentPixels[i * 4 + 1]!;
        const b = currentPixels[i * 4 + 2]!;
        gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }
      finalBuffer = gray;
    } else if (finalFormat === "BGRA8") {
      const bgra = new Uint8ClampedArray(curWidth * curHeight * 4);
      for (let i = 0; i < curWidth * curHeight; i++) {
        const off = i * 4;
        bgra[off] = currentPixels[off + 2]!;
        bgra[off + 1] = currentPixels[off + 1]!;
        bgra[off + 2] = currentPixels[off]!;
        bgra[off + 3] = currentPixels[off + 3]!;
      }
      finalBuffer = bgra;
    }

    const outputMetadata: FrameMetadata = {
      dimensions: { width: curWidth, height: curHeight },
      pixelFormat: finalFormat,
      colorSpace: metadata.colorSpace,
      timestamp: {
        acquisitionTimestampMs: effectiveTimestampMs,
        presentationTimestampMs: metadata.timestamp.presentationTimestampMs,
        sequenceNumber,
      },
      byteLength: finalBuffer.byteLength,
      stride: curWidth * getBytesPerPixel(finalFormat),
      mirrored: false,
      rotationDegrees: 0,
      sourceDeviceId: metadata.sourceDeviceId,
      isSynthetic: metadata.isSynthetic,
    };

    const outputFrame: VideoFrameInput = {
      frameId,
      buffer: finalBuffer,
      metadata: outputMetadata,
    };

    return {
      success: true,
      frame: outputFrame,
      processingDurationMs: Math.max(0, Date.now() - startMs),
      bytesTransformed: finalBuffer.byteLength,
      dropped: false,
    };
  }

  private applyOrientation(
    src: Uint8ClampedArray,
    width: number,
    height: number,
    rotation: FrameOrientation,
    mirror: boolean
  ): { pixels: Uint8ClampedArray; width: number; height: number } {
    let dstWidth = width;
    let dstHeight = height;

    if (rotation === 90 || rotation === 270) {
      dstWidth = height;
      dstHeight = width;
    }

    const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let srcX = x;
        let srcY = y;
        if (mirror) {
          srcX = width - 1 - x;
        }

        let dstX = srcX;
        let dstY = srcY;

        switch (rotation) {
          case 90:
            dstX = height - 1 - srcY;
            dstY = srcX;
            break;
          case 180:
            dstX = width - 1 - srcX;
            dstY = height - 1 - srcY;
            break;
          case 270:
            dstX = srcY;
            dstY = width - 1 - srcX;
            break;
          case 0:
          default:
            dstX = srcX;
            dstY = srcY;
            break;
        }

        const srcOffset = (y * width + x) * 4;
        const dstOffset = (dstY * dstWidth + dstX) * 4;

        dst[dstOffset] = src[srcOffset]!;
        dst[dstOffset + 1] = src[srcOffset + 1]!;
        dst[dstOffset + 2] = src[srcOffset + 2]!;
        dst[dstOffset + 3] = src[srcOffset + 3]!;
      }
    }

    return { pixels: dst, width: dstWidth, height: dstHeight };
  }

  private scaleBilinear(
    src: Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number
  ): Uint8ClampedArray {
    const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
    const xRatio = srcWidth / dstWidth;
    const yRatio = srcHeight / dstHeight;

    for (let dy = 0; dy < dstHeight; dy++) {
      const sy = dy * yRatio;
      const y0 = Math.floor(sy);
      const y1 = Math.min(y0 + 1, srcHeight - 1);
      const yFrac = sy - y0;

      for (let dx = 0; dx < dstWidth; dx++) {
        const sx = dx * xRatio;
        const x0 = Math.floor(sx);
        const x1 = Math.min(x0 + 1, srcWidth - 1);
        const xFrac = sx - x0;

        const off00 = (y0 * srcWidth + x0) * 4;
        const off10 = (y0 * srcWidth + x1) * 4;
        const off01 = (y1 * srcWidth + x0) * 4;
        const off11 = (y1 * srcWidth + x1) * 4;

        const dstOff = (dy * dstWidth + dx) * 4;

        for (let c = 0; c < 4; c++) {
          const top = src[off00 + c]! * (1 - xFrac) + src[off10 + c]! * xFrac;
          const bot = src[off01 + c]! * (1 - xFrac) + src[off11 + c]! * xFrac;
          dst[dstOff + c] = Math.round(top * (1 - yFrac) + bot * yFrac);
        }
      }
    }

    return dst;
  }
}
