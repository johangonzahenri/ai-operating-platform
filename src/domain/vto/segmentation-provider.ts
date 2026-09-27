/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Hexagonal Segmentation Provider Port & Deterministic Fake Provider.
 * 
 * Invariants:
 * 1. Zero Vendor Dependencies: Provider interface is clean TypeScript without ONNX/MediaPipe/FASHN bindings.
 * 2. Deterministic & Isolated: Fake provider generates synthetic test masks without network calls, GPUs, or external assets.
 * 3. Explicit Capability Discovery: Providers declare supported features (`SOFT_MASK`, `OCCLUSION`, etc.).
 * 4. Fail-Closed Error Handling: Health checks and execution errors fail safely without crashing the platform.
 */

import {
  SegmentationRequest,
  SegmentationResult,
  SegmentationMask,
  OcclusionMap,
  OcclusionState,
  validateSegmentationMask,
} from "./segmentation-types.js";

export type SegmentationCapability =
  | "SEGMENTATION"
  | "SOFT_MASK"
  | "HARD_MASK"
  | "GARMENT_WARP"
  | "OCCLUSION"
  | "MULTI_LAYER";

export interface SegmentationProviderHealth {
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly providerId: string;
  readonly supportedCapabilities: readonly SegmentationCapability[];
  readonly details?: string | undefined;
}

export interface SegmentationProviderPort {
  readonly providerId: string;
  readonly capabilities: ReadonlySet<SegmentationCapability>;
  checkHealth(): Promise<SegmentationProviderHealth>;
  segment(request: SegmentationRequest): Promise<SegmentationResult>;
}

export interface FakeSegmentationProviderConfig {
  readonly providerId?: string;
  readonly simulateFailure?: boolean;
  readonly failureErrorMessage?: string;
  readonly simulatedLatencyMs?: number;
  readonly forcedConfidence?: number;
  readonly defaultResolution?: { readonly width: number; readonly height: number };
}

/**
 * Deterministic in-memory fake segmentation provider for unit testing, offline development,
 * and contract verification.
 */
export class DeterministicFakeSegmentationProvider implements SegmentationProviderPort {
  public readonly providerId: string;
  public readonly capabilities: ReadonlySet<SegmentationCapability>;

  private _simulateFailure: boolean;
  private _failureErrorMessage: string;
  private _simulatedLatencyMs: number;
  private _forcedConfidence: number;
  private _defaultWidth: number;
  private _defaultHeight: number;

  constructor(config?: FakeSegmentationProviderConfig) {
    this.providerId = config?.providerId ?? "provider-fake-segmentation-01";
    this.capabilities = new Set<SegmentationCapability>([
      "SEGMENTATION",
      "SOFT_MASK",
      "HARD_MASK",
      "OCCLUSION",
      "MULTI_LAYER",
    ]);

    this._simulateFailure = config?.simulateFailure ?? false;
    this._failureErrorMessage = config?.failureErrorMessage ?? "Simulated segmentation inference error";
    this._simulatedLatencyMs = config?.simulatedLatencyMs ?? 0;
    this._forcedConfidence = config?.forcedConfidence ?? 0.95;
    this._defaultWidth = config?.defaultResolution?.width ?? 64;
    this._defaultHeight = config?.defaultResolution?.height ?? 64;
  }

  public async checkHealth(): Promise<SegmentationProviderHealth> {
    if (this._simulateFailure) {
      return {
        status: "UNAVAILABLE",
        providerId: this.providerId,
        supportedCapabilities: Array.from(this.capabilities),
        details: this._failureErrorMessage,
      };
    }

    return {
      status: "HEALTHY",
      providerId: this.providerId,
      supportedCapabilities: Array.from(this.capabilities),
      details: "Deterministic fake segmentation provider online and functional",
    };
  }

