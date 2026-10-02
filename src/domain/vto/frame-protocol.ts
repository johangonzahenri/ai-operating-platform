/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Neutral Video Frame Protocol & Pure Domain Contracts.
 * 
 * Invariants:
 * - Domain layer is 100% pure: ZERO imports or bindings of browser video/image/stream APIs.
 * - Strongly-typed neutral frame representation for camera streams, video inputs, and synthetic test doubles.
 * - Explicit fail-closed frame validation with bounded dimensions and memory limits.
 * - Deterministic timestamp tracking preserving monotonic sequence compatibility.
 */

export type FrameId = string;

export interface FrameDimensions {
  readonly width: number;
  readonly height: number;
}

export type PixelFormat = "RGBA8" | "BGRA8" | "RGB8" | "GRAYSCALE8";

export type ColorSpace = "srgb" | "display-p3" | "rec2020";

export type FrameOrientation = 0 | 90 | 180 | 270;

export interface FrameTimestamp {
  readonly acquisitionTimestampMs: number;
  readonly presentationTimestampMs?: number | undefined;
  readonly sequenceNumber: number;
}

export type FrameBuffer = Uint8Array | Uint8ClampedArray | ArrayBuffer;

export interface FrameMetadata {
  readonly dimensions: FrameDimensions;
  readonly pixelFormat: PixelFormat;
  readonly colorSpace: ColorSpace;
  readonly timestamp: FrameTimestamp;
  readonly byteLength: number;
  readonly stride?: number | undefined;
  readonly mirrored?: boolean | undefined;
  readonly rotationDegrees?: FrameOrientation | undefined;
  readonly sourceDeviceId?: string | undefined;
  readonly isSynthetic?: boolean | undefined;
}

export interface VideoFrameInput {
  readonly frameId: FrameId;
  readonly buffer: FrameBuffer;
  readonly metadata: FrameMetadata;
}

export type FrameValidationErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_FRAME_ID"
  | "INVALID_DIMENSIONS"
  | "DIMENSIONS_OUT_OF_BOUNDS"
  | "UNSUPPORTED_PIXEL_FORMAT"
  | "UNSUPPORTED_COLOR_SPACE"
  | "INVALID_BUFFER"
  | "BUFFER_SIZE_MISMATCH"
  | "INVALID_TIMESTAMP"
  | "INVALID_ROTATION"
  | "MAX_CAPACITY_EXCEEDED";

export interface FrameValidationResult {
  readonly isValid: boolean;
  readonly valid: boolean;
  readonly error?: string | undefined;
  readonly errorCode?: FrameValidationErrorCode | undefined;
  readonly frame?: VideoFrameInput | undefined;
}

export const MAX_FRAME_DIMENSION = 4096;
export const MAX_FRAME_BUFFER_BYTES = 64 * 1024 * 1024; // 64 MB bounded ceiling

export function getBytesPerPixel(format: PixelFormat): number {
  switch (format) {
    case "RGBA8":
    case "BGRA8":
      return 4;
    case "RGB8":
      return 3;
    case "GRAYSCALE8":
      return 1;
    default:
      return 0;
  }
}

/**
 * Validates structural and numerical integrity of a VideoFrameInput object fail-closed.
 */
