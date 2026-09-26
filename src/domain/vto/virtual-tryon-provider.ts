/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Virtual Try-On Provider Port & Computer Vision Pipeline Interfaces.
 * 
 * Hexagonal architecture ports for decoupled inference engine execution.
 */

import {
  VirtualTryOnRequest,
  VirtualTryOnResult,
  VirtualTryOnJob,
  VtoExecutionTier,
  InferenceMetadata,
} from "./virtual-tryon.js";

// ============================================================================
// 1. PROVIDER CAPABILITIES & HEALTH CONTRACTS
// ============================================================================

export interface VtoProviderCapabilities {
  readonly supportedTiers: readonly VtoExecutionTier[];
  readonly supportedGarmentCategories: readonly string[];
  readonly maxImageResolution: { readonly width: number; readonly height: number };
  readonly supportsPoseInference: boolean;
  readonly supportsGarmentWarping: boolean;
  readonly supportsFitEstimation: boolean;
  readonly supportsRealtimeStream: boolean;
  readonly hardwareAcceleration: "WEBGPU" | "WEBGL2" | "WASM_SIMD" | "CLOUD_GPU" | "SIMULATED";
}

export interface VtoProviderHealth {
  readonly providerId: string;
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly latencyP95Ms: number;
  readonly activeJobsCount: number;
  readonly errorRatePercent: number;
  readonly message?: string | undefined;
}

// ============================================================================
// 2. HEXAGONAL PORT: VirtualTryOnProviderPort
// ============================================================================

export interface VirtualTryOnProviderPort {
  readonly providerId: string;
  readonly displayName: string;

  /**
   * Returns technical capabilities supported by this provider.
   */
  getCapabilities(): VtoProviderCapabilities;

  /**
   * Health probe for routing and circuit breaking.
   */
  checkHealth(): Promise<VtoProviderHealth>;

  /**
   * Synchronously or asynchronously processes a VTO inference request.
   */
  process(job: VirtualTryOnJob, signal?: AbortSignal): Promise<VirtualTryOnResult>;

  /**
   * Cancels a currently running inference job if supported by provider.
   */
  cancelJob?(jobId: string): Promise<boolean>;
}

// ============================================================================
// 3. DETERMINISTIC FAKE PROVIDER (Test & Baseline Execution)
// ============================================================================

export interface DeterministicFakeProviderOptions {
  readonly providerId?: string;
  readonly simulateLatencyMs?: number;
  readonly forceFailure?: boolean;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly defaultFitScore?: number;
}

export class DeterministicFakeVtoProvider implements VirtualTryOnProviderPort {
  public readonly providerId: string;
  public readonly displayName: string = "Deterministic In-Memory VTO Simulation Provider";

  private _simulateLatencyMs: number;
  private _forceFailure: boolean;
  private _failureCode: string;
  private _failureMessage: string;
  private _defaultFitScore: number;
  private _activeJobs = new Set<string>();

  constructor(options?: DeterministicFakeProviderOptions) {
    this.providerId = options?.providerId ?? "vto-provider-deterministic-fake";
    this._simulateLatencyMs = options?.simulateLatencyMs ?? 15;
    this._forceFailure = options?.forceFailure ?? false;
    this._failureCode = options?.failureCode ?? "VTO_SIMULATED_FAILURE";
    this._failureMessage = options?.failureMessage ?? "Forced failure for testing";
    this._defaultFitScore = options?.defaultFitScore ?? 0.94;
  }

  public setForceFailure(force: boolean, code?: string, message?: string): void {
    this._forceFailure = force;
    if (code) this._failureCode = code;
    if (message) this._failureMessage = message;
  }

  public getCapabilities(): VtoProviderCapabilities {
    return {
      supportedTiers: [
        "TIER_1_ON_DEVICE_NEURAL",
        "TIER_2_ON_DEVICE_STANDARD",
        "TIER_3_ASYNC_WORKER",
        "TIER_4_CLOUD_NEURAL",
      ],
      supportedGarmentCategories: [
        "UPPER_BODY",
        "LOWER_BODY",
        "FULL_BODY",
        "FOOTWEAR",
        "ACCESSORY",
        "EYEWEAR",
        "JEWELRY",
      ],
      maxImageResolution: { width: 3840, height: 2160 },
      supportsPoseInference: true,
      supportsGarmentWarping: true,
      supportsFitEstimation: true,
      supportsRealtimeStream: true,
      hardwareAcceleration: "SIMULATED",
    };
  }