  public async segment(request: SegmentationRequest): Promise<SegmentationResult> {
    const startTime = Date.now();

    if (this._simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._simulatedLatencyMs));
    }

    if (this._simulateFailure) {
      return {
        requestId: request.requestId,
        status: "FAILED",
        masks: {},
        overallConfidence: 0,
        quality: "INSUFFICIENT_DATA",
        durationMs: Date.now() - startTime,
        providerId: this.providerId,
        error: {
          code: "PROVIDER_INFERENCE_ERROR",
          message: this._failureErrorMessage,
        },
      };
    }

    const width = request.options?.targetResolution?.width ?? this._defaultWidth;
    const height = request.options?.targetResolution?.height ?? this._defaultHeight;
    const format = request.options?.preferredFormat ?? "SOFT_PROBABILITY_MAP";

    const bodyMask = this.generateSyntheticBodyMask(width, height, format);
    const garmentMask = this.generateSyntheticGarmentMask(width, height, format);
    const occlusionMap = this.generateSyntheticOcclusionMap(width, height);

    // Validate generated masks to guarantee domain invariant adherence
    const bodyVal = validateSegmentationMask(bodyMask);
    const garmentVal = validateSegmentationMask(garmentMask);

    if (!bodyVal.isValid || !garmentVal.isValid) {
      return {
        requestId: request.requestId,
        status: "FAILED",
        masks: {},
        overallConfidence: 0,
        quality: "INSUFFICIENT_DATA",
        durationMs: Date.now() - startTime,
        providerId: this.providerId,
        error: {
          code: "MASK_SYNTHESIS_CORRUPTION",
          message: `Generated mask failed validation: ${bodyVal.error ?? garmentVal.error}`,
        },
      };
    }

    const confidence = this._forcedConfidence;
    const quality = confidence < 0.6 ? "MASK_LOW_CONFIDENCE" : "MASK_VALID";

    return {
      requestId: request.requestId,
      status: quality === "MASK_LOW_CONFIDENCE" ? "DEGRADED" : "SUCCESS",
      masks: {
        PERSON: bodyMask,
        GARMENT: garmentMask,
      },
      occlusionMap,
      overallConfidence: confidence,
      quality,
      durationMs: Date.now() - startTime,
      providerId: this.providerId,
    };
  }

  /**
   * Generates a synthetic human silhouette mask (Head circle, Torso rectangle, Limbs).
   */
  private generateSyntheticBodyMask(
    width: number,
    height: number,
    format: "BINARY_MAP" | "SOFT_PROBABILITY_MAP" | "INDEXED_LABELS"
  ): SegmentationMask {
    const data: number[] = new Array(width * height).fill(0);

    const centerX = width / 2;
    const headY = height * 0.15;
    const headRadius = width * 0.12;

    const torsoTop = height * 0.28;
    const torsoBottom = height * 0.65;
    const torsoHalfWidth = width * 0.22;

    const legBottom = height * 0.92;
    const legHalfWidth = width * 0.16;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Head check
        const distHead = Math.hypot(x - centerX, y - headY);
        const inHead = distHead <= headRadius;

        // Torso check
        const inTorso = y >= torsoTop && y <= torsoBottom && Math.abs(x - centerX) <= torsoHalfWidth;

        // Legs check
        const inLegs = y > torsoBottom && y <= legBottom && Math.abs(x - centerX) <= legHalfWidth;

        if (inHead || inTorso || inLegs) {
          if (format === "BINARY_MAP") {
            data[idx] = 1;
          } else if (format === "INDEXED_LABELS") {
            data[idx] = 1; // 1 = PERSON
          } else {
            // Soft probability map: smoothed boundary
            const edgeDist = inHead
              ? (headRadius - distHead) / headRadius
              : inTorso
              ? Math.min((torsoHalfWidth - Math.abs(x - centerX)) / torsoHalfWidth, (torsoBottom - y) / (torsoBottom - torsoTop))
              : (legHalfWidth - Math.abs(x - centerX)) / legHalfWidth;
            data[idx] = Math.max(0.1, Math.min(1.0, 0.5 + 0.5 * edgeDist));
          }
        }
      }
    }

    return {
      width,
      height,
      format,
      maskType: "BODY_MASK",
      confidence: this._forcedConfidence,
      source: "SIMULATED_DETERMINISTIC",
      data,
      checksumSha256: `synthetic-body-${width}x${height}`,
    };
  }

  /**
   * Generates a synthetic upper garment mask (Torso & Shoulders).
   */
  private generateSyntheticGarmentMask(
    width: number,
    height: number,
    format: "BINARY_MAP" | "SOFT_PROBABILITY_MAP" | "INDEXED_LABELS"
  ): SegmentationMask {
    const data: number[] = new Array(width * height).fill(0);

    const centerX = width / 2;
    const garmentTop = height * 0.28;
    const garmentBottom = height * 0.60;
    const garmentHalfWidth = width * 0.24;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const inGarment = y >= garmentTop && y <= garmentBottom && Math.abs(x - centerX) <= garmentHalfWidth;

        if (inGarment) {
          if (format === "BINARY_MAP") {
            data[idx] = 1;
          } else if (format === "INDEXED_LABELS") {
            data[idx] = 2; // 2 = GARMENT
          } else {
            const edgeDist = (garmentHalfWidth - Math.abs(x - centerX)) / garmentHalfWidth;
            data[idx] = Math.max(0.2, Math.min(1.0, 0.6 + 0.4 * edgeDist));
          }
        }
      }
    }

    return {
      width,
      height,
      format,
      maskType: "GARMENT_MASK",
      confidence: this._forcedConfidence,
      source: "SIMULATED_DETERMINISTIC",
      data,
      checksumSha256: `synthetic-garment-${width}x${height}`,
    };
  }

  /**
   * Generates a synthetic occlusion map.
   */
  private generateSyntheticOcclusionMap(width: number, height: number): OcclusionMap {
    const states: OcclusionState[] = new Array(width * height).fill("UNKNOWN");
    const centerX = width / 2;

    let garmentVisibleCount = 0;
    let bodyOccludingCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const inGarmentZone = y >= height * 0.28 && y <= height * 0.60 && Math.abs(x - centerX) <= width * 0.24;
        const inArmOcclusionZone = y >= height * 0.40 && y <= height * 0.55 && Math.abs(x - centerX) >= width * 0.18 && Math.abs(x - centerX) <= width * 0.24;

        if (inArmOcclusionZone) {
          states[idx] = "BODY_OCCLUDING";
          bodyOccludingCount++;
        } else if (inGarmentZone) {
          states[idx] = "GARMENT_VISIBLE";
          garmentVisibleCount++;
        } else if (y >= height * 0.10 && y <= height * 0.90 && Math.abs(x - centerX) <= width * 0.20) {
          states[idx] = "BODY_VISIBLE";
        }
      }
    }

    const total = width * height;
    return {
      width,
      height,
      states,
      confidence: this._forcedConfidence,
      garmentVisibleRatio: garmentVisibleCount / total,
      bodyOccludingRatio: bodyOccludingCount / total,
    };
  }
}
