/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * CPU Reference Micro-Model Inference Provider.
 * 
 * Invariants:
 * - Mathematical ground truth authority for numerical validation.
 * - 100% deterministic, dependency-free, zero GPU/DOM requirements.
 * - Implements Linear(in, out) + Bias, and ReLU activation.
 */

import {
  OnDeviceInferenceProviderPort,
  InferenceProviderType,
  InferenceLifecycleStatus,
  InferenceProviderCapabilities,
  InferenceRequest,
  InferenceResult,
} from "./inference-provider-port.js";
import { MicroModelManifest, validateModelAbi, validateModelManifest } from "./neural-model.js";
import { Tensor } from "./neural-tensor.js";

export class CpuMicroModelInferenceProvider implements OnDeviceInferenceProviderPort {
  public readonly providerId = "cpu-reference-v1";
  public readonly providerType: InferenceProviderType = "CPU_REFERENCE";

  private _status: InferenceLifecycleStatus = "UNINITIALIZED";
  private _loadedModel?: MicroModelManifest;
  private _isWarm = false;

  public get lifecycleStatus(): InferenceLifecycleStatus {
    return this._status;
  }

  public async getCapabilities(): Promise<InferenceProviderCapabilities> {
    return {
      providerId: this.providerId,
      providerType: this.providerType,
      isHardwareAccelerated: false,
      supportsFp16: false,
      maxBufferBytes: 32 * 1024 * 1024,
      isAvailableInEnvironment: true,
    };
  }

  public async loadModel(manifest: MicroModelManifest): Promise<void> {
    this._status = "INITIALIZING";
    const manifestCheck = validateModelManifest(manifest);
    if (!manifestCheck.isValid) {
      this._status = "DEGRADED";
      throw new Error(`MODEL_INTEGRITY_FAILED: ${manifestCheck.errors.join("; ")}`);
    }

    this._loadedModel = manifest;
    this._status = "READY";
  }

  public async infer(request: InferenceRequest): Promise<InferenceResult> {
    const startTotal = Date.now();

    if (this._status !== "READY" || !this._loadedModel) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "ERROR",
        outputs: new Map(),
        metrics: {
          queueLatencyMs: 0,
          computeLatencyMs: 0,
          readbackLatencyMs: 0,
          totalDurationMs: Date.now() - startTotal,
          isWarmStart: this._isWarm,
        },
        errorDetails: `Provider not ready. Current lifecycle: ${this._status}`,
      };
    }

    if (request.abortSignal?.aborted) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "ABORTED",
        outputs: new Map(),
        metrics: {
          queueLatencyMs: 0,
          computeLatencyMs: 0,
          readbackLatencyMs: 0,
          totalDurationMs: Date.now() - startTotal,
          isWarmStart: this._isWarm,
        },
        errorDetails: "Inference request was aborted before compute",
      };
    }

    // ABI Validation
    const inputMeta = new Map<string, { shape: readonly number[]; dataType: string }>();
    for (const [name, tensor] of request.inputs.entries()) {
      inputMeta.set(name, { shape: tensor.shape, dataType: tensor.dataType });
    }

    const abiCheck = validateModelAbi(this._loadedModel, inputMeta);
    if (!abiCheck.isValid) {
      return {
        requestId: request.requestId,
        modelId: request.modelId,
        modelVersion: request.modelVersion,
        providerId: this.providerId,
        providerType: this.providerType,
        status: "VALIDATION_FAILED",
        outputs: new Map(),
        metrics: {
          queueLatencyMs: 0,
          computeLatencyMs: 0,
          readbackLatencyMs: 0,
          totalDurationMs: Date.now() - startTotal,
          isWarmStart: this._isWarm,
        },
        errorDetails: `ABI Mismatch: ${abiCheck.errors.join("; ")}`,
      };
    }

    const computeStart = Date.now();

    // Execute Layers
    const inputTensor = request.inputs.get(this._loadedModel.inputs[0].name)!;
    const l1 = this._loadedModel.weights.layer1;
    const l2 = this._loadedModel.weights.layer2;

    // Layer 1: Dense
    const h1 = this.denseLinear(inputTensor.data, l1.weights, l1.biases, l1.inFeatures, l1.outFeatures);
    // Activation: ReLU
    const a1 = this.relu(h1);
    // Layer 2: Dense
    const h2 = this.denseLinear(a1, l2.weights, l2.biases, l2.inFeatures, l2.outFeatures);

    const computeDuration = Date.now() - computeStart;
    const isWarm = this._isWarm;
    this._isWarm = true;

    const outputTensor = new Tensor(this._loadedModel.outputs[0].shape, h2, "FLOAT32");
    const outputs = new Map<string, Tensor>([[this._loadedModel.outputs[0].name, outputTensor]]);

    return {
      requestId: request.requestId,
      modelId: request.modelId,
      modelVersion: request.modelVersion,
      providerId: this.providerId,
      providerType: this.providerType,
      status: "SUCCESS",
      outputs,
      metrics: {
        queueLatencyMs: 0,
        computeLatencyMs: computeDuration,
        readbackLatencyMs: 0,
        totalDurationMs: Date.now() - startTotal,
        isWarmStart: isWarm,
      },
    };
  }

  public async dispose(): Promise<void> {
    this._loadedModel = undefined;
    this._status = "DISPOSED";
    this._isWarm = false;
  }

  /**
   * Evaluates y = W * x + b
   * x: Float32Array [inFeatures]
   * W: readonly number[] row-major [outFeatures, inFeatures]
   * b: readonly number[] [outFeatures]
   */
  public denseLinear(
    x: Float32Array,
    weights: readonly number[],
    biases: readonly number[],
    inFeatures: number,
    outFeatures: number
  ): Float32Array {
    const y = new Float32Array(outFeatures);
    for (let outIdx = 0; outIdx < outFeatures; outIdx++) {
      let sum = biases[outIdx] ?? 0;
      const rowOffset = outIdx * inFeatures;
      for (let inIdx = 0; inIdx < inFeatures; inIdx++) {
        sum += x[inIdx] * weights[rowOffset + inIdx];
      }
      y[outIdx] = sum;
    }
    return y;
  }

  public relu(x: Float32Array): Float32Array {
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      y[i] = Math.max(0, x[i]);
    }
    return y;
  }
}
