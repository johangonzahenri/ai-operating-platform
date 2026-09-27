/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Depth Estimation Provider Port & Deterministic Fake Depth Provider.
 * 
 * Invariants:
 * 1. Zero Vendor SDKs: Pure TypeScript interface without MiDaS/Depth Anything/ONNX/TensorFlow dependencies.
 * 2. Deterministic & Isolated: Generates synthetic geometric depth maps without networks, GPUs or camera access.
 * 3. Graceful Degradation: Provider unavailability reports DEGRADED/UNAVAILABLE without crashing the pipeline.
 * 4. Distinct Confidence: Pixel confidence map and provider score are clearly differentiated.
 */

import {
  DepthRequest,
  DepthResult,
  DepthMap,
  DepthFormat,
  DepthType,
  validateDepthMap,
} from "./depth-types.js";

export type DepthCapability =
  | "RELATIVE_DEPTH_ESTIMATION"
  | "METRIC_DEPTH_ESTIMATION"
  | "CONFIDENCE_MAP"
  | "DEPTH_OCCLUSION";

export interface DepthProviderHealth {
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly providerId: string;
  readonly supportedCapabilities: readonly DepthCapability[];
  readonly details?: string | undefined;
}

export interface DepthProviderPort {
  readonly providerId: string;
  readonly capabilities: ReadonlySet<DepthCapability>;
  checkHealth(): Promise<DepthProviderHealth>;
  estimateDepth(request: DepthRequest): Promise<DepthResult>;
}

export type SyntheticDepthSceneType =
  | "BODY_CENTERED"
  | "GARMENT_FOREGROUND"
  | "CROSSING_OCCLUSION"
  | "LINEAR_GRADIENT"
  | "FLAT";

export interface FakeDepthProviderConfig {
  readonly providerId?: string;
  readonly simulateFailure?: boolean;
  readonly failureErrorMessage?: string;
  readonly simulatedLatencyMs?: number;
  readonly forcedConfidence?: number;
  readonly defaultResolution?: { readonly width: number; readonly height: number };
  readonly defaultSceneType?: SyntheticDepthSceneType;
}

/**
 * Deterministic in-memory fake depth provider for testing, offline simulation, and contract verification.
 */
export class DeterministicFakeDepthProvider implements DepthProviderPort {
  public readonly providerId: string;
  public readonly capabilities: ReadonlySet<DepthCapability>;

  private _simulateFailure: boolean;
  private _failureErrorMessage: string;
  private _simulatedLatencyMs: number;
  private _forcedConfidence: number;
  private _defaultWidth: number;
  private _defaultHeight: number;
  private _defaultSceneType: SyntheticDepthSceneType;

  constructor(config?: FakeDepthProviderConfig) {
    this.providerId = config?.providerId ?? "provider-fake-depth-01";
    this.capabilities = new Set<DepthCapability>([
      "RELATIVE_DEPTH_ESTIMATION",
      "CONFIDENCE_MAP",
      "DEPTH_OCCLUSION",
    ]);

    this._simulateFailure = config?.simulateFailure ?? false;
    this._failureErrorMessage = config?.failureErrorMessage ?? "Simulated depth inference engine failure";
    this._simulatedLatencyMs = config?.simulatedLatencyMs ?? 0;
    this._forcedConfidence = config?.forcedConfidence ?? 0.92;
    this._defaultWidth = config?.defaultResolution?.width ?? 64;
    this._defaultHeight = config?.defaultResolution?.height ?? 64;
    this._defaultSceneType = config?.defaultSceneType ?? "BODY_CENTERED";
  }