export function validateVideoFrameInput(input: unknown): FrameValidationResult {
  if (!input || typeof input !== "object") {
    return {
      isValid: false,
      valid: false,
      error: "Frame input must be a non-null object",
      errorCode: "INVALID_PAYLOAD",
    };
  }

  const f = input as Partial<VideoFrameInput>;

  if (!f.frameId || typeof f.frameId !== "string" || f.frameId.trim() === "") {
    return {
      isValid: false,
      valid: false,
      error: "Missing or invalid frameId string",
      errorCode: "INVALID_FRAME_ID",
    };
  }

  if (!f.metadata || typeof f.metadata !== "object") {
    return {
      isValid: false,
      valid: false,
      error: "Missing or invalid frame metadata object",
      errorCode: "INVALID_PAYLOAD",
    };
  }

  const m = f.metadata;

  if (
    !m.dimensions ||
    typeof m.dimensions.width !== "number" ||
    typeof m.dimensions.height !== "number" ||
    !Number.isFinite(m.dimensions.width) ||
    !Number.isFinite(m.dimensions.height) ||
    m.dimensions.width <= 0 ||
    m.dimensions.height <= 0 ||
    !Number.isInteger(m.dimensions.width) ||
    !Number.isInteger(m.dimensions.height)
  ) {
    return {
      isValid: false,
      valid: false,
      error: "Frame dimensions must be positive integers",
      errorCode: "INVALID_DIMENSIONS",
    };
  }

  if (
    m.dimensions.width > MAX_FRAME_DIMENSION ||
    m.dimensions.height > MAX_FRAME_DIMENSION
  ) {
    return {
      isValid: false,
      valid: false,
      error: `Frame dimensions exceed maximum limit of ${MAX_FRAME_DIMENSION}x${MAX_FRAME_DIMENSION}`,
      errorCode: "DIMENSIONS_OUT_OF_BOUNDS",
    };
  }

  const validFormats: readonly PixelFormat[] = ["RGBA8", "BGRA8", "RGB8", "GRAYSCALE8"];
  if (!validFormats.includes(m.pixelFormat)) {
    return {
      isValid: false,
      valid: false,
      error: `Unsupported pixel format "${m.pixelFormat}"`,
      errorCode: "UNSUPPORTED_PIXEL_FORMAT",
    };
  }

  const validColorSpaces: readonly ColorSpace[] = ["srgb", "display-p3", "rec2020"];
  if (!validColorSpaces.includes(m.colorSpace)) {
    return {
      isValid: false,
      valid: false,
      error: `Unsupported color space "${m.colorSpace}"`,
      errorCode: "UNSUPPORTED_COLOR_SPACE",
    };
  }

  if (m.rotationDegrees !== undefined) {
    const validRotations: readonly FrameOrientation[] = [0, 90, 180, 270];
    if (!validRotations.includes(m.rotationDegrees)) {
      return {
        isValid: false,
        valid: false,
        error: `Invalid rotation "${m.rotationDegrees}". Allowed values: 0, 90, 180, 270`,
        errorCode: "INVALID_ROTATION",
      };
    }
  }

  if (
    !m.timestamp ||
    typeof m.timestamp.acquisitionTimestampMs !== "number" ||
    !Number.isFinite(m.timestamp.acquisitionTimestampMs) ||
    m.timestamp.acquisitionTimestampMs < 0 ||
    typeof m.timestamp.sequenceNumber !== "number" ||
    !Number.isFinite(m.timestamp.sequenceNumber) ||
    m.timestamp.sequenceNumber < 0
  ) {
    return {
      isValid: false,
      valid: false,
      error: "Frame timestamp contains invalid acquisition timestamp or sequence number",
      errorCode: "INVALID_TIMESTAMP",
    };
  }

  // Validate buffer
  if (!f.buffer) {
    return {
      isValid: false,
      valid: false,
      error: "Frame buffer cannot be null or undefined",
      errorCode: "INVALID_BUFFER",
    };
  }

  let bufferByteLength = 0;
  if (f.buffer instanceof ArrayBuffer) {
    bufferByteLength = f.buffer.byteLength;
  } else if (ArrayBuffer.isView(f.buffer)) {
    bufferByteLength = f.buffer.byteLength;
  } else {
    return {
      isValid: false,
      valid: false,
      error: "Frame buffer must be an ArrayBuffer or TypedArray view",
      errorCode: "INVALID_BUFFER",
    };
  }

  if (bufferByteLength > MAX_FRAME_BUFFER_BYTES) {
    return {
      isValid: false,
      valid: false,
      error: `Buffer byte length (${bufferByteLength} bytes) exceeds maximum capacity (${MAX_FRAME_BUFFER_BYTES} bytes)`,
      errorCode: "MAX_CAPACITY_EXCEEDED",
    };
  }

  const bytesPerPixel = getBytesPerPixel(m.pixelFormat);
  const expectedMinBytes = m.dimensions.width * m.dimensions.height * bytesPerPixel;

  if (bufferByteLength < expectedMinBytes) {
    return {
      isValid: false,
      valid: false,
      error: `Buffer size mismatch: expected at least ${expectedMinBytes} bytes for ${m.dimensions.width}x${m.dimensions.height} ${m.pixelFormat}, but got ${bufferByteLength} bytes`,
      errorCode: "BUFFER_SIZE_MISMATCH",
    };
  }

  return {
    isValid: true,
    valid: true,
    frame: input as VideoFrameInput,
  };
}