  public async checkHealth(): Promise<VtoProviderHealth> {
    return {
      providerId: this.providerId,
      status: this._forceFailure ? "DEGRADED" : "HEALTHY",
      latencyP95Ms: this._simulateLatencyMs,
      activeJobsCount: this._activeJobs.size,
      errorRatePercent: this._forceFailure ? 100 : 0,
      message: this._forceFailure ? "Simulated degraded state" : "Operational deterministic simulation",
    };
  }

  public async process(job: VirtualTryOnJob, signal?: AbortSignal): Promise<VirtualTryOnResult> {
    this._activeJobs.add(job.jobId);
    const start = Date.now();

    try {
      if (signal?.aborted) {
        throw new Error("VTO inference aborted by caller");
      }

      if (this._simulateLatencyMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => resolve(), this._simulateLatencyMs);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new Error("VTO inference aborted during delay"));
            });
          }
        });
      }

      if (this._forceFailure) {
        const durationMs = Date.now() - start;
        return {
          jobId: job.jobId,
          requestId: job.requestId,
          status: "FAILED",
          auxiliaryArtifacts: [],
          inferenceMetadata: {
            providerId: this.providerId,
            executionTier: job.getState().executionTier,
            modelName: "simulated-vto-v1",
            durationMs,
            hardwareUsed: "SIMULATED",
          },
          completedAt: new Date(),
          error: {
            code: this._failureCode,
            message: this._failureMessage,
          },
        };
      }

      const req = job.getState().requestPayload;
      const durationMs = Date.now() - start;

      // Deterministic Fit calculation based on garment category and measurements
      let fitVerdict: "PERFECT_FIT" | "SLIGHTLY_TIGHT" | "SLIGHTLY_LOOSE" = "PERFECT_FIT";
      const height = req.bodyProfile.measurements?.heightCm ?? 170;
      if (height > 185) {
        fitVerdict = "SLIGHTLY_TIGHT";
      } else if (height < 155) {
        fitVerdict = "SLIGHTLY_LOOSE";
      }

      const compositeArtifactId = `art-vto-${job.jobId}-composite`;
      const primaryArtifact = {
        artifactId: compositeArtifactId,
        kind: "FINAL_COMPOSITE_IMAGE" as const,
        uriOrHandle: `memory://vto/renders/${job.tenantId}/${compositeArtifactId}.webp`,
        mimeType: "image/webp",
        widthPx: 1080,
        heightPx: 1440,
        byteSize: 184520,
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        createdAt: new Date(),
      };

      const depthArtifact = {
        artifactId: `art-vto-${job.jobId}-depth`,
        kind: "DEPTH_MAP" as const,
        uriOrHandle: `memory://vto/depth/${job.tenantId}/depth-${job.jobId}.png`,
        mimeType: "image/png",
        widthPx: 512,
        heightPx: 512,
        createdAt: new Date(),
      };

      return {
        jobId: job.jobId,
        requestId: job.requestId,
        status: "SUCCESS",
        primaryArtifact,
        auxiliaryArtifacts: [depthArtifact],
        fitAssessment: {
          recommendedSize: req.garment.size ?? "M",
          fitScore: this._defaultFitScore,
          fitVerdict,
          confidence: 0.96,
          details: {
            shoulderMatchPercent: 94,
            torsoLengthMatchPercent: 91,
            estimatedEaseCm: 4.2,
          },
        },
        inferenceMetadata: {
          providerId: this.providerId,
          executionTier: job.getState().executionTier,
          modelName: "simulated-vto-v1",
          durationMs,
          hardwareUsed: "SIMULATED",
        },
        completedAt: new Date(),
      };
    } finally {
      this._activeJobs.delete(job.jobId);
    }
  }

  public async cancelJob(jobId: string): Promise<boolean> {
    return this._activeJobs.delete(jobId);
  }
}
