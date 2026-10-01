/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * On-Device VTO Inference Coordinator with Explicit CPU Fallback.
 * 
 * Pipeline:
 * [PreparedVirtualTryOnInput (Phase 154)]
 *                 ↓
 *     [extractVtoFeatureTensor] -> Tensor [1, 8]
 *                 ↓
 *     [Try WebGPU Provider] ----(Failure/Unavailable)----> [Explicit Fallback: CPU Reference]
 *                 ↓                                                     ↓
 *         status: SUCCESS                                      status: FALLBACK_APPLIED (DEGRADED)
 *                 └───────────────────────┬─────────────────────────────┘
 *                                         ↓
 *                           [VtoInferenceEvaluation]
 *                                         ↓
 *               Attached to extended [DepthMaterialRenderInput] (Phase 156)
 */

import { PreparedVirtualTryOnInput } from "../../domain/vto/pose-preprocessing-pipeline.js";
import {
  OnDeviceInferenceProviderPort,
  InferenceRequest,
  InferenceResult,
} from "../../domain/vto/inference-provider-port.js";
import {
  CANONICAL_VTO_MICRO_MODEL_MANIFEST,
  extractVtoFeatureTensor,
} from "../../domain/vto/canonical-micro-model.js";
import { CpuMicroModelInferenceProvider } from "../../domain/vto/cpu-inference-provider.js";
import { WebGpuInferenceProvider, WebGpuInferenceProviderConfig } from "./webgpu-inference-provider.js";

export interface VtoInferenceEvaluation {
  readonly alignmentQualityScore: number;      // 0.0 to 1.0
  readonly fitmentStabilityConfidence: number; // 0.0 to 1.0
  readonly inferenceProviderId: string;
  readonly inferenceProviderType: string;
  readonly isHardwareAccelerated: boolean;
  readonly isFallbackApplied: boolean;
  readonly inferenceDurationMs: number;
}

export interface OnDeviceVtoCoordinatorConfig {
  readonly primaryProvider?: OnDeviceInferenceProviderPort | undefined;
  readonly fallbackProvider?: OnDeviceInferenceProviderPort | undefined;
  readonly allowCpuFallback?: boolean | undefined;
  readonly webGpuConfig?: WebGpuInferenceProviderConfig | undefined;
}

export class OnDeviceVtoInferenceCoordinator {
  private _primaryProvider: OnDeviceInferenceProviderPort;
  private _fallbackProvider: OnDeviceInferenceProviderPort;
  private _allowFallback: boolean;
  private _isInitialized = false;

  constructor(config?: OnDeviceVtoCoordinatorConfig) {
    this._primaryProvider =
      config?.primaryProvider ?? new WebGpuInferenceProvider(config?.webGpuConfig);
    this._fallbackProvider =
      config?.fallbackProvider ?? new CpuMicroModelInferenceProvider();
    this._allowFallback = config?.allowCpuFallback ?? true;
  }

  public async initialize(): Promise<void> {
    if (this._isInitialized) return;

    // Load canonical model into fallback first (guaranteed)
    await this._fallbackProvider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);

    // Attempt to initialize primary provider
    try {
      const caps = await this._primaryProvider.getCapabilities();
      if (caps.isAvailableInEnvironment) {
        await this._primaryProvider.loadModel(CANONICAL_VTO_MICRO_MODEL_MANIFEST);
      }
    } catch {
      // Primary provider unavailable; will fall back gracefully
    }

    this._isInitialized = true;
  }

  public async evaluateVtoInput(
    preparedInput: PreparedVirtualTryOnInput,
    tenantId: string,
    applicationId: string
  ): Promise<VtoInferenceEvaluation> {
    if (!this._isInitialized) {
      await this.initialize();
    }

    const featureTensor = extractVtoFeatureTensor(preparedInput);
    const request: InferenceRequest = {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      applicationId,
      modelId: CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelId,
      modelVersion: CANONICAL_VTO_MICRO_MODEL_MANIFEST.modelVersion,
      inputs: new Map([[CANONICAL_VTO_MICRO_MODEL_MANIFEST.inputs[0].name, featureTensor]]),
    };

    let result: InferenceResult | undefined;
    let fallbackApplied = false;

    // 1. Try Primary Provider (WebGPU)
    try {
      if (this._primaryProvider.lifecycleStatus === "READY") {
        result = await this._primaryProvider.infer(request);
      }
    } catch {
      result = undefined;
    }

    // 2. Fallback to CPU Reference if primary failed, was unavailable, or device was lost
    if (!result || result.status !== "SUCCESS") {
      if (!this._allowFallback) {
        throw new Error(
          `INFERENCE_FAILED_NO_FALLBACK: Primary provider ${this._primaryProvider.providerId} failed: ${result?.errorDetails ?? "Unavailable"}`
        );
      }

      fallbackApplied = true;
      result = await this._fallbackProvider.infer(request);
    }

    if (result.status !== "SUCCESS") {
      throw new Error(`INFERENCE_PIPELINE_ERROR: Fallback CPU inference also failed: ${result.errorDetails}`);
    }

    // Extract outputs [alignmentQualityScore, fitmentStabilityConfidence]
    const outputTensor = result.outputs.get(CANONICAL_VTO_MICRO_MODEL_MANIFEST.outputs[0].name)!;
    const scores = outputTensor.data;

    return {
      alignmentQualityScore: Math.max(0.0, Math.min(1.0, scores[0])),
      fitmentStabilityConfidence: Math.max(0.0, Math.min(1.0, scores[1])),
      inferenceProviderId: result.providerId,
      inferenceProviderType: result.providerType,
      isHardwareAccelerated: result.providerType === "WEBGPU",
      isFallbackApplied: fallbackApplied,
      inferenceDurationMs: result.metrics.totalDurationMs,
    };
  }

  public async dispose(): Promise<void> {
    await this._primaryProvider.dispose();
    await this._fallbackProvider.dispose();
    this._isInitialized = false;
  }
}