  public async checkHealth(): Promise<DepthProviderHealth> {
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
      details: "Deterministic fake depth provider online and functional",
    };
  }

  public async estimateDepth(request: DepthRequest): Promise<DepthResult> {
    const startTime = Date.now();

    if (this._simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._simulatedLatencyMs));
    }

    if (this._simulateFailure) {
      return {
        requestId: request.requestId,
        status: "FAILED",
        overallConfidence: 0,
        durationMs: Date.now() - startTime,
        providerId: this.providerId,
        error: {
          code: "DEPTH_INFERENCE_ERROR",
          message: this._failureErrorMessage,
        },
      };
    }

    const width = request.options?.targetResolution?.width ?? this._defaultWidth;
    const height = request.options?.targetResolution?.height ?? this._defaultHeight;
    const format = request.options?.preferredFormat ?? "FLOAT32";
    const depthType = request.options?.preferredDepthType ?? "NORMALIZED_DEPTH";

    const depthMap = this.generateSyntheticDepthMap(width, height, this._defaultSceneType, format, depthType);
    const valResult = validateDepthMap(depthMap);

    if (!valResult.isValid) {
      return {
        requestId: request.requestId,
        status: "FAILED",
        overallConfidence: 0,
        durationMs: Date.now() - startTime,
        providerId: this.providerId,
        error: {
          code: "DEPTH_SYNTHESIS_CORRUPTION",
          message: `Generated synthetic depth map failed validation: ${valResult.error}`,
        },
      };
    }

    const isDegraded = this._forcedConfidence < 0.6;
    return {
      requestId: request.requestId,
      status: isDegraded ? "DEGRADED" : "SUCCESS",
      depthMap,
      overallConfidence: this._forcedConfidence,
      durationMs: Date.now() - startTime,
      providerId: this.providerId,
    };
  }

  /**
   * Generates a deterministic synthetic depth map matching the specified scene scenario.
   */
  public generateSyntheticDepthMap(
    width: number,
    height: number,
    sceneType: SyntheticDepthSceneType = "BODY_CENTERED",
    format: DepthFormat = "FLOAT32",
    depthType: DepthType = "NORMALIZED_DEPTH"
  ): DepthMap {
    const total = width * height;
    const values: number[] = new Array(total).fill(0.85); // Default far background depth (~0.85)
    const confidenceMap: number[] = new Array(total).fill(this._forcedConfidence);

    const centerX = width / 2;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        switch (sceneType) {
          case "FLAT":
            values[idx] = 0.5;
            break;

          case "LINEAR_GRADIENT":
            values[idx] = 0.2 + 0.6 * (y / height);
            break;

          case "BODY_CENTERED":
            // Head and Torso at ~0.40 depth, limbs at ~0.45, background at ~0.85
            if (y >= height * 0.15 && y <= height * 0.85 && Math.abs(x - centerX) <= width * 0.22) {
              values[idx] = 0.40;
            } else {
              values[idx] = 0.85;
            }
            break;

          case "GARMENT_FOREGROUND":
            // Garment in front of body at ~0.35 depth, body at ~0.40, background at ~0.85
            if (y >= height * 0.25 && y <= height * 0.65 && Math.abs(x - centerX) <= width * 0.24) {
              values[idx] = 0.35; // Garment foreground
            } else if (y >= height * 0.15 && y <= height * 0.85 && Math.abs(x - centerX) <= width * 0.22) {
              values[idx] = 0.40; // Body
            } else {
              values[idx] = 0.85;
            }
            break;

          case "CROSSING_OCCLUSION":
            // Arm crossing in front of garment at ~0.25 depth, garment at ~0.35, body at ~0.40
            const inCrossingArm = y >= height * 0.40 && y <= height * 0.52 && Math.abs(x - centerX) <= width * 0.20;
            if (inCrossingArm) {
              values[idx] = 0.25; // Arm in front of garment!
            } else if (y >= height * 0.25 && y <= height * 0.65 && Math.abs(x - centerX) <= width * 0.24) {
              values[idx] = 0.35; // Garment
            } else if (y >= height * 0.15 && y <= height * 0.85 && Math.abs(x - centerX) <= width * 0.22) {
              values[idx] = 0.40; // Body
            } else {
              values[idx] = 0.85;
            }
            break;
        }
      }
    }

    return {
      width,
      height,
      depthType,
      format,
      values,
      confidenceMap,
      range: { near: 0.0, far: 1.0, unit: "NORMALIZED_UNITLESS" },
      overallConfidence: this._forcedConfidence,
      source: "SIMULATED_DETERMINISTIC",
      checksumSha256: `synthetic-depth-${sceneType}-${width}x${height}`,
    };
  }
}
